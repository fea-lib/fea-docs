import fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import type {
  FileContent,
  FilePath,
  RemoteUrl,
  FileResource,
} from "../types/FileResource";

function findProjectRoot(startDir: string): string | null {
  const symlinkPath = path.join(startDir, "src", "content", "docs");
  try {
    if (fs.lstatSync(symlinkPath).isSymbolicLink()) {
      const target = fs.readlinkSync(symlinkPath);
      return path.isAbsolute(target)
        ? target
        : path.resolve(path.dirname(symlinkPath), target);
    }
  } catch {}

  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, "fea-docs.config.mjs"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveExistingPath(pathname: string): string {
  if (path.isAbsolute(pathname) && fs.existsSync(pathname)) {
    return pathname;
  }

  const rawPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const relVariants = new Set<string>([rawPath]);

  if (rawPath.startsWith("docs/")) {
    relVariants.add(rawPath.slice("docs/".length));
  }

  const cwd = process.cwd();
  const candidateBases = [
    cwd,
    path.resolve(cwd, "docs"),
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ];

  const projectRoot = findProjectRoot(cwd);
  if (projectRoot) {
    candidateBases.push(projectRoot);
    candidateBases.push(path.resolve(projectRoot, "docs"));
  }

  for (const base of candidateBases) {
    for (const relPath of relVariants) {
      const candidate = path.resolve(base, relPath);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return path.resolve(cwd, rawPath);
}

export async function loadFileResource(
  resource: FileResource
): Promise<string> {
  if (isFileContent(resource)) return resource;

  if (isFilePath(resource)) {
    const absPath = resolveExistingPath(resource.pathname);
    const fileUrl = pathToFileURL(absPath);

    const fs = await import("fs/promises");
    return await fs.readFile(fileUrl, "utf-8");
  }

  if (isRemoteUrl(resource)) {
    const res = await fetch(resource);
    return await res.text();
  }
  throw new Error(`Unknown file resource: ${resource}`);
}

function isFileContent(resource: unknown): resource is FileContent {
  return typeof resource === "string";
}

function isFilePath(resource: unknown): resource is FilePath {
  return resource instanceof URL && resource.protocol === "file:";
}

function isRemoteUrl(resource: unknown): resource is RemoteUrl {
  return (
    resource instanceof URL &&
    (resource.protocol === "http:" || resource.protocol === "https:")
  );
}
