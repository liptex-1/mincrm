import type { Bps, Kop } from './types';

/** Разбор строки вида "1 234,56" / "1234.5" в копейки. null — если не число. */
export function parseMoney(input: string | number): Kop | null {
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null;
  const s = input.replace(/[\s ₽$€]/g, '').replace(',', '.');
  if (s === '' || !/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-') return null;
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = s.replace('-', '').split('.');
  const kop = Number(intPart || '0') * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -kop : kop;
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ | /g, ' ');
}

/** Формат суммы: целые рубли без копеек, иначе с копейками. */
export function formatMoney(kop: Kop, symbol = '₽'): string {
  const whole = kop % 100 === 0;
  const s = formatNumber(kop / 100, whole ? 0 : 2);
  return `${s} ${symbol}`;
}

/** Рубли для поля ввода: "1234,5" */
export function moneyToInput(kop: Kop): string {
  if (!kop) return '';
  return kop % 100 === 0 ? String(kop / 100) : (kop / 100).toFixed(2).replace('.', ',');
}

export function formatPercent(bps: Bps): string {
  const v = bps / 100;
  return `${formatNumber(v, Number.isInteger(v) ? 0 : 2)}%`;
}
export function parsePercent(input: string): Bps | null {
  const s = input.replace(/[\s%]/g, '').replace(',', '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  return Math.round(Number(s) * 100);
}

/**
 * Метод наибольших остатков: делит total (целое) по весам так, что сумма частей
 * ровно равна total. Детерминирован: при равных остатках первым получает больший вес, затем меньший индекс.
 */
export function allocate(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  if (!Number.isInteger(total)) throw new Error('allocate: total должен быть целым');
  const sign = total < 0 ? -1n : 1n;
  const T = BigInt(Math.abs(total));
  const W = weights.reduce((a, b) => a + BigInt(Math.round(b)), 0n);
  if (W === 0n) return weights.map(() => 0);
  const parts = weights.map((w) => (T * BigInt(Math.round(w))) / W);
  const rems = weights.map((w, i) => ({ i, r: (T * BigInt(Math.round(w))) % W, w: Math.round(w) }));
  let left = T - parts.reduce((a, b) => a + b, 0n);
  rems.sort((a, b) => (a.r === b.r ? (b.w !== a.w ? b.w - a.w : a.i - b.i) : a.r > b.r ? -1 : 1));
  for (const x of rems) {
    if (left <= 0n) break;
    parts[x.i] += 1n;
    left -= 1n;
  }
  return parts.map((p) => Number(p * sign));
}

export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const formatDate = (iso?: string): string => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '—');
export const formatDateTime = (iso: string): string => `${formatDate(iso)} ${iso.slice(11, 16)}`;
export const uid = (): string => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`);
export const nowISO = (): string => new Date().toISOString();
