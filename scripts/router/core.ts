import {
  isDataSaverActive,
  isRoutableLink,
  normaliseCacheKey,
} from "./utils";
import { emitNavigate, emitPrefetch, emitMount } from "./hooks";

/**
 * Configuration options for `TypressRouter`.
 */
export interface RouterOptions {
  /** CSS selector for the swappable page container. Defaults to `"#app"`. */
  readonly container?: string;
  /** Maximum number of pages to keep in the navigation cache. Defaults to 20. */
  readonly maxCacheSize?: number;
}

/** Parsed representation of a cached page entry. */
interface CachedPageEntry {
  readonly element: HTMLElement;
  readonly title: string;
  readonly lang: string;
  readonly headNodes: readonly Element[];
  readonly moduleScripts: readonly string[];
  readonly stylesheets: readonly string[];
}

/** Minimal Vite HMR client contract. */
interface ViteHotContext {
  on(event: string, cb: () => void): void;
}

/** Extended `ImportMeta` carrying the optional Vite HMR context. */
interface ImportMetaWithHot extends ImportMeta {
  readonly hot?: ViteHotContext;
}

/** Selector matching document `<head>` metadata elements managed across SPA navigations. */
const MANAGED_HEAD_SELECTOR = [
  'meta[name]:not([name="viewport"]):not([name="referrer"])',
  "meta[property]",
  'link[rel="canonical"]',
  'link[rel="alternate"]',
  'link[rel="icon"]',
  'link[rel="apple-touch-icon"]',
  'link[rel="manifest"]',
  'script[type="application/ld+json"]',
].join(", ");

/** Maximum time in milliseconds to wait for a newly injected stylesheet before swapping DOM. */
const STYLESHEET_LOAD_TIMEOUT_MS = 2_000;

/**
 * Bounded least-recently-used (LRU) cache backed by a `Map` preserving insertion order.
 */
class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  /**
   * Initialises an LRU cache with a fixed maximum capacity.
   *
   * @param maxSize Maximum number of entries retained before evicting the oldest key.
   */
  constructor(private readonly maxSize: number) {}

  /**
   * Retrieves a value by key and promotes it to the most recently used position.
   *
   * @param key Cache key to look up.
   * @returns Cached value, or undefined if absent.
   */
  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  /**
   * Checks whether a key exists in the cache without altering recency order.
   *
   * @param key Cache key to check.
   * @returns True if the key is present.
   */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /**
   * Inserts or updates a cache entry and evicts the least recently used entry if full.
   *
   * @param key Cache key to write.
   * @param value Value to associate with `key`.
   */
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, value);
  }

  /**
   * Removes an entry from the cache.
   *
   * @param key Cache key to delete.
   */
  delete(key: K): void {
    this.map.delete(key);
  }

  /**
   * Removes all entries from the cache.
   */
  clear(): void {
    this.map.clear();
  }
}

/**
 * Client-side SPA router with head synchronisation, hoisted asset loading, and accessibility announcements.
 */
export class TypressRouter {
  private readonly fetchCache: LruCache<string, Promise<string>>;
  private readonly pageCache: LruCache<string, CachedPageEntry>;
  private readonly loadedScripts = new Set<string>();
  private readonly loadedStyles = new Set<string>();
  private container: HTMLElement;
  private currentUrl: string;
  private readonly selector: string;
  private isMounted = false;
  private navSequence = 0;
  private announcer: HTMLElement | null = null;

  /**
   * Creates a new `TypressRouter` bound to the configured container selector.
   *
   * @param options Router configuration options.
   */
  constructor(options: RouterOptions = {}) {
    this.selector = options.container ?? "#app";
    const cacheSize = options.maxCacheSize ?? 20;
    this.fetchCache = new LruCache(cacheSize);
    this.pageCache = new LruCache(cacheSize);

    const el = document.querySelector<HTMLElement>(this.selector);
    if (!el) throw new Error(`Router container '${this.selector}' not found.`);

    this.container = el;
    this.currentUrl = location.href;
  }

