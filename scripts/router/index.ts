import { TypressRouter } from "./core";
import type { RouterOptions } from "./core";

export { TypressRouter } from "./core";
export type { RouterOptions } from "./core";
export { onNavigate, onPrefetch, onMount } from "./hooks";
export type { NavigateContext, PrefetchContext } from "./hooks";

let instance: TypressRouter | null = null;

/**
 * Creates and returns the singleton router instance. Subsequent calls return the existing instance.
 *
 * @param options Optional router configuration settings.
 * @returns Active `TypressRouter` singleton instance.
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
 * Retrieves the active router singleton instance. Throws if `createRouter` has not been called.
 *
 * @returns Active `TypressRouter` singleton instance.
 */
export function useRouter(): TypressRouter {
  if (!instance) {
    throw new Error("Router not initialised. Call createRouter() first.");
  }
  return instance;
}
