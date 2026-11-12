/** Согласие на cookie и хранение данных в браузере. Решение запоминается один раз. */
import { useSyncExternalStore } from 'react';

export type Consent = 'accepted' | 'declined' | null;
const KEY = 'minicrm.cookies';
/** Ключи, которые хранятся «надолго» только при согласии; иначе — до закрытия вкладки. */
export const OPTIONAL_KEYS = ['minicrm.session', 'minicrm.theme', 'minicrm.bg'];

const safe = <T,>(fn: () => T, d: T): T => { try { return fn(); } catch { return d; } };
const listeners = new Set<() => void>();

export const getConsent = (): Consent => safe(() => { const v = localStorage.getItem(KEY); return v === 'accepted' || v === 'declined' ? v : null; }, null);
/** Хранилище для необязательных данных: постоянное — только при согласии. */
export const optStore = (): Storage => (getConsent() === 'accepted' ? localStorage : sessionStorage);

export function readOpt(key: string): string | null { return safe(() => localStorage.getItem(key) ?? sessionStorage.getItem(key), null); }
export function writeOpt(key: string, value: string | null) {
  safe(() => { localStorage.removeItem(key); sessionStorage.removeItem(key); if (value !== null) optStore().setItem(key, value); }, undefined);
}

function migrate() {
  for (const k of OPTIONAL_KEYS) { const v = readOpt(k); if (v !== null) writeOpt(k, v); }
}
export function setConsent(v: Exclude<Consent, null>) {
  safe(() => localStorage.setItem(KEY, v), undefined);
  migrate(); listeners.forEach((l) => l());
}
export function resetConsent() { safe(() => localStorage.removeItem(KEY), undefined); migrate(); listeners.forEach((l) => l()); }
export const useConsent = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getConsent);
