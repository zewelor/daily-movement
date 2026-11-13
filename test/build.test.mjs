import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, record, run, video, writeJson } from './helpers.mjs';

test('builds root and two bookmarkable modes with one complete catalog offline', async t => {
  const root = await fixture({ '@first': [video('aaaaaaaaaaa')] }, { aaaaaaaaaaa: record() });
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = run(root, 'build', [], { PATH: '' });
  assert.equal(result.status, 0, result.stderr);
  for (const path of ['index.html', 'morning/index.html', 'day/index.html', 'app.js', 'styles.css', 'sun.svg', '.nojekyll']) {
    await access(join(root, 'dist', path));
  }
  const catalog = JSON.parse(await readFile(join(root, 'dist/catalog.json'), 'utf8'));
  assert.equal(catalog.videos.length, 1);
  assert.deepEqual(catalog.videos[0].modes, ['morning', 'day']);
});

test('a failed validation preserves the previous build and reports missing metadata', async t => {
  const root = await fixture({ '@first': [video('aaaaaaaaaaa')] }, { aaaaaaaaaaa: record() });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(run(root, 'build').status, 0);
  const before = await readFile(join(root, 'dist/catalog.json'), 'utf8');
  await writeJson(join(root, 'video-metadata.json'), {});
  const result = run(root, 'build');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /metadata/i);
  assert.equal(await readFile(join(root, 'dist/catalog.json'), 'utf8'), before);
});
