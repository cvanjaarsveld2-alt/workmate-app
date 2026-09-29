// The public website and user manual (site/): builds it and checks that every
// page is complete and every link and picture on it works.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
const SITE = "https://www.example-site.test";
execFileSync(process.execPath, ["site/build.mjs"], { env: { ...process.env, SITE_OUT: OUT, SITE_URL: SITE, APP_URL: "https://app.example-site.test", CONTACT_EMAIL: "", CONTACT_WHATSAPP: "" }, stdio: "pipe" });

const pages = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith(".html")) pages.push(p);
  }
})(OUT);
const read = p => fs.readFileSync(p, "utf8");
const exists = href => {
  const clean = href.split("#")[0].split("?")[0];
  const p = path.join(OUT, clean);
  return clean.endsWith("/") ? fs.existsSync(path.join(p, "index.html")) : fs.existsSync(p);
};

test("every page has a title, description, canonical link, preview image and one h1", () => {
  assert.ok(pages.length >= 15, `only ${pages.length} pages`);
  for (const p of pages) {
    const html = read(p);
    const name = path.relative(OUT, p);
    assert.match(html, /<title>[^<]{10,}<\/title>/, name);
    assert.match(html, /<meta name="description" content="[^"]{40,}">/, name);
    assert.match(html, new RegExp(`<link rel="canonical" href="${SITE}/`), name);
    assert.match(html, /<meta property="og:image" content="[^"]+\/img\/og\.png">/, name);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${name}: one h1`);
    assert.doesNotMatch(html, /localhost|undefined|\[object Object\]|NaN/, name);
  }
});

test("every internal link and picture points at something that exists", () => {
  const broken = [];
  for (const p of pages) {
    const html = read(p);
    const pageDir = "/" + path.relative(OUT, path.dirname(p)).split(path.sep).join("/");
    for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]+)"/g)) {
      if (/^(https?:|mailto:|tel:|data:)/.test(url) || url.startsWith("#")) continue;
      const abs = url.startsWith("/") ? url : path.posix.join(pageDir, url);
      if (!exists(abs)) broken.push(`${path.relative(OUT, p)}: ${attr}=${url}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("in-page links on manual pages point at headings that exist", () => {
  const broken = [];
  const ids = new Map(pages.map(p => [p, new Set([...read(p).matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))]));
  const byUrl = new Map(pages.map(p => ["/" + path.relative(OUT, p).replace(/index\.html$/, "").split(path.sep).join("/"), p]));
  for (const p of pages) {
    for (const [, url] of read(p).matchAll(/href="([^"]*#[^"]+)"/g)) {
      if (/^https?:/.test(url)) continue;
      const [target, hash] = url.split("#");
      const file = target ? byUrl.get(target) : p;
      if (!file || !ids.get(file).has(hash)) broken.push(`${path.relative(OUT, p)} → ${url}`);
    }
  }
  assert.deepEqual(broken, []);
});

test("sitemap, robots.txt and llms.txt list the site's pages", () => {
  const sitemap = read(path.join(OUT, "sitemap.xml"));
  for (const p of pages.filter(p => !p.endsWith("404.html"))) {
    const url = SITE + "/" + path.relative(OUT, p).replace(/index\.html$/, "").split(path.sep).join("/");
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `sitemap misses ${url}`);
  }
  assert.ok(!sitemap.includes("404"), "the 404 page stays out of the sitemap");
  assert.match(read(path.join(OUT, "robots.txt")), new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.match(read(path.join(OUT, "llms.txt")), /## User manual\n- \[Getting started\]/);
});

test("contact buttons stay hidden until contact details are set", () => {
  const home = read(path.join(OUT, "index.html"));
  assert.doesNotMatch(home, /wa\.me|mailto:/);
  const withContact = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  execFileSync(process.execPath, ["site/build.mjs"], { env: { ...process.env, SITE_OUT: withContact, SITE_URL: SITE, CONTACT_EMAIL: "hello@example-site.test", CONTACT_WHATSAPP: "+27 82 123 4567" }, stdio: "pipe" });
  const html = read(path.join(withContact, "index.html"));
  assert.match(html, /href="https:\/\/wa\.me\/27821234567\?text=/);
  assert.match(html, /href="mailto:hello@example-site\.test/);
});

test("prices on the website match the app's plan list", () => {
  const migration = fs.readdirSync("supabase/migrations").filter(f => f.includes("plan")).map(f => read(path.join("supabase/migrations", f))).join("\n");
  const pricing = read(path.join(OUT, "pricing", "index.html"));
  for (const [name, price] of [["Starter", "499"], ["Pro", "1 299"], ["Enterprise", "2 999"]]) {
    assert.match(pricing, new RegExp(`${name}[\\s\\S]{0,200}R${price.replace(" ", "\\s")}`), `${name} price`);
    assert.ok(migration.includes(price.replace(" ", "")), `${name} price ${price} is in the plan migrations`);
  }
});

test("screenshots come from the demo company, and every one is used", () => {
  const imgs = fs.readdirSync("site/img").filter(f => f.startsWith("app-"));
  const all = pages.map(read).join("\n");
  const unused = imgs.filter(f => !all.includes(`/img/${f}`));
  const used = [...all.matchAll(/\/img\/(app-[\w-]+\.webp)/g)].map(m => m[1]);
  assert.deepEqual([...new Set(used.filter(f => !imgs.includes(f)))], [], "pages use screenshots that don't exist");
  assert.ok(unused.length <= 4, `screenshots not used on any page: ${unused.join(", ")}`);
  assert.match(fs.readFileSync("tests/sim/site-shots.cjs", "utf8"), /rebrand\(H\.db\)/, "screenshots use the fictional demo company");
});

test("the app stays out of search results and opens Sign Up from the website", () => {
  assert.match(fs.readFileSync("public/robots.txt", "utf8"), /User-agent: \*\nDisallow: \//);
  assert.match(fs.readFileSync("index.html", "utf8"), /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(fs.readFileSync("src/auth/AuthScreen.jsx", "utf8"), /has\("signup"\) \? "signup" : "signin"/);
  assert.match(fs.readFileSync("src/screens/HelpScreen.jsx", "utf8"), /VITE_MANUAL_URL/);
  assert.match(fs.readFileSync("site/src/layout.mjs", "utf8"), /\/\?signup=1/);
});
