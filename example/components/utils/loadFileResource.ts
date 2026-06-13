import fs from "node:fs";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import type {
  FileContent,
  FilePath,
  RemoteUrl,
  FileResource,
} from "../types/FileResource";

function resolveExistingPath(pathname: string): string {
  if (path.isAbsolute(pathname) && fs.existsSync(pathname)) {
    return pathname;
  }

  const rawPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const relVariants = new Set<string>([rawPath]);

  if (rawPath.startsWith("docs/")) {
    relVariants.add(rawPath.slice("".length));
    relVariants.add(rawPath.slice("docs/".length));
  }

  if (rawPath.startsWith("")) {
    relVariants.add(rawPath.slice("".length));
  }

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
