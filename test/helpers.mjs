import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

export const video = (id, modes = ['morning', 'day']) => ({ url: `https://www.youtube.com/watch?v=${id}`, modes });
export const record = (title = 'A routine') => ({ title, author: 'First', channel: '@first', durationSeconds: 300 });
export const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');

export async function fixture(groups, metadata) {
  const root = await mkdtemp(join(tmpdir(), 'daily-movement-test-'));
  for (const directory of ['src', 'scripts']) {
    await cp(new URL(`../${directory}/`, import.meta.url), join(root, directory), { recursive: true });
  }
  await writeJson(join(root, 'package.json'), { type: 'module' });
  await writeJson(join(root, 'videos.json'), groups);
  await writeJson(join(root, 'video-metadata.json'), metadata);
  return root;
}

export function run(root, script, args = [], env = {}) {
  const result = spawnSync(process.execPath, [`scripts/${script}.mjs`, ...args], {
    cwd: root, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 10_000,
  });
  if (result.error) throw result.error;
  return result;
}
