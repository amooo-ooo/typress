import { NodeCompiler } from "@myriaddreamin/typst-ts-node-compiler";
import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  stat,
  rm,
} from "node:fs/promises";
import { join, dirname, basename, relative, resolve, sep } from "node:path";

/**
 * Structured metadata extracted from `typress:head` containers.
 */
export interface HeadMetadata {
  /** Raw inner HTML of the `typress:head` containers. */
  readonly inner: string;
  /** Document language from the `typress:head` `lang` attribute. */
  readonly lang?: string;
  /** Layout template name from the `typress:head` `layout` attribute. */
  readonly layout?: string;
}

/** Diagnostic item returned by `NodeCompiler.fetchDiagnostics`. */
interface TypstDiagnostic {
  readonly message?: string;
  readonly path?: string;
  readonly range?: string | null;
}

let sharedCompiler: NodeCompiler | null = null;
let sharedCompilerWorkspace: string | null = null;

/**
 * Retrieves or initialises the in-process Rust `NodeCompiler` singleton for the workspace.
 *
 * @param workspace Absolute path to the workspace root directory.
 * @returns Warm `NodeCompiler` instance with incremental `comemo` caching enabled.
 */
function getCompiler(workspace: string): NodeCompiler {
  if (!sharedCompiler || sharedCompilerWorkspace !== workspace) {
    sharedCompiler = NodeCompiler.create({
      workspace,
      inputs: { is_html: "true" },
    });
    sharedCompilerWorkspace = workspace;
  }
  return sharedCompiler;
}

/**
 * Escapes regular expression metacharacters in dynamic strings.
 *
 * @param value Input string to escape.
 * @returns Escaped string safe for `RegExp` construction.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Computes the latest modification timestamp across shared source and build scripts.
 *
 * @param cwd Working directory root path.
 * @returns Maximum `mtimeMs` across shared files, or 0 if none exist.
 */
async function getMaxSharedMtime(cwd: string): Promise<number> {
  const srcDir = join(cwd, "src");
  const entries = await readdir(srcDir, {
    recursive: true,
    withFileTypes: true,
  }).catch(() => []);

  const filePaths: string[] = [join(cwd, "scripts/ssg.ts")];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const parentPath = entry.parentPath;
    const relFromSrc = relative(srcDir, parentPath).replace(/\\/g, "/");
    if (relFromSrc === "pages" || relFromSrc.startsWith("pages/")) continue;
    filePaths.push(join(parentPath, entry.name));
  }

  const stats = await Promise.all(
    filePaths.map((filePath) => stat(filePath).catch(() => null)),
  );
  return stats.reduce((max: number, s) => Math.max(max, s?.mtimeMs ?? 0), 0);
}

/**
 * Preloads all `.html` layout templates from `src/layouts` into an in-memory map.
 *
 * @param layoutsDir Absolute path to the `src/layouts` directory.
 * @returns Map of layout name (without `.html` extension) to layout HTML content.
 */
async function preloadLayouts(
  layoutsDir: string,
): Promise<Map<string, string>> {
  const entries = await readdir(layoutsDir).catch(() => [] as string[]);
  const htmlFiles = entries.filter((file) => file.endsWith(".html"));
  const pairs = await Promise.all(
    htmlFiles.map(async (file): Promise<readonly [string, string]> => {
      const content = await readFile(join(layoutsDir, file), "utf-8");
      return [basename(file, ".html"), content] as const;
    }),
  );
  return new Map(pairs);
}

/**
 * Extracts the inner `<body>` content from a compiled Typst HTML document.
 *
 * @param html Raw HTML document string produced by the Typst compiler.
 * @returns Inner HTML of the `<body>` element, or the original string if no `<body>` tag is present.
 */
function extractBodyContent(html: string): string {
  return html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
}

/**
 * Normalises heading levels so every page contains a primary `<h1>` without skipped levels.
 *
 * @param bodyHtml Extracted page body HTML string.
 * @returns Body HTML with a primary `<h1>` and sequential heading hierarchy.
 */
