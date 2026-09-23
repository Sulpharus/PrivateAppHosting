// Writes schema.json so editors can validate mininode.json files via "$schema".
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { manifestSchema } from '../src/schema.ts';

const jsonSchema = z.toJSONSchema(manifestSchema, { io: 'input', unrepresentable: 'any' });
const target = fileURLToPath(new URL('../schema.json', import.meta.url));
writeFileSync(
  target,
  `${JSON.stringify({ title: 'MiniNode app manifest (mininode.json)', ...jsonSchema }, null, 2)}\n`,
);
console.log(`wrote ${target}`);
