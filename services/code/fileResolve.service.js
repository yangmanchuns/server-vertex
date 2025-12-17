import path from "path";

export function resolveFileByExactName(fileIndex, fileName) {
  if (!fileName) return null;

  const base = path.basename(fileName);

  const matches = fileIndex.filter(
    (f) => path.basename(f) === base
  );

  console.log("[RESOLVE] fileName:", base);
  console.log("[RESOLVE] candidates:", matches);

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `파일명이 중복됩니다: ${base}\n` +
      matches.map((m) => `- ${m}`).join("\n")
    );
  }

  return null;
}