function ensurePrimaryHeading(bodyHtml: string): string {
  if (/<h1\b/i.test(bodyHtml)) return bodyHtml;
  const h2Matches = bodyHtml.match(/<h2\b/gi);
  if (!h2Matches || h2Matches.length === 0) return bodyHtml;
  if (h2Matches.length === 1) {
    return bodyHtml.replace(
      /<(\/?)h([2-6])\b([^>]*)>/gi,
      (_match: string, slash: string, levelStr: string, attrs: string) => {
        const nextLevel = Number.parseInt(levelStr, 10) - 1;
        return `<${slash}h${nextLevel}${attrs}>`;
      },
    );
  }
  return bodyHtml.replace(
    /<h2(\b[^>]*)>([\s\S]*?)<\/h2>/i,
    (_, attrs: string, content: string) => `<h1${attrs}>${content}</h1>`,
  );
}

/**
 * Removes duplicate module script imports emitted by repeated web component instances.
 *
 * @param html Page body HTML string.
 * @returns HTML string with duplicate `<script type="module">` tags removed.
 */
function deduplicateModuleScripts(html: string): string {
  const seenSpecs = new Set<string>();
  const scriptRegex =
    /<script\s+type="module"(?:\s+src=(['"][^'"]+['"])\s*><\/script>|>\s*import\((['"][^'"]+['"])\);\s*<\/script>)/gi;

  return html.replace(
    scriptRegex,
    (fullMatch: string, srcSpec?: string, inlineSpec?: string): string => {
      const spec = srcSpec ?? inlineSpec;
      if (!spec) return fullMatch;
      if (seenSpecs.has(spec)) {
        return "";
      }
      seenSpecs.add(spec);
      return fullMatch;
    },
  );
}

/**
 * Checks whether the compiled output is newer than both the source file and shared dependencies.
 *
 * @param srcPath Absolute path to the `.typ` source file.
 * @param outPath Absolute path to the compiled `.html` output file.
 * @param maxSharedMtime Latest modification timestamp across shared layout and component files.
 * @returns True if `outPath` exists and is fresher than both `srcPath` and `maxSharedMtime`.
 */
async function isOutputFresh(
  srcPath: string,
  outPath: string,
  maxSharedMtime: number,
): Promise<boolean> {
  try {
    const [srcStat, outStat] = await Promise.all([
      stat(srcPath),
      stat(outPath),
    ]);
    return (
      outStat.mtimeMs >= srcStat.mtimeMs && outStat.mtimeMs >= maxSharedMtime
    );
  } catch {
    return false;
  }
}

/**
 * Merges extracted head metadata elements into the layout HTML `<head>` section.
 *
 * @param layoutHtml Base HTML layout string.
 * @param headInner Raw HTML metadata tags extracted from `<typress-head>`.
 * @param lang Optional BCP 47 language tag for the root `<html>` element.
 * @returns Layout HTML string with updated `<head>` metadata and `lang` attribute.
 */
function injectHeadElements(
  layoutHtml: string,
  headInner: string,
  lang?: string,
): string {
  let html = layoutHtml;

  if (lang) {
    if (/<html[^>]*lang="[^"]*"/i.test(html)) {
      html = html.replace(
        /(<html[^>]*lang=")[^"]*("[^>]*>)/i,
        (_, prefix: string, suffix: string) => `${prefix}${lang}${suffix}`,
      );
    } else {
      html = html.replace(/<html/i, () => `<html lang="${lang}"`);
    }
  }

  const headCloseIndex = html.toLowerCase().indexOf("</head>");
  if (headCloseIndex === -1) return html;

  // Match void tags (meta, link) separately from container tags (script, style, noscript) to prevent greedy spanning.
  const tagMatches =
    headInner.match(
      /<(?:meta|link)\b[^>]*>|<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,
    ) ?? [];
  const replacedSelectors = new Set<string>();

  for (const tag of tagMatches) {
    const isVoidMetaOrLink = /^<(?:meta|link)\b/i.test(tag);
    let selector: RegExp | null = null;

    if (isVoidMetaOrLink) {
      const nameMatch = tag.match(/\bname="([^"]+)"/i);
      const propMatch = tag.match(/\bproperty="([^"]+)"/i);
      const equivMatch = tag.match(/\bhttp-equiv="([^"]+)"/i);
      const relMatch = tag.match(/\brel="([^"]+)"/i);

      if (nameMatch?.[1]) {
        selector = new RegExp(
          `<meta[^>]*\\bname="${escapeRegExp(nameMatch[1])}"[^>]*>`,
          "gi",
        );
      } else if (propMatch?.[1]) {
        selector = new RegExp(
          `<meta[^>]*\\bproperty="${escapeRegExp(propMatch[1])}"[^>]*>`,
          "gi",
        );
      } else if (equivMatch?.[1]) {
        selector = new RegExp(
          `<meta[^>]*\\bhttp-equiv="${escapeRegExp(equivMatch[1])}"[^>]*>`,
          "gi",
        );
      } else if (
        relMatch?.[1] &&
        (relMatch[1] === "canonical" || relMatch[1] === "icon")
      ) {
        selector = new RegExp(
          `<link[^>]*\\brel="${escapeRegExp(relMatch[1])}"[^>]*>`,
          "gi",
        );
      }
    }

    if (selector && !replacedSelectors.has(selector.source)) {
      replacedSelectors.add(selector.source);
      const before = html;
      html = html.replace(selector, () => tag);
      if (html !== before) continue;
    }

    html = html.replace(/<\/head>/i, () => `    ${tag}\n  </head>`);
  }

  return html;
}

