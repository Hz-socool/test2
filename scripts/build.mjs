import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const outDirectory = new URL("../dist/", import.meta.url);

await rm(outDirectory, { recursive: true, force: true });
await mkdir(outDirectory, { recursive: true });

await build({
  entryPoints: [new URL("../src/code.ts", import.meta.url).pathname],
  outfile: new URL("code.js", outDirectory).pathname,
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  sourcemap: true,
  logLevel: "info"
});

await copyFile(
  new URL("../src/ui.html", import.meta.url),
  new URL("ui.html", outDirectory)
);
