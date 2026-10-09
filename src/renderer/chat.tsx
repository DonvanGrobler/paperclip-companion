import { useEffect, useReducer, useRef, useState } from 'react';
import { chatReducer, initialChat } from './chat-state';

export function Chat() {
  const [state, dispatch] = useReducer(chatReducer, initialChat);
  const [draft, setDraft] = useState('');
  const [scenario, setScenario] = useState('reply');
  const [copyStatus, setCopyStatus] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const copyAttempt = useRef(0);
  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (state.status !== 'typing') return;
    const timer = window.setTimeout(
      () =>
        dispatch({
          type: scenario === 'error' ? 'error' : 'complete',
          run: state.run,
        }),
      1500,
    );
    return () => window.clearTimeout(timer);
  }, [state.run, state.status, scenario]);
  useEffect(() => {
    copyAttempt.current++;
    setCopyStatus('');
  }, [state.run]);
  const submit = () => {
    if (
      !draft.trim() ||
      draft.trim().length > 2000 ||
      state.status === 'typing'
    )
      return;
    dispatch({ type: 'submit', prompt: draft });
    setDraft('');
    input.current?.focus();
  };
  const copy = async () => {
    const attempt = ++copyAttempt.current;
    let ok = false;
    try {
      ok = await window.companionWindow.copyText(state.response);
    } catch {
      /* Fixed UI text only. */
    }
    if (attempt === copyAttempt.current)
      setCopyStatus(
        ok
          ? 'Copied response.'
          : 'Could not copy. Select the response and press Ctrl+C.',
      );
  };
  const clear = () => {
    dispatch({ type: 'clear' });
    setDraft('');
    input.current?.focus();
  };
  const status = {
    idle: 'Ready for a preview message.',
    typing: 'Preparing a sample reply…',
    complete: 'Sample reply ready.',
    stopped: 'Stopped. No request was sent.',
    error: 'Simulated error. Nothing was sent. Choose Sample reply and retry.',
  }[state.status];
  return (
    <main className="chat-shell">
      <header className="chat-header">
        <div>
          <p className="eyebrow">LOCAL PREVIEW</p>
          <h1>Paperclip chat</h1>
        </div>
        <button onClick={() => window.companionWindow.close()}>
          Close chat
        </button>
      </header>
      <p className="chat-notice">
        Try the chat controls with a fixed sample reply. No AI is connected and
        no screen is captured. Only the latest exchange is kept while this
        window is open.
      </p>
      <div className="chat-options">
        <label htmlFor="scenario">Preview scenario</label>
        <select
          id="scenario"
          value={scenario}
          disabled={state.status === 'typing'}
          onChange={(e) => setScenario(e.target.value)}
        >
          <option value="reply">Sample reply</option>
          <option value="error">Simulated error</option>
        </select>
        <button onClick={clear}>Clear conversation</button>
      </div>
      <section className="conversation" aria-label="Conversation" tabIndex={0}>
        {!state.prompt && (
          <p className="empty-chat">What would you like help with?</p>
        )}
        {state.prompt && (
          <article>
            <h2>You</h2>
            <p>{state.prompt}</p>
          </article>
        )}
        {state.response && (
          <article className="sample">
            <h2>Paperclip · sample reply</h2>
            <p>{state.response}</p>
            <button onClick={() => void copy()}>Copy response</button>
          </article>
        )}
      </section>
      <p
        className="chat-status"
        role={state.status === 'error' ? 'alert' : 'status'}
        aria-live={state.status === 'error' ? 'assertive' : 'polite'}
      >
        {status}
      </p>
      <p className="copy-status" role="status">
        {copyStatus}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="message">Your message</label>
        <textarea
          ref={input}
          id="message"
          maxLength={2000}
          value={draft}
          rows={3}
          aria-describedby="message-help"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <p id="message-help">
          Enter to send · Shift+Enter for a new line · 2,000 characters maximum
        </p>
        <div className="chat-actions">
          <button
            type="submit"
            disabled={!draft.trim() || state.status === 'typing'}
          >
            Send preview
          </button>
          <button
            type="button"
            disabled={state.status !== 'typing'}
            onClick={() => {
              dispatch({ type: 'stop' });
              input.current?.focus();
            }}
          >
            Stop
          </button>
          <button
            type="button"
            disabled={state.status !== 'stopped' && state.status !== 'error'}
            onClick={() => {
              dispatch({ type: 'retry' });
              input.current?.focus();
            }}
          >
            Retry
          </button>
        </div>
      </form>
    </main>
  );
}
