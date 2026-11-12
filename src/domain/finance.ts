import { allocate } from './money';
import type { Bps, Data, DistMode, Distribution, Kop, Order, PaymentStatus, Partner, Transaction } from './types';

export const DIRECT_COST_CATEGORIES = ['Материалы', 'Упаковка'];

export const live = (txs: Transaction[]) => txs.filter((t) => !t.voided);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sumType = (txs: Transaction[], ...types: string[]) => sum(txs.filter((t) => types.includes(t.type)).map((t) => t.amount));

export interface Range { from?: string; to?: string }
export const inRange = (date: string, r?: Range) => !r || ((!r.from || date >= r.from) && (!r.to || date <= r.to));

// ───────── Заказ ─────────
export function computeOrder(o: Pick<Order, 'qty' | 'unitPrice' | 'unitCost' | 'extraCost'>) {
  const total = o.qty * o.unitPrice;
  const cost = o.qty * o.unitCost;
  const grossProfit = total - cost;
  return { total, cost, extra: o.extraCost, grossProfit, profit: grossProfit - o.extraCost };
}

export function orderPayments(order: Pick<Order, 'id' | 'qty' | 'unitPrice'>, txs: Transaction[]) {
  const mine = live(txs).filter((t) => t.orderId === order.id);
  const paid = sumType(mine, 'income');
  const refunded = sumType(mine, 'refund');
  const net = paid - refunded;
  const total = order.qty * order.unitPrice;
  let status: PaymentStatus;
  if (paid > 0 && net <= 0) status = 'refunded';
  else if (net <= 0) status = 'unpaid';
  else if (net < total) status = 'partial';
  else status = 'paid';
  return { paid, refunded, net, total, left: Math.max(0, total - net), status };
}

// ───────── Сводка ─────────
export interface Summary {
  revenue: Kop; // фактически полученные деньги от клиентов минус возвраты
  expenses: Kop; // расходы бизнеса (из кассы + оплаченные партнёрами)
  directCosts: Kop;
  grossProfit: Kop;
  operatingProfit: Kop;
  otherNet: Kop;
  netProfit: Kop;
}
export function summarize(txsAll: Transaction[], range?: Range): Summary {
  const txs = live(txsAll).filter((t) => inRange(t.date, range));
  const revenue = sumType(txs, 'income') - sumType(txs, 'refund');
  const expenseTx = txs.filter((t) => t.type === 'expense' || t.type === 'advance');
  const expenses = sum(expenseTx.map((t) => t.amount));
  const directCosts = sum(expenseTx.filter((t) => DIRECT_COST_CATEGORIES.includes(t.category ?? '')).map((t) => t.amount));
  const otherNet = sum(txs.filter((t) => t.type === 'other').map((t) => (t.direction === 'in' ? t.amount : -t.amount)));
  const operatingProfit = revenue - expenses;
  return { revenue, expenses, directCosts, grossProfit: revenue - directCosts, operatingProfit, otherNet, netProfit: operatingProfit + otherNet };
}

/** Реально имеющиеся деньги. Личный аванс партнёра деньги бизнеса не меняет (платил партнёр). */
export function cashBalance(txsAll: Transaction[], upTo?: string): Kop {
  const txs = live(txsAll).filter((t) => !upTo || t.date <= upTo);
  const inflow = sumType(txs, 'income', 'capital') + sum(txs.filter((t) => t.type === 'other' && t.direction === 'in').map((t) => t.amount));
  const outflow =
    sumType(txs, 'refund', 'expense', 'advance_repay', 'capital_return', 'profit_payout') +
    sum(txs.filter((t) => t.type === 'other' && t.direction !== 'in').map((t) => t.amount));
  return inflow - outflow;
}

export const totalDistributed = (dists: Distribution[]) => sum(dists.filter((d) => d.status === 'active').map((d) => d.total));

// ───────── Партнёры ─────────
export interface PartnerLedger {
  partnerId: string;
  capitalIn: Kop;
  capitalReturned: Kop;
  capitalNet: Kop;
  advances: Kop;
  advanceRepaid: Kop;
  debt: Kop; // долг бизнеса перед партнёром по авансам
  accrued: Kop;
  paid: Kop;
  unpaid: Kop;
}
export function partnerLedger(partnerId: string, txsAll: Transaction[]): PartnerLedger {
  const t = live(txsAll).filter((x) => x.partnerId === partnerId);
  const capitalIn = sumType(t, 'capital');
  const capitalReturned = sumType(t, 'capital_return');
  const advances = sumType(t, 'advance');
  const advanceRepaid = sumType(t, 'advance_repay');
  const accrued = sumType(t, 'profit_accrual');
  const paid = sumType(t, 'profit_payout');
  return { partnerId, capitalIn, capitalReturned, capitalNet: capitalIn - capitalReturned, advances, advanceRepaid, debt: advances - advanceRepaid, accrued, paid, unpaid: accrued - paid };
}
export const totalCapital = (partners: Partner[], txs: Transaction[]) => sum(partners.map((p) => partnerLedger(p.id, txs).capitalNet));
export const totalDebt = (partners: Partner[], txs: Transaction[]) => sum(partners.map((p) => partnerLedger(p.id, txs).debt));
export const totalUnpaid = (partners: Partner[], txs: Transaction[]) => sum(partners.map((p) => partnerLedger(p.id, txs).unpaid));

