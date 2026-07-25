import { glob } from "glob";
import { mkdir, readFile, writeFile, stat, rm } from "fs/promises";
import { join, dirname, basename } from "path";
import { $ } from "bun";

/** Structured metadata extracted from the <typress-head> container. */
interface HeadMetadata {
  /** Raw inner HTML of the <typress-head> container. */
  inner: string;
  /** Document language from the typress-head lang attribute. */
  lang?: string;
}

async function getMaxSharedMtime(cwd: string): Promise<number> {
  const sharedFiles = await glob("src/**/*", {
    cwd,
    nodir: true,
    ignore: "src/pages/**/*",
  });
  const stats = await Promise.all(
    sharedFiles.map((file) => stat(join(cwd, file)).catch(() => null)),
  );
  return stats.reduce((max: number, s) => Math.max(max, s?.mtimeMs ?? 0), 0);
}

/**
 * Extracts the body content from an HTML string.
 */
function extractBodyContent(html: string): string {
  return html.match(/<body[^>]*>(.*?)<\/body>/is)?.[1] ?? html;
}

/**
 * Checks whether the compiled output is newer than both the source file
 * and the most recently modified shared file.
 */
async function isOutputFresh(
  srcPath: string,
  outPath: string,
  maxSharedMtime: number,
): Promise<boolean> {
  try {
    const srcStat = await stat(srcPath);
    const outStat = await stat(outPath);
    return outStat.mtimeMs >= srcStat.mtimeMs && outStat.mtimeMs >= maxSharedMtime;
  } catch {
    return false;
  }
}

/**
 * Merges extracted head metadata elements into the layout HTML head section.
 */
function injectHeadElements(
  layoutHtml: string,
  headInner: string,
  lang?: string,
): string {
  let html = layoutHtml;

  if (lang) {
    if (/<html[^>]*lang="[^"]*"/i.test(html)) {
      html = html.replace(/(<html[^>]*lang=")("[^>]*>)/i, `$1${lang}$2`);
    } else {
      html = html.replace(/<html/i, `<html lang="${lang}"`);
    }
  }

  const headCloseIndex = html.toLowerCase().indexOf("</head>");
  if (headCloseIndex === -1) return html;

  const tagMatches =
    headInner.match(
      /<(?:meta|link|script|style)[^>]*>(?:[\s\S]*?<\/(?:script|style)>)?/gi,
    ) || [];

  for (const tag of tagMatches) {
    const nameMatch = tag.match(/name="([^"]+)"/i);
    const propMatch = tag.match(/property="([^"]+)"/i);
    const equivMatch = tag.match(/http-equiv="([^"]+)"/i);
    const relMatch = tag.match(/rel="([^"]+)"/i);

    // Build a selector regex for the tag being replaced. Using replace()
    // directly (instead of test-then-replace) avoids the global regex
    // lastIndex drift that occurs when test() consumes the match state.
    let selector: RegExp | null = null;

    if (nameMatch) {
      selector = new RegExp(`<meta[^>]*name="${nameMatch[1]}"[^>]*>`, "gi");
    } else if (propMatch) {
      selector = new RegExp(`<meta[^>]*property="${propMatch[1]}"[^>]*>`, "gi");
    } else if (equivMatch) {
      selector = new RegExp(`<meta[^>]*http-equiv="${equivMatch[1]}"[^>]*>`, "gi");
    } else if (relMatch && (relMatch[1] === "canonical" || relMatch[1] === "icon")) {
      selector = new RegExp(`<link[^>]*rel="${relMatch[1]}"[^>]*>`, "gi");
    }

    if (selector) {
      const before = html;
      html = html.replace(selector, tag);
      if (html !== before) continue;
    }

    html = html.replace(/<\/head>/i, `    ${tag}\n  </head>`);
  }

  return html;
}

/**
 * Resolves the layout HTML string for a given document content.
 */
async function getLayoutHtml(
  layoutsDir: string,
  content: string,
): Promise<string> {
  // Support #show: meta.with(..., layout: "layoutName", ...) across single or multi line definitions
  const setDocMatch = content.match(
    /#show:\s*meta\.with\s*\([\s\S]*?layout\s*:\s*"([^"]+)"[\s\S]*?\)/,
  );
  const rawLayoutName = setDocMatch?.[1] ?? "default";
  const layoutName = basename(rawLayoutName);

  const layoutPath = join(layoutsDir, `${layoutName}.html`);

  try {
    return await readFile(layoutPath, "utf-8");
  } catch (error) {
    console.error(`[ERROR] Layout not found: ${layoutPath}`);
    throw error;
  }
}

/**
 * Determines the output path for a compiled HTML file based on its source path.
 */
function determineOutputPath(file: string): string {
  const name = basename(file, ".typ");
  const dir = dirname(file);
  if (name === "index") {
    return join(dir === "." ? "" : dir, "index.html");
  }
  return join(dir === "." ? "" : dir, `${name}.html`);
}

/**
 * Compiles a single Typst source file to HTML via the typst CLI.
 * Deduplicates warnings using the shared set.
 */
async function compileTypstFile(
  srcPath: string,
  outPath: string,
  printedWarnings: Set<string>,
): Promise<void> {
  try {
    const result =
      await $`typst compile --root ${process.cwd()} --format html --features html --input is_html=true ${srcPath} ${outPath}`.quiet();

    if (result.stderr) {
      const stderrStr = result.stderr.toString().replace(/\\\\\\?\\/g, "");
      const warnings = stderrStr.split(/\n\s*\n/);
      for (const warning of warnings) {
        const trimmed = warning.trim();
        if (trimmed && !printedWarnings.has(trimmed)) {
          printedWarnings.add(trimmed);
          console.error(trimmed + "\n");
        }
      }
    }
  } catch (error: unknown) {
    const err = error as { stderr?: string | Buffer };
    const detail = err?.stderr
      ? err.stderr.toString().trim()
      : error instanceof Error
        ? error.message
        : String(error);
    throw new Error(`Typst compilation failed for ${srcPath}: ${detail}`);
  }
}

