/**
 * Payload dispatched when a client-side route navigation completes.
 */
export interface NavigateContext {
  /** Destination URL that was loaded. */
  readonly url: string;
  /** Whether the destination page was served from the in-memory LRU cache. */
  readonly isCached: boolean;
}

/**
 * Payload dispatched when a background page prefetch is initiated.
 */
export interface PrefetchContext {
  /** Normalised URL being prefetched. */
  readonly url: string;
}

/** Shared event bus for router lifecycle events. */
export const routerEvents = new EventTarget();

/**
 * Subscribes to post-navigation events.
 *
 * @param cb Callback invoked with the navigation context after each route transition.
 * @returns Unsubscribe function that removes the registered event listener.
 */
export function onNavigate(
  cb: (ctx: NavigateContext) => void,
): () => void {
  const handler: EventListener = (event: Event) => {
    const customEvent = event as CustomEvent<NavigateContext>;
    cb(customEvent.detail);
  };
  routerEvents.addEventListener("navigate", handler);
  return () => routerEvents.removeEventListener("navigate", handler);
}

/**
 * Subscribes to background prefetch events.
 *
 * @param cb Callback invoked when a link prefetch begins.
 * @returns Unsubscribe function that removes the registered event listener.
 */
export function onPrefetch(
  cb: (ctx: PrefetchContext) => void,
): () => void {
  const handler: EventListener = (event: Event) => {
    const customEvent = event as CustomEvent<PrefetchContext>;
    cb(customEvent.detail);
  };
  routerEvents.addEventListener("prefetch", handler);
  return () => routerEvents.removeEventListener("prefetch", handler);
}

/**
 * Subscribes to page mount events.
 *
 * @param cb Callback invoked when the initial page or a newly navigated page mounts.
 * @returns Unsubscribe function that removes the registered event listener.
 */
export function onMount(cb: () => void): () => void {
  const handler: EventListener = () => cb();
  routerEvents.addEventListener("mount", handler);
  return () => routerEvents.removeEventListener("mount", handler);
}

/**
 * Dispatches a `navigate` lifecycle event on the router event bus.
 *
 * @param ctx Navigation context details.
 */
export function emitNavigate(ctx: NavigateContext): void {
  routerEvents.dispatchEvent(new CustomEvent("navigate", { detail: ctx }));
}

/**
 * Dispatches a `prefetch` lifecycle event on the router event bus.
 *
 * @param ctx Prefetch context details.
 */
export function emitPrefetch(ctx: PrefetchContext): void {
  routerEvents.dispatchEvent(new CustomEvent("prefetch", { detail: ctx }));
}

/**
 * Dispatches a `mount` lifecycle event on the router event bus.
 */
export function emitMount(): void {
  routerEvents.dispatchEvent(new CustomEvent("mount"));
}
