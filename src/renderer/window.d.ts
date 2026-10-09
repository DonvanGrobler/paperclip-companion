export {};
declare global {
  interface Window {
    companionWindow: { close: () => void };
  }
}
