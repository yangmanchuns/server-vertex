import fs from "fs";
import path from "path";

const IGNORE_DIRS = [".git", "node_modules", "dist", "build"];

export function buildFileIndex(root = process.cwd()) {
  const result = [];

  function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
      if (IGNORE_DIRS.includes(f)) continue;

      const full = path.join(dir, f);
      const rel = path.relative(root, full);

      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (f.endsWith(".js")) {
        result.push(rel.replace(/\\/g, "/"));
      }
    }
  }

  walk(root);
  return result;
}
