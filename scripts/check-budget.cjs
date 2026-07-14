const { statSync } = require("node:fs");
const { join } = require("node:path");

const file = join(process.cwd(), "dist", "index.js");
const bytes = statSync(file).size;
const maximum = 100 * 1024;
if (bytes > maximum) {
  console.error(`Bundle budget exceeded: ${bytes} / ${maximum} bytes.`);
  process.exit(1);
}
console.log(`Bundle budget passed: ${bytes} / ${maximum} bytes.`);

