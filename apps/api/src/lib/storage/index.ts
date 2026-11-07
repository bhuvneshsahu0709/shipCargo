import { LocalStorageAdapter } from "./localStorage.js";
import type { StorageAdapter } from "./types.js";

export const storage: StorageAdapter = new LocalStorageAdapter();
export type { StorageAdapter } from "./types.js";
