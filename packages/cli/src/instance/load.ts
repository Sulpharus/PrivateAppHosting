import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INSTANCE_CONFIG_FILENAME,
  type InstanceConfig,
  parseInstanceConfig,
} from '@mininode/manifest';

export function instanceConfigPath(root: string): string {
  return join(root, INSTANCE_CONFIG_FILENAME);
}

/**
 * Reads and validates `mininode.config.json` (or another file with the same format, e.g. the
 * example); the error says what to run when it is missing.
 */
export function loadInstanceConfig(root: string, file?: string): InstanceConfig {
  const path = file ?? instanceConfigPath(root);
  if (!existsSync(path)) {
    throw new Error(`${INSTANCE_CONFIG_FILENAME} not found: run \`pnpm mininode init\` first`);
  }
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${INSTANCE_CONFIG_FILENAME} is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = parseInstanceConfig(json);
  if (!parsed.ok) {
    throw new Error(`${INSTANCE_CONFIG_FILENAME} is invalid:\n  ${parsed.errors.join('\n  ')}`);
  }
  return parsed.config;
}
