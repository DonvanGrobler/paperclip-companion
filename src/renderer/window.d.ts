import type { ChatStart, ChatEvent } from '../core/chat-protocol';
declare global {
  interface Window {
    companionWindow: {
      chatStart: (request: ChatStart) => Promise<boolean>;
      chatNext: (run: number) => Promise<ChatEvent | null>;
      chatCancel: (run: number) => Promise<boolean>;
      close: () => void;
      openChat: () => void;
      copyText: (text: string) => Promise<boolean>;
    };
  }
}
