import { afterEach, expect, it, vi } from 'vitest';
import { createChatSession, paceMock } from '../../src/main/chat-session';
import { createMockProvider } from '../../src/providers/mock';
import { ProviderError } from '../../src/core/provider';
import { CHAT_ERRORS } from '../../src/core/chat-protocol';

const request = { run: 1, prompt: 'hello', scenario: 'reply' };
const immediate = async () => {};
afterEach(() => vi.useRealTimers());
it('does no idle work, streams bounded text, completes and rejects replay', async () => {
  const factory = vi.fn(createMockProvider);
  const chat = createChatSession(factory, immediate);
  expect(factory).not.toHaveBeenCalled();
  expect(chat.start(request)).toBe(true);
  expect(chat.start({ ...request, run: 2 })).toBe(false);
  expect(await chat.next(1)).toEqual({ type: 'chunk', text: 'A pivot table ' });
  expect(await chat.next(1)).toEqual({
    type: 'chunk',
    text: 'summarizes grouped data.',
  });
  expect(await chat.next(1)).toEqual({ type: 'complete' });
  expect(await chat.next(1)).toBeNull();
  expect(chat.start(request)).toBe(false);
  expect(chat.cancel(1)).toBe(false);
  expect(chat.start({ ...request, run: 2 })).toBe(true);
  chat.reset();
});
it.each([
  null,
  [],
  {},
  { ...request, run: 0 },
  { ...request, run: 1.1 },
  { ...request, run: Number.MAX_SAFE_INTEGER + 1 },
  { ...request, prompt: '' },
  { ...request, prompt: ' '.repeat(2001) + 'x' },
  { ...request, prompt: 2 },
  { ...request, scenario: '__proto__' },
  { ...request, scenario: 'vision-success' },
  { ...request, screenshot: {} },
  { ...request, includeScreen: true },
  { ...request, consentGranted: true },
  { ...request, screen: { reviewed: true, include: true } },
  { ...request, endpoint: 'https://example.com' },
])(
  'rejects malformed or overprivileged start %# without provider work',
  (value) => {
    const factory = vi.fn(createMockProvider);
    expect(createChatSession(factory, immediate).start(value)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  },
);
it.each([
  ['error', 'OFFLINE'],
  ['auth', 'AUTH_EXPIRED'],
  ['rate', 'RATE_LIMITED'],
  ['vision', 'VISION_UNSUPPORTED'],
  ['cancel', 'CANCELLED'],
])('normalizes %s and permits explicit retry', async (scenario, code) => {
  const chat = createChatSession(createMockProvider, immediate);
  chat.start({ ...request, scenario });
  if (scenario === 'cancel')
    expect(await chat.next(1)).toEqual({
      type: 'chunk',
      text: 'Partial synthetic response.',
    });
  expect(await chat.next(1)).toEqual({ type: 'error', code });
  expect(chat.start({ ...request, run: 2 })).toBe(true);
  chat.reset();
});
it('aborts pending pacing, rejects parallel pulls and isolates the next generation', async () => {
  vi.useFakeTimers();
  const chat = createChatSession();
  chat.start(request);
  const pending = chat.next(1);
  expect(await chat.next(1)).toBeNull();
  expect(await chat.next('1')).toBeNull();
  expect(chat.cancel(2)).toBe(false);
  expect(chat.cancel(1)).toBe(true);
  chat.start({ ...request, run: 2 });
  expect(await pending).toBeNull();
  const next = chat.next(2);
  await vi.advanceTimersByTimeAsync(500);
  expect(await next).toEqual({ type: 'chunk', text: 'A pivot table ' });
  chat.reset();
  expect(vi.getTimerCount()).toBe(0);
  expect(chat.start(request)).toBe(true);
  chat.reset();
});
it('finishes the provider iterator and disconnects on stop and on completion', async () => {
  const provider = createMockProvider();
  const disconnect = vi.spyOn(provider, 'disconnect');
  const chat = createChatSession(() => provider, immediate);
  chat.start(request);
  await chat.next(1);
  chat.cancel(1);
  await vi.waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
  chat.start({ ...request, run: 2 });
  await chat.next(2);
  await chat.next(2);
  await chat.next(2);
  expect(disconnect).toHaveBeenCalledTimes(2);
});
it.each(Object.keys(CHAT_ERRORS))(
  'only exports a fixed user-safe code for %s',
  async (code) => {
    const provider = createMockProvider();
    provider.connect = async () => {
      throw code === 'INTERNAL'
        ? new Error('private prompt/token')
        : new ProviderError(
            code as ConstructorParameters<typeof ProviderError>[0],
          );
    };
    const chat = createChatSession(() => provider, immediate);
    chat.start(request);
    expect(await chat.next(1)).toEqual({ type: 'error', code });
    expect(CHAT_ERRORS[code as keyof typeof CHAT_ERRORS]).not.toMatch(
      /private prompt|token value/,
    );
  },
);
it.each(['', 'x'.repeat(12001), 42])(
  'rejects invalid adapter output %#',
  async (text) => {
    const provider = createMockProvider();
    provider.streamReply = async function* () {
      yield text as string;
    };
    const chat = createChatSession(() => provider, immediate);
    chat.start(request);
    expect(await chat.next(1)).toEqual({ type: 'error', code: 'INTERNAL' });
  },
);
it('bounds aggregate output and suppresses private cleanup errors', async () => {
  const provider = createMockProvider();
  provider.streamReply = async function* () {
    yield 'x'.repeat(12000);
    yield 'x';
  };
  provider.disconnect = async () => {
    throw new Error('private');
  };
  const chat = createChatSession(() => provider, immediate);
  chat.start(request);
  expect(await chat.next(1)).toEqual({
    type: 'chunk',
    text: 'x'.repeat(12000),
  });
  expect(await chat.next(1)).toEqual({ type: 'error', code: 'INTERNAL' });
});
it('ignores late provider results after reset even when the run number is reused', async () => {
  let release!: () => void;
  const provider = createMockProvider();
  provider.connect = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const chat = createChatSession(() => provider, immediate);
  chat.start(request);
  const pending = chat.next(1);
  await vi.waitFor(() => expect(release).toBeDefined());
  chat.reset();
  chat.start(request);
  release();
  expect(await pending).toBeNull();
  expect(chat.cancel(1)).toBe(true);
});
it('pacing handles an already aborted signal without a timer', async () => {
  vi.useFakeTimers();
  await paceMock(AbortSignal.abort());
  expect(vi.getTimerCount()).toBe(0);
});