/**
 * Resolves the layout HTML template from the preloaded layout cache or disk fallback.
 *
 * @param layoutsDir Directory containing `.html` layout templates.
 * @param layouts In-memory map of preloaded layout templates.
 * @param srcPath Absolute path to the `.typ` source file for fallback regex extraction.
 * @param compiledLayout Layout name extracted from the compiled `<typress-head>` element.
 * @returns Contents of the resolved `.html` layout template.
 */
async function resolveLayoutHtml(
  layoutsDir: string,
  layouts: Map<string, string>,
  srcPath: string,
  compiledLayout?: string,
): Promise<string> {
  let rawLayoutName = compiledLayout;
  if (!rawLayoutName) {
    const content = await readFile(srcPath, "utf-8");
    const setDocMatch = content.match(
      /#show:\s*meta\.with\s*\([\s\S]*?layout\s*:\s*"([^"]+)"[\s\S]*?\)/,
    );
    rawLayoutName = setDocMatch?.[1] ?? "default";
  }

  const layoutName = basename(rawLayoutName);
  const cached = layouts.get(layoutName);
  if (cached !== undefined) {
    return cached;
  }

  const layoutPath = join(layoutsDir, `${layoutName}.html`);
  try {
    const loaded = await readFile(layoutPath, "utf-8");
    layouts.set(layoutName, loaded);
    return loaded;
  } catch (error) {
    console.error(`[ERROR] Layout not found: ${layoutPath}`);
    throw error;
  }
}

/**
 * Determines the relative output path for a compiled HTML file from its source `.typ` path.
 *
 * @param file Relative `.typ` path within `src/pages`.
 * @returns Relative `.html` output path within `.typress`.
 */
export function determineOutputPath(file: string): string {
  const name = basename(file, ".typ");
  const dir = dirname(file);
  if (name === "index") {
    return join(dir === "." ? "" : dir, "index.html");
  }
  return join(dir === "." ? "" : dir, `${name}.html`);
}

/**
 * Marks the matching navigation link in the layout with `aria-current="page"`.
 *
 * @param html Assembled HTML document string.
 * @param outRelPath Relative output path of the current page.
 * @returns HTML string with `aria-current="page"` applied to the active navigation link.
 */
function applyCurrentPageAria(html: string, outRelPath: string): string {
  const normalisedRel = outRelPath.replace(/\\/g, "/").replace(/\.html$/, "");
  const routePath =
    normalisedRel === "index"
      ? "/"
      : normalisedRel.endsWith("/index")
        ? `/${normalisedRel.slice(0, -6)}`
        : `/${normalisedRel}`;

  return html.replace(
    /<a\b([^>]*?\bhref="([^"]+)"[^>]*)>/gi,
    (fullMatch: string, attrs: string, href: string): string => {
      if (href === routePath && !/\baria-current=/i.test(attrs)) {
        return `<a${attrs} aria-current="page">`;
      }
      return fullMatch;
    },
  );
}

