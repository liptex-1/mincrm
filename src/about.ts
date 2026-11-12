import { useSyncExternalStore } from 'react';
import { CLOUD, emptyAbout, fetchAbout, saveAbout, type AboutInfo } from './db/cloud';

let state: AboutInfo = emptyAbout; let loaded = false; const ls = new Set<() => void>();
const set = (a: AboutInfo) => { state = a; ls.forEach((l) => l()); };
export function loadAbout() { if (!CLOUD || loaded) return; loaded = true; fetchAbout().then(set).catch(() => { loaded = false; }); }
export async function updateAbout(a: AboutInfo) { await saveAbout(a); set(a); }
export function useAbout() { loadAbout(); return useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state); }
