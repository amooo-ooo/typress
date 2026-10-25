// Typress hyperscript and metadata module providing composable helpers for HTML elements.

// Parses a CSS-like tag selector into tag name, element id, and class list.
#let parse-selector(s) = {
  let (tag, id, classes) = ("div", none, ())
  for m in s.matches(regex("(^|#|\\.)([^#.\\[\\]]+)")) {
    let (prefix, name) = m.captures
    if prefix == "" { tag = name.replace("typress:", "typress-") }
    else if prefix == "." { classes.push(name) }
    else if prefix == "#" { id = name }
  }
  (tag, id, classes)
}

// Emits a semantic HTML element when compiled for HTML output, falling back to content in PDF/editor preview.
#let h(selector, ..args) = {
  let (tag, id, classes) = parse-selector(selector)
  let attrs = if id != none { (id: id) } else { (:) }

  for (k, v) in args.named() {
    if k == "class" {
      classes += if type(v) == array { v.map(str) } else { (str(v),) }
    } else if type(v) == bool {
      if v { attrs.insert(k, "") }
    } else if type(v) == array {
      attrs.insert(k, v.map(str).join(" "))
    } else if v != none {
      attrs.insert(k, str(v))
    }
  }

  if classes.len() > 0 { attrs.class = classes.join(" ") }

  let content = args.pos().join()
  if sys.inputs.at("is_html", default: "false") == "true" {
    html.elem(tag, attrs: attrs)[#content]
  } else {
    // Editor fallback to keep content visible outside HTML mode.
    content
  }
}

// Emits an unwrapped fragment container for projecting content into named layout slots.
#let fragment(..args) = {
  h("typress:fragment", ..args)
}

// Registers a custom web component and renders its custom element tag.
#let component(ts-path, element-name) = {
  (..args) => {
    h("script", type: "module", src: str(ts-path))[]
    h(element-name, ..args.named())[#args.pos().join()]
  }
}

// Creates a single HTML meta tag node when content is provided.
#let create-meta-tag(attr-name, attr-val, content-val) = {
  if content-val != none {
    let formatted = if type(content-val) == array { content-val.map(str).join(", ") } else { str(content-val) }
    let attrs = (:)
    attrs.insert(attr-name, attr-val)
    attrs.insert("content", formatted)
    (h("meta", ..attrs),)
  } else {
    ()
  }
}

// Normalises a value into an array. Arrays pass through, scalars become single-element arrays, and none becomes empty.
#let coerce-list(val) = {
  if type(val) == array { val }
  else if val != none { (val,) }
  else { () }
}

// Builds standard HTML meta name tags plus charset declaration.
#let build-standard-meta(description, keywords, author, viewport, robots, generator, theme-color, color-scheme, referrer, charset) = {
  let nodes = ()
  nodes += create-meta-tag("name", "description", description)
  nodes += create-meta-tag("name", "keywords", keywords)
  nodes += create-meta-tag("name", "author", author)
  nodes += create-meta-tag("name", "viewport", viewport)
  nodes += create-meta-tag("name", "robots", robots)
  nodes += create-meta-tag("name", "generator", generator)
  nodes += create-meta-tag("name", "theme-color", theme-color)
  nodes += create-meta-tag("name", "color-scheme", color-scheme)
  nodes += create-meta-tag("name", "referrer", referrer)
  if charset != none {
    nodes.push(h("meta", charset: str(charset)))
  }
  nodes
}

// Builds Open Graph metadata nodes and returns effective fallback values for Twitter cards.
#let build-og-meta(og-title, og-description, og-type, og-url, og-image, og-image-alt, og-site-name, og-locale, og, title, description, canonical, published-time) = {
  let eff-title = if og-title != none { og-title } else { title }
  let eff-desc = if og-description != none { og-description } else { description }
  let eff-image = if og-image != none { og-image } else { none }
  let eff-url = if og-url != none { og-url } else { canonical }

  let nodes = ()
  nodes += create-meta-tag("property", "og:title", eff-title)
  nodes += create-meta-tag("property", "og:description", eff-desc)
  nodes += create-meta-tag("property", "og:type", if og-type != none { og-type } else if published-time != none { "article" } else { "website" })
  nodes += create-meta-tag("property", "og:url", eff-url)
  nodes += create-meta-tag("property", "og:image", eff-image)
  nodes += create-meta-tag("property", "og:image:alt", og-image-alt)
  nodes += create-meta-tag("property", "og:site_name", og-site-name)
  nodes += create-meta-tag("property", "og:locale", og-locale)

  if type(og) == dictionary {
    for (k, v) in og {
      nodes += create-meta-tag("property", "og:" + str(k), v)
    }
  }

  (nodes: nodes, eff-title: eff-title, eff-desc: eff-desc, eff-image: eff-image)
}

