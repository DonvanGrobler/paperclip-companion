import { expect, it } from 'vitest';
import { CHAT_ERRORS } from '../../src/core/chat-protocol';
import { chatReducer, initialChat } from '../../src/renderer/chat-state';
import { errorCases } from '../fixtures/chat-errors';

it.each(Object.entries(errorCases))(
  'preserves partial text and offers a fresh explicit retry for %s',
  (code, expected) => {
    const start = chatReducer(initialChat, {
      type: 'submit',
      prompt: 'Synthetic request',
    });
    const partial = chatReducer(start, {
      type: 'chunk',
      run: start.run,
      text: 'Partial synthetic reply.',
    });
    const failure = chatReducer(partial, {
      type: 'error',
      run: start.run,
      code: code as keyof typeof errorCases,
    });
    expect(failure.status).toBe(expected.status);
    expect(failure.response).toBe('Partial synthetic reply.');
    expect(CHAT_ERRORS[failure.error!]).toBe(expected.message);
    expect(
      chatReducer(failure, { type: 'chunk', run: start.run, text: 'late' }),
    ).toBe(failure);
    const retry = chatReducer(failure, { type: 'retry' });
    expect(retry).toMatchObject({
      status: 'typing',
      response: '',
      error: null,
      prompt: start.prompt,
    });
    expect(retry.run).toBeGreaterThan(start.run);
    expect(
      chatReducer(retry, { type: 'error', run: start.run, code: 'INTERNAL' }),
    ).toBe(retry);
    expect(chatReducer(retry, { type: 'clear' })).toMatchObject({
      ...initialChat,
      run: retry.run + 1,
    });
  },
);
