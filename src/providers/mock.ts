import {
  parseChatInput,
  ProviderError,
  type AIProvider,
  type ChatInput,
  type ProviderCapabilities,
  type ProviderErrorCode,
} from '../core/provider';

type Script = { chunks: readonly string[]; error?: ProviderErrorCode };
// Independently authored P0 fixture scripts. They never inspect image pixels or echo input.
const scripts = {
  'text-success': { chunks: ['A pivot table ', 'summarizes grouped data.'] },
  'vision-success': {
    chunks: [
      'The synthetic sheet shows B1 is zero. ',
      'Check the divisor before dividing.',
    ],
  },
  offline: { chunks: [], error: 'OFFLINE' },
  'token-expired': { chunks: [], error: 'AUTH_EXPIRED' },
  'rate-limit': { chunks: [], error: 'RATE_LIMITED' },
  'vision-unsupported': { chunks: [], error: 'VISION_UNSUPPORTED' },
  cancel: { chunks: ['Partial synthetic response.'], error: 'CANCELLED' },
} as const satisfies Record<string, Script>;
export type MockScenario = keyof typeof scripts;
export interface MockOptions {
  scenario?: MockScenario;
  vision?: boolean;
}

/** Offline scripted adapter; production callers are owned by main/chat-session. */
export function createMockProvider(options: MockOptions = {}) {
  const scenario = options.scenario ?? 'text-success';
  const vision = options.vision ?? false;
  if (!Object.hasOwn(scripts, scenario) || typeof vision !== 'boolean')
    throw new ProviderError('INVALID_INPUT');
  const script: Script = scripts[scenario];
  const capabilities: ProviderCapabilities = {
    text: true,
    vision,
    streaming: true,
  };
  let connected = false;
  let generation = 0;
  let active: symbol | undefined;
  const provider = {
    id: 'mock',
    async capabilities() {
      return { ...capabilities };
    },
    async connect() {
      connected = true;
    },
    async disconnect() {
      connected = false;
      generation++;
      active = undefined;
    },
    async *streamReply(
      input: ChatInput,
      signal: AbortSignal,
    ): AsyncGenerator<string, void, unknown> {
      if (signal.aborted) throw new ProviderError('CANCELLED');
      if (!connected) throw new ProviderError('NOT_CONNECTED');
      if (active) throw new ProviderError('BUSY');
      const hasImage = Boolean(parseChatInput(input, capabilities).screenshot);
      if (scenario === 'vision-success' && !hasImage)
        throw new ProviderError('INVALID_INPUT');
      const epoch = generation;
      const token = Symbol();
      active = token;
      const check = () => {
        if (signal.aborted || !connected || generation !== epoch)
          throw new ProviderError('CANCELLED');
      };
      try {
        for (const chunk of script.chunks) {
          check();
          yield chunk;
        }
        check();
        if (script.error) throw new ProviderError(script.error);
      } finally {
        // A stale iterator must never release a newly connected request's slot.
        if (active === token) active = undefined;
      }
    },
  } satisfies AIProvider;
  return provider;
}