export function distributionPaid(dist: Distribution, partnerId: string, txsAll: Transaction[]): Kop {
  return sumType(live(txsAll).filter((t) => t.distributionId === dist.id && t.partnerId === partnerId), 'profit_payout');
}

// ───────── Распределение ─────────
export interface PreviewInput {
  mode: DistMode;
  partners: Partner[]; // только активные
  data: Pick<Data, 'transactions' | 'distributions'>;
  reserve: Kop;
  fixedBps: Record<string, Bps>;
  customBps: Record<string, Bps>;
  amount?: Kop; // сколько распределить (по умолчанию — вся доступная прибыль)
}
export interface Preview {
  revenue: Kop; expenses: Kop; operatingProfit: Kop; netProfit: Kop;
  alreadyDistributed: Kop; undistributed: Kop; reserve: Kop; available: Kop; total: Kop;
  cash: Kop;
  rows: { partnerId: string; bps: Bps; amount: Kop }[];
  errors: string[];
  warnings: string[];
}

export function sharesFor(mode: DistMode, partners: Partner[], txs: Transaction[], fixed: Record<string, Bps>, custom: Record<string, Bps>): { bps: Record<string, Bps>; weights: Record<string, number>; errors: string[] } {
  const errors: string[] = [];
  const ids = partners.map((p) => p.id);
  if (ids.length === 0) return { bps: {}, weights: {}, errors: ['Нет активных партнёров'] };
  let weights: number[];
  if (mode === 'capital') {
    weights = partners.map((p) => Math.max(0, partnerLedger(p.id, txs).capitalNet));
    if (weights.every((w) => w === 0)) errors.push('Ни у одного партнёра нет вложенного капитала — режим «По вложениям» недоступен');
  } else if (mode === 'equal') {
    weights = ids.map(() => 1);
  } else {
    const src = mode === 'fixed' ? fixed : custom;
    weights = ids.map((id) => Math.max(0, src[id] ?? 0));
    const s = sum(weights);
    if (s !== 10000) errors.push(`Сумма долей должна быть ровно 100% (сейчас ${(s / 100).toLocaleString('ru-RU')}%)`);
    const w = Object.fromEntries(ids.map((id, i) => [id, weights[i]]));
    return { bps: w, weights: w, errors };
  }
  const zero = Object.fromEntries(ids.map((id) => [id, 0]));
  if (errors.length) return { bps: zero, weights: zero, errors };
  // проценты — только для показа; суммы считаются по точным весам, чтобы не терять копейки
  const bps = allocate(10000, weights);
  return { bps: Object.fromEntries(ids.map((id, i) => [id, bps[i]])), weights: Object.fromEntries(ids.map((id, i) => [id, weights[i]])), errors };
}

export function previewDistribution(inp: PreviewInput): Preview {
  const s = summarize(inp.data.transactions);
  const alreadyDistributed = totalDistributed(inp.data.distributions);
  const undistributed = s.netProfit - alreadyDistributed;
  const available = Math.max(0, undistributed - inp.reserve);
  const total = inp.amount ?? available;
  const { bps, weights, errors } = sharesFor(inp.mode, inp.partners, inp.data.transactions, inp.fixedBps, inp.customBps);
  const warnings: string[] = [];
  if (available <= 0) errors.push('Нет доступной для распределения прибыли');
  if (total > available) errors.push('Сумма превышает доступную прибыль');
  if (total <= 0 && available > 0) errors.push('Сумма распределения должна быть больше нуля');
  const cash = cashBalance(inp.data.transactions);
  const debts = totalDebt(inp.partners, inp.data.transactions);
  if (cash < total + debts) warnings.push('Денег на счёте меньше, чем начисляется и должно быть возвращено партнёрам по авансам — выплаты могут быть частичными');
  const ids = inp.partners.map((p) => p.id);
  const amounts = errors.length ? ids.map(() => 0) : allocate(total, ids.map((id) => weights[id] ?? 0));
  return {
    revenue: s.revenue, expenses: s.expenses, operatingProfit: s.operatingProfit, netProfit: s.netProfit,
    alreadyDistributed, undistributed, reserve: inp.reserve, available, total, cash,
    rows: ids.map((id, i) => ({ partnerId: id, bps: bps[id] ?? 0, amount: amounts[i] })),
    errors, warnings,
  };
}
