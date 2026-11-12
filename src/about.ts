import { useSyncExternalStore } from 'react';
import { CLOUD, emptyAbout, fetchAbout, fetchBrand, saveAbout, saveBrand, type AboutInfo, type Brand } from './db/cloud';

let state: AboutInfo = emptyAbout; let loaded = false; const ls = new Set<() => void>();
const set = (a: AboutInfo) => { state = a; ls.forEach((l) => l()); };
export function loadAbout() { if (!CLOUD || loaded) return; loaded = true; fetchAbout().then(set).catch(() => { loaded = false; }); }
export async function updateAbout(a: AboutInfo) { await saveAbout(a); set(a); }
export function useAbout() { loadAbout(); return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state); }

// Название и логотип бизнеса — публичные, видны всем (и на экране входа).
let brand: Brand = { name: '', logo: null }; let brandLoaded = false; const bl = new Set<() => void>();
const setBrand = (b: Brand) => { brand = b; bl.forEach((l) => l()); };
export function loadBrand() { if (!CLOUD || brandLoaded) return; brandLoaded = true; fetchBrand().then((b) => b && setBrand(b)).catch(() => { brandLoaded = false; }); }
export async function updateBrand(b: Brand) { await saveBrand(b); setBrand(b); }
export const getBrand = () => brand;
export const isBrandLoaded = () => brand !== undefined && brandLoaded;
export function useBrand() { loadBrand(); return useSyncExternalStore((l) => { bl.add(l); return () => bl.delete(l); }, () => brand); }
