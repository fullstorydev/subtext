/**
 * State management system for Potemkin applications
 * Provides store-based state with persistence and cross-tab synchronization
 */

interface Store<T> {
  data: T;
  version: number;
  lastModified: number;
}

export class StateManager {
  private namespace: string;
  private instanceId: string;
  private tabId: string;
  private stores: Map<string, Store<any>> = new Map();
  private channel: BroadcastChannel;
  private initialized = false;
  private handlers: Map<string, Set<(data: any) => void>> = new Map();

  constructor(namespace: string) {
    this.namespace = namespace;
    this.instanceId = this.getInstanceId();

    // Generate a unique tab ID for cross-tab communication
    this.tabId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.channel = new BroadcastChannel(`potemkin_${namespace}`);

    this.setupBroadcastHandler();
  }

  /**
   * Register a store with default data
   * Must be called before initialization
   */
  registerStore<T>(storeName: string, defaultData: T): void {
    if (this.initialized) {
      throw new Error("Cannot register stores after initialization");
    }

    const key = this.getStoreKey(storeName);
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        this.stores.set(storeName, JSON.parse(stored));
      } catch (e) {
        console.error(`Failed to parse stored data for ${storeName}`, e);
        this.stores.set(storeName, {
          data: defaultData,
          version: 0,
          lastModified: Date.now(),
        });
      }
    } else {
      this.stores.set(storeName, {
        data: defaultData,
        version: 0,
        lastModified: Date.now(),
      });
    }
  }

  /**
   * Initialize from scenario data
   * Will overwrite existing data when a scenario is explicitly provided
   */
  initializeFromScenario(scenarioData: Record<string, any>): void {
    if (this.initialized) return;

    // Apply scenario data, overwriting any existing data
    Object.entries(scenarioData).forEach(([storeName, data]) => {
      if (this.stores.has(storeName)) {
        const store = {
          data,
          version: 0,
          lastModified: Date.now(),
        };
        this.stores.set(storeName, store);

        // Persist immediately
        localStorage.setItem(
          this.getStoreKey(storeName),
          JSON.stringify(store),
        );
      }
    });

    this.initialized = true;
  }

  /**
   * Mark initialization complete (call after scenario check)
   */
  finishInitialization(): void {
    this.initialized = true;
  }

  /**
   * Get data from a specific store
   */
  getStore<T>(storeName: string): T | null {
    const store = this.stores.get(storeName);
    return store ? store.data : null;
  }

  /**
   * Update a specific store with an updater function
   */
  updateStore<T>(storeName: string, updater: (data: T) => T): void {
    const store = this.stores.get(storeName);
    if (!store) {
      console.warn(`Store ${storeName} not found`);
      return;
    }

    try {
      store.data = updater(store.data);
      store.version++;
      store.lastModified = Date.now();

      // Persist to localStorage
      localStorage.setItem(this.getStoreKey(storeName), JSON.stringify(store));

      // Just notify other tabs that this store has changed
      // They will read the new value from localStorage
      this.channel.postMessage({
        type: "store-update",
        tabId: this.tabId,
        storeName,
        // Don't send the store data - let other tabs read from localStorage
      });
    } catch (e) {
      console.error(`Failed to update store ${storeName}`, e);
    }
  }

  /**
   * Subscribe to changes in a specific store
   */
  onStoreChange<T>(storeName: string, callback: (data: T) => void): () => void {
    // Get or create the set of handlers for this store
    if (!this.handlers.has(storeName)) {
      this.handlers.set(storeName, new Set());
    }

    const handlers = this.handlers.get(storeName)!;
    handlers.add(callback);

    // Return unsubscribe function
    return () => {
      handlers.delete(callback);
      // Clean up empty handler sets
      if (handlers.size === 0) {
        this.handlers.delete(storeName);
      }
    };
  }

  /**
   * Clear all data for this instance (useful for testing)
   */
  clearInstance(): void {
    this.stores.forEach((_, storeName) => {
      localStorage.removeItem(this.getStoreKey(storeName));
    });
    this.stores.clear();
  }

  /**
   * Get the current instance ID from URL parameters
   */
  private getInstanceId(): string {
    const params = new URLSearchParams(window.location.search);
    return params.get("instance") || "default";
  }

  /**
   * Generate a localStorage key for a store
   */
  private getStoreKey(storeName: string): string {
    return `potemkin_${this.namespace}_${this.instanceId}_${storeName}`;
  }

  /**
   * Set up centralized broadcast channel handler
   */
  private setupBroadcastHandler(): void {
    this.channel.addEventListener("message", (e: MessageEvent) => {
      if (
        e.data.type === "store-update" &&
        e.data.tabId !== this.tabId && // Only process updates from OTHER tabs
        e.data.storeName
      ) {
        const storeName = e.data.storeName;

        // Read the latest value from localStorage
        const key = this.getStoreKey(storeName);
        const stored = localStorage.getItem(key);

        if (stored) {
          try {
            // Update the local store
            const store = JSON.parse(stored);
            this.stores.set(storeName, store);

            // Call all registered handlers for this store
            const handlers = this.handlers.get(storeName);
            if (handlers) {
              handlers.forEach((handler) => {
                try {
                  handler(store.data);
                } catch (err) {
                  console.error(
                    `Error in store change handler for ${storeName}:`,
                    err,
                  );
                }
              });
            }
          } catch (err) {
            console.error(`Failed to parse store data for ${storeName}:`, err);
          }
        }
      }
    });
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.channel.close();
    this.handlers.clear();
  }
}
