import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Chat } from './chat';

function App() {
  const [greeting, setGreeting] = useState(false);
  useEffect(() => {
    if (!greeting) return;
    const timeout = window.setTimeout(() => setGreeting(false), 1_200);
    return () => window.clearTimeout(timeout);
  }, [greeting]);

  return (
    <main className="companion" data-state={greeting ? 'greeting' : 'idle'}>
      <header className="handle" title="Drag here to move the companion">
        <span className="grip" aria-hidden="true">
          ⠿
        </span>
        <span>Paperclip Companion</span>
        <button
          className="close"
          aria-label="Close companion"
          onClick={() => window.companionWindow.close()}
        >
          ×
        </button>
      </header>
      <div className="character-stage">
        <svg
          className="character"
          viewBox="0 0 180 210"
          role="img"
          aria-label="An original teal paperclip character"
        >
          <ellipse className="shadow" cx="88" cy="195" rx="40" ry="7" />
          <g className="wire">
            <path
              className="wire-outline"
              d="M 112 158 L 112 58 C 112 20 58 20 58 58 L 58 155 C 58 192 136 192 136 151 L 136 64 C 136 4 34 4 34 67 L 34 144"
            />
            <path
              className="wire-highlight"
              d="M 112 158 L 112 58 C 112 20 58 20 58 58 L 58 155 C 58 192 136 192 136 151 L 136 64 C 136 4 34 4 34 67 L 34 144"
            />
            <rect
              className="face"
              x="65"
              y="77"
              width="57"
              height="45"
              rx="18"
            />
            <g className="eyes">
              <circle cx="81" cy="94" r="3" />
              <circle cx="106" cy="94" r="3" />
            </g>
            <path className="smile" d="M 86 106 Q 94 113 102 106" />
            <circle className="badge" cx="37" cy="143" r="12" />
            <path className="badge-mark" d="M 31 143 L 36 148 L 43 138" />
          </g>
        </svg>
      </div>
      <section className="bubble" aria-labelledby="status-heading">
        <h1 id="status-heading">Companion preview</h1>
        <p role="status" aria-live="polite">
          {greeting ? 'Hello there!' : 'A little help, close at hand.'}
        </p>
        <button
          className="hello"
          onClick={() => window.companionWindow.openChat()}
        >
          Open chat
        </button>
        <button className="hello" onClick={() => setGreeting(true)}>
          Say hello
        </button>
      </section>
      <p className="hint">Tray menu: show, recover or quit</p>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('SHELL_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    {window.location.pathname === '/chat.html' ? <Chat /> : <App />}
  </StrictMode>,
);
