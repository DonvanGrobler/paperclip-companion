/** Renderer-only UX state. Never convert this acknowledgement into capture consent. */
export interface ScreenPreviewState {
  reviewed: boolean;
  neverInclude: boolean;
  include: boolean;
}
export const initialScreenPreview: ScreenPreviewState = {
  reviewed: false,
  neverInclude: false,
  include: false,
};
export type ScreenPreviewAction =
  | { type: 'review' | 'withdraw' | 'reset-request' }
  | { type: 'include' | 'never'; value: boolean };

export function screenPreviewReducer(
  state: ScreenPreviewState,
  action: ScreenPreviewAction,
): ScreenPreviewState {
  switch (action.type) {
    case 'review':
      return { ...state, reviewed: true, include: false };
    case 'withdraw':
      return { ...state, reviewed: false, include: false };
    case 'reset-request':
      return { ...state, include: false };
    case 'never':
      return { ...state, neverInclude: action.value, include: false };
    case 'include':
      return {
        ...state,
        include: action.value && state.reviewed && !state.neverInclude,
      };
  }
}

export function screenPreviewSubmission(
  state: ScreenPreviewState,
): 'text-only' | 'confirm-text-only' {
  return state.reviewed && !state.neverInclude && state.include
    ? 'confirm-text-only'
    : 'text-only';
}
