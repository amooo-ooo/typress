#import "/src/components/typress.typ": meta
#show: meta.with(
  title: "Building a Typst SSG",
  description: "Learn how to build a ultra-fast static site generator using Typst, Vite, and HTML layouts.",
  author: "Amor",
  keywords: ("typst", "ssg", "static-site", "blog", "vite"),
  canonical: "https://example.com/blog/building-typst-ssg",
  og-image: "https://example.com/og-building-typst-ssg.png",
  twitter-site: "@typress",
  twitter-creator: "@amor",
  published-time: "2026-07-25T00:00:00Z",
  section: "Development",
  tags: ("typst", "ssg", "webdev"),
  json-ld: (
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "Building a Typst SSG",
    "description": "Learn how to build an ultra-fast static site generator using Typst, Vite, and HTML layouts.",
    "author": (
      "@type": "Person",
      "name": "Amor"
    ),
    "datePublished": "2026-07-25T00:00:00Z"
  ),
  layout: "blog"
)

= Building a Typst SSG
*By Amor, July 2026*

Writing static sites shouldn't require complex frameworks. This blog post uses the `blog` layout.

== The Vision

The goal is to keep things simple:
+ Write content in Typst.
+ Build layout in HTML.
+ Bundle with Vite.

