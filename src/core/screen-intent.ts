import { MAX_PROMPT_LENGTH } from './limits.ts';

export interface ScreenIntentInput {
  prompt: string;
  submitted: boolean;
  hardExcluded: boolean;
  neverIncludeScreen: boolean;
  includeScreen: boolean;
}
export type ScreenIntentReason =
  | 'invalid-input'
  | 'excluded'
  | 'never-include'
  | 'not-submitted'
  | 'explicit-include'
  | 'unsupported-text'
  | 'negated'
  | 'quoted-or-instructional'
  | 'screen-reference'
  | 'ambiguous'
  | 'general';
export interface ScreenIntent {
  kind: 'text-only' | 'screen-context-requested';
  reason: ScreenIntentReason;
}
const keys = [
  'prompt',
  'submitted',
  'hardExcluded',
  'neverIncludeScreen',
  'includeScreen',
];
const textOnly = (reason: ScreenIntentReason): ScreenIntent => ({
  kind: 'text-only',
  reason,
});
const requested = (reason: ScreenIntentReason): ScreenIntent => ({
  kind: 'screen-context-requested',
  reason,
});

/** Intent evidence only, NEVER capture/transmission authorization. No I/O or retained state. */
export function classifyScreenIntent(value: unknown): ScreenIntent {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return textOnly('invalid-input');
  const data = value as Record<string, unknown>;
  if (
    Object.keys(data).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(data, key)) ||
    typeof data.prompt !== 'string' ||
    data.prompt.length > MAX_PROMPT_LENGTH ||
    !data.prompt.trim() ||
    keys.slice(1).some((key) => typeof data[key] !== 'boolean')
  )
    return textOnly('invalid-input');
  if (data.hardExcluded) return textOnly('excluded');
  if (data.neverIncludeScreen) return textOnly('never-include');
  if (!data.submitted) return textOnly('not-submitted');
  // An explicit UI override expresses intent, not consent, target validity or provider capability.
  if (data.includeScreen) return requested('explicit-include');
  const prompt = data.prompt;
  // Do not normalize invisible characters, confusables or other scripts into an affirmative match.
  if (/[^\x20-\x7e\r\n\t]/.test(prompt)) return textOnly('unsupported-text');
  const text = prompt.toLowerCase().replace(/\s+/g, ' ').trim();
  // Deliberately broad negation guard: missing a request is safer than inferring permission.
  if (
    /\b(?:no|not|never|without|avoid|stop|disable|refuse|cannot|can't|don't|won't|isn't|aren't|shouldn't)\b/.test(
      text,
    )
  )
    return textOnly('negated');
  if (
    /["'`]/.test(text) ||
    /\b(?:translate|rewrite|write|story|example|imagine|pretend|if|hypothetical|theoretically|phrase|sentence|meaning|expression|keyword|code|python|javascript|html|css|website|webpage|document|tutorial|says|instructs|asks|ignore|disregard|bypass|override|privacy|consent|permissions?|password|secret|confidential|token|monitoring|watch|watching|every|each|always|periodically|automatically|continuous|later|tomorrow|yesterday|tonight|week|after|support|text[- ]only)\b/.test(
      text,
    )
  )
    return textOnly('quoted-or-instructional');
  const task =
    /^(?:please )?(?:what|why|where|how|which|can you|could you|help|explain|describe|read|summarize|check|inspect|look at|tell me)\b/.test(
      text,
    );
  const anchored =
    /\b(?:on (?:my|this) (?:screen|display)|in (?:this|the active) window)\b/.test(
      text,
    );
  const direct =
    /^(?:please )?(?:look at|read|inspect|describe|summarize|explain|check) (?:my|this) (?:screen|window|display)[.!?]*$/.test(
      text,
    );
  if ((task && anchored) || direct) return requested('screen-reference');
  return textOnly(
    /\b(?:this|that|here|it|screen|display|window|error|warning)\b/.test(text)
      ? 'ambiguous'
      : 'general',
  );
}