/**
 * Compiles a single Typst source file to HTML in-memory using `@myriaddreamin/typst-ts-node-compiler`.
 *
 * @param compiler Shared in-process `NodeCompiler` instance.
 * @param srcPath Absolute path to the `.typ` source file.
 * @param printedWarnings Set tracking warnings already logged during the current build.
 * @returns Compiled HTML string produced by the Typst engine.
 */
function compileTypstHtml(
  compiler: NodeCompiler,
  srcPath: string,
  printedWarnings: Set<string>,
): string {
  const execResult = compiler.tryHtml({
    mainFilePath: srcPath,
    inputs: { is_html: "true" },
  });

  const warnings = execResult.takeWarnings();
  if (warnings) {
    const diagnostics = compiler.fetchDiagnostics(
      warnings,
    ) as TypstDiagnostic[];
    for (const diag of diagnostics) {
      const msg = diag.message?.trim();
      if (msg && !printedWarnings.has(msg)) {
        printedWarnings.add(msg);
        console.warn(`[warn] ${diag.path ?? srcPath}: ${msg}`);
      }
    }
  }

  if (execResult.hasError()) {
    const err = execResult.takeError();
    const diagnostics = err
      ? (compiler.fetchDiagnostics(err) as TypstDiagnostic[])
      : [];
    const detail =
      diagnostics
        .map(
          (d) =>
            `${d.path ?? srcPath}${d.range ? `:${d.range}` : ""} - ${d.message ?? "unknown error"}`,
        )
        .join("; ") || "Unknown Typst compilation error";
    throw new Error(`Typst compilation failed for ${srcPath}: ${detail}`);
  }

  const output = execResult.result;
  if (!output) {
    throw new Error(
      `Typst compilation returned empty output for ${srcPath}.`,
    );
  }

  return output.html();
}

/**
 * Extracts metadata from all `typress:head` containers in compiled Typst HTML.
 *
 * @param html Compiled Typst HTML string.
 * @returns Parsed `HeadMetadata` object, or null if no `typress:head` container is present.
 */
function extractHeadMetadata(html: string): HeadMetadata | null {
  const headRegex = /<typress[-:]head([^>]*)>([\s\S]*?)<\/typress[-:]head>/gi;
  const innerChunks: string[] = [];
  let lang: string | undefined;
  let layout: string | undefined;
  let match: RegExpExecArray | null;

  while ((match = headRegex.exec(html)) !== null) {
    const attrs = match[1] ?? "";
    const inner = match[2] ?? "";
    if (inner) innerChunks.push(inner);
    if (!lang) {
      lang = attrs.match(/\blang="([^"]+)"/i)?.[1];
    }
    if (!layout) {
      layout = attrs.match(/\blayout="([^"]+)"/i)?.[1];
    }
  }

  if (innerChunks.length === 0 && !lang && !layout) return null;

  return {
    inner: innerChunks.join("\n"),
    lang,
    layout,
  };
}

/**
 * Removes all `typress:head` containers from compiled HTML.
 *
 * @param html Compiled Typst HTML string.
 * @returns HTML string without `typress:head` blocks.
 */
function stripHeadContainer(html: string): string {
  return html.replace(/<typress[-:]head[^>]*>[\s\S]*?<\/typress[-:]head>/gi, "");
}

/**
 * Extracts the `<title>` element text from compiled Typst HTML.
 *
 * @param html Compiled Typst HTML string.
 * @returns Inner text of the `<title>` element, or null if absent.
 */
function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
}

/** Set of standard HTML void element tag names that do not have closing tags. */
const VOID_HTML_TAGS = new Set<string>([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/**
 * Finds the matching closing tag for a balanced HTML element starting after its opening tag.
 *
 * @param html Source HTML string.
 * @param tagName Tag name to balance.
 * @param searchStart Index immediately following the opening `<tagName...>` tag.
 * @returns Tuple of `[innerEnd, closeEnd]`, or null if no matching close tag is found.
 */
function findBalancedCloseTag(
  html: string,
  tagName: string,
  searchStart: number,
): readonly [number, number] | null {
  const escapedTag = escapeRegExp(tagName);
  const tagScanRegex = new RegExp(
    `<(\\/?)${escapedTag}\\b([^>]*)>`,
    "gi",
  );
  tagScanRegex.lastIndex = searchStart;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = tagScanRegex.exec(html)) !== null) {
    const isClosing = match[1] === "/";
    const attrs = match[2] ?? "";
    const isSelfClosing = !isClosing && /\/\s*$/.test(attrs);
    if (isClosing) {
      depth -= 1;
      if (depth === 0) {
        return [match.index, match.index + match[0].length] as const;
      }
    } else if (!isSelfClosing) {
      depth += 1;
    }
  }
  return null;
}

