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
  expect(chatReducer(retry, { type: 'error', run: typing.run })).toBe(retry);
  const clear = chatReducer(retry, { type: 'clear' });
  expect(clear.prompt).toBe('');
  expect(chatReducer(clear, { type: 'complete', run: retry.run })).toBe(clear);
});
it('supports explicit errors, retry and fixed preview completion', () => {
  const typing = chatReducer(initialChat, {
    type: 'submit',
    prompt: '<script>test</script>',
  });
  const error = chatReducer(typing, { type: 'error', run: typing.run });
  expect(error.status).toBe('error');
  const retry = chatReducer(error, { type: 'retry' });
  const done = chatReducer(retry, { type: 'complete', run: retry.run });
  expect(done.status).toBe('complete');
  expect(done.response).toContain('local preview');
  expect(chatReducer(done, { type: 'retry' })).toBe(done);
  expect(chatReducer(done, { type: 'stop' })).toBe(done);
});
