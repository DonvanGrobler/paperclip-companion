import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import cases from '../fixtures/provider-cases.json';
import {
  parseChatInput,
  ProviderError,
  MAX_IMAGE_BYTES,
} from '../../src/core/provider';
import {
  createMockProvider,
  type MockScenario,
} from '../../src/providers/mock';
const capabilities = { text: true, vision: true, streaming: true };
const signal = () => new AbortController().signal;
const input = { prompt: 'Synthetic question' };
afterEach(() => vi.restoreAllMocks());

describe('provider input boundary', () => {
  it('normalizes text and snapshots bounded image bytes without retaining extra data', () => {
    expect(parseChatInput({ prompt: '  question  ' }, capabilities)).toEqual({
      prompt: 'question',
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const result = parseChatInput(
      { prompt: 'image', screenshot: { mimeType: 'image/png', bytes } },
      capabilities,
    );
    bytes[0] = 255;
    expect(result.screenshot!.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(
      parseChatInput(
        { prompt: 'jpeg', screenshot: { mimeType: 'image/jpeg', bytes } },
        capabilities,
      ).screenshot!.mimeType,
    ).toBe('image/jpeg');
  });
  it.each([
    null,
    [],
    {},
    { prompt: 5 },
    { prompt: ' ' },
    { prompt: 'x'.repeat(2001) },
    { prompt: 'x', command: 'run' },
    { prompt: 'x', screenshot: null },
    { prompt: 'x', screenshot: [] },
    { prompt: 'x', screenshot: {} },
    {
      prompt: 'x',
      screenshot: { mimeType: 'image/gif', bytes: new Uint8Array([1]) },
    },
    { prompt: 'x', screenshot: { mimeType: 'image/png', bytes: [1] } },
    {
      prompt: 'x',
      screenshot: { mimeType: 'image/png', bytes: new Uint8Array() },
    },
    {
      prompt: 'x',
      screenshot: {
        mimeType: 'image/png',
        bytes: new Uint8Array(MAX_IMAGE_BYTES + 1),
      },
    },
    {
      prompt: 'x',
      screenshot: {
        mimeType: 'image/png',
        bytes: new Uint8Array([1]),
        path: 'private',
      },
    },
  ])('rejects invalid payload %# with a fixed error', (value) => {
    expect(() => parseChatInput(value, capabilities)).toThrow('INVALID_INPUT');
  });
  it('enforces capability denials and accepts exact configured limits', () => {
    expect(() =>
      parseChatInput(input, { ...capabilities, text: false }),
    ).toThrow('TEXT_UNSUPPORTED');
    const image = {
      prompt: 'x',
      screenshot: { mimeType: 'image/png', bytes: new Uint8Array([1]) },
    };
    expect(() =>
      parseChatInput(image, { ...capabilities, vision: false }),
    ).toThrow('VISION_UNSUPPORTED');
    expect(
      parseChatInput(
        {
          prompt: 'x'.repeat(2000),
          screenshot: {
            mimeType: 'image/png',
            bytes: new Uint8Array(MAX_IMAGE_BYTES),
          },
        },
        capabilities,
      ).prompt,
    ).toHaveLength(2000);
  });
});

describe('executable deterministic mock', () => {
  for (const entry of cases.cases) {
    it(`matches P0 fixture ${entry.id} without any network request`, async () => {
      const network = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
      const provider = createMockProvider({
        scenario: entry.id as MockScenario,
        vision: entry.id === 'vision-success',
      });
      await provider.connect();
      const request = {
        prompt: entry.input.prompt,
        ...(entry.input.screenId
          ? {
              screenshot: {
                mimeType: 'image/png' as const,
                bytes: new Uint8Array(
                  readFileSync(
                    new URL(
                      `../fixtures/screens/${entry.input.screenId}.png`,
                      import.meta.url,
                    ),
                  ),
                ),
              },
            }
          : {}),
      };
      const events: Array<{ type: string; text?: string; code?: string }> = [];
      try {
        for await (const text of provider.streamReply(request, signal()))
          events.push({ type: 'chunk', text });
        events.push({ type: 'done' });
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        const { code } = error as ProviderError;
        events.push(
          code === 'CANCELLED'
            ? { type: 'cancelled' }
            : { type: 'error', code },
        );
      }
      expect(events).toEqual(entry.events);
      expect(network).not.toHaveBeenCalled();
      await provider.disconnect();
    });
  }
  it('requires connection, stable capabilities and explicit valid scenario options', async () => {
    const provider = createMockProvider();
    expect(provider.id).toBe('mock');
    const caps = await provider.capabilities();
    expect(caps).toEqual({ text: true, vision: false, streaming: true });
    caps.vision = true;
    expect((await provider.capabilities()).vision).toBe(false);
    await expect(
      provider.streamReply(input, signal()).next(),
    ).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
      message: 'NOT_CONNECTED',
    });
    expect(() =>
      createMockProvider({ scenario: 'unknown' as MockScenario }),
    ).toThrow('INVALID_INPUT');
    expect(() =>
      createMockProvider({ vision: 'true' as unknown as boolean }),
    ).toThrow('INVALID_INPUT');
    await provider.connect();
    await provider.connect();
    await expect(
      provider.streamReply({ prompt: '' }, signal()).next(),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const vision = createMockProvider({
      scenario: 'vision-success',
      vision: true,
    });
    await vision.connect();
    await expect(
      vision.streamReply(input, signal()).next(),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('cancels before or between chunks without exposing the abort reason; consumer return frees the slot', async () => {
    const provider = createMockProvider();
    await provider.connect();
    const controller = new AbortController();
    controller.abort('private reason');
    await expect(
      provider.streamReply(input, controller.signal).next(),
    ).rejects.toMatchObject({ code: 'CANCELLED', message: 'CANCELLED' });
    const nextController = new AbortController();
    const stream = provider.streamReply(input, nextController.signal);
    expect((await stream.next()).value).toBe('A pivot table ');
    nextController.abort(new Error('private reason'));
    await expect(stream.next()).rejects.toMatchObject({ code: 'CANCELLED' });
    const next = provider.streamReply(input, signal());
    await next.next();
    await next.return();
    const final = provider.streamReply(input, signal());
    expect((await final.next()).value).toBe('A pivot table ');
    await final.return();
  });
  it('isolates instances, rejects overlap and rejects stale output after disconnect/reconnect', async () => {
    const provider = createMockProvider();
    await provider.connect();
    const old = provider.streamReply(input, signal());
    await old.next();
    await expect(
      provider.streamReply(input, signal()).next(),
    ).rejects.toMatchObject({ code: 'BUSY' });
    const other = createMockProvider();
    await other.connect();
    const independent = other.streamReply(input, signal());
    await independent.next();
    await independent.return();
    await provider.disconnect();
    await provider.connect();
    const current = provider.streamReply(input, signal());
    await current.next();
    await expect(old.next()).rejects.toMatchObject({ code: 'CANCELLED' });
    // Completing the stale generator must not clear the new request's busy slot.
    await expect(
      provider.streamReply(input, signal()).next(),
    ).rejects.toMatchObject({ code: 'BUSY' });
    await current.return();
    const disconnected = provider.streamReply(input, signal());
    await disconnected.next();
    await provider.disconnect();
    await expect(disconnected.next()).rejects.toMatchObject({
      code: 'CANCELLED',
    });
  });
  it('does not echo prompts or log payloads and does not start work merely by constructing a stream', async () => {
    const logs = vi.spyOn(console, 'log');
    const errors = vi.spyOn(console, 'error');
    const provider = createMockProvider();
    await provider.connect();
    const lazy = provider.streamReply(
      { prompt: 'private synthetic marker' },
      signal(),
    );
    const output = [];
    for await (const chunk of provider.streamReply(input, signal()))
      output.push(chunk);
    expect(output.join('')).toBe('A pivot table summarizes grouped data.');
    expect(output.join('')).not.toContain('private synthetic marker');
    await lazy.return();
    expect(logs).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });
});