/**
 * Extracts W3C slotted elements (`slot="..."`) and `<typress-fragment>` blocks from the page body.
 *
 * @param bodyHtml Raw page body HTML string.
 * @returns Object containing the remaining default slot HTML and a map of named slot HTML strings.
 */
function extractSlottedContent(bodyHtml: string): {
  readonly defaultBody: string;
  readonly namedSlots: Map<string, string>;
} {
  const namedSlots = new Map<string, string>();
  if (!/\bslot="|<typress-fragment\b/i.test(bodyHtml)) {
    return { defaultBody: bodyHtml, namedSlots };
  }

  const slotOpenRegex =
    /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?\bslot="([^"]+)"[^>]*)>/gi;
  const defaultChunks: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = slotOpenRegex.exec(bodyHtml)) !== null) {
    const startIdx = match.index;
    const fullOpenTag = match[0];
    const tagName = match[1] ?? "div";
    const rawAttrs = match[2] ?? "";
    const slotName = match[3] ?? "default";
    const openEnd = startIdx + fullOpenTag.length;
    const lowerTag = tagName.toLowerCase();

    defaultChunks.push(bodyHtml.slice(cursor, startIdx));

    let innerHtml = "";
    let closeEnd = openEnd;
    const isVoidOrSelfClosing =
      VOID_HTML_TAGS.has(lowerTag) || /\/\s*>$/.test(fullOpenTag);

    if (!isVoidOrSelfClosing) {
      const balanced = findBalancedCloseTag(bodyHtml, tagName, openEnd);
      if (balanced) {
        innerHtml = bodyHtml.slice(openEnd, balanced[0]);
        closeEnd = balanced[1];
      }
    }

    cursor = closeEnd;
    slotOpenRegex.lastIndex = closeEnd;

    let chunk: string;
    if (lowerTag === "typress-fragment") {
      chunk = innerHtml;
    } else {
      const cleanedAttrs = rawAttrs
        .replace(/\s*\bslot="[^"]*"/gi, "")
        .replace(/\/\s*$/, "");
      chunk = isVoidOrSelfClosing
        ? `<${tagName}${cleanedAttrs}>`
        : `<${tagName}${cleanedAttrs}>${innerHtml}</${tagName}>`;
    }

    if (slotName === "default") {
      defaultChunks.push(chunk);
    } else {
      const prev = namedSlots.get(slotName);
      namedSlots.set(slotName, prev ? `${prev}\n${chunk}` : chunk);
    }
  }

  defaultChunks.push(bodyHtml.slice(cursor));
  const defaultBody = defaultChunks
    .join("")
    .replace(/<\/?typress-fragment\b[^>]*>/gi, "");

  return { defaultBody, namedSlots };
}

/**
 * Resolves W3C default `<slot></slot>` and named `<slot name="...">` elements with fallback support.
 *
 * @param layoutHtml Base HTML layout string containing `<slot>` elements.
 * @param bodyContent Extracted page body HTML string.
 * @returns Layout HTML string with all slots populated or replaced by their fallback content.
 */
function resolveSlots(layoutHtml: string, bodyContent: string): string {
  const deduplicatedBody = deduplicateModuleScripts(bodyContent);
  const { defaultBody, namedSlots } = extractSlottedContent(deduplicatedBody);
  const cleanDefaultBody = ensurePrimaryHeading(defaultBody);

  return layoutHtml.replace(
    /<slot(\b[^>]*?)(?:\/>|>([\s\S]*?)<\/slot>)/gi,
    (_fullMatch: string, attrs: string, fallback?: string): string => {
      const nameMatch = attrs.match(/\bname="([^"]+)"/i);
      const slotName = nameMatch?.[1];
      if (slotName && slotName !== "default") {
        const assigned = namedSlots.get(slotName);
        return assigned !== undefined && assigned.trim().length > 0
          ? assigned
          : (fallback ?? "");
      }
      return cleanDefaultBody.trim().length > 0
        ? cleanDefaultBody
        : (fallback ?? "");
    },
  );
}

