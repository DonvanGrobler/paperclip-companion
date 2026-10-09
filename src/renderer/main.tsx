import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main>
      <p className="eyebrow">PAPERCLIP COMPANION</p>
      <h1>
        A little help,
        <br />
        close at hand.
      </h1>
      <p className="intro">Your desktop companion is taking shape.</p>
      <section aria-labelledby="status-heading">
        <h2 id="status-heading">Foundation preview</h2>
        <p>
          The desktop shell is ready. Chat and the animated companion are coming
          in the next development stages.
        </p>
        <p className="privacy">
          No screen capture. No account connection. No messages sent.
        </p>
      </section>
      <footer>Independent hobby project · Early development</footer>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('SHELL_ROOT_MISSING');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
