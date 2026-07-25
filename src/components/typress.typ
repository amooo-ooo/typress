// Typress Hyperscript Component. Provides clean, composable DX for HTML elements.

#let parse-selector(s) = {
  let (tag, id, classes) = ("div", none, ())
  for m in s.matches(regex("(^|#|\\.)([^#.\\[\\]]+)")) {
    let (prefix, name) = m.captures
    if prefix == "" { tag = name }
    else if prefix == "." { classes.push(name) }
    else if prefix == "#" { id = name }
  }
  (tag, id, classes)
}

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
    } else {
      attrs.insert(k, str(v))
    }
  }

  if classes.len() > 0 { attrs.class = classes.join(" ") }

  let content = args.pos().join()
  if sys.inputs.at("is_html", default: "false") == "true" {
    html.elem(tag, attrs: attrs)[#content]
  } else {
    // Editor fallback to keep content visible.
    content
  }
}

#let component(ts-path, element-name) = {
  (..args) => {
    h("script", type: "module", "import('" + ts-path + "');")
    h(element-name, ..args.named())[#args.pos().join()]
  }
}

#let meta(title: none, layout: "default", body) = {
  set document(title: title) if title != none
  body
}
