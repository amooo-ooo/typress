<!-- markdownlint-disable MD033 MD013 -->

# typress

typress is a minimal static site generator template that combines Typst for document authoring with Vite and Bun for web development. Author pages in Typst with TypeScript Web Components, and wrap the output in standard HTML layouts.

## Features

- **Typst Authoring**: Write pages with Typst.
- **Bun & Vite Tooling**: Use Bun for SSG builds and Vite for dev server HMR for `.typ` files.
- **Web Components**: Inject TypeScript Web Components into Typst files.
- **SPA Router**: Client-side router that caches DOM trees for navigation without full page reloads.
- **HTML Layouts**: Render compiled Typst output into HTML shell files via `<slot />`.
- **Raw Source Access**: Direct `.typ` file URLs serve the raw source code as plain text.
- **Perfect Lighthouse Score**: 100 across all Lighthouse metrics.

See [DOCS.md](DOCS.md) for full documentation and code examples.

## Architecture

### Pages & Layouts

Pages in `src/pages/` are compiled into HTML and mapped to their corresponding URL paths. Typst HTML output goes into a `<slot />` within HTML shell files in `src/layouts/`. The layout is specified via the `meta` configuration macro, such as:

```typst
#import "/src/components/typress.typ": meta
#show: meta.with(
  title: "My Page",
  description: "A page built with Typress",
  keywords: ("typst", "ssg", "web"),
  author: "Author Name",
  canonical: "https://example.com/my-page",
  og-image: "https://example.com/og.png",
  twitter-site: "@handle",
  layout: "default"
)
```

#### Metadata & Head Management

The `meta` macro provides flexible metadata and head management. It supports standard SEO, Open Graph (`og:*`), Twitter Cards (`twitter:*`), Article metadata, Icons/Links, JSON-LD structured data, custom head scripts/tags, and layout controls.

### Static Site Generation

The `scripts/ssg.ts` engine uses Bun to compile via `typst compile --format html`. The output goes to the `.typress/` cache directory.

### Web Components

The `component` macro in `src/components/typress.typ` allows injecting TypeScript Web Components directly into Typst files, mapping them to custom HTML elements.

```typst
#import "/src/components/typress.typ": component
#let typress-counter = component("/src/components/counter.ts", "typress-counter")

#typress-counter(class: "btn")[Count is 0]
```

### Hyperscript API

A custom hyperscript module (`h`) provides an API for emitting HTML tags inside Typst when `is_html=true`.

```typst
#import "/src/components/typress.typ": h
#h("div.wrapper")[Hello, World!]
```

### Dev Server & Routing

Vite serves from the `.typress` directory. A custom plugin handles clean URLs and serving raw `.typ` source files as plain text, while an HMR watcher rebuilds Typst pages on change. The client-side router in `scripts/router/index.ts` provides SPA navigation.

## Usage

You need `bun` and `typst` installed and on your PATH.

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Build the static site for production:

```bash
bun run build
```

## Deployment

This project is configured for Cloudflare Pages. Run build commands before deploying.

```bash
bun run deploy
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the [MIT License](LICENSE).
