import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(
  import.meta.dirname,
  "..",
  "..",
  "api-zod",
  "src",
  "index.ts",
);

writeFileSync(target, 'export * from "./generated/api";\n');
