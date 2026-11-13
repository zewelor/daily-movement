import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, selectRandomVideo } from '../src/catalog.js';

const groups = {
  '@first': [{ url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', modes: ['morning', 'day'] }],
  '@second': [{ url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', modes: ['day'] }],
};
const metadata = {
  aaaaaaaaaaa: { title: 'Full body stretch', author: 'First', channel: '@first', durationSeconds: 900 },
  bbbbbbbbbbb: { title: 'Work break', author: 'Second', channel: '@second', durationSeconds: 300 },
};

test('builds mode assignments and accepts an explicitly curated longer video', () => {
  const catalog = buildCatalog(groups, metadata);
  assert.deepEqual(catalog.videos.map(({ id, modes, durationSeconds }) => ({ id, modes, durationSeconds })), [
    { id: 'aaaaaaaaaaa', modes: ['morning', 'day'], durationSeconds: 900 },
    { id: 'bbbbbbbbbbb', modes: ['day'], durationSeconds: 300 },
  ]);
  assert.deepEqual(catalog.channels.map(channel => channel.key), ['@first', '@second']);
});

test('rejects missing, unknown and repeated modes, duplicate films and wrong ownership', () => {
  for (const modes of [[], ['night'], ['day', 'day']]) {
    assert.throws(() => buildCatalog({ '@first': [{ ...groups['@first'][0], modes }] }, metadata), /mode/i);
  }
  assert.throws(() => buildCatalog({ '@first': [groups['@first'][0], groups['@first'][0]] }, metadata), /duplicate/i);
  assert.throws(() => buildCatalog(groups, { ...metadata, bbbbbbbbbbb: { ...metadata.bbbbbbbbbbb, channel: '@first' } }), /channel|belong/i);
});

test('rejects non-YouTube links and unavailable or invalid metadata', () => {
  assert.throws(() => buildCatalog({ '@first': [{ url: 'https://example.com/watch?v=aaaaaaaaaaa', modes: ['day'] }] }, metadata), /URL|YouTube/i);
  assert.throws(() => buildCatalog(groups, {}), /metadata/i);
  for (const durationSeconds of [0, -1, null, '300']) {
    assert.throws(() => buildCatalog(groups, { ...metadata, aaaaaaaaaaa: { ...metadata.aaaaaaaaaaa, durationSeconds } }), /duration/i);
  }
});

test('gives equally likely channels regardless of their number of videos', () => {
  const one = { id: 'aaaaaaaaaaa', creatorKey: '@first', durationSeconds: 300 };
  const many = Array.from({ length: 9 }, (_, i) => ({ id: `bbbbbbbbbb${i}`, creatorKey: '@second', durationSeconds: 300 }));
  const original = Math.random;
  try {
    for (const [draws, expected] of [[[0.49, 0.9], one], [[0.5, 0.99], many[8]]]) {
      Math.random = () => draws.shift();
      assert.equal(selectRandomVideo([one, ...many]), expected);
    }
    const third = { id: 'ccccccccccc', creatorKey: '@third', durationSeconds: 300 };
    for (const [draws, expected] of [[[0.34, 0], many[0]], [[0.67, 0], third]]) {
      Math.random = () => draws.shift();
      assert.equal(selectRandomVideo([one, ...many, third]), expected);
    }
    Math.random = () => 0;
    assert.equal(selectRandomVideo([one]), one);
    assert.equal(selectRandomVideo([one]), one);
    assert.equal(selectRandomVideo([]), null);
  } finally {
    Math.random = original;
  }
});
