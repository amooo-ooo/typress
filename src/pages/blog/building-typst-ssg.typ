#import "/src/components/typress.typ": meta
#show: meta.with(title: "Minimal Typress Blog", layout: "blog")

= Building a Typst SSG
*By Amor, July 2026*

Writing static sites shouldn't require complex frameworks. This blog post uses the `blog` layout.

== The Vision

The goal is to keep things simple:
+ Write content in Typst.
+ Build layout in HTML.
+ Bundle with Vite.

