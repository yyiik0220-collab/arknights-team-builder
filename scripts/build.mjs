import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'dist');
const excluded = new Set(['.git', '.verdent', 'dist', 'node_modules']);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
for (const entry of await readdir(projectRoot, { withFileTypes: true })) {
  if (excluded.has(entry.name)) continue;
  await cp(path.join(projectRoot, entry.name), path.join(outputDirectory, entry.name), { recursive: true });
}