/**
 * Assembles the final HTML document from layout, body content, title, and head metadata.
 *
 * @param layoutHtml Base HTML layout string.
 * @param bodyContent Extracted inner body HTML string.
 * @param title Optional page title extracted from `<title>`.
 * @param head Optional structured metadata extracted from `<typress-head>`.
 * @param outRelPath Relative output path used to mark active navigation links.
 * @returns Complete, assembled HTML document string.
 */
function assembleDocument(
  layoutHtml: string,
  bodyContent: string,
  title: string | null,
  head: HeadMetadata | null,
  outRelPath: string,
): string {
  let html = resolveSlots(layoutHtml, bodyContent);

  if (title) {
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(html)) {
      html = html.replace(
        /<title[^>]*>[\s\S]*?<\/title>/i,
        () => `<title>${title}</title>`,
      );
    } else {
      html = html.replace(
        /<\/head>/i,
        () => `    <title>${title}</title>\n  </head>`,
      );
    }
  }

  if (head?.inner || head?.lang) {
    html = injectHeadElements(html, head.inner, head.lang);
  }

  return applyCurrentPageAria(html, outRelPath);
}

/**
 * Compiles, assembles, and writes a single Typst page to `.typress`.
 *
 * @param compiler Shared in-process `NodeCompiler` instance.
 * @param file Relative `.typ` file path within `pagesDir`.
 * @param pagesDir Absolute path to `src/pages`.
 * @param layoutsDir Absolute path to `src/layouts`.
 * @param layouts Preloaded in-memory layout map.
 * @param printedWarnings Set used to deduplicate compiler warnings.
 * @returns True if the file was compiled and written, or false on error.
 */
