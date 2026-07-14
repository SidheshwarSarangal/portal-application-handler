import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node22",
  dts: true,
  clean: true,
  treeshake: true,
  external: ["playwright"]
});

