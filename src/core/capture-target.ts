export type TargetInvalidation =
  | 'external-focus'
  | 'target-closed'
  | 'target-replaced'
  | 'session-changed'
  | 'display-changed'
  | 'geometry-unknown'
  | 'helper-restarted'
  | 'cancelled';

export type TargetTicket = Readonly<{
  generation: number;
  requestId: string;
  targetId: string;
}>;

function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

/**
 * In-memory state for a future main-owned resolver, not wired to the app.
 * Inputs must come from trusted main/native observations, never renderer facts.
 * Resolving a target does NOT authorize capture or prove native identity. The
 * caller must revalidate policy/consent and native binding at every side effect.
 */
export function createTargetLifecycle() {
  let generation = 0;
  let phase: 'idle' | 'selecting' | 'bound' | 'validating' | 'consumed' =
    'idle';
  let targetId: string | null = null;
  let pending: TargetTicket | null = null;

  function clear() {
    targetId = null;
    pending = null;
    phase = 'idle';
  }

  return {
    beginInvocation(): number {
      clear();
      generation += 1;
      phase = 'selecting';
      return generation;
    },
    bind(
      invocation: number,
      candidate: unknown,
      identityConfirmed: unknown,
    ): boolean {
      if (
        invocation !== generation ||
        phase !== 'selecting' ||
        identityConfirmed !== true ||
        !isId(candidate)
      )
        return false;
      targetId = candidate;
      phase = 'bound';
      return true;
    },
    submit(invocation: number, requestId: unknown): TargetTicket | null {
      if (
        invocation !== generation ||
        phase !== 'bound' ||
        targetId === null ||
        !isId(requestId)
      )
        return null;
      pending = Object.freeze({ generation, requestId, targetId });
      phase = 'validating';
      return pending;
    },
    resolve(
      ticket: unknown,
      currentTargetId: unknown,
      identityConfirmed: unknown,
      targetAllowed: unknown,
    ): TargetTicket | null {
      // Object identity rejects forged/replayed/cross-instance completion tokens.
      if (phase !== 'validating' || ticket !== pending) return null;
      const result = pending;
      clear();
      phase = 'consumed';
      if (
        result === null ||
        currentTargetId !== result.targetId ||
        identityConfirmed !== true ||
        targetAllowed !== true
      )
        return null;
      return result;
    },
    observe(event: TargetInvalidation | 'companion-focus'): void {
      // All other lifecycle events discard identity; unknown runtime values also deny.
      if (event !== 'companion-focus') clear();
    },
  };
}