/**
 * Extracts metadata from the <typress-head> container in compiled Typst HTML.
 */
function extractHeadMetadata(html: string): HeadMetadata | null {
  const match = html.match(/<typress-head([^>]*)>(.*?)<\/typress-head>/is);
  if (!match) return null;

  const langMatch = match[1].match(/lang="([^"]+)"/i);
  return {
    inner: match[2],
    lang: langMatch?.[1],
  };
}

/**
 * Removes the <typress-head> container from compiled HTML.
 */
function stripHeadContainer(html: string): string {
  return html.replace(/<typress-head[^>]*>.*?<\/typress-head>/is, "");
}

/**
 * Extracts the <title> content from compiled Typst HTML.
 */
function extractTitle(html: string): string | null {
  return html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1] ?? null;
}

/**
 * Assembles the final HTML document from layout, body content, title, and head metadata.
 */
function assembleDocument(
  layoutHtml: string,
  bodyContent: string,
  title: string | null,
  head: HeadMetadata | null,
): string {
  let html = layoutHtml.replace(/<slot\s*\/?>(<\/slot>)?/, bodyContent);

  if (title) {
    html = html.replace(
      /<title[^>]*>.*?<\/title>/is,
      `<title>${title}</title>`,
    );
  }

  if (head?.inner) {
    html = injectHeadElements(html, head.inner, head.lang);
  }

  return html;
}

/**
 * Processes a single Typst file through the compile-extract-assemble pipeline.
 */
async function processTypstFile(
  file: string,
  pagesDir: string,
  layoutsDir: string,
  tempDir: string,
  maxSharedMtime: number = 0,
  printedWarnings: Set<string>,
): Promise<boolean> {
  const srcPath = join(pagesDir, file);
  const outRelPath = determineOutputPath(file);
  const finalOutPath = join(process.cwd(), ".typress", outRelPath);

  if (await isOutputFresh(srcPath, finalOutPath, maxSharedMtime)) {
    return false;
  }

  const content = await readFile(srcPath, "utf-8");

  let layoutHtml: string;
  try {
    layoutHtml = await getLayoutHtml(layoutsDir, content);
  } catch {
    return false;
  }

  const tempOutPath = join(tempDir, `${file.replace(/[/\\]/g, "_")}.html`);

  try {
    await compileTypstFile(srcPath, tempOutPath, printedWarnings);
  } catch (error) {
    console.error(
      `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }

  const typstHtml = await readFile(tempOutPath, "utf-8");

  const head = extractHeadMetadata(typstHtml);
  const bodyContent = extractBodyContent(stripHeadContainer(typstHtml));
  const title = extractTitle(typstHtml);
  const finalHtml = assembleDocument(layoutHtml, bodyContent, title, head);

  await mkdir(dirname(finalOutPath), { recursive: true });
  await writeFile(finalOutPath, finalHtml);

  console.log(`\x1b[32m\u2713\x1b[0m compiled ${file}`);
  return true;
}

/**
 * Discovers Typst files and orchestrates the Static Site Generation build process.
 */
async function buildSSG(): Promise<void> {
  const startTime = performance.now();

  const cwd = process.cwd();
  const pagesDir = join(cwd, "src/pages");
  const layoutsDir = join(cwd, "src/layouts");
  const typFiles = await glob("**/*.typ", { cwd: pagesDir });

  if (typFiles.length === 0) {
    console.log("\x1b[33m\u26a0\x1b[0m no .typ files found in src/pages");
    return;
  }

  const tempDir = join(cwd, ".typress", "_temp");
  await mkdir(tempDir, { recursive: true });

  const maxSharedMtime = await getMaxSharedMtime(cwd);

  // Clean up stale HTML files in .typress (orphaned files that no longer have a .typ source)
  const existingHtmlFiles = await glob("**/*.html", {
    cwd: join(cwd, ".typress"),
    ignore: "_temp/**",
  });
  const expectedHtmlFiles = new Set(typFiles.map(determineOutputPath));
  for (const htmlFile of existingHtmlFiles) {
    if (!expectedHtmlFiles.has(htmlFile)) {
      await rm(join(cwd, ".typress", htmlFile)).catch(() => {});
    }
  }

  const printedWarnings = new Set<string>();
  const results = await Promise.all(
    typFiles.map((file) =>
      processTypstFile(
        file,
        pagesDir,
        layoutsDir,
        tempDir,
        maxSharedMtime,
        printedWarnings,
      ),
    ),
  );
  const builtCount = results.filter(Boolean).length;
  const skippedCount = results.length - builtCount;
  const timeMs = Math.round(performance.now() - startTime);

  if (builtCount > 0 || skippedCount > 0) {
    const builtText = builtCount === 1 ? "1 file" : `${builtCount} files`;
    const skippedText =
      skippedCount > 0
        ? `, skipped ${skippedCount === 1 ? "1 file" : `${skippedCount} files`}`
        : "";
    console.log(
      `\x1b[32m\u2713\x1b[0m \x1b[35mtypress\x1b[0m built ${builtText}${skippedText} in ${timeMs}ms`,
    );
  }
}

buildSSG().catch(console.error);
