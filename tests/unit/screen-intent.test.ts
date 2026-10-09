import { expect, it } from 'vitest';
import { classifyScreenIntent } from '../../src/core/screen-intent';
import corpus from '../fixtures/screen-intent.json';

const input = {
  prompt: 'What is on my screen?',
  submitted: true,
  hardExcluded: false,
  neverIncludeScreen: false,
  includeScreen: false,
};
it.each([
  ['What is on my screen?', 'screen-reference'],
  ['  PLEASE READ MY SCREEN.  ', 'screen-reference'],
  ['Can you explain the chart in this window?', 'screen-reference'],
  ['What is a pivot table?', 'general'],
  ['Can you explain this?', 'ambiguous'],
  ['Do not inspect this window.', 'negated'],
  ['Translate "what is on my screen".', 'quoted-or-instructional'],
  ['What is on my screen tomorrow?', 'quoted-or-instructional'],
  ['Was steht auf meinem Bildschirm?', 'general'],
  ['Erkläre meinen Bildschirm.', 'unsupported-text'],
])(
  'classifies a synthetic case without returning its prompt (%#)',
  (prompt, reason) => {
    const result = classifyScreenIntent({ ...input, prompt });
    expect(result).toEqual({
      kind:
        reason === 'screen-reference'
          ? 'screen-context-requested'
          : 'text-only',
      reason,
    });
    expect(JSON.stringify(result)).not.toContain(prompt);
  },
);
it('requires submission and lets hard exclusions and Never override Include', () => {
  expect(
    classifyScreenIntent({
      ...input,
      includeScreen: true,
      prompt: 'A general question',
    }),
  ).toEqual({ kind: 'screen-context-requested', reason: 'explicit-include' });
  for (const includeScreen of [false, true]) {
    expect(
      classifyScreenIntent({ ...input, includeScreen, submitted: false })
        .reason,
    ).toBe('not-submitted');
    expect(
      classifyScreenIntent({
        ...input,
        includeScreen,
        neverIncludeScreen: true,
      }).reason,
    ).toBe('never-include');
    expect(
      classifyScreenIntent({
        ...input,
        includeScreen,
        neverIncludeScreen: true,
        hardExcluded: true,
      }).reason,
    ).toBe('excluded');
  }
});
it.each([
  null,
  undefined,
  [],
  '',
  1,
  {},
  { ...input, extra: true },
  { ...input, prompt: '' },
  { ...input, prompt: '  ' },
  { ...input, prompt: 4 },
  { ...input, prompt: 'x'.repeat(2001) },
  { ...input, submitted: 1 },
  { ...input, hardExcluded: undefined },
  { ...input, neverIncludeScreen: 'false' },
  { ...input, includeScreen: null },
  Object.create(input),
])('rejects malformed, inherited or oversized input %#', (value) => {
  expect(classifyScreenIntent(value)).toEqual({
    kind: 'text-only',
    reason: 'invalid-input',
  });
});
it('bounds before trimming, accepts the exact limit and rejects invisible/control text', () => {
  expect(
    classifyScreenIntent({
      ...input,
      prompt: 'x'.repeat(2000),
      includeScreen: true,
    }).kind,
  ).toBe('screen-context-requested');
  for (const prompt of ['x'.repeat(2001), ' '.repeat(2000) + 'x'])
    expect(
      classifyScreenIntent({ ...input, prompt, includeScreen: true }).reason,
    ).toBe('invalid-input');
  for (const prompt of [
    'Read my scr\u200been.',
    'Read my screen.\u0000',
    'Read my scrеen.',
  ])
    expect(classifyScreenIntent({ ...input, prompt }).kind).toBe('text-only');
});
it('has 240 unique predeclared prompts in balanced disjoint partitions', () => {
  expect(corpus.version).toBe(1);
  expect(corpus.synthetic).toBe(true);
  const all = [corpus.development, corpus.evaluation].flatMap((partition) => {
    expect(Object.keys(partition).sort()).toEqual([
      'adversarial',
      'ambiguous',
      'clear',
      'general',
    ]);
    return Object.values(partition).flatMap((prompts) => {
      expect(prompts).toHaveLength(30);
      for (const prompt of prompts)
        expect(prompt.length).toBeLessThanOrEqual(2000);
      return prompts.map((prompt) => prompt.trim().toLowerCase());
    });
  });
  expect(new Set(all).size).toBe(240);
});
// IDs only in test names/output, not prompt text. Evaluation labels are not tuned to outputs.
for (const [partition, groups] of Object.entries(corpus).filter(
  ([key]) => key === 'development' || key === 'evaluation',
) as [string, typeof corpus.development][]) {
  for (const [label, prompts] of Object.entries(groups)) {
    for (const [index, prompt] of prompts.entries()) {
      if (label !== 'clear')
        it(`fails closed for ${partition}-${label}-${index + 1}`, () => {
          expect(classifyScreenIntent({ ...input, prompt }).kind).toBe(
            'text-only',
          );
        });
      it(`honors mandatory controls for ${partition}-${label}-${index + 1}`, () => {
        for (const includeScreen of [false, true]) {
          for (const flags of [
            { submitted: false },
            { hardExcluded: true },
            { neverIncludeScreen: true },
          ])
            expect(
              classifyScreenIntent({
                ...input,
                prompt,
                includeScreen,
                ...flags,
              }).kind,
            ).toBe('text-only');
        }
      });
    }
  }
}
