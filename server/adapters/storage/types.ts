export type StoredObject = { data: Uint8Array; etag: string }

/** Persistent bytes are separate from the relational media index and deployment artifact. */
export interface StorageAdapter {
  put(key: string, data: Uint8Array): Promise<{ etag: string }>
  get(key: string): Promise<StoredObject | null>
  remove(key: string): Promise<void>
  writable(): Promise<boolean>
}
