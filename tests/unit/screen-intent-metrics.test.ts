import { expect, it } from 'vitest';
import { intentMetrics } from '../../scripts/screen-intent-metrics';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { classifyScreenIntent } from '../../src/core/screen-intent';
import corpus from '../fixtures/screen-intent.json';
import baseline from '../../docs/evidence/P3-04-metrics.json';

it('reproduces the recorded baseline and flags any corpus or prediction drift for review', () => {
  const bytes = readFileSync(
    new URL('../fixtures/screen-intent.json', import.meta.url),
  );
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    baseline.corpusSha256,
  );
  for (const partition of ['development', 'evaluation'] as const) {
    const predictions = Object.entries(corpus[partition]).flatMap(
      ([label, prompts]) =>
        prompts.map((prompt, index) => ({
          id: `${partition}-${label}-${index + 1}`,
          expectedScreen: label === 'clear',
          predictedScreen:
            classifyScreenIntent({
              prompt,
              submitted: true,
              hardExcluded: false,
              neverIncludeScreen: false,
              includeScreen: false,
            }).kind === 'screen-context-requested',
        })),
    );
    expect(intentMetrics(predictions)).toEqual(baseline[partition]);
  }
  expect(baseline.captureEnabled).toBe(false);
  expect(baseline.independentBenchmark).toBe(false);
});

it('counts both error directions and uses the correct denominators', () => {
  expect(
    intentMetrics([
      { id: 'tp', expectedScreen: true, predictedScreen: true },
      { id: 'fp', expectedScreen: false, predictedScreen: true },
      { id: 'fn', expectedScreen: true, predictedScreen: false },
      { id: 'tn', expectedScreen: false, predictedScreen: false },
    ]),
  ).toEqual({
    total: 4,
    tp: 1,
    fp: 1,
    fn: 1,
    tn: 1,
    precision: 0.5,
    recall: 0.5,
    precisionTargetMet: false,
    recallTargetMet: false,
    falsePositiveIds: ['fp'],
    missedRequestIds: ['fn'],
  });
});
it('does not report perfect precision or recall on absent denominators', () => {
  expect(intentMetrics([])).toMatchObject({
    precision: null,
    recall: null,
    precisionTargetMet: false,
    recallTargetMet: false,
  });
  expect(
    intentMetrics([
      { id: 'miss', expectedScreen: true, predictedScreen: false },
    ]),
  ).toMatchObject({ precision: null, recall: 0 });
  expect(
    intentMetrics([{ id: 'hit', expectedScreen: true, predictedScreen: true }]),
  ).toMatchObject({
    precision: 1,
    recall: 1,
    precisionTargetMet: true,
    recallTargetMet: true,
  });
});
