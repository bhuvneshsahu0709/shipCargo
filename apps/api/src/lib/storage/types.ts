export interface StoredObjectRef {
  storageKey: string;
}

export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<StoredObjectRef>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
