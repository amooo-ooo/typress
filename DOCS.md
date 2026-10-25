# Typress Documentation

Typress is a static site generator template that combines Typst for document authoring with Vite and Bun for web development. This document provides a comprehensive reference for authoring pages, defining metadata, using Web Components, customising layouts, and understanding the SSG architecture.

## Overview

Typress compiles Typst files located in `src/pages/` into HTML documents, injecting the rendered content into HTML layout templates defined in `src/layouts/`.

- **Typst Authoring**: Write pages in Typst syntax.
- **HTML Layouts**: Enclose compiled pages in reusable HTML templates via W3C `<slot>` elements (default and named slots).
- **Comprehensive Metadata**: Define standard SEO, Open Graph, Twitter Cards, JSON-LD, and custom head tags per page.
- **Web Components**: Embed TypeScript Web Components into Typst documents.
- **Hyperscript API**: Emit HTML elements inside Typst using the `h()` macro.
- **SPA Client Router**: Client-side navigation with DOM tree caching and raw source serving.

## Getting Started

### Prerequisites

Ensure Bun is installed on your machine (Typst compilation runs in-process via `@myriaddreamin/typst-ts-node-compiler`, requiring no external `typst` CLI installation):

- [Bun](https://bun.sh)

### Project Commands

Install dependencies:

```bash
bun install
```

Start the development server with Hot Module Replacement (HMR):

```bash
bun run dev
```

Build the static site for production into `dist/`:

```bash
bun run build
```

Deploy to Cloudflare Pages or any static host:

```bash
bun run deploy
```

## Page Authoring & Metadata

Pages reside in `src/pages/`. File paths directly map to output URLs:

- `src/pages/index.typ` maps to `/` (`index.html`)
- `src/pages/cheatsheet.typ` maps to `/cheatsheet` (`cheatsheet.html`)
- `src/pages/blog/building-typst-ssg.typ` maps to `/blog/building-typst-ssg` (`blog/building-typst-ssg.html`)

### Metadata Macro (`meta`)

Every page configures its layout and head metadata using the `#show: meta.with(...)` macro:

```typst
#import "/src/components/typress.typ": meta

#show: meta.with(
  title: "My Page Title",
  description: "Description of the page content",
  layout: "default"
)

= Hello World
Welcome to my website.
```

### Supported Metadata Parameters

#### Standard SEO

- `title`: Page title string. Sets `<title>` tag and defaults `og:title` and `twitter:title`.
- `description`: Meta description for search engines.
- `keywords`: Array or comma-separated string of keywords.
- `author`: Content author name.
- `viewport`: Custom viewport setting.
- `charset`: Character encoding (default: `"UTF-8"`).
- `robots`: Search engine indexing directive.
- `generator`: Site generator name.
- `theme-color`: Theme colour for browser headers.
- `color-scheme`: Light/dark colour scheme support.
- `referrer`: Referrer policy directive.

```typst
#show: meta.with(
  title: "Page Title",
  description: "Page description for search engines",
  keywords: ("typst", "ssg", "web"),
  author: "Author Name",
  viewport: "width=device-width, initial-scale=1.0",
  charset: "UTF-8",
  robots: "index, follow",
  generator: "Typress SSG",
  theme-color: "#0f172a",
  color-scheme: "dark light",
  referrer: "strict-origin-when-cross-origin"
)
```

#### Open Graph (`og:*`)

- `og-title`: Title override for Open Graph social cards.
- `og-description`: Description override for social sharing.
- `og-type`: Open Graph object type (`"website"`, `"article"`).
- `og-url`: Canonical URL for Open Graph sharing.
- `og-image`: Preview image URL.
- `og-image-alt`: Alt text for preview image.
- `og-site-name`: Name of the website.
- `og-locale`: Language locale identifier.
- `og`: Dictionary of custom `og:*` properties.

```typst
#show: meta.with(
  og-title: "Open Graph Title",
  og-description: "Open Graph Description",
  og-type: "article",
  og-url: "https://example.com/posts/article",
  og-image: "https://example.com/og-cover.png",
  og-image-alt: "Cover image preview",
  og-site-name: "Typress Blog",
  og-locale: "en_US",
  og: (
    audio: "https://example.com/audio.mp3",
    video: "https://example.com/video.mp4"
  )
)
```

#### Twitter Cards (`twitter:*`)

- `twitter-card`: Card format (`"summary"`, `"summary_large_image"`).
- `twitter-site`: Website Twitter handle.
- `twitter-creator`: Author Twitter handle.
- `twitter-title`: Card title override.
- `twitter-description`: Card description override.
- `twitter-image`: Card image URL.
- `twitter-image-alt`: Card image alt text.
- `twitter`: Dictionary of custom Twitter card fields.

```typst
#show: meta.with(
  twitter-card: "summary_large_image",
  twitter-site: "@sitehandle",
  twitter-creator: "@authorhandle",
  twitter-title: "Twitter Card Title",
  twitter-description: "Twitter Card Description",
  twitter-image: "https://example.com/twitter-card.png",
  twitter-image-alt: "Card image preview",
  twitter: (
    label1: "Reading time",
    data1: "5 minutes"
  )
)
```

#### Links & Icons

- `canonical`: Canonical URL link.
- `icon` / `favicon`: Favicon image URL.
- `apple-touch-icon`: Apple touch icon URL.
- `manifest`: Web App Manifest URL.
- `alternate`: Array of dictionaries for RSS feeds or hreflang links.

```typst
#show: meta.with(
  canonical: "https://example.com/canonical-url",
  icon: "/favicon.ico",
  favicon: "/favicon.svg",
  apple-touch-icon: "/apple-touch-icon.png",
  manifest: "/site.webmanifest",
  alternate: (
    (rel: "alternate", type: "application/rss+xml", href: "/feed.xml", title: "RSS Feed"),
    (rel: "alternate", hreflang: "es", href: "https://example.com/es/")
  )
)
```

#### Article & Blog Metadata

- `published-time`: ISO publication timestamp.
- `modified-time`: ISO modification timestamp.
- `section`: Article section category.
- `tags`: Array of tag strings.

```typst
#show: meta.with(
  published-time: "2026-07-25T00:00:00Z",
  modified-time: "2026-07-25T12:00:00Z",
  section: "Technology",
  tags: ("typst", "ssg", "frontend")
)
```

#### Framework Extensibility

- `meta`: Array or dictionary of custom `<meta>` attribute maps.
- `links`: Array or dictionary of custom `<link>` attribute maps.
- `scripts`: Array of strings or dictionaries for head scripts.
- `json-ld`: JSON-LD structured data object or JSON string.
- `head`: Raw element to embed directly in the head.

```typst
#show: meta.with(
  meta: (
    (name: "custom-meta", content: "custom-value"),
    (http-equiv: "X-UA-Compatible", content: "IE=edge")
  ),
  links: (
    (rel: "stylesheet", href: "/extra.css"),
    (rel: "preconnect", href: "https://fonts.googleapis.com")
  ),
  scripts: (
    (src: "/analytics.js", async: true),
    "console.log('inline head script');"
  ),
  json-ld: (
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Custom Typress Page"
  ),
  head: h("noscript", "JavaScript is required for interactive components.")
)
```

#### Layout & Language Controls

- `layout`: Layout template file name in `src/layouts/` (default: `"default"`).
- `lang`: Document language attribute for `<html lang="...">` (default: `"en"`).

```typst
#show: meta.with(
  layout: "blog",
  lang: "en"
)
```

## HTML Layouts

Layouts are standard HTML files stored in `src/layouts/`. Compiled content from Typst is projected into W3C `<slot></slot>` elements in the designated layout.

Example `src/layouts/default.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Typress</title>
    <link rel="stylesheet" href="/src/style.css">
  </head>
  <body>
    <div id="app">
      <header>
        <nav class="navbar">
          <a href="/">Home</a>
          <a href="/cheatsheet">Cheatsheet</a>
          <a href="/blog/building-typst-ssg">Blog</a>
        </nav>
      </header>
      <main id="main-content" tabindex="-1">
        <slot></slot>
      </main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### Named Slots & Fallbacks

Following the W3C `<slot>` specification and Svelte's fragment convention, layouts can define multiple named slots (`<slot name="..."></slot>`) alongside the default `<slot></slot>`. Content placed inside a `<slot>` element in the layout serves as fallback content when a page does not populate that slot:

```html
<div class="layout-grid">
  <aside class="sidebar">
    <slot name="sidebar">
      <p>Default sidebar navigation</p>
    </slot>
  </aside>
  <main id="main-content" tabindex="-1">
    <slot></slot>
  </main>
</div>
```

In a Typst page, you can project content into a named slot either on a semantic HTML wrapper element using the W3C `slot` attribute, or without a wrapper element using `h("typress:fragment", slot: "...")` (or the `#fragment(slot: "...")` shorthand):

```typst
#import "/src/components/typress.typ": h, fragment, meta

// Unwrapped fragment projected into <slot name="sidebar"></slot>
#h("typress:fragment", slot: "sidebar")[
  #outline(title: "On this page", depth: 2)
]

// Equivalent shorthand:
// #fragment(slot: "sidebar")[#outline(title: "On this page", depth: 2)]

// Semantic element with W3C slot attribute (preserves the <header> tag)
#h("header.hero", slot: "hero")[
  = Welcome
]

// Remaining content without a slot attribute goes into the default <slot></slot>
= Main Document Content
This paragraph is projected into the default slot.
```

## Web Components & Interactivity

Typress provides two ways to add client-side interactivity to Typst pages: TypeScript Web Components and inline Hyperscript elements.

### TypeScript Web Components (`component`)

Use the `component` macro from `src/components/typress.typ` to load and render TypeScript Web Components:

```typst
#import "/src/components/typress.typ": component

#let typress-counter = component("/src/components/counter.ts", "typress-counter")

#typress-counter(class: "btn counter")[Count is 0]
```

#### Optional Lit Support

If you want to use Lit instead of vanilla Web Components:

- Install `lit`: `bun add lit`
- Add the `lit()` plugin in your `vite.config.ts`:
```ts
import { lit } from "./scripts/plugins/vite";
// ...
plugins: [..., lit()]
```
- Author Lit components and import them using the exact same `component()` macro:
```typst
#let my-component = component("/src/components/my-component.ts", "my-component")
```

### Hyperscript Engine (`h`)

The `h` macro provides a hyperscript selector API to output HTML elements directly when `sys.inputs.is_html` is `"true"` (automatically passed by `NodeCompiler` during SSG builds).

```typst
#import "/src/components/typress.typ": h

#h("div.container#hero", class: ("shadow", "p-4"))[
  #h("h1", "Welcome to Typress")
  #h("p", "Built with Typst and Bun.")
]
```

### Selector Syntax

The `h` function supports standard CSS selector syntax:

- `h("div.card")`: `<div class="card"></div>`
- `h("button#submit.btn.primary")`: `<button id="submit" class="btn primary"></button>`
- `h("typress:head")`: Injects child elements into the document `<head>`.
- `h("typress:fragment", slot: "sidebar")`: Unwrapped fragment projected into `<slot name="sidebar"></slot>`.
- Positional arguments become inner content; named arguments become HTML attributes.

## Architecture & SSG Engine

### Build Pipeline (`scripts/ssg.ts`)

- **File Discovery & Layout Preloading**: Discovers `.typ` source files inside `src/pages/` via native `fs.readdir` and preloads `.html` layout templates from `src/layouts/` concurrently (or fast-paths the single modified `.typ` file during Vite HMR).
- **Incremental Build Check**: Compares source modification timestamps (`mtimeMs`) against output files in `.typress/` before instantiating the compiler.
- **In-Process Typst Compilation**: Compiles `.typ` sources to HTML in memory using `@myriaddreamin/typst-ts-node-compiler` (`NodeCompiler`), keeping `comemo` AST, font, and grammar caches warm across pages and HMR updates.
- **Layout Resolution**: Reads layout selection from compiled `typress:head` (`layout="..."`) metadata.
- **Head Injection**: Extracts `typress:head` metadata from compiled HTML, merges or replaces default layout `<head>` tags (preserving repeatable `<meta>` tags such as `article:tag`), and updates `<html lang="...">`.
- **Slot Resolution**: Projects named `slot="..."` elements and `typress:fragment` blocks into matching `<slot name="..."></slot>` targets (or renders their fallback content), normalises heading hierarchy (`<h1>` -> `<h2>`), deduplicates module scripts, marks active `aria-current="page"` links, and injects the remaining document body into the default `<slot></slot>`.

### Client Router & SPA Navigation

The client router in `scripts/router/index.ts` enhances page navigation:

- Intercepts internal link clicks and prefetches links on hover/focus (respecting `Save-Data`).
- Caches fetched DOM trees in an LRU cache (normalised without URL hashes) to minimise network requests.
- Synchronises `<head>` metadata (`<title>`, `<meta>`, `<link rel="canonical">`), hoisted stylesheet/module assets, and active `aria-current="page"` navigation links.
- Cancels superseded in-flight navigations via a monotonic sequence counter, announces route changes to assistive technologies (`#typress-announcer`), and re-executes page scripts on navigation.

### Serving Raw Typst Source

Typress serves raw `.typ` source files directly when requested with a `.typ` extension or via raw source URL endpoints.

### Vite Plugins & Extensibility (`scripts/plugins/vite/`)

Vite plugins are located in the `scripts/plugins/vite/` directory and exported via a single barrel file:

- **`typressRouter`**: Middleware resolving clean extensionless routes and serving raw `.typ` source files.
- **`typstHmr`**: Triggers page reloads on Typst/layout source updates and handles incremental builds.
- **`copyTypFiles`**: Production asset exporter for raw page source files.
- **`generateSitemap`**: Automatically constructs a `sitemap.xml` listing all compiled pages.
- **`lit`**: Optional plugin configuring esbuild decorator transforms dynamically, enabling optional Lit component support without global tsconfig pollution.

