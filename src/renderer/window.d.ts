export {};
declare global {
  interface Window {
    companionWindow: {
      close: () => void;
      openChat: () => void;
      copyText: (text: string) => Promise<boolean>;
    };
  }
}
