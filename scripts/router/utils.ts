/** Regular expression matching file extensions that should bypass the HTML SPA router. */
const NON_HTML_EXTENSION_REGEX =
  /\.(?:typ|pdf|xml|json|txt|csv|zip|tar|gz|rar|7z|svg|png|jpe?g|webp|gif|avif|ico|css|m?js|ts|wasm|bib|mp4|webm|mov|mp3|wav|ogg|docx?|xlsx?|pptx?|woff2?|ttf|otf|eot)$/i;

/** NetworkInformation subset used to detect reduced data preferences. */
interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

/** Navigator extension exposing the optional Network Information API. */
interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformationLike;
}

/**
 * Detects whether the user agent has requested reduced data usage or is on a constrained 2G link.
 *
 * @returns True if background prefetching should be suppressed.
 */
export function isDataSaverActive(): boolean {
  const nav = navigator as NavigatorWithConnection;
  if (nav.connection?.saveData) return true;
  const effectiveType = nav.connection?.effectiveType;
  return effectiveType === "slow-2g" || effectiveType === "2g";
}

/**
 * Normalises a URL into a hash-free cache key so fragment navigations share cached pages.
 *
 * @param url Raw destination URL string.
 * @returns Canonical URL string with the fragment identifier removed.
 */
export function normaliseCacheKey(url: string): string {
  try {
    const parsed = new URL(url, location.href);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url.split("#")[0] ?? url;
  }
}

/**
 * Determines whether an anchor click or hover event should be handled by the client router.
 *
 * @param anchor Target anchor element, if any.
 * @param event Triggering DOM mouse or touch event.
 * @returns True if the link is an internal HTML route eligible for client-side navigation.
 */
export function isRoutableLink(
  anchor: HTMLAnchorElement | null,
  event: Event,
): boolean {
  if (!anchor?.href || event.defaultPrevented) return false;
  if (anchor.hasAttribute("data-no-router")) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;

  const rel = anchor.getAttribute("rel");
  if (rel && /\bexternal\b/i.test(rel)) return false;

  if (anchor.origin !== location.origin) return false;
  if (NON_HTML_EXTENSION_REGEX.test(anchor.pathname)) return false;

  if (event instanceof MouseEvent) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return false;
    }
  }

  // Hash-only changes on the current document use native browser anchor scrolling.
  const isSamePageHash =
    anchor.pathname === location.pathname &&
    anchor.search === location.search &&
    anchor.hash.length > 0;

  return !isSamePageHash;
}
