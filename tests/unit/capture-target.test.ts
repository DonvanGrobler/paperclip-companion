import { describe, expect, it } from 'vitest';
import { createTargetLifecycle } from '../../src/core/capture-target';

function bound() {
  const lifecycle = createTargetLifecycle();
  const generation = lifecycle.beginInvocation();
  expect(lifecycle.bind(generation, 'window-A', true)).toBe(true);
  return { lifecycle, generation };
}

describe('target lifecycle (synthetic, no OS identity proof)', () => {
  it('rejects tokens from another owner even when identifiers match', () => {
    const first = bound();
    const second = bound();
    const other = first.lifecycle.submit(first.generation, 'request-A')!;
    const own = second.lifecycle.submit(second.generation, 'request-A')!;
    expect(second.lifecycle.resolve(other, 'window-A', true, true)).toBeNull();
    expect(
      second.lifecycle.resolve(own, 'window-A', true, true),
    ).not.toBeNull();
  });

  it('invalidates pending selection and starts retries without an inherited target', () => {
    const lifecycle = createTargetLifecycle();
    const generation = lifecycle.beginInvocation();
    lifecycle.observe('cancelled');
    expect(lifecycle.bind(generation, 'window-A', true)).toBe(false);
    const next = lifecycle.beginInvocation();
    expect(lifecycle.submit(next, 'request-A')).toBeNull();
    expect(lifecycle.bind(next, 'window-B', true)).toBe(true);
    const ticket = lifecycle.submit(next, 'request-A')!;
    expect(lifecycle.resolve(ticket, 'window-B', true, true)).not.toBeNull();
  });

  it('requires invocation and confirmed identity before binding', () => {
    const lifecycle = createTargetLifecycle();
    expect(lifecycle.bind(0, 'window-A', true)).toBe(false);
    expect(lifecycle.submit(0, 'request-A')).toBeNull();
    const generation = lifecycle.beginInvocation();
    expect(lifecycle.bind(generation, 'window-A', false)).toBe(false);
    expect(lifecycle.submit(generation, 'request-A')).toBeNull();
    expect(lifecycle.bind(generation, 'window-A', true)).toBe(true);
    expect(lifecycle.bind(generation, 'window-B', true)).toBe(false);
  });

  it('resolves once and cannot resubmit or retarget the same invocation', () => {
    const { lifecycle, generation } = bound();
    const ticket = lifecycle.submit(generation, 'request-A')!;
    expect(lifecycle.submit(generation, 'request-A')).toBeNull();
    expect(lifecycle.resolve(ticket, 'window-A', true, true)).toEqual({
      generation,
      requestId: 'request-A',
      targetId: 'window-A',
    });
    expect(lifecycle.resolve(ticket, 'window-A', true, true)).toBeNull();
    expect(lifecycle.submit(generation, 'request-B')).toBeNull();
    expect(lifecycle.bind(generation, 'window-B', true)).toBe(false);
  });

  it.each([
    'external-focus',
    'target-closed',
    'target-replaced',
    'session-changed',
    'display-changed',
    'geometry-unknown',
    'helper-restarted',
    'cancelled',
  ] as const)(
    'invalidates target and late selection/results on %s',
    (reason) => {
      const { lifecycle, generation } = bound();
      const ticket = lifecycle.submit(generation, 'request-A')!;
      lifecycle.observe(reason);
      expect(lifecycle.bind(generation, 'window-B', true)).toBe(false);
      expect(lifecycle.resolve(ticket, 'window-A', true, true)).toBeNull();
      expect(lifecycle.submit(generation, 'request-B')).toBeNull();
    },
  );

  it('companion focus preserves the target while a new invocation rejects old work', () => {
    const { lifecycle, generation } = bound();
    lifecycle.observe('companion-focus');
    const old = lifecycle.submit(generation, 'request-A')!;
    const next = lifecycle.beginInvocation();
    expect(next).toBeGreaterThan(generation);
    expect(lifecycle.bind(generation, 'window-A', true)).toBe(false);
    expect(lifecycle.bind(next, 'window-B', true)).toBe(true);
    const fresh = lifecycle.submit(next, 'request-B')!;
    expect(lifecycle.resolve(old, 'window-A', true, true)).toBeNull();
    expect(lifecycle.resolve(fresh, 'window-B', true, true)?.targetId).toBe(
      'window-B',
    );
  });

  it.each([
    ['window-B', true, true],
    ['window-A', false, true],
    ['window-A', true, false],
    ['window-A', undefined, true],
    ['window-A', true, 'yes'],
  ])(
    'fails closed and consumes a failed validation (%s, %s, %s)',
    (target, identity, allowed) => {
      const { lifecycle, generation } = bound();
      const ticket = lifecycle.submit(generation, 'request-A')!;
      expect(lifecycle.resolve(ticket, target, identity, allowed)).toBeNull();
      expect(lifecycle.resolve(ticket, 'window-A', true, true)).toBeNull();
    },
  );

  it('rejects forged tickets without cancelling the actual pending validation', () => {
    const { lifecycle, generation } = bound();
    const ticket = lifecycle.submit(generation, 'request-A')!;
    for (const fake of [null, undefined, {}, { ...ticket }, 'request-A'])
      expect(lifecycle.resolve(fake, 'window-A', true, true)).toBeNull();
    expect(lifecycle.resolve(ticket, 'window-A', true, true)).not.toBeNull();
  });

  it.each(['', 'sensitive title!', 'a'.repeat(129), null, 1, {}])(
    'rejects invalid identifiers %s',
    (id) => {
      const lifecycle = createTargetLifecycle();
      const generation = lifecycle.beginInvocation();
      expect(lifecycle.bind(generation, id, true)).toBe(false);
      expect(lifecycle.bind(generation, 'window-A', true)).toBe(true);
      expect(lifecycle.submit(generation, id)).toBeNull();
      expect(lifecycle.submit(generation - 1, 'request-A')).toBeNull();
      expect(lifecycle.submit(generation, 'request-A')).not.toBeNull();
    },
  );

  it('requires strict confirmation and keeps returned tickets immutable', () => {
    const lifecycle = createTargetLifecycle();
    const generation = lifecycle.beginInvocation();
    expect(lifecycle.bind(generation, 'window-A', 'true')).toBe(false);
    expect(lifecycle.bind(generation, 'window-A', true)).toBe(true);
    const ticket = lifecycle.submit(generation, 'request-A')!;
    expect(Object.isFrozen(ticket)).toBe(true);
    expect(lifecycle.resolve(undefined, 'window-A', true, true)).toBeNull();
    lifecycle.observe('cancelled');
    expect(lifecycle.resolve(ticket, 'window-A', true, true)).toBeNull();
  });
});
