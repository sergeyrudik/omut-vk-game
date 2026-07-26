import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);
const outputExists = existsSync(outputRoot);

test(
  "production export contains the playable Russian game shell",
  { skip: outputExists ? false : "run `pnpm build` before the production smoke test" },
  async () => {
    const html = await readFile(new URL("index.html", outputRoot), "utf8");
    assert.match(html, /<html[^>]*\blang=["']ru["']/i);
    assert.match(html, /<title>Омут — тихая заводь<\/title>/i);
    assert.match(html, /Омут/);
    assert.match(html, /class=["']app-shell["']/);
    assert.match(html, /ЗАГРУЗКА…/);
    assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);

    const staticEntries = await readdir(new URL("_next/static/", outputRoot), { recursive: true });
    const jsFiles = staticEntries.filter((entry) => entry.endsWith(".js"));
    let foundStart = false;
    for (const file of jsFiles) {
      const source = await readFile(new URL(`_next/static/${file}`, outputRoot), "utf8");
      if (source.includes("start-play") && source.includes("На мостки")) {
        foundStart = true;
        break;
      }
    }
    assert.equal(foundStart, true, "client bundle should include the start screen CTA");
  },
);

test(
  "production export includes local JavaScript and stylesheet assets",
  { skip: outputExists ? false : "run `pnpm build` before the production smoke test" },
  async () => {
    const [html, staticEntries] = await Promise.all([
      readFile(new URL("index.html", outputRoot), "utf8"),
      readdir(new URL("_next/static/", outputRoot), { recursive: true }),
    ]);
    assert.match(html, /\/_next\/static\/[^"']+\.js/);
    assert.match(html, /\/_next\/static\/[^"']+\.css/);
    assert.ok(staticEntries.some((entry) => entry.endsWith(".js")));
    assert.ok(staticEntries.some((entry) => entry.endsWith(".css")));
  },
);
