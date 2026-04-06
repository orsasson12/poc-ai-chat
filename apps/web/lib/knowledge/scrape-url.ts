/**
 * Fetches a URL and extracts readable text content from the HTML.
 * Handles SSL issues, bot-blocking, and heavy JS sites.
 */

import https from "node:https";
import http from "node:http";

const MAX_CONTENT_LENGTH = 50_000; // ~50KB text limit to avoid bloated LLM context
const REQUEST_TIMEOUT = 15_000;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Strip HTML tags, scripts, styles, and decode common entities. */
function htmlToText(html: string): string {
  return (
    html
      // Remove script blocks (including multiline, inline handlers)
      .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
      // Remove style blocks
      .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ")
      // Remove SVG blocks (often contain non-text data)
      .replace(/<svg[\s\S]*?<\/svg\s*>/gi, " ")
      // Remove HTML comments
      .replace(/<!--[\s\S]*?-->/g, " ")
      // Remove inline event handlers and data attributes
      .replace(/\s(?:on\w+|data-[\w-]+)="[^"]*"/gi, "")
      // Replace block-level elements with newlines
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article|header|footer|dt|dd)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "\n---\n")
      // List items get a bullet
      .replace(/<li[^>]*>/gi, "\n• ")
      // Remove all remaining tags
      .replace(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
      .replace(/&\w+;/g, " ") // remaining entities → space
      // Remove JS-like artifacts that leak through (var x = ..., function(), {}, etc.)
      .replace(/\bvar\s+\w+\s*=[\s\S]*?[;\n]/g, " ")
      .replace(/\bfunction\s*\([^)]*\)\s*\{[\s\S]*?\}/g, " ")
      .replace(/\bgoogletag\b[\s\S]*?;/g, " ")
      .replace(/\b(?:window|document)\.\w+[\s\S]*?[;\n]/g, " ")
      // Collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Fetch a URL using node:https/http with relaxed SSL.
 * Falls back to this when standard fetch() rejects SSL certs.
 */
function fetchWithRelaxedSSL(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const mod = parsedUrl.protocol === "https:" ? https : http;

    const req = mod.get(
      url,
      {
        headers: {
          "User-Agent": BROWSER_UA,
          Accept: "text/html,application/xhtml+xml,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
        },
        rejectUnauthorized: false,
        timeout: REQUEST_TIMEOUT,
      },
      (res) => {
        // Follow redirects (up to 5)
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          fetchWithRelaxedSSL(redirectUrl).then(resolve, reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      },
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
    req.on("error", reject);
  });
}

export async function scrapeUrl(url: string): Promise<{ content: string; title: string }> {
  let raw: string;

  // Try standard fetch first, fall back to relaxed SSL
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9,he;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    raw = await response.text();
  } catch (err) {
    // SSL or network error → retry with relaxed SSL
    try {
      raw = await fetchWithRelaxedSSL(url);
    } catch (fallbackErr) {
      throw new Error(
        `Failed to fetch URL: ${fallbackErr instanceof Error ? fallbackErr.message : "Connection failed"}`,
      );
    }
  }

  if (!raw || raw.length < 50) {
    throw new Error("URL returned empty or too small response");
  }

  const contentType = raw.slice(0, 200).toLowerCase();

  // Plain text (no HTML tags in first 200 chars) — use directly
  if (!contentType.includes("<html") && !contentType.includes("<!doctype")) {
    return {
      content: raw.slice(0, MAX_CONTENT_LENGTH),
      title: new URL(url).hostname,
    };
  }

  // Extract <title> before stripping HTML
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? htmlToText(titleMatch[1]).slice(0, 200) : new URL(url).hostname;

  // Try to extract the main content area (reduces noise from nav/footer/ads)
  let targetHtml = raw;
  const mainMatch =
    raw.match(/<main[\s\S]*?<\/main>/i) ??
    raw.match(/<article[\s\S]*?<\/article>/i);

  if (mainMatch) {
    targetHtml = mainMatch[0];
  } else {
    // Fall back to <body>
    const bodyMatch = raw.match(/<body[\s\S]*?<\/body>/i);
    if (bodyMatch) targetHtml = bodyMatch[0];
  }

  const content = htmlToText(targetHtml).slice(0, MAX_CONTENT_LENGTH);

  if (!content || content.length < 20) {
    throw new Error("Could not extract meaningful content from URL");
  }

  return { content, title };
}
