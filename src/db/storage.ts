/**
 * Слой хранения. Интерфейс StorageAdapter скрывает конкретную БД: сегодня это IndexedDB в браузере,
 * завтра сюда можно подключить облачный адаптер (REST/Supabase/Firebase) и синхронизацию —
 * все записи содержат updatedAt, а изменения применяются атомарными пакетами (Batch).
 */
import { COLLECTIONS, emptyData, type Batch, type Data } from '../domain/types';

export interface StorageAdapter {
  load(): Promise<Data>;
  /** Атомарно: либо весь пакет записан, либо ничего. */
  commit(batch: Batch): Promise<void>;
  /** Полная замена данных (импорт резервной копии) — тоже одной транзакцией. */
  replaceAll(data: Data): Promise<void>;
}

const DB_NAME = 'minicrm';
const DB_VERSION = 1;
const STORES = [...COLLECTIONS, 'settings'] as const;

const req = <T,>(r: IDBRequest<T>): Promise<T> => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export class IndexedDBAdapter implements StorageAdapter {
  private dbp: Promise<IDBDatabase>;
  constructor() {
    this.dbp = new Promise((res, rej) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => { for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s, { keyPath: 'id' }); };
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    });
  }
  async load(): Promise<Data> {
    const db = await this.dbp;
    const tx = db.transaction([...STORES], 'readonly');
    const data: any = emptyData();
    for (const c of COLLECTIONS) data[c] = await req(tx.objectStore(c).getAll());
    const s = await req(tx.objectStore('settings').get('main'));
    if (s) data.settings = { ...data.settings, ...s };
    return data as Data;
  }
  private run(fn: (tx: IDBTransaction) => void): Promise<void> {
    return this.dbp.then((db) => new Promise<void>((res, rej) => {
      const tx = db.transaction([...STORES], 'readwrite');
      try { fn(tx); } catch (e) { tx.abort(); rej(e); return; }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error ?? new Error('Транзакция отменена'));
    }));
  }
  commit(b: Batch) {
    return this.run((tx) => {
      for (const [store, ids] of Object.entries(b.del)) for (const id of ids ?? []) tx.objectStore(store).delete(id);
      for (const [store, recs] of Object.entries(b.put)) for (const r of recs ?? []) tx.objectStore(store).put(r);
    });
  }
  replaceAll(data: Data) {
    return this.run((tx) => {
      for (const c of COLLECTIONS) { const st = tx.objectStore(c); st.clear(); for (const r of data[c] as any[]) st.put(r); }
      const st = tx.objectStore('settings'); st.clear(); st.put({ ...data.settings, id: 'main' });
    });
  }
}

/** Запасной вариант, если IndexedDB недоступна (например, приватный режим): данные живут до закрытия вкладки. */
export class MemoryAdapter implements StorageAdapter {
  private data: Data = emptyData();
  async load() { return this.data; }
  async commit(b: Batch) { const { applyBatch } = await import('../domain/ops'); this.data = applyBatch(this.data, b); }
  async replaceAll(d: Data) { this.data = d; }
}

export async function createStorage(): Promise<{ adapter: StorageAdapter; persistent: boolean }> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no idb');
    const a = new IndexedDBAdapter();
    await a.load();
    return { adapter: a, persistent: true };
  } catch {
    return { adapter: new MemoryAdapter(), persistent: false };
  }
}

// ───────── Резервная копия ─────────
export const BACKUP_VERSION = 1;
export function exportBackup(d: Data): string {
  return JSON.stringify({ app: 'MiniCRM', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: d }, null, 2);
}
export function parseBackup(text: string): Data {
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('Файл не является корректным JSON'); }
  if (j?.app !== 'MiniCRM' || !j.data) throw new Error('Это не резервная копия MiniCRM');
  const base = emptyData();
  const out: any = { ...base, settings: { ...base.settings, ...(j.data.settings ?? {}), id: 'main' } };
  for (const c of COLLECTIONS) {
    const arr = j.data[c];
    if (arr !== undefined && !Array.isArray(arr)) throw new Error(`Повреждён раздел «${c}»`);
    out[c] = (arr ?? []).filter((x: any) => x && typeof x.id === 'string');
  }
  return out as Data;
}
