import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { classifyScreenIntent } from '../src/core/screen-intent.ts';
import { intentMetrics } from './screen-intent-metrics.ts';

const bytes = readFileSync(
  new URL('../tests/fixtures/screen-intent.json', import.meta.url),
);
const corpus = JSON.parse(bytes.toString()) as {
  version: number;
  synthetic: boolean;
  development: Record<string, string[]>;
  evaluation: Record<string, string[]>;
};
const evaluate = (partition: 'development' | 'evaluation') =>
  intentMetrics(
    Object.entries(corpus[partition]).flatMap(([label, prompts]) =>
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
    ),
  );
const development = evaluate('development');
const evaluation = evaluate('evaluation');
console.log(
  JSON.stringify(
    {
      corpusVersion: corpus.version,
      corpusSha256: createHash('sha256').update(bytes).digest('hex'),
      synthetic: corpus.synthetic,
      independentBenchmark: false,
      development,
      evaluation,
      captureEnabled: false,
      gate: 'G3_OPEN_NO_CAPTURE_INTEGRATION',
    },
    null,
    2,
  ),
);
// False positives are a regression blocker. Recall misses remain explicit fail-closed limitations.
if (development.fp || evaluation.fp) process.exitCode = 1;
