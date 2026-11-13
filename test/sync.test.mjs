import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fixture, record, run, video, writeJson } from './helpers.mjs';

async function withDownloader(root) {
  const bin = join(root, 'bin');
  await mkdir(bin);
  const script = join(bin, 'yt-dlp');
  await writeFile(script, `#!${process.execPath}
import fs from 'node:fs';
const id = new URL(process.argv.at(-1)).searchParams.get('v');
fs.appendFileSync(process.env.DOWNLOADER_CALLS, id + '\\n');
if (id === process.env.FAIL_ID) { console.error('simulated network failure'); process.exit(1); }
console.log(JSON.stringify({ id, title: 'Fetched ' + id, channel: 'First', uploader_id: '@first', duration: 900 }));
`);
  await chmod(script, 0o755);
  return { PATH: bin, DOWNLOADER_CALLS: join(root, 'calls') };
}

test('reuses cached records, fetches only missing videos and refreshes explicitly', async t => {
  const root = await fixture({ '@first': [video('aaaaaaaaaaa'), video('bbbbbbbbbbb')] }, { aaaaaaaaaaa: record('Cached title') });
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = await withDownloader(root);
  let result = run(root, 'sync-videos', [], env);
  assert.equal(result.status, 0, result.stderr);
  let cache = JSON.parse(await readFile(join(root, 'video-metadata.json')));
  assert.equal(cache.aaaaaaaaaaa.title, 'Cached title');
  assert.equal(cache.bbbbbbbbbbb.durationSeconds, 900);
  assert.equal(await readFile(env.DOWNLOADER_CALLS, 'utf8'), 'bbbbbbbbbbb\n');

  await writeJson(join(root, 'videos.json'), { '@first': [video('aaaaaaaaaaa', ['day']), video('bbbbbbbbbbb')] });
  result = run(root, 'sync-videos', ['--check'], { PATH: '' });
  assert.equal(result.status, 0, result.stderr);
  result = run(root, 'sync-videos', [], env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(env.DOWNLOADER_CALLS, 'utf8'), 'bbbbbbbbbbb\n');

  result = run(root, 'sync-videos', ['--refresh'], env);
  assert.equal(result.status, 0, result.stderr);
  cache = JSON.parse(await readFile(join(root, 'video-metadata.json')));
  assert.equal(cache.aaaaaaaaaaa.title, 'Fetched aaaaaaaaaaa');
  assert.equal(await readFile(env.DOWNLOADER_CALLS, 'utf8'), 'bbbbbbbbbbb\naaaaaaaaaaa\nbbbbbbbbbbb\n');
});

test('a failure after a successful fetch leaves the complete old cache untouched', async t => {
  const root = await fixture({ '@first': [video('aaaaaaaaaaa'), video('bbbbbbbbbbb')] }, {});
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = await readFile(join(root, 'video-metadata.json'), 'utf8');
  const env = { ...await withDownloader(root), FAIL_ID: 'bbbbbbbbbbb' };
  const result = run(root, 'sync-videos', [], env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /simulated network failure/);
  assert.equal(await readFile(join(root, 'video-metadata.json'), 'utf8'), before);
  assert.equal(await readFile(env.DOWNLOADER_CALLS, 'utf8'), 'aaaaaaaaaaa\nbbbbbbbbbbb\n');
});

test('removing a film prunes its metadata and invalid configuration preserves the cache', async t => {
  const root = await fixture({ '@first': [video('aaaaaaaaaaa')] }, { aaaaaaaaaaa: record(), bbbbbbbbbbb: record() });
  t.after(() => rm(root, { recursive: true, force: true }));
  let result = run(root, 'sync-videos', [], { PATH: '' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(JSON.parse(await readFile(join(root, 'video-metadata.json')))), ['aaaaaaaaaaa']);
  const before = await readFile(join(root, 'video-metadata.json'), 'utf8');
  await writeJson(join(root, 'videos.json'), { '@first': [video('aaaaaaaaaaa', ['night'])] });
  result = run(root, 'sync-videos', [], { PATH: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /mode/i);
  assert.equal(await readFile(join(root, 'video-metadata.json'), 'utf8'), before);
});
