import { access, readFile } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL("manifest.json", repositoryRoot), "utf8")
);

if (manifest.documentAccess !== "dynamic-page") {
  throw new Error("manifest.json must opt into dynamic page loading.");
}
if (manifest.networkAccess?.allowedDomains?.join(",") !== "none") {
  throw new Error("The MVP manifest must keep network access disabled.");
}

const main = new URL(manifest.main, repositoryRoot);
const ui = new URL(manifest.ui, repositoryRoot);
await Promise.all([access(main), access(ui)]);

const [code, html] = await Promise.all([
  readFile(main, "utf8"),
  readFile(ui, "utf8")
]);

if (!code.includes("figma.showUI") || !code.includes("figma.ui.onmessage")) {
  throw new Error("Built controller is missing the expected Figma entry points.");
}
if (!html.includes("<!doctype html>") || !html.includes("Responsive Layout Refactor")) {
  throw new Error("Built UI is missing or malformed.");
}
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (inlineScript === undefined) {
  throw new Error("Built UI has no inline controller script.");
}
new Function(inlineScript);

console.log(`Verified manifest targets: ${manifest.main}, ${manifest.ui}`);