// Builds Twitter Cards metadata cascading from Open Graph effective values.
#let build-twitter-meta(twitter-card, twitter-site, twitter-creator, twitter-title, twitter-description, twitter-image, twitter-image-alt, twitter, og-image-alt, og-eff-title, og-eff-desc, og-eff-image) = {
  let eff-card = if twitter-card != none { twitter-card } else if og-eff-image != none { "summary_large_image" } else { "summary" }
  let eff-title = if twitter-title != none { twitter-title } else { og-eff-title }
  let eff-desc = if twitter-description != none { twitter-description } else { og-eff-desc }
  let eff-image = if twitter-image != none { twitter-image } else { og-eff-image }

  let nodes = ()
  nodes += create-meta-tag("name", "twitter:card", eff-card)
  nodes += create-meta-tag("name", "twitter:site", twitter-site)
  nodes += create-meta-tag("name", "twitter:creator", twitter-creator)
  nodes += create-meta-tag("name", "twitter:title", eff-title)
  nodes += create-meta-tag("name", "twitter:description", eff-desc)
  nodes += create-meta-tag("name", "twitter:image", eff-image)
  nodes += create-meta-tag("name", "twitter:image:alt", if twitter-image-alt != none { twitter-image-alt } else { og-image-alt })

  if type(twitter) == dictionary {
    for (k, v) in twitter {
      nodes += create-meta-tag("name", "twitter:" + str(k), v)
    }
  }

  nodes
}

// Builds article metadata tags (published_time, modified_time, section, tags).
#let build-article-meta(published-time, modified-time, section, tags) = {
  let nodes = ()
  nodes += create-meta-tag("property", "article:published_time", published-time)
  nodes += create-meta-tag("property", "article:modified_time", modified-time)
  nodes += create-meta-tag("property", "article:section", section)

  for t in coerce-list(tags) {
    nodes += create-meta-tag("property", "article:tag", t)
  }

  nodes
}

// Builds link elements for canonical URLs, icons, web manifests, and alternates.
#let build-link-nodes(canonical, icon, favicon, apple-touch-icon, manifest, alternate) = {
  let nodes = ()

  if canonical != none {
    nodes.push(h("link", rel: "canonical", href: str(canonical)))
  }

  let fav = if icon != none { icon } else { favicon }
  if fav != none {
    nodes.push(h("link", rel: "icon", href: str(fav)))
  }

  if apple-touch-icon != none {
    nodes.push(h("link", rel: "apple-touch-icon", href: str(apple-touch-icon)))
  }

  if manifest != none {
    nodes.push(h("link", rel: "manifest", href: str(manifest)))
  }

  for item in coerce-list(alternate) {
    if type(item) == dictionary {
      nodes.push(h("link", rel: "alternate", ..item))
    }
  }

  nodes
}

// Builds user-provided custom meta, link, script elements, JSON-LD, and raw head nodes.
#let build-custom-nodes(meta, links, scripts, json-ld, head) = {
  let nodes = ()

  for m in coerce-list(meta) {
    if type(m) == dictionary {
      nodes.push(h("meta", ..m))
    }
  }

  for l in coerce-list(links) {
    if type(l) == dictionary {
      nodes.push(h("link", ..l))
    }
  }

  for s in coerce-list(scripts) {
    if type(s) == dictionary {
      nodes.push(h("script", ..s))
    } else if type(s) == str {
      nodes.push(h("script", s))
    }
  }

  if json-ld != none {
    let json-str = if type(json-ld) == str { json-ld } else { json.encode(json-ld) }
    nodes.push(h("script", type: "application/ld+json", json-str))
  }

  if head != none {
    nodes.push(head)
  }

  nodes
}

// Declarative document metadata macro emitting a typress-head container for SSG extraction.
#let meta(
  title: none,
  layout: "default",
  lang: none,
  description: none,
  keywords: none,
  author: none,
  viewport: none,
  charset: none,
  robots: none,
  generator: none,
  theme-color: none,
  color-scheme: none,
  referrer: none,
  canonical: none,
  icon: none,
  favicon: none,
  apple-touch-icon: none,
  manifest: none,
  og-title: none,
  og-description: none,
  og-type: none,
  og-url: none,
  og-image: none,
  og-image-alt: none,
  og-site-name: none,
  og-locale: none,
  og: (:),
  twitter-card: none,
  twitter-site: none,
  twitter-creator: none,
  twitter-title: none,
  twitter-description: none,
  twitter-image: none,
  twitter-image-alt: none,
  twitter: (:),
  published-time: none,
  modified-time: none,
  section: none,
  tags: (),
  meta: (),
  links: (),
  scripts: (),
  alternate: (),
  json-ld: none,
  head: none,
  body
) = {
  set document(title: title) if title != none

  let head-nodes = ()

  head-nodes += build-standard-meta(description, keywords, author, viewport, robots, generator, theme-color, color-scheme, referrer, charset)

  let og-result = build-og-meta(og-title, og-description, og-type, og-url, og-image, og-image-alt, og-site-name, og-locale, og, title, description, canonical, published-time)
  head-nodes += og-result.nodes

  head-nodes += build-twitter-meta(twitter-card, twitter-site, twitter-creator, twitter-title, twitter-description, twitter-image, twitter-image-alt, twitter, og-image-alt, og-result.eff-title, og-result.eff-desc, og-result.eff-image)

  head-nodes += build-article-meta(published-time, modified-time, section, tags)

  head-nodes += build-link-nodes(canonical, icon, favicon, apple-touch-icon, manifest, alternate)

  head-nodes += build-custom-nodes(meta, links, scripts, json-ld, head)

  let head-attrs = (:)
  if layout != none { head-attrs.insert("layout", layout) }
  if lang != none { head-attrs.insert("lang", lang) }

  if head-nodes.len() > 0 or head-attrs.len() > 0 {
    h("typress:head", ..head-attrs, ..head-nodes)
  }

  body
}
