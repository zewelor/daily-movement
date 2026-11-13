#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { readVideoList, validateMetadata } from '../src/catalog.js';

const runFile = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = join(root, 'videos.json');
const cachePath = join(root, 'video-metadata.json');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim().length > 0;

function rejectErrors(errors) {
  if (errors.length) throw new Error(errors.map(error => `- ${error}`).join('\n'));
}

async function readJson(path, allowMissing = false) {
  let contents;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    if (allowMissing && error.code === 'ENOENT') return {};
    throw new Error(`Cannot read ${path}: ${error.message}`);
  }
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`);
  }
}

async function fetchMetadata(entry) {
  const { id, channel } = entry;
  let output;
  try {
    output = await runFile('yt-dlp', [
      '--skip-download',
      '--dump-single-json',
      '--no-playlist',
      '--ignore-config',
      '--',
      `https://www.youtube.com/watch?v=${id}`,
    ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 120_000, windowsHide: true });
  } catch (error) {
    const details = [error.message, error.stderr, error.stdout].filter(isText).join('\n');
    if (error.code === 'ENOENT') throw new Error(`Cannot fetch ${id}: yt-dlp was not found on PATH. Install yt-dlp before running sync.\n${details}`);
    throw new Error(`yt-dlp failed for ${id}${error.signal ? ` (signal ${error.signal})` : ''}:\n${details}`);
  }
  if (output.stderr.trim()) process.stderr.write(`yt-dlp output for ${id}:\n${output.stderr}\n`);
  let result;
  try {
    result = JSON.parse(output.stdout);
  } catch (error) {
    throw new Error(`yt-dlp returned invalid JSON for ${id}: ${error.message}\n${output.stdout}`);
  }
  if (!isObject(result)) throw new Error(`yt-dlp returned invalid metadata for ${id}: expected an object.`);
  if (result.id !== id) throw new Error(`yt-dlp returned video ID ${JSON.stringify(result.id)} when ${id} was requested.`);
  if (typeof result.uploader_id !== 'string' || result.uploader_id.toLowerCase() !== channel.toLowerCase()) {
    throw new Error(`Channel mismatch for ${id}: yt-dlp uploader_id is ${JSON.stringify(result.uploader_id)}, but videos.json places it in ${channel}.`);
  }
  if (result.is_live === true || result.is_upcoming === true || ['is_live', 'is_upcoming', 'post_live'].includes(result.live_status)) {
    throw new Error(`${id} is live, upcoming, or still being processed; a complete published runtime is required.`);
  }
  const record = {
    title: result.title,
    author: result.channel || result.uploader,
    channel,
    durationSeconds: result.duration,
  };
  return record;
}

async function writeCacheAtomically(cache) {
  const temporaryPath = join(dirname(cachePath), `.video-metadata.${process.pid}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, JSON.stringify(cache, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, cachePath);
  } catch (error) {
    try {
      await unlink(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') process.stderr.write(`Could not remove temporary cache ${temporaryPath}: ${cleanupError.message}\n`);
    }
    throw new Error(`Could not update ${cachePath}: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter(arg => !['--check', '--refresh', '--help'].includes(arg));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(', ')}. Use --help for usage.`);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/sync-videos.mjs [--refresh | --check]\n\nDefault: fetch only IDs missing from video-metadata.json using yt-dlp.\n--refresh: fetch metadata for every configured ID.\n--check: validate the configuration and cached metadata offline without writing files.');
    return;
  }
  const checkOnly = args.includes('--check');
  const refresh = args.includes('--refresh');
  if (checkOnly && refresh) throw new Error('--check and --refresh cannot be used together.');

  const groups = await readJson(configPath);
  const entries = readVideoList(groups);
  const cache = await readJson(cachePath, !checkOnly);
  if (!isObject(cache)) throw new Error('video-metadata.json must be an object keyed by video ID.');

  const errors = [];
  const nextCache = {};
  let fetchedCount = 0;
  for (const entry of entries) {
    const hasCachedRecord = Object.hasOwn(cache, entry.id);
    if (checkOnly && !hasCachedRecord) {
      errors.push(`Missing metadata for ${entry.id}. Run npm run sync:videos to populate the cache.`);
      continue;
    }
    let record = cache[entry.id];
    if (!checkOnly && (refresh || !hasCachedRecord)) {
      console.log(`Fetching metadata for ${entry.id} (${entry.channel})...`);
      try {
        record = await fetchMetadata(entry);
        fetchedCount += 1;
      } catch (error) {
        errors.push(error.message);
        continue;
      }
    }
    try {
      validateMetadata(record, entry);
      nextCache[entry.id] = record;
    } catch (error) {
      errors.push(error.message);
    }
  }
  if (errors.length) {
    rejectErrors([...errors, 'The metadata cache was not changed.']);
  }

  if (checkOnly) {
    console.log(`Validated ${entries.length} videos across ${Object.keys(groups).length} channels offline.`);
    return;
  }
  if (JSON.stringify(cache) !== JSON.stringify(nextCache)) {
    await writeCacheAtomically(nextCache);
    console.log(`Saved metadata for ${entries.length} videos (${fetchedCount} fetched).`);
  } else {
    console.log(`Validated ${entries.length} videos (${fetchedCount} fetched). The metadata cache is already up to date.`);
  }
}

main().catch(error => {
  console.error(`Video catalog error:\n${error.message}`);
  process.exitCode = 1;
});
