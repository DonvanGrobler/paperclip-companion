import { useEffect, useRef } from 'react';
import type {
  ScreenPreviewAction,
  ScreenPreviewState,
} from '../core/screen-preview';

export function ScreenControls({
  state,
  busy,
  onAction,
}: {
  state: ScreenPreviewState;
  busy: boolean;
  onAction: (action: ScreenPreviewAction) => void;
}) {
  const include = useRef<HTMLInputElement>(null);
  const never = useRef<HTMLInputElement>(null);
  const review = useRef<HTMLButtonElement>(null);
  const wasReviewed = useRef(state.reviewed);
  useEffect(() => {
    if (wasReviewed.current !== state.reviewed) {
      (state.reviewed
        ? state.neverInclude || busy
          ? never.current
          : include.current
        : review.current
      )?.focus();
      wasReviewed.current = state.reviewed;
    }
  }, [state.reviewed, state.neverInclude, busy]);
  return (
    <details className="screen-controls">
      <summary>Screen context · unavailable in this preview</summary>
      <p id="screen-disclosure">
        Screen context will be optional. A submitted screen-related question or
        Include screen can request one permitted window or display, never
        continuous recording. Before real sharing, you must consent to the
        selected provider and account. The app must not save screenshot files,
        but the provider has its own privacy and retention rules. Never and
        application exclusions override screen requests.
      </p>
      <p id="screen-preview-help">
        This offline mock has no account or capture capability. Try the controls
        locally without granting screen-sharing consent. Automatic screen
        context is not active. Choices reset when you close or reload chat.
      </p>
      <div className="chat-actions">
        {!state.reviewed && (
          <button
            ref={review}
            type="button"
            onClick={() => onAction({ type: 'review' })}
          >
            Try controls locally
          </button>
        )}
        <button type="button" onClick={() => onAction({ type: 'withdraw' })}>
          Use text only
        </button>
      </div>
      <label>
        <input
          ref={never}
          type="checkbox"
          checked={state.neverInclude}
          onChange={(event) =>
            onAction({ type: 'never', value: event.target.checked })
          }
        />
        Never include screen in this window
      </label>
      <label>
        <input
          ref={include}
          type="checkbox"
          checked={state.include}
          disabled={!state.reviewed || state.neverInclude || busy}
          aria-describedby="screen-preview-help"
          onChange={(event) =>
            onAction({ type: 'include', value: event.target.checked })
          }
        />
        Include screen for next message
      </label>
      <p className="screen-choice" role="status">
        {state.neverInclude
          ? 'Never is on. No screen will be included.'
          : state.reviewed
            ? 'Controls preview only. No screen-sharing consent granted.'
            : 'Text only. Screen-sharing consent has not been requested.'}
      </p>
    </details>
  );
}
