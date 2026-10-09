export type ChatStatus = 'idle' | 'typing' | 'complete' | 'stopped' | 'error';
export interface ChatState {
  status: ChatStatus;
  prompt: string;
  response: string;
  run: number;
}
export const initialChat: ChatState = {
  status: 'idle',
  prompt: '',
  response: '',
  run: 0,
};
export const PREVIEW_REPLY =
  'This is a local preview, not an AI answer. Your message stayed on this computer. You can copy this sample, try another message, or clear the conversation. No screen was captured.';
type Action =
  | { type: 'submit'; prompt: string }
  | { type: 'stop' | 'retry' | 'clear' }
  | { type: 'complete' | 'error'; run: number };
export function chatReducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case 'submit': {
      const prompt = action.prompt.trim();
      if (!prompt || prompt.length > 2000 || state.status === 'typing')
        return state;
      return { status: 'typing', prompt, response: '', run: state.run + 1 };
    }
    case 'stop':
      return state.status === 'typing'
        ? { ...state, status: 'stopped', run: state.run + 1 }
        : state;
    case 'retry':
      return state.status === 'stopped' || state.status === 'error'
        ? { ...state, status: 'typing', run: state.run + 1 }
        : state;
    case 'clear':
      return { ...initialChat, run: state.run + 1 };
    case 'complete':
    case 'error':
      if (state.status !== 'typing' || action.run !== state.run) return state;
      return {
        ...state,
        status: action.type,
        response: action.type === 'complete' ? PREVIEW_REPLY : '',
      };
  }
}
