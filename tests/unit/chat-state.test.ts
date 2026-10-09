import { CHAT_ERRORS } from '../../src/core/chat-protocol';
import { expect, it } from 'vitest';
import { initialChat, chatReducer } from '../../src/renderer/chat-state';
it('rejects empty, oversized and concurrent submissions', () => {
  expect(chatReducer(initialChat, { type: 'submit', prompt: '  ' })).toBe(
    initialChat,
  );
  expect(
    chatReducer(initialChat, { type: 'submit', prompt: 'x'.repeat(2001) }),
  ).toBe(initialChat);
  const typing = chatReducer(initialChat, { type: 'submit', prompt: 'hello' });
  expect(chatReducer(typing, { type: 'submit', prompt: 'again' })).toBe(typing);
});
it('ignores late completion after stop, clear and retry', () => {
  const typing = chatReducer(initialChat, { type: 'submit', prompt: 'hello' });
  const stopped = chatReducer(typing, { type: 'stop' });
  expect(chatReducer(stopped, { type: 'complete', run: typing.run })).toBe(
    stopped,
  );
  const retry = chatReducer(stopped, { type: 'retry' });
  expect(retry.status).toBe('typing');
  expect(
    chatReducer(retry, { type: 'error', run: typing.run, code: 'OFFLINE' }),
  ).toBe(retry);
  const clear = chatReducer(retry, { type: 'clear' });
  expect(clear.prompt).toBe('');
  expect(chatReducer(clear, { type: 'complete', run: retry.run })).toBe(clear);
});
it('supports explicit errors, retry and streamed completion', () => {
  const typing = chatReducer(initialChat, {
    type: 'submit',
    prompt: '<script>test</script>',
  });
  const error = chatReducer(typing, {
    type: 'error',
    run: typing.run,
    code: 'OFFLINE',
  });
  expect(error.status).toBe('error');
  const retry = chatReducer(error, { type: 'retry' });
  const partial = chatReducer(retry, {
    type: 'chunk',
    run: retry.run,
    text: 'local sample',
  });
  const done = chatReducer(partial, { type: 'complete', run: retry.run });
  expect(done.status).toBe('complete');
  expect(done.response).toBe('local sample');
  expect(chatReducer(done, { type: 'retry' })).toBe(done);
  expect(chatReducer(done, { type: 'stop' })).toBe(done);
});

it('keeps partial output on stop, resets on retry and ignores stale chunks', () => {
  const start = chatReducer(initialChat, { type: 'submit', prompt: 'hi' });
  const partial = chatReducer(start, {
    type: 'chunk',
    run: start.run,
    text: 'partial',
  });
  const stopped = chatReducer(partial, { type: 'stop' });
  expect(stopped.response).toBe('partial');
  const retry = chatReducer(stopped, { type: 'retry' });
  expect(retry.response).toBe('');
  expect(
    chatReducer(retry, { type: 'chunk', run: start.run, text: 'late' }),
  ).toBe(retry);
  expect(
    chatReducer(stopped, { type: 'chunk', run: start.run, text: 'late' }),
  ).toBe(stopped);
  expect(
    chatReducer(start, { type: 'error', run: start.run, code: 'CANCELLED' })
      .status,
  ).toBe('stopped');
});
it('bounds displayed output and handles every fixed error code', () => {
  const start = chatReducer(initialChat, { type: 'submit', prompt: 'hi' });
  const invalid = chatReducer(start, {
    type: 'chunk',
    run: start.run,
    text: 'x'.repeat(12001),
  });
  expect(invalid.status).toBe('error');
  expect(invalid.response).toBe('');
  for (const code of Object.keys(CHAT_ERRORS) as (keyof typeof CHAT_ERRORS)[]) {
    const result = chatReducer(start, { type: 'error', run: start.run, code });
    expect(result.error).toBe(code);
    expect(CHAT_ERRORS[result.error!]).toEqual(expect.any(String));
    expect(result.status).toBe(code === 'CANCELLED' ? 'stopped' : 'error');
  }
});
