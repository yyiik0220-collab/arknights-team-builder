const state = {
  masterData: null,
  roster: [],
  activeView: 'dashboard',
  selectedStageId: null,
  filters: {},
  // リージョン切替（CN / Global）用の状態。言語設定（prefs.language）とは独立。
  region: 'cn',
  activeRegion: null
};

const listeners = new Set();

/** Return a read-only snapshot of application state. @returns {Readonly<typeof state>} */
export function getState() {
  return structuredClone(state);
}

/** Update application state and notify subscribers. @param {Partial<typeof state>} changes */
export function updateState(changes) {
  Object.assign(state, changes);
  const snapshot = getState();
  listeners.forEach((listener) => listener(snapshot));
}

/** Subscribe to state updates. @param {(snapshot: Readonly<typeof state>) => void} listener @returns {() => void} */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
