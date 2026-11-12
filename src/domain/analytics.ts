import { addDays, lastMonths, monthKey, monthsBetween } from './dates';
import { cashBalance, computeOrder, inRange, summarize, type Range } from './finance';
import { todayISO } from './money';
import type { Data, Order } from './types';

export function monthsFor(d: Data, range: Range): string[] {
  const t = todayISO();
  const earliest = [...d.transactions.map((x) => x.date), ...d.orders.map((o) => o.createdAt)].sort()[0] ?? t;
  const from = range.from ?? earliest, to = range.to ?? t;
  const ms = monthsBetween(from.slice(0, 7) + '-01', to);
  if (ms.length >= 3) return ms.slice(-24);
  return lastMonths(6);
}

export interface MonthRow { month: string; revenue: number; expenses: number; profit: number; orders: number; avgCheck: number; margin: number; cash: number }
export function monthlySeries(d: Data, months: string[]): MonthRow[] {
  return months.map((m) => {
    const r: Range = { from: `${m}-01`, to: `${m}-31` };
    const s = summarize(d.transactions, r);
    const os = d.orders.filter((o) => o.status !== 'cancelled' && inRange(o.createdAt, r));
    const total = os.reduce((a, o) => a + computeOrder(o).total, 0);
    return { month: m, revenue: s.revenue, expenses: s.expenses, profit: s.netProfit, orders: os.length, avgCheck: os.length ? Math.round(total / os.length) : 0, margin: s.revenue > 0 ? Math.round((s.netProfit / s.revenue) * 1000) / 10 : 0, cash: cashBalance(d.transactions, `${m}-31`) };
  });
}

export const activeOrders = (orders: Order[], r?: Range) => orders.filter((o) => o.status !== 'cancelled' && inRange(o.createdAt, r));

export function ordersStats(orders: Order[], r?: Range) {
  const os = activeOrders(orders, r);
  const total = os.reduce((a, o) => a + computeOrder(o).total, 0);
  return { count: os.length, total, avg: os.length ? Math.round(total / os.length) : 0 };
}

export function topProducts(orders: Order[], r?: Range) {
  const m = new Map<string, { title: string; profit: number; revenue: number; qty: number }>();
  for (const o of activeOrders(orders, r)) {
    const c = computeOrder(o);
    const k = o.title.trim().toLowerCase();
    const e = m.get(k) ?? { title: o.title, profit: 0, revenue: 0, qty: 0 };
    e.profit += c.profit; e.revenue += c.total; e.qty += o.qty;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.profit - a.profit);
}

export const dueSoon = (orders: Order[], days = 14) =>
  orders.filter((o) => o.dueDate && !['handed', 'cancelled'].includes(o.status) && o.dueDate <= addDays(todayISO(), days)).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
export { monthKey };
