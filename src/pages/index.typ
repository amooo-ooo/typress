#import "/src/components/typress.typ": component, meta

#show: meta.with(title: "Minimal Typress Home", layout: "default")

#let typress-counter = component("/src/components/counter.ts", "typress-counter")

= Get started

Edit `src/pages/index.typ` and save to test HMR. This page uses the `default` layout.

== Features

- Clean, minimal design
- High performance
- Easy to read

== Interactive Component

Here is a functional counter:

#typress-counter(class: "btn counter")[Count is 0] 
