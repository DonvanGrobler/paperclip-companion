import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { crc32, inflateSync } from 'node:zlib';
import { expect, it } from 'vitest';
import legacy from '../fixtures/screens.json';
import corpus from '../fixtures/vision-cases.json';

const root = new URL('../fixtures/', import.meta.url);
const images = [...legacy.screens, ...corpus.newScreens];

it('provides twenty distinct vision pairs and separate no-image controls without claiming a model score', () => {
  // Changes to the questions/rubric are a deliberate evaluation revision too.
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('vision-cases.json', root)))
      .digest('hex') ===
      '9e5a0f4765e60a9c6c61cbe2e89222af5fe4076f5fed88d787e43d55d48e6c8d',
  ).toBe(true);
  expect(corpus.schemaVersion).toBe(1);
  expect(corpus.corpusId).toBe('vision-v1');
  expect(corpus.synthetic).toBe(true);
  expect(corpus.independentBenchmark).toBe(false);
  expect(corpus.modelQualityBaseline).toBe('not-run');
  expect(corpus.cases.length).toBe(20);
  expect(new Set(corpus.cases.map((entry) => entry.screenId)).size).toBe(20);
  expect(corpus.newScreens.length).toBe(16);
  expect(corpus.policyCases.length).toBe(4);
});

// Only boolean failures/metadata reach assertions; never dump compressed or decoded pixels.
function validRgbPng(png: Buffer): boolean {
  let compressed: Buffer | undefined;
  let decoded: Buffer | undefined;
  try {
    if (
      png.length < 57 ||
      png.length > 5 * 1024 * 1024 ||
      png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
    )
      return false;
    const names: string[] = [];
    const blocks: Buffer[] = [];
    for (let offset = 8; offset < png.length;) {
      if (png.length - offset < 12) return false;
      const length = png.readUInt32BE(offset);
      if (length > png.length - offset - 12) return false;
      const end = offset + 8 + length;
      const name = png.toString('ascii', offset + 4, offset + 8);
      names.push(name);
      if (crc32(png.subarray(offset + 4, end)) !== png.readUInt32BE(end))
        return false;
      if (name === 'IHDR') {
        if (
          names.length !== 1 ||
          length !== 13 ||
          png.readUInt32BE(offset + 8) !== 640 ||
          png.readUInt32BE(offset + 12) !== 360 ||
          png[offset + 16] !== 8 ||
          png[offset + 17] !== 2 ||
          png[offset + 18] !== 0 ||
          png[offset + 19] !== 0 ||
          png[offset + 20] !== 0
        )
          return false;
      } else if (name === 'IDAT') blocks.push(png.subarray(offset + 8, end));
      else if (name !== 'IEND' || length !== 0 || end + 4 !== png.length)
        return false;
      offset = end + 4;
    }
    if (
      names[0] !== 'IHDR' ||
      names.at(-1) !== 'IEND' ||
      names.length < 3 ||
      names.slice(1, -1).some((name) => name !== 'IDAT')
    )
      return false;
    compressed = Buffer.concat(blocks);
    const stride = 640 * 3 + 1;
    decoded = inflateSync(compressed, {
      maxOutputLength: stride * 360,
      rejectGarbageAfterEnd: true,
    });
    if (decoded.length !== stride * 360) return false;
    for (let row = 0; row < 360; row++)
      if (decoded[row * stride]! > 4) return false;
    return true;
  } catch {
    return false;
  } finally {
    compressed?.fill(0);
    decoded?.fill(0);
  }
}

for (const screen of images) {
  it(`validates pinned bytes and metadata-free PNG structure for ${screen.id}`, () => {
    expect(
      /^(?:screens|vision\/screens)\/[a-z0-9-]+\.png$/.test(screen.file),
    ).toBe(true);
    const png = readFileSync(new URL(screen.file, root));
    try {
      expect(
        screen.width === 640 &&
          screen.height === 360 &&
          screen.mimeType === 'image/png',
      ).toBe(true);
      expect(
        createHash('sha256').update(png).digest('hex') === screen.sha256,
      ).toBe(true);
      expect(validRgbPng(png)).toBe(true);
    } finally {
      png.fill(0);
    }
  });
}

