import { expect, it } from 'vitest';
import {
  initialScreenPreview,
  screenPreviewReducer,
  screenPreviewSubmission,
} from '../../src/core/screen-preview';

it('starts text-only without acknowledgement or a carried-over Include choice', () => {
  expect(initialScreenPreview).toEqual({
    reviewed: false,
    neverInclude: false,
    include: false,
  });
  expect(screenPreviewSubmission(initialScreenPreview)).toBe('text-only');
  expect(
    screenPreviewReducer(initialScreenPreview, { type: 'include', value: true })
      .include,
  ).toBe(false);
});
it('requires review and explicit Include, then requires explicit text-only fallback', () => {
  const reviewed = screenPreviewReducer(initialScreenPreview, {
    type: 'review',
  });
  expect(reviewed.include).toBe(false);
  const included = screenPreviewReducer(reviewed, {
    type: 'include',
    value: true,
  });
  expect(screenPreviewSubmission(included)).toBe('confirm-text-only');
  expect(
    screenPreviewSubmission(
      screenPreviewReducer(included, { type: 'include', value: false }),
    ),
  ).toBe('text-only');
  expect(screenPreviewReducer(included, { type: 'reset-request' })).toEqual(
    reviewed,
  );
});
it('Never wins and turning it off cannot resurrect Include', () => {
  const included = { reviewed: true, neverInclude: false, include: true };
  const never = screenPreviewReducer(included, { type: 'never', value: true });
  expect(never).toEqual({ reviewed: true, neverInclude: true, include: false });
  expect(
    screenPreviewReducer(never, { type: 'include', value: true }).include,
  ).toBe(false);
  expect(screenPreviewSubmission(never)).toBe('text-only');
  expect(
    screenPreviewReducer(never, { type: 'never', value: false }).include,
  ).toBe(false);
  expect(screenPreviewReducer(never, { type: 'reset-request' })).toEqual(never);
});
it('withdrawal removes review and Include without clearing Never', () => {
  for (const neverInclude of [false, true]) {
    const state = { reviewed: true, neverInclude, include: true };
    const withdrawn = screenPreviewReducer(state, { type: 'withdraw' });
    expect(withdrawn).toEqual({
      reviewed: false,
      neverInclude,
      include: false,
    });
    expect(screenPreviewReducer(withdrawn, { type: 'review' })).toEqual({
      reviewed: true,
      neverInclude,
      include: false,
    });
  }
});
it('never treats contradictory preview state as a screen request or an authorization grant', () => {
  for (const reviewed of [false, true])
    for (const neverInclude of [false, true])
      for (const include of [false, true]) {
        const state = Object.freeze({ reviewed, neverInclude, include });
        expect(screenPreviewSubmission(state)).toBe(
          reviewed && !neverInclude && include
            ? 'confirm-text-only'
            : 'text-only',
        );
        expect(
          Object.keys(screenPreviewReducer(state, { type: 'withdraw' })).sort(),
        ).toEqual(['include', 'neverInclude', 'reviewed']);
      }
});
