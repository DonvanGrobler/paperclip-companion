import { MAX_REPLY_LENGTH, type ChatErrorCode } from '../core/chat-protocol';
import { MAX_PROMPT_LENGTH } from '../core/provider';
export type ChatStatus = 'idle' | 'typing' | 'complete' | 'stopped' | 'error';
export interface ChatState {
  status: ChatStatus;
  prompt: string;
  response: string;
  run: number;
  error: ChatErrorCode | null;
}
export const initialChat: ChatState = {
  status: 'idle',
  prompt: '',
  response: '',
  run: 0,
  error: null,
};
type Action =
  | { type: 'submit'; prompt: string }
  | { type: 'stop' | 'retry' | 'clear' }
  | { type: 'chunk'; run: number; text: string }
  | { type: 'complete'; run: number }
  | { type: 'error'; run: number; code: ChatErrorCode };
export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'submit': {
      const prompt = action.prompt.trim();
      if (
        !prompt ||
        action.prompt.length > MAX_PROMPT_LENGTH ||
        state.status === 'typing'
      )
        return state;
      return {
        status: 'typing',
        prompt,
        response: '',
        run: state.run + 1,
        error: null,
      };
    }
    case 'stop':
      return state.status === 'typing'
        ? {
            ...state,
            status: 'stopped',
            run: state.run + 1,
            error: 'CANCELLED',
          }
        : state;
    case 'retry':
      return state.status === 'stopped' || state.status === 'error'
        ? {
            ...state,
            status: 'typing',
            response: '',
            error: null,
            run: state.run + 1,
          }
        : state;
    case 'clear':
      return { ...initialChat, run: state.run + 1 };
    case 'chunk':
    case 'complete':
    case 'error':
      if (state.status !== 'typing' || action.run !== state.run) return state;
      if (action.type === 'chunk') {
        if (state.response.length + action.text.length > MAX_REPLY_LENGTH)
          return { ...state, status: 'error', error: 'INTERNAL' };
        return { ...state, response: state.response + action.text };
      }
      if (action.type === 'error')
        return {
          ...state,
          status: action.code === 'CANCELLED' ? 'stopped' : 'error',
          error: action.code,
        };
      return { ...state, status: 'complete' };
  }
}
