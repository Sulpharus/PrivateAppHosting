// Files of the Supabase Storage buckets (app files, uploads, app logos): listing, copying out
// and putting back, with the service key. Folders are walked, objects are copied one by one.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface BucketInfo {
  id: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
}

export interface ObjectInfo {
  bucket: string;
  name: string;
  bytes: number;
  contentType: string | null;
}

const PAGE = 1000;

export async function listBuckets(client: SupabaseClient): Promise<BucketInfo[]> {
  const { data, error } = await client.storage.listBuckets();
  if (error) throw new Error(`listing the buckets failed: ${error.message}`);
  return data
    .map((bucket) => ({
      id: bucket.id,
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? null,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Every object of a bucket (or below the folder `prefix`), folders walked. */
export async function listObjects(
  client: SupabaseClient,
  bucket: string,
  prefix = '',
): Promise<ObjectInfo[]> {
  const found: ObjectInfo[] = [];
  const folders = [prefix];
  for (let folder = folders.shift(); folder !== undefined; folder = folders.shift()) {
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await client.storage.from(bucket).list(folder, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error(`listing ${bucket}/${folder} failed: ${error.message}`);
      for (const entry of data) {
        const name = folder ? `${folder}/${entry.name}` : entry.name;
        // Folders come back without an id.
        if (entry.id === null) folders.push(name);
        else {
          const meta = (entry.metadata ?? {}) as { size?: number; mimetype?: string };
          found.push({
            bucket,
            name,
            bytes: Number(meta.size ?? 0),
            contentType: meta.mimetype ?? null,
          });
        }
      }
      if (data.length < PAGE) break;
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function download(client: SupabaseClient, object: ObjectInfo): Promise<Buffer> {
  const { data, error } = await client.storage.from(object.bucket).download(object.name);
  if (error)
    throw new Error(`downloading ${object.bucket}/${object.name} failed: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Creates the bucket with the saved settings, or brings an existing one to them. */
export async function ensureBucket(client: SupabaseClient, bucket: BucketInfo): Promise<void> {
  const options = {
    public: bucket.public,
    ...(bucket.fileSizeLimit !== null ? { fileSizeLimit: bucket.fileSizeLimit } : {}),
    ...(bucket.allowedMimeTypes ? { allowedMimeTypes: bucket.allowedMimeTypes } : {}),
  };
  const created = await client.storage.createBucket(bucket.id, options);
  if (!created.error) return;
  const updated = await client.storage.updateBucket(bucket.id, options);
  if (updated.error)
    throw new Error(
      `bucket ${bucket.id} could not be created or updated: ${updated.error.message}`,
    );
}

export async function upload(
  client: SupabaseClient,
  object: ObjectInfo,
  body: Buffer,
): Promise<void> {
  const { error } = await client.storage.from(object.bucket).upload(object.name, body, {
    upsert: true,
    ...(object.contentType ? { contentType: object.contentType } : {}),
  });
  if (error) throw new Error(`uploading ${object.bucket}/${object.name} failed: ${error.message}`);
}

/** Runs `work` over `items` with a few at a time; the first failure stops the rest. */
export async function inParallel<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let failure: unknown;
  const lane = async () => {
    while (failure === undefined) {
      const index = next++;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      try {
        await work(item);
      } catch (error) {
        failure ??= error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  if (failure !== undefined) throw failure;
}

/** Deletes objects of a bucket, a hundred at a time. */
export async function removeObjects(
  client: SupabaseClient,
  bucket: string,
  names: string[],
): Promise<void> {
  for (let start = 0; start < names.length; start += 100) {
    const { error } = await client.storage.from(bucket).remove(names.slice(start, start + 100));
    if (error) throw new Error(`deleting files of ${bucket} failed: ${error.message}`);
  }
}
