import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire("C:/Users/urmylucky/Documents/MIKKO/fund-allocation-os/apps/web/package.json");
const sharp = require("sharp");

const outputDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const entries = (await fs.readdir(outputDir)).filter((name) => name.endsWith(".svg"));

for (const name of entries) {
  const input = path.join(outputDir, name);
  const output = path.join(outputDir, `${path.parse(name).name}.preview.png`);
  await sharp(input, { density: 144 }).png().toFile(output);
  process.stdout.write(`${output}\n`);
}
