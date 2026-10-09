import {
  CHAT_ERRORS,
  MAX_REPLY_LENGTH,
  type ChatEvent,
  type ChatScenario,
} from '../core/chat-protocol';
import {
  MAX_PROMPT_LENGTH,
  ProviderError,
  type AIProvider,
} from '../core/provider';
import {
  createMockProvider,
  type MockOptions,
  type MockScenario,
} from '../providers/mock';

const scenarios: Record<ChatScenario, MockScenario> = {
  reply: 'text-success',
  error: 'offline',
  auth: 'token-expired',
  rate: 'rate-limit',
  vision: 'vision-unsupported',
  cancel: 'cancel',
};
const validRun = (run: unknown): run is number =>
  typeof run === 'number' && Number.isSafeInteger(run) && run > 0;

/** One abortable delay per pull; no timer or request while idle. */
export function paceMock(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, 500);
    signal.addEventListener('abort', finish, { once: true });
  });
}
interface Active {
  run: number;
  abort: AbortController;
  iterator: AsyncGenerator<string, void, unknown>;
  pulling: boolean;
  length: number;
}
export function createChatSession(
  factory: (options: MockOptions) => AIProvider = createMockProvider,
  pace: (signal: AbortSignal) => Promise<void> = paceMock,
) {
  let active: Active | undefined;
  let lastRun = 0;
  const release = (request: Active) => {
    if (active === request) active = undefined;
    request.abort.abort();
    // return runs the provider's finally even when the consumer stops between chunks.
    void request.iterator.return().catch(() => {});
  };
  return {
    start(value: unknown): boolean {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
      const data = value as Record<string, unknown>;
      if (
        active ||
        !validRun(data.run) ||
        data.run <= lastRun ||
        Object.keys(data).some(
          (key) => !['run', 'prompt', 'scenario'].includes(key),
        ) ||
        typeof data.prompt !== 'string' ||
        !data.prompt.trim() ||
        data.prompt.length > MAX_PROMPT_LENGTH ||
        typeof data.scenario !== 'string' ||
        !Object.hasOwn(scenarios, data.scenario)
      )
        return false;
      const run = data.run;
      const prompt = data.prompt.trim();
      const scenario = scenarios[data.scenario as ChatScenario];
      const abort = new AbortController();
      async function* stream() {
        const provider = factory({ scenario, vision: false });
        try {
          await provider.connect();
          if (abort.signal.aborted) return;
          yield* provider.streamReply({ prompt }, abort.signal);
        } finally {
          // Cleanup errors must not expose private exception text or replace a safe result.
          try {
            await provider.disconnect();
          } catch {
            /* No logging. */
          }
        }
      }
      active = { run, abort, iterator: stream(), pulling: false, length: 0 };
      lastRun = run;
      return true;
    },
    async next(run: unknown): Promise<ChatEvent | null> {
      const request = active;
      if (!request || run !== request.run || request.pulling) return null;
      request.pulling = true;
      try {
        await pace(request.abort.signal);
        if (active !== request) return null;
        const result = await request.iterator.next();
        if (active !== request) return null;
        if (result.done) {
          release(request);
          return { type: 'complete' };
        }
        const text = result.value;
        if (
          typeof text !== 'string' ||
          !text.length ||
          request.length + text.length > MAX_REPLY_LENGTH
        )
          throw new Error('INVALID_REPLY');
        request.length += text.length;
        return { type: 'chunk', text };
      } catch (error) {
        if (active !== request) return null;
        release(request);
        const code =
          error instanceof ProviderError &&
          Object.hasOwn(CHAT_ERRORS, error.code)
            ? error.code
            : 'INTERNAL';
        return { type: 'error', code };
      } finally {
        request.pulling = false;
      }
    },
    cancel(run: unknown): boolean {
      if (!active || run !== active.run) return false;
      release(active);
      return true;
    },
    reset(): void {
      if (active) release(active);
      lastRun = 0;
    },
  };
}
