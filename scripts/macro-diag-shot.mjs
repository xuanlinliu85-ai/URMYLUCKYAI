// 截图辅助：把页面上移 N 像素，让无头截图能拍到页面下部的面板
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
let html = readFileSync(resolve(root, "public/macro-workbench.html"), "utf8");
const shift = Number(process.argv[2] || 0);
if (shift > 0) {
  const style = "<style>html{margin-top:-" + shift + "px!important}header{position:static!important}</style>";
  html = html.replace("</head>", style + "</head>");
}
const out = resolve(root, "work/macro/__shot_src.html");
writeFileSync(out, html, "utf8");
console.log("ok shift=" + shift);
