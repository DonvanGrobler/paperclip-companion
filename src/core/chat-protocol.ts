import type { ProviderErrorCode } from './provider';

export const MAX_REPLY_LENGTH = 12000;
export type ChatScenario =
  'reply' | 'error' | 'auth' | 'rate' | 'vision' | 'cancel';
export interface ChatStart {
  run: number;
  prompt: string;
  scenario: ChatScenario;
}
export type ChatErrorCode = ProviderErrorCode | 'INTERNAL';
export type ChatEvent =
  | { type: 'chunk'; text: string }
  | { type: 'complete' }
  | { type: 'error'; code: ChatErrorCode };
// No adapter messages or user input enter status text.
export const CHAT_ERRORS: Record<ChatErrorCode, string> = {
  INVALID_INPUT:
    'Enter a message of 1–2,000 characters. Images are unavailable in this preview.',
  NOT_CONNECTED:
    'The mock provider is disconnected. Retry to start a fresh local session.',
  BUSY: 'A reply is already running. Stop it before retrying.',
  TEXT_UNSUPPORTED:
    'This provider cannot answer text questions. No other provider was selected.',
  VISION_UNSUPPORTED:
    'This mock provider cannot read images. Choose Sample reply for text-only chat.',
  OFFLINE:
    'Simulated offline error. Choose Sample reply and retry. Nothing left this computer.',
  AUTH_EXPIRED:
    'Simulated expired sign-in. No real account is connected. Choose Sample reply and retry.',
  RATE_LIMITED:
    'Simulated rate limit. No automatic retry was made. Choose Sample reply and retry.',
  CANCELLED: 'Stopped. Nothing was sent to an external service.',
  INTERNAL:
    'The local reply could not finish. Retry to start a fresh response.',
};
