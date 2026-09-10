import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "adapters", "native-pptx", "contact-sheet.mjs"), "utf8");

test("contact sheets use a compact dynamic grid for long decks", () => {
  assert.match(source, /slideCount <= 3 \? 3 : slideCount <= 20 \? 4 : 5/);
  assert.match(source, /slideNumber/);
  assert.match(source, /labelHeight = 26/);
  assert.match(source, /top: labelHeight/);
});
