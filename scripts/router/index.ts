import { TypressRouter } from "./core";
import type { RouterOptions } from "./core";

export { onNavigate, onPrefetch, onMount } from "./hooks";

let instance: TypressRouter | null = null;

/**
 * Create and return the singleton router. Subsequent calls return the existing instance.
 */
export function createRouter(options?: RouterOptions): TypressRouter {
  if (instance) {
    console.warn(
      "TypressRouter already initialised. Returning the existing instance.",
    );
    return instance;
  }
  instance = new TypressRouter(options);
  return instance;
}

/**
 * Retrieve the active router instance. Throws if createRouter has not been called.
 */
export function useRouter(): TypressRouter {
  if (!instance) {
    throw new Error("Router not initialised. Call createRouter() first.");
  }
  return instance;
}
