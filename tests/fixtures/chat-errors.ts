import type { ChatErrorCode } from '../../src/core/chat-protocol';

// Independent acceptance copy, not read back from the production message map.
// Record makes a newly added error code require an explicit recovery expectation.
export const errorCases = {
  INVALID_INPUT: {
    message:
      'Enter a message of 1–2,000 characters. Images are unavailable in this preview.',
    status: 'error',
    role: 'alert',
  },
  NOT_CONNECTED: {
    message:
      'The mock provider is disconnected. Retry to start a fresh local session.',
    status: 'error',
    role: 'alert',
  },
  BUSY: {
    message: 'The provider was busy. Retry to start a fresh response.',
    status: 'error',
    role: 'alert',
  },
  TEXT_UNSUPPORTED: {
    message:
      'This provider cannot answer text questions. No other provider was selected.',
    status: 'error',
    role: 'alert',
  },
  VISION_UNSUPPORTED: {
    message:
      'This mock provider cannot read images. Choose Sample reply for text-only chat.',
    status: 'error',
    role: 'alert',
  },
  OFFLINE: {
    message:
      'Simulated offline error. Choose Sample reply and retry. Nothing left this computer.',
    status: 'error',
    role: 'alert',
  },
  AUTH_EXPIRED: {
    message:
      'Simulated expired sign-in. No real account is connected. Choose Sample reply and retry.',
    status: 'error',
    role: 'alert',
  },
  RATE_LIMITED: {
    message:
      'Simulated rate limit. No automatic retry was made. Choose Sample reply and retry.',
    status: 'error',
    role: 'alert',
  },
  CANCELLED: {
    message: 'Stopped. Nothing was sent to an external service.',
    status: 'stopped',
    role: 'status',
  },
  INTERNAL: {
    message:
      'The local reply could not finish. Retry to start a fresh response.',
    status: 'error',
    role: 'alert',
  },
} as const satisfies Record<
  ChatErrorCode,
  { message: string; status: 'error' | 'stopped'; role: 'alert' | 'status' }
>;
