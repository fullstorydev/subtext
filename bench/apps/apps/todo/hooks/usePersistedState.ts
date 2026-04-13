import { signal, effect } from "@preact/signals";
import { useRef } from "preact/hooks";
import { StateManager } from "../../../shared/utils/state-manager";

export function usePersistedState<T>(
  stateManager: StateManager,
  storeName: string,
  defaultValue: T,
) {
  // Get initial value from store
  const initialValue = stateManager.getStore<T>(storeName) ?? defaultValue;

  // Create a signal for reactive state
  const state = signal<T>(initialValue);

  // Track if this is the first render and if update is from remote
  const isFirstRender = useRef(true);
  const isRemoteUpdate = useRef(false);

  // Keep track of the last persisted value to avoid unnecessary updates
  const lastPersistedValue = useRef<T>(initialValue);

  // Set up effect to persist changes
  effect(() => {
    const value = state.value;

    // Skip the first render to avoid overwriting scenario data
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Skip if this update came from a remote source
    if (isRemoteUpdate.current) {
      isRemoteUpdate.current = false;
      lastPersistedValue.current = value;
      return;
    }

    // Skip if the value hasn't actually changed
    if (JSON.stringify(value) === JSON.stringify(lastPersistedValue.current)) {
      return;
    }

    lastPersistedValue.current = value;
    stateManager.updateStore(storeName, () => value);
  });

  // Subscribe to cross-tab changes
  const unsubscribe = stateManager.onStoreChange<T>(storeName, (newValue) => {
    // Set the flag and update in the next event loop tick to avoid race conditions
    isRemoteUpdate.current = true;
    setTimeout(() => {
      state.value = newValue;
    }, 0);
  });

  // Return state signal and cleanup function
  return { state, unsubscribe };
}
