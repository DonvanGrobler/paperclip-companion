export interface ProviderCapabilities {
  text: boolean;
  vision: boolean;
  streaming: boolean;
}
export interface ChatInput {
  prompt: string;
  screenshot?: { mimeType: 'image/png' | 'image/jpeg'; bytes: Uint8Array };
}
export type ProviderErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_CONNECTED'
  | 'BUSY'
  | 'TEXT_UNSUPPORTED'
  | 'VISION_UNSUPPORTED'
  | 'OFFLINE'
  | 'AUTH_EXPIRED'
  | 'RATE_LIMITED'
  | 'CANCELLED';
/** Fixed codes only. Never embed provider exception messages, prompts or abort reasons. */
export class ProviderError extends Error {
  constructor(readonly code: ProviderErrorCode) {
    super(code);
    this.name = 'ProviderError';
  }
}
export interface AIProvider {
  readonly id: string;
  capabilities(): Promise<ProviderCapabilities>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  streamReply(input: ChatInput, signal: AbortSignal): AsyncIterable<string>;
}
export const MAX_PROMPT_LENGTH = 2000;
// Local contract budget, not a claim about a real provider's upload limit.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

/** Payload validation only; capture consent/target authorization must be checked separately. */
export function parseChatInput(
  value: unknown,
  capabilities: ProviderCapabilities,
): ChatInput {
  const invalid = () => new ProviderError('INVALID_INPUT');
  if (
    !record(value) ||
    !exactKeys(value, ['prompt', 'screenshot']) ||
    typeof value.prompt !== 'string' ||
    value.prompt.length > MAX_PROMPT_LENGTH ||
    !value.prompt.trim()
  )
    throw invalid();
  if (!capabilities.text) throw new ProviderError('TEXT_UNSUPPORTED');
  const prompt = value.prompt.trim();
  if (!('screenshot' in value)) return { prompt };
  const image = value.screenshot;
  if (
    !record(image) ||
    !exactKeys(image, ['mimeType', 'bytes']) ||
    (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg') ||
    !(image.bytes instanceof Uint8Array) ||
    image.bytes.byteLength === 0 ||
    image.bytes.byteLength > MAX_IMAGE_BYTES
  )
    throw invalid();
  if (!capabilities.vision) throw new ProviderError('VISION_UNSUPPORTED');
  // Copy only after capability/size checks so callers cannot mutate the accepted snapshot.
  return {
    prompt,
    screenshot: {
      mimeType: image.mimeType,
      bytes: new Uint8Array(image.bytes),
    },
  };
}
