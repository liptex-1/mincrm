import { useSyncExternalStore } from 'react';
import { readOpt, writeOpt } from './consent';

export interface Bg { img: string | null; dim: number; blur: number }
const KEY = 'minicrm.bg';
let state: Bg = { img: null, dim: 80, blur: 0 };
const ls = new Set<() => void>();

function parse(): Bg { try { const v = JSON.parse(readOpt(KEY) || 'null'); return v && typeof v === 'object' ? { img: v.img ?? null, dim: Number(v.dim ?? 80), blur: Number(v.blur ?? 0) } : state; } catch { return state; } }
export function applyBg() {
  state = parse();
  const el = document.documentElement;
  el.classList.toggle('has-bg', !!state.img);
  if (state.img) { el.style.setProperty('--bg-img', `url("${state.img}")`); el.style.setProperty('--bg-dim', `${state.dim}%`); el.style.setProperty('--bg-blur', `${state.blur}px`); }
  else ['--bg-img', '--bg-dim', '--bg-blur'].forEach((p) => el.style.removeProperty(p));
  ls.forEach((l) => l());
}
export function saveBg(b: Bg) { writeOpt(KEY, b.img ? JSON.stringify(b) : null); applyBg(); }
export const getBg = () => state;
export const useBg = () => useSyncExternalStore((l) => { ls.add(l); return () => ls.delete(l); }, () => state);
