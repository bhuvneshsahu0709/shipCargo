import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "../../config/env.js";
import type { StorageAdapter, StoredObjectRef } from "./types.js";

const root = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

function resolveKeyPath(key: string): string {
  const safeKey = key.replace(/\.\./g, "");
  return path.join(root, safeKey);
}

export class LocalStorageAdapter implements StorageAdapter {
  async put(key: string, data: Buffer): Promise<StoredObjectRef> {
    const filePath = resolveKeyPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return { storageKey: key };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(resolveKeyPath(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(resolveKeyPath(key), { force: true });
  }
}