  /**
   * Eagerly fetches and caches the HTML payload for a normalised URL.
   *
   * @param url Target URL to prefetch.
   * @returns Promise resolving to the raw HTML string.
   */
  prefetch(url: string): Promise<string> {
    const cacheKey = normaliseCacheKey(url);
    if (this.pageCache.has(cacheKey)) {
      return Promise.resolve("");
    }

    const existing = this.fetchCache.get(cacheKey);
    if (existing) return existing;

    emitPrefetch({ url: cacheKey });

    const request = fetch(cacheKey, {
      headers: { Accept: "text/html,application/xhtml+xml" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .catch((err: unknown) => {
        this.fetchCache.delete(cacheKey);
        throw err;
      });

    this.fetchCache.set(cacheKey, request);
    return request;
  }

  /**
   * Navigates to a target URL, synchronising head metadata, scripts, focus, and scroll position.
   *
   * @param url Target URL to load.
   * @param isPopState Whether the navigation was triggered by browser history traversal.
   */
  async loadPage(url: string, isPopState = false): Promise<void> {
    const seq = ++this.navSequence;
    const cacheKey = normaliseCacheKey(url);

    try {
      let entry = this.pageCache.get(cacheKey);
      const isCached = entry !== undefined;

      if (!entry) {
        entry = await this.parsePage(cacheKey);
        this.pageCache.set(cacheKey, entry);
        this.fetchCache.delete(cacheKey);
      }

      if (seq !== this.navSequence) return;

      await this.ensureHeadAssets(entry);
      if (seq !== this.navSequence) return;

      this.syncHeadMetadata(entry);
      this.swapContainer(entry.element);
      this.updateActiveNavLinks(url);

      if (!isCached) {
        this.activateScripts(entry.element);
      }

      emitMount();
      this.handleScrollAndFocus(url, isPopState);
      this.announceNavigation(entry.title);

      emitNavigate({ url, isCached });
    } catch (error: unknown) {
      if (seq !== this.navSequence) return;
      console.error(
        "SPA navigation failed, falling back to full reload.",
        error,
      );
      location.href = url;
    }
  }

  /**
   * Binds router event listeners and snapshots the initial document state.
   */
  mount(): void {
    if (this.isMounted) return;
    this.isMounted = true;

    this.indexInitialHeadAssets();
    this.registerCurrentPage();
    this.updateActiveNavLinks(location.href);
    this.ensureAnnouncer();

    document.addEventListener("mouseover", this.onHover);
    document.addEventListener("touchstart", this.onHover, { passive: true });
    document.addEventListener("click", this.onClick);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("hashchange", this.onHashChange);

    emitMount();
    this.registerHMR();
  }

  /**
   * Unbinds all active event listeners registered by the router.
   */
  unmount(): void {
    if (!this.isMounted) return;
    this.isMounted = false;

    document.removeEventListener("mouseover", this.onHover);
    document.removeEventListener("touchstart", this.onHover);
    document.removeEventListener("click", this.onClick);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("hashchange", this.onHashChange);
  }

  /**
   * Fetches a URL and parses its container element, metadata, and head assets.
   *
   * @param cacheKey Normalised URL key to fetch and parse.
   * @returns Parsed `CachedPageEntry` ready for DOM insertion.
   */
  private async parsePage(cacheKey: string): Promise<CachedPageEntry> {
    const html = await this.prefetch(cacheKey);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const page = doc.querySelector<HTMLElement>(this.selector);

    if (!page) {
      throw new Error(
        `Container '${this.selector}' not found in fetched page.`,
      );
    }

    page.dataset.url = cacheKey;
    page.dataset.title = doc.title;

    return {
      element: page,
      title: doc.title,
      lang: doc.documentElement.lang || "en",
      headNodes: this.extractManagedHeadNodes(doc.head),
      moduleScripts: this.extractHeadScripts(doc.head, cacheKey),
      stylesheets: this.extractHeadStylesheets(doc.head, cacheKey),
    };
  }

  /**
   * Records module scripts and stylesheets already present in the initial document head.
   */
  private indexInitialHeadAssets(): void {
    for (const script of document.head.querySelectorAll<HTMLScriptElement>(
      'script[type="module"][src]',
    )) {
      if (script.src) this.loadedScripts.add(script.src);
    }

    for (const link of document.head.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href]',
    )) {
      if (link.href) this.loadedStyles.add(link.href);
    }
  }

  /**
   * Extracts resolved same-origin module script URLs from a parsed document head.
   *
   * @param head Parsed `<head>` element.
   * @param baseUrl Base page URL used to resolve relative `src` attributes.
   * @returns List of absolute module script URLs.
   */
  private extractHeadScripts(head: HTMLHeadElement, baseUrl: string): string[] {
    const urls: string[] = [];
    for (const script of head.querySelectorAll<HTMLScriptElement>(
      'script[type="module"][src]',
    )) {
      const rawSrc = script.getAttribute("src");
      if (!rawSrc) continue;
      try {
        const resolved = new URL(rawSrc, baseUrl);
        if (resolved.origin === location.origin) {
          urls.push(resolved.href);
        }
      } catch {
        // Ignore malformed script URLs.
      }
    }
    return urls;
  }

  /**
   * Extracts resolved same-origin stylesheet URLs from a parsed document head.
   *
   * @param head Parsed `<head>` element.
   * @param baseUrl Base page URL used to resolve relative `href` attributes.
   * @returns List of absolute stylesheet URLs.
   */
  private extractHeadStylesheets(
    head: HTMLHeadElement,
    baseUrl: string,
  ): string[] {
    const urls: string[] = [];
    for (const link of head.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href]',
    )) {
      const rawHref = link.getAttribute("href");
      if (!rawHref) continue;
      try {
        const resolved = new URL(rawHref, baseUrl);
        if (resolved.origin === location.origin) {
          urls.push(resolved.href);
        }
      } catch {
        // Ignore malformed stylesheet URLs.
      }
    }
    return urls;
  }

  /**
   * Clones managed SEO and structured data nodes from a document head.
   *
   * @param head Source `<head>` element.
   * @returns Cloned list of managed metadata elements.
   */
  private extractManagedHeadNodes(head: HTMLHeadElement): Element[] {
    return Array.from(head.querySelectorAll(MANAGED_HEAD_SELECTOR)).map(
      (node) => node.cloneNode(true) as Element,
    );
  }

  /**
   * Injects hoisted page module scripts and awaits new stylesheets before swapping to prevent FOUC.
   *
   * @param entry Target cached page entry.
   */
  private async ensureHeadAssets(entry: CachedPageEntry): Promise<void> {
    const stylePromises: Promise<void>[] = [];

    for (const href of entry.stylesheets) {
      if (this.loadedStyles.has(href)) continue;
      this.loadedStyles.add(href);

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;

      const loaded = new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, STYLESHEET_LOAD_TIMEOUT_MS);
        const done = (): void => {
          window.clearTimeout(timer);
          resolve();
        };
        link.addEventListener("load", done, { once: true });
        link.addEventListener("error", done, { once: true });
      });

      document.head.appendChild(link);
      stylePromises.push(loaded);
    }

    for (const src of entry.moduleScripts) {
      if (this.loadedScripts.has(src)) continue;
      this.loadedScripts.add(src);
      const script = document.createElement("script");
      script.type = "module";
      script.src = src;
      document.head.appendChild(script);
    }

    if (stylePromises.length > 0) {
      await Promise.all(stylePromises);
    }
  }

  /**
   * Synchronises document title, language, and managed `<head>` metadata tags across navigations.
   *
   * @param entry Target cached page entry.
   */
  private syncHeadMetadata(entry: CachedPageEntry): void {
    document.title = entry.title;
    if (entry.lang) {
      document.documentElement.lang = entry.lang;
    }

    for (const existing of document.head.querySelectorAll(
      MANAGED_HEAD_SELECTOR,
    )) {
      existing.remove();
    }

    for (const node of entry.headNodes) {
      document.head.appendChild(node.cloneNode(true));
    }
  }

  /**
   * Swaps the active container element with the target page container.
   *
   * @param next Replacement container element.
   */
  private swapContainer(next: HTMLElement): void {
    if (this.container !== next) {
      this.container.replaceWith(next);
      this.container = next;
    }
  }

  /**
   * Updates `aria-current="page"` on navigation links matching the active pathname.
   *
   * @param targetUrl Active destination URL.
   */
  private updateActiveNavLinks(targetUrl: string): void {
    let activePath = location.pathname;
    try {
      activePath = new URL(targetUrl, location.href).pathname;
    } catch {
      // Fall back to location.pathname if URL parsing fails.
    }

    const normalisedActive =
      activePath === "/"
        ? "/"
        : activePath.replace(/\/+$/, "").replace(/\.html$/, "");

    for (const link of this.container.querySelectorAll<HTMLAnchorElement>(
      "nav a[href]",
    )) {
      if (link.origin !== location.origin) {
        link.removeAttribute("aria-current");
        continue;
      }
      const linkPath =
        link.pathname === "/"
          ? "/"
          : link.pathname.replace(/\/+$/, "").replace(/\.html$/, "");

      if (linkPath === normalisedActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    }
  }

  /**
   * Clones same-origin and inline `<script>` tags inside the container so the browser executes them.
   *
   * @param root Page container element whose scripts should be activated.
   */
  private activateScripts(root: HTMLElement): void {
    for (const original of root.querySelectorAll("script")) {
      const src = original.getAttribute("src");

      if (src) {
        try {
          const scriptUrl = new URL(src, location.href);
          if (scriptUrl.origin !== location.origin) continue;
        } catch {
          continue;
        }
      }

      const clone = document.createElement("script");
      for (const { name, value } of original.attributes) {
        clone.setAttribute(name, value);
      }
      clone.textContent = original.textContent;
      original.replaceWith(clone);
    }
  }

  /**
   * Manages hash target scrolling and transfers keyboard focus to the target or `<main>` landmark.
   *
   * @param url Destination URL potentially containing a hash fragment.
   * @param isPopState Whether navigation was triggered by history `popstate`.
   */
  private handleScrollAndFocus(url: string, isPopState: boolean): void {
    let hash = "";
    try {
      hash = new URL(url, location.href).hash;
    } catch {
      hash = "";
    }

    if (hash.length > 1) {
      let rawId = hash.slice(1);
      try {
        rawId = decodeURIComponent(rawId);
      } catch {
        // Keep raw fragment identifier if percent-decoding fails.
      }

      const target = document.getElementById(rawId);
      if (target) {
        if (!target.hasAttribute("tabindex")) {
          target.setAttribute("tabindex", "-1");
        }
        target.scrollIntoView();
        target.focus({ preventScroll: true });
        return;
      }
    }

    if (!isPopState) {
      scrollTo({ top: 0, left: 0, behavior: "instant" });
      const main = this.container.querySelector<HTMLElement>("main");
      if (main) {
        if (!main.hasAttribute("tabindex")) {
          main.setAttribute("tabindex", "-1");
        }
        main.focus({ preventScroll: true });
      }
    }
  }

  /**
   * Creates a persistent visually hidden live region for screen reader route announcements.
   */
  private ensureAnnouncer(): void {
    const existing = document.getElementById("typress-announcer");
    if (existing) {
      this.announcer = existing;
      return;
    }

    const region = document.createElement("div");
    region.id = "typress-announcer";
    region.className = "sr-only";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    document.body.appendChild(region);
    this.announcer = region;
  }

  /**
   * Resets and populates the live region so screen readers announce the new page title.
   *
   * @param title Document title of the newly activated route.
   */
  private announceNavigation(title: string): void {
    const announcer = this.announcer;
    if (!announcer || !title) return;
    announcer.textContent = "";
    requestAnimationFrame(() => {
      announcer.textContent = `Navigated to ${title}`;
    });
  }

  /**
   * Snapshots the initial landing page into the LRU cache for instant back navigation.
   */
  private registerCurrentPage(): void {
    const el = document.querySelector<HTMLElement>(this.selector);
    if (!el) return;

    const cacheKey = normaliseCacheKey(this.currentUrl);
    el.dataset.url = cacheKey;
    el.dataset.title = document.title;

    this.pageCache.set(cacheKey, {
      element: el,
      title: document.title,
      lang: document.documentElement.lang || "en",
      headNodes: this.extractManagedHeadNodes(document.head),
      moduleScripts: Array.from(this.loadedScripts),
      stylesheets: Array.from(this.loadedStyles),
    });
    this.container = el;
  }

  /**
   * Listens for Vite custom HMR events to invalidate cached pages and reload content.
   */
  private registerHMR(): void {
    const hot = (import.meta as ImportMetaWithHot).hot;
    if (!hot) return;

    hot.on("typress:hmr", () => {
      this.fetchCache.clear();
      this.pageCache.clear();
      void this.loadPage(location.href, true);
    });
  }

  private onHover = (e: Event): void => {
    if (isDataSaverActive()) return;
    const target = e.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (anchor && isRoutableLink(anchor, e)) {
      void this.prefetch(anchor.href).catch(() => {});
    }
  };

  private onClick = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;

    const anchor = target.closest("a");
    if (!anchor || !isRoutableLink(anchor, e)) return;

    e.preventDefault();

    const destination = anchor.href;
    if (destination === this.currentUrl) return;

    this.currentUrl = destination;
    history.pushState({}, "", destination);
    void this.loadPage(destination, false);
  };

  private onPopState = (): void => {
    const nextUrl = location.href;
    const prevKey = normaliseCacheKey(this.currentUrl);
    const nextKey = normaliseCacheKey(nextUrl);
    this.currentUrl = nextUrl;

    if (prevKey === nextKey) {
      this.handleScrollAndFocus(nextUrl, false);
      return;
    }

    void this.loadPage(nextUrl, true);
  };

  private onHashChange = (): void => {
    this.currentUrl = location.href;
  };
}
