import type { Range } from './finance';
import { todayISO } from './money';

const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return fmt(d); };
export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][Number(key.slice(5, 7)) - 1] + ' ' + key.slice(2, 4);
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
export const PERIOD_LABELS: Record<PeriodKey, string> = { today: 'Сегодня', week: 'Неделя', month: 'Месяц', quarter: 'Квартал', year: 'Год', all: 'Всё время', custom: 'Период' };

export function periodRange(key: PeriodKey, custom?: Range): Range {
  const t = todayISO();
  const d = parse(t);
  switch (key) {
    case 'today': return { from: t, to: t };
    case 'week': { const wd = (d.getDay() + 6) % 7; return { from: addDays(t, -wd), to: t }; }
    case 'month': return { from: fmt(new Date(d.getFullYear(), d.getMonth(), 1)), to: t };
    case 'quarter': return { from: fmt(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1)), to: t };
    case 'year': return { from: `${d.getFullYear()}-01-01`, to: t };
    case 'custom': return custom ?? {};
    default: return {};
  }
}

/** Список месячных корзин от from до to включительно. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split('-').map(Number);
  const [ey, em] = to.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export function lastMonths(n: number): string[] {
  const t = todayISO();
  const [y, m] = t.split('-').map(Number);
  const start = new Date(y, m - n, 1);
  return monthsBetween(fmt(start), t);
}