async function compileAndWritePage(
  compiler: NodeCompiler,
  file: string,
  pagesDir: string,
  layoutsDir: string,
  layouts: Map<string, string>,
  printedWarnings: Set<string>,
): Promise<boolean> {
  const srcPath = join(pagesDir, file);
  const outRelPath = determineOutputPath(file);
  const finalOutPath = join(process.cwd(), ".typress", outRelPath);

  let typstHtml: string;
  try {
    typstHtml = compileTypstHtml(compiler, srcPath, printedWarnings);
  } catch (error: unknown) {
    console.error(
      `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }

  const head = extractHeadMetadata(typstHtml);
  const preloadedLayout = head?.layout
    ? layouts.get(basename(head.layout))
    : undefined;

  let layoutHtml: string;
  if (preloadedLayout !== undefined) {
    layoutHtml = preloadedLayout;
  } else {
    try {
      layoutHtml = await resolveLayoutHtml(
        layoutsDir,
        layouts,
        srcPath,
        head?.layout,
      );
    } catch {
      return false;
    }
  }

  const bodyContent = extractBodyContent(stripHeadContainer(typstHtml));
  const title = extractTitle(typstHtml);
  const finalHtml = assembleDocument(
    layoutHtml,
    bodyContent,
    title,
    head,
    outRelPath,
  );

  await mkdir(dirname(finalOutPath), { recursive: true });
  await writeFile(finalOutPath, finalHtml, "utf-8");

  console.log(`\x1b[32m[ok]\x1b[0m compiled ${file}`);
  return true;
}

/**
 * Discovers Typst pages and orchestrates the static site generation build process.
 *
 * @param changedFile Optional path of a single modified file triggered by Vite HMR.
 */
export async function buildSSG(changedFile?: string): Promise<void> {
  const startTime = performance.now();

  const cwd = process.cwd();
  const pagesDir = resolve(cwd, "src/pages");
  const layoutsDir = resolve(cwd, "src/layouts");
  const cacheDir = resolve(cwd, ".typress");
  const printedWarnings = new Set<string>();

  // Fast-path single-page HMR updates when a .typ file inside src/pages is saved.
  if (changedFile) {
    const absChanged = resolve(cwd, changedFile);
    const pagesPrefix = pagesDir.endsWith(sep) ? pagesDir : `${pagesDir}${sep}`;
    if (absChanged.startsWith(pagesPrefix) && absChanged.endsWith(".typ")) {
      const relFile = relative(pagesDir, absChanged);
      const layoutsPromise = preloadLayouts(layoutsDir);
      const compiler = getCompiler(cwd);
      const layouts = await layoutsPromise;
      const built = await compileAndWritePage(
        compiler,
        relFile,
        pagesDir,
        layoutsDir,
        layouts,
        printedWarnings,
      );
      compiler.evictCache(30);
      if (built) {
        const timeMs = Math.round(performance.now() - startTime);
        console.log(
          `\x1b[32m[ok]\x1b[0m \x1b[35mtypress\x1b[0m built 1 file in ${timeMs}ms`,
        );
      }
      return;
    }
  }

  // Launch all filesystem discovery and layout preloading tasks on worker threads before compiler creation.
  const discoveryPromise = Promise.all([
    readdir(pagesDir, { recursive: true }).catch(() => [] as string[]),
    mkdir(cacheDir, { recursive: true }),
    getMaxSharedMtime(cwd),
    preloadLayouts(layoutsDir),
    readdir(cacheDir, { recursive: true }).catch(() => [] as string[]),
  ]);

  const [rawPages, , maxSharedMtime, layouts, rawCacheEntries] =
    await discoveryPromise;

  const typFiles = rawPages.filter((file) => file.endsWith(".typ")).sort();

  if (typFiles.length === 0) {
    console.log("\x1b[33m[warn]\x1b[0m no .typ files found in src/pages");
    return;
  }

  // Clean up stale HTML files in .typress using normalised forward-slash paths.
  const existingHtmlFiles = rawCacheEntries.filter(
    (file) =>
      file.endsWith(".html") && !file.replace(/\\/g, "/").startsWith("_temp/"),
  );
  const expectedHtmlFiles = new Set(
    typFiles.map((f) => determineOutputPath(f).replace(/\\/g, "/")),
  );
  const staleRemovals: Promise<unknown>[] = [];
  for (const htmlFile of existingHtmlFiles) {
    const normalisedHtml = htmlFile.replace(/\\/g, "/");
    if (!expectedHtmlFiles.has(normalisedHtml)) {
      staleRemovals.push(rm(join(cacheDir, htmlFile)).catch(() => {}));
    }
  }

  // Check freshness in parallel across all pages before instantiating NodeCompiler.
  const freshnessFlags = await Promise.all(
    typFiles.map((file) =>
      isOutputFresh(
        join(pagesDir, file),
        join(cacheDir, determineOutputPath(file)),
        maxSharedMtime,
      ),
    ),
  );

  const staleFiles = typFiles.filter((_, idx) => !freshnessFlags[idx]);

  if (staleFiles.length === 0) {
    await Promise.all(staleRemovals);
    const skippedCount = typFiles.length;
    const timeMs = Math.round(performance.now() - startTime);
    const skippedText =
      skippedCount === 1 ? "1 file" : `${skippedCount} files`;
    console.log(
      `\x1b[32m[ok]\x1b[0m \x1b[35mtypress\x1b[0m built 0 files, skipped ${skippedText} in ${timeMs}ms`,
    );
    return;
  }

  const compiler = getCompiler(cwd);
  const results = await Promise.all(
    staleFiles.map((file) =>
      compileAndWritePage(
        compiler,
        file,
        pagesDir,
        layoutsDir,
        layouts,
        printedWarnings,
      ),
    ),
  );
  await Promise.all(staleRemovals);

  // Evict stale memoised entries while keeping active AST, font, and grammar caches warm.
  compiler.evictCache(10);

  const builtCount = results.filter(Boolean).length;
  const skippedCount = typFiles.length - staleFiles.length;
  const timeMs = Math.round(performance.now() - startTime);

  if (builtCount > 0 || skippedCount > 0) {
    const builtText = builtCount === 1 ? "1 file" : `${builtCount} files`;
    const skippedText =
      skippedCount > 0
        ? `, skipped ${skippedCount === 1 ? "1 file" : `${skippedCount} files`}`
        : "";
    console.log(
      `\x1b[32m[ok]\x1b[0m \x1b[35mtypress\x1b[0m built ${builtText}${skippedText} in ${timeMs}ms`,
    );
  }
}

if (import.meta.main) {
  buildSSG().catch(console.error);
}
