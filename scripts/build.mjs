import { mkdir, copyFile, cp } from "node:fs/promises";
const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
await copyFile(new URL("index.html", root), new URL("dist/index.html", root));
await cp(new URL("src/", root), new URL("dist/src/", root), { recursive: true });
console.log("Built standalone admin assets in dist/.");