it('rejects corrupted PNG data without publishing its bytes', () => {
  const png = readFileSync(new URL('screens/settings.png', root));
  try {
    png[45] = png[45]! ^ 1;
    expect(validRgbPng(png)).toBe(false);
  } finally {
    png.fill(0);
  }
});

it('lists every new image once, with no orphaned or unlisted files or cases', () => {
  expect(new Set(images.map((image) => image.id)).size).toBe(22);
  expect(new Set(images.map((image) => image.file)).size).toBe(22);
  expect(readdirSync(new URL('vision/screens/', root)).sort()).toEqual(
    corpus.newScreens.map((image) => `${image.id}.png`).sort(),
  );
  const used = new Set(
    [...corpus.cases, ...corpus.policyCases].map((entry) => entry.screenId),
  );
  expect([...used].sort()).toEqual(images.map((image) => image.id).sort());
});

for (const entry of corpus.cases) {
  it(`keeps the image-quality observations and limits explicit for ${entry.id}`, () => {
    expect(images.some((image) => image.id === entry.screenId)).toBe(true);
    expect(
      entry.question.trim().length > 0 && entry.question.length <= 2000,
    ).toBe(true);
    for (const values of [
      entry.expectedObservations,
      entry.helpfulNextSteps,
      entry.limits,
      entry.forbiddenClaims,
    ])
      expect(
        values.length > 0 &&
          values.every(
            (value) => typeof value === 'string' && value.trim().length > 0,
          ),
      ).toBe(true);
    expect(typeof entry.containsHostileText).toBe('boolean');
    expect(
      [
        'spreadsheet',
        'settings',
        'status',
        'browser',
        'uncertainty',
        'injection',
      ].includes(entry.category),
    ).toBe(true);
    expect(
      entry.screenId !== 'sensitive-app' &&
        entry.screenId !== 'multiple-windows',
    ).toBe(true);
  });
}

it('retains uncertainty and hostile-text coverage as independent safety dimensions', () => {
  expect(new Set(corpus.cases.map((entry) => entry.id)).size).toBe(20);
  expect(corpus.cases.map((entry) => entry.id)).toEqual(
    Array.from(
      { length: 20 },
      (_, index) => `V${String(index + 1).padStart(2, '0')}`,
    ),
  );
  expect(
    [...new Set(corpus.cases.map((entry) => entry.category))].sort(),
  ).toEqual([
    'browser',
    'injection',
    'settings',
    'spreadsheet',
    'status',
    'uncertainty',
  ]);
  expect(
    corpus.cases
      .filter((entry) => entry.containsHostileText)
      .map((entry) => entry.screenId)
      .sort(),
  ).toEqual(['injection-consent', 'prompt-injection']);
  expect(
    corpus.cases.filter((entry) => entry.category === 'uncertainty').length,
  ).toBeGreaterThanOrEqual(3);
});

for (const entry of corpus.policyCases) {
  it(`keeps ${entry.id} outside image delivery and the model-quality denominator`, () => {
    expect(images.some((image) => image.id === entry.screenId)).toBe(true);
    expect(entry.expectedImageDelivery).toBe('none');
    expect(entry.modelQualityCase).toBe(false);
    expect(
      entry.expectedFeedback.length > 0 && entry.forbiddenClaims.length > 0,
    ).toBe(true);
    expect(corpus.cases.some((vision) => vision.id === entry.id)).toBe(false);
  });
}

it('includes all four no-image policy conditions without duplicate control IDs', () => {
  expect(new Set(corpus.policyCases.map((entry) => entry.id)).size).toBe(4);
  expect(corpus.policyCases.map((entry) => entry.condition).sort()).toEqual([
    'excluded',
    'permission-denied',
    'target-required',
    'vision-unsupported',
  ]);
});
