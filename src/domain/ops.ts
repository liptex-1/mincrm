/**
 * Бизнес-операции. Каждая plan*-функция — чистая: принимает текущие данные, проверяет правила,
 * возвращает Batch (набор записей/удалений), который сохраняется ОДНОЙ транзакцией хранилища.
 * Если правило нарушено — бросается AppError и ничего не меняется.
 */
import { cashBalance, distributionPaid, orderPayments, partnerLedger, previewDistribution } from './finance';
import { formatMoney, nowISO, todayISO, uid } from './money';
import type { Batch, Bps, Client, ConsumedMaterial, Data, DistMode, Distribution, LogEntry, Material, Order, OrderMaterial, Partner, ProductionStatus, Purchase, Settings, Transaction, TxType } from './types';
import { COLLECTIONS, PRODUCTION_LABELS, TX_LABELS } from './types';

export class AppError extends Error {}
export const fail = (m: string): never => { throw new AppError(m); };
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const empty = (): Batch => ({ put: {}, del: {} });
export const put = (b: Batch, store: keyof Batch['put'], ...rec: any[]) => { (b.put[store] ??= []).push(...rec); };
export const del = (b: Batch, store: keyof Batch['del'], ...ids: string[]) => { (b.del[store] ??= []).push(...ids); };

/** Объединяет пакеты: более поздние записи с тем же id перекрывают ранние. */
export function mergeBatch(a: Batch, b: Batch): Batch {
  for (const [k, v] of Object.entries(b.put)) if (v?.length) ((a.put as any)[k] ??= []).push(...v);
  for (const [k, v] of Object.entries(b.del)) if (v?.length) ((a.del as any)[k] ??= []).push(...v);
  return a;
}
/** Выполняет планы последовательно, каждый — на данных после предыдущего, и возвращает один общий пакет. */
export function chain(d: Data, plans: ((d: Data) => Batch)[]): Batch {
  let cur = d; const out = empty();
  for (const p of plans) { const b = p(cur); mergeBatch(out, b); cur = applyBatch(cur, b); }
  return out;
}

export function logEntry(action: string, entity: string, entityId: string | undefined, summary: string): LogEntry {
  return { id: uid(), at: nowISO(), action, entity, entityId, summary };
}

export function applyBatch(d: Data, b: Batch): Data {
  const next: Data = { ...d };
  for (const c of COLLECTIONS) {
    const puts = b.put[c] as { id: string }[] | undefined;
    const dels = b.del[c];
    if (!puts?.length && !dels?.length) continue;
    let arr: any[] = d[c] as any[];
    if (dels?.length) arr = arr.filter((x) => !dels.includes(x.id));
    if (puts?.length) {
      const map = new Map(arr.map((x, i) => [x.id, i]));
      arr = [...arr];
      for (const p of puts) { const i = map.get(p.id); if (i === undefined) { map.set(p.id, arr.length); arr.push(p); } else arr[i] = p; }
    }
    (next as any)[c] = arr;
  }
  const s = b.put.settings;
  if (s?.length) next.settings = s[s.length - 1];
  return next;
}

// ───────── Клиенты ─────────
export function planSaveClient(d: Data, i: Partial<Client> & { name: string }): Batch {
  const name = i.name.trim();
  if (!name) fail('Укажите имя клиента или название компании');
  const old = i.id ? d.clients.find((c) => c.id === i.id) : undefined;
  const rec: Client = { id: old?.id ?? uid(), createdAt: old?.createdAt ?? todayISO(), ...old, ...i, name, updatedAt: nowISO() };
  const b = empty();
  put(b, 'clients', rec);
  put(b, 'log', logEntry(old ? 'Изменение' : 'Создание', 'Клиент', rec.id, name));
  return b;
}
export function planDeleteClient(d: Data, id: string, cascade = false): Batch {
  const c = d.clients.find((x) => x.id === id) ?? fail('Клиент не найден');
  const orders = d.orders.filter((o) => o.clientId === id);
  if (orders.length && !cascade) fail(`У клиента ${orders.length} заказ(ов). Удалите их вместе с клиентом или сначала удалите заказы`);
  const b = chain(d, orders.map((o) => (cur: Data) => planDeleteOrder(cur, o.id, true)));
  del(b, 'clients', id);
  put(b, 'log', logEntry('Удаление', 'Клиент', id, `${c.name}${orders.length ? ` (вместе с заказами: ${orders.length})` : ''}`));
  return b;
}

// ───────── Заказы и склад ─────────
const CONSUMING: ProductionStatus[] = ['in_production', 'ready', 'handed'];

export function autoUnitCost(d: Pick<Data, 'materials'>, mats: OrderMaterial[]): number {
  return Math.round(mats.reduce((a, m) => a + m.qtyPerUnit * (d.materials.find((x) => x.id === m.materialId)?.unitCost ?? 0), 0));
}

/**
 * Приводит списанное количество к нужному. Идемпотентна: повторный вызов с теми же данными ничего не списывает.
 */
export function reconcileConsumption(order: Pick<Order, 'qty' | 'status' | 'materials' | 'consumed'>, materials: Material[]) {
  const desired = new Map<string, number>();
  if (CONSUMING.includes(order.status)) for (const m of order.materials) desired.set(m.materialId, r3((desired.get(m.materialId) ?? 0) + order.qty * m.qtyPerUnit));
  const current = new Map(order.consumed.map((c) => [c.materialId, c.qty]));
  const ids = new Set([...desired.keys(), ...current.keys()]);
  const updated: Material[] = [];
  for (const id of ids) {
    const delta = r3((desired.get(id) ?? 0) - (current.get(id) ?? 0));
    if (delta === 0) continue;
    const m = materials.find((x) => x.id === id);
    if (!m) continue;
    if (m.qty - delta < -1e-9) fail(`Недостаточно материала «${m.name}» на складе: нужно ещё ${delta} ${m.unit}, есть ${m.qty} ${m.unit}`);
    updated.push({ ...m, qty: r3(m.qty - delta), updatedAt: nowISO() });
  }
  const consumed: ConsumedMaterial[] = [...desired].filter(([, q]) => q > 0).map(([materialId, qty]) => ({ materialId, qty }));
  return { updated, consumed };
}

export type OrderInput = Omit<Order, 'id' | 'number' | 'consumed' | 'updatedAt' | 'createdAt'> & { id?: string; createdAt?: string };

export function planSaveOrder(d: Data, i: OrderInput): Batch {
  if (!i.title.trim()) fail('Укажите название товара');
  if (!d.clients.some((c) => c.id === i.clientId)) fail('Выберите клиента');
  if (!(i.qty > 0) || !Number.isInteger(i.qty)) fail('Количество должно быть целым числом больше нуля');
  if (i.unitPrice < 0 || i.unitCost < 0 || i.extraCost < 0) fail('Суммы не могут быть отрицательными');
  const old = i.id ? d.orders.find((o) => o.id === i.id) : undefined;
  const b = empty();
  let number = old?.number;
  if (!number) { number = `№${String(d.settings.orderCounter).padStart(4, '0')}`; put(b, 'settings', { ...d.settings, orderCounter: d.settings.orderCounter + 1 }); }
  const materials = i.materials.filter((m) => m.materialId && m.qtyPerUnit > 0);
  const unitCost = i.costMode === 'auto' && materials.length ? autoUnitCost(d, materials) : i.unitCost;
  const order: Order = {
    ...(old ?? {}), ...i, id: old?.id ?? uid(), number, materials, unitCost,
    createdAt: i.createdAt ?? old?.createdAt ?? todayISO(), consumed: old?.consumed ?? [], updatedAt: nowISO(),
  };
  const { updated, consumed } = reconcileConsumption(order, d.materials);
  order.consumed = consumed;
  put(b, 'orders', order);
  if (updated.length) put(b, 'materials', ...updated);
  put(b, 'log', logEntry(old ? 'Изменение' : 'Создание', 'Заказ', order.id, `${number} · ${order.title}`));
  if (old && old.unitPrice !== order.unitPrice) put(b, 'log', logEntry('Изменение стоимости', 'Заказ', order.id, `${number}: ${formatMoney(old.unitPrice)} → ${formatMoney(order.unitPrice)} за ед.`));
  if (old && old.status !== order.status) put(b, 'log', logEntry('Смена статуса', 'Заказ', order.id, `${number}: ${PRODUCTION_LABELS[old.status]} → ${PRODUCTION_LABELS[order.status]}`));
  return b;
}
export function planDeleteOrder(d: Data, id: string, cascade = false): Batch {
  const o = d.orders.find((x) => x.id === id) ?? fail('Заказ не найден');
  const txs = d.transactions.filter((t) => t.orderId === id);
  if (txs.some((t) => !t.voided) && !cascade) fail('По заказу есть платежи. Удалите заказ вместе с платежами или сначала удалите платежи в финансах');
  const { updated } = reconcileConsumption({ ...o, status: 'new' }, d.materials);
  const b = empty();
  del(b, 'orders', id);
  if (txs.length) del(b, 'transactions', ...txs.map((t) => t.id));
  if (updated.length) put(b, 'materials', ...updated);
  put(b, 'log', logEntry('Удаление', 'Заказ', id, `${o.number} · ${o.title}${txs.length ? ` (вместе с платежами: ${txs.length})` : ''}`));
  return b;
}
export function planCopyOrder(d: Data, id: string): Batch {
  const o = d.orders.find((x) => x.id === id) ?? fail('Заказ не найден');
  const { id: _i, number: _n, consumed: _c, updatedAt: _u, createdAt: _cr, ...rest } = o;
  return planSaveOrder(d, { ...rest, status: 'new', title: o.title });
}

// ───────── Материалы ─────────
export function planSaveMaterial(d: Data, i: Partial<Material> & { name: string; unit: string }): Batch {
  if (!i.name.trim()) fail('Укажите название материала');
  const old = i.id ? d.materials.find((m) => m.id === i.id) : undefined;
  const rec: Material = { id: old?.id ?? uid(), qty: 0, unitCost: 0, minQty: 0, ...old, ...i, name: i.name.trim(), updatedAt: nowISO() };
  const b = empty();
  if (!(rec.qty >= -1e-9) || rec.unitCost < 0 || rec.minQty < 0) fail('Остаток, цена и минимальный остаток не могут быть отрицательными');
  put(b, 'materials', rec);
  put(b, 'log', logEntry(old ? 'Изменение' : 'Создание', 'Материал', rec.id, rec.name));
  if (old && old.qty !== rec.qty) put(b, 'log', logEntry('Корректировка склада', 'Материал', rec.id, `${rec.name}: ${old.qty} → ${rec.qty} ${rec.unit}`));
  return b;
}

export interface PurchaseInput { materialId: string; date: string; qty: number; unitCost: number; payer: 'business' | string; note?: string }
export function planPurchase(d: Data, i: PurchaseInput): Batch {
  const m = d.materials.find((x) => x.id === i.materialId) ?? fail('Материал не найден');
  if (!(i.qty > 0)) fail('Количество должно быть больше нуля');
  if (!(i.unitCost > 0)) fail('Укажите цену за единицу');
  const total = Math.round(i.qty * i.unitCost);
  if (i.payer !== 'business' && !d.partners.some((p) => p.id === i.payer)) fail('Партнёр не найден');
  const tx: Transaction = {
    id: uid(), type: i.payer === 'business' ? 'expense' : 'advance', amount: total, date: i.date, category: 'Материалы',
    description: `Закупка: ${m.name}, ${i.qty} ${m.unit}`, partnerId: i.payer === 'business' ? undefined : i.payer, createdAt: nowISO(),
  };
  const newQty = r3(m.qty + i.qty);
  const stockValue = Math.max(0, m.qty) * m.unitCost + total;
  const unitCost = Math.round(stockValue / (Math.max(0, m.qty) + i.qty));
  const purchase: Purchase = { id: uid(), materialId: m.id, date: i.date, qty: i.qty, unitCost: i.unitCost, total, txId: tx.id, note: i.note };
  const b = empty();
  put(b, 'transactions', tx);
  put(b, 'purchases', purchase);
  put(b, 'materials', { ...m, qty: newQty, unitCost, updatedAt: nowISO() });
  put(b, 'log', logEntry('Закупка', 'Материал', m.id, `${m.name}: +${i.qty} ${m.unit} за ${formatMoney(total)}`));
  return b;
}

// ───────── Финансовые операции ─────────
export interface TxInput {
  id?: string; type: TxType; amount: number; date: string; category?: string; description?: string;
  orderId?: string; partnerId?: string; direction?: 'in' | 'out';
}
const PARTNER_TYPES: TxType[] = ['capital', 'advance', 'advance_repay', 'capital_return'];
const SYSTEM_TYPES: TxType[] = ['profit_accrual', 'profit_payout'];

export function planSaveTx(d: Data, i: TxInput): Batch {
  const old = i.id ? d.transactions.find((t) => t.id === i.id) : undefined;
  if (i.id && !old) fail('Операция не найдена');
  if (old && (SYSTEM_TYPES.includes(old.type) || d.purchases.some((p) => p.txId === old.id))) fail(SYSTEM_TYPES.includes(old.type) ? 'Начисления и выплаты изменяются в разделе «Распределение прибыли»' : 'Эта операция создана поставкой — измените поставку в разделе «Производство»');
  if (SYSTEM_TYPES.includes(i.type)) fail('Начисления и выплаты прибыли проводятся в разделе «Распределение прибыли»');
  if (!Number.isInteger(i.amount) || i.amount <= 0) fail('Сумма должна быть больше нуля');
  if (!i.date) fail('Укажите дату');
  const base: Data = old ? { ...d, transactions: d.transactions.filter((t) => t.id !== old.id) } : d;
  if (PARTNER_TYPES.includes(i.type) && !base.partners.some((p) => p.id === i.partnerId)) fail('Выберите партнёра');
  if (i.type === 'advance_repay') {
    const debt = partnerLedger(i.partnerId!, base.transactions).debt;
    if (i.amount > debt) fail(`Долг перед партнёром по авансам — ${formatMoney(debt)}. Больше вернуть нельзя`);
  }
  if (i.type === 'capital_return') {
    const cap = partnerLedger(i.partnerId!, base.transactions).capitalNet;
    if (i.amount > cap) fail(`Вложенный капитал партнёра — ${formatMoney(cap)}. Больше вернуть нельзя`);
  }
  if (i.orderId) {
    const o = base.orders.find((x) => x.id === i.orderId) ?? fail('Заказ не найден');
    const p = orderPayments(o, base.transactions);
    if (i.type === 'income' && i.amount > p.left) fail(`По заказу осталось оплатить ${formatMoney(p.left)}`);
    if (i.type === 'refund' && i.amount > p.net) fail(`По заказу можно вернуть не более ${formatMoney(p.net)}`);
  }
  if (['advance_repay', 'capital_return', 'refund'].includes(i.type) || (i.type === 'other' && i.direction !== 'in')) {
    const cash = cashBalance(base.transactions);
    if (i.amount > cash) fail(`Недостаточно денег на счёте (${formatMoney(cash)})`);
  }
  const tx: Transaction = {
    ...(old ?? {}), id: old?.id ?? uid(), createdAt: old?.createdAt ?? nowISO(),
    type: i.type, amount: i.amount, date: i.date, category: i.category, description: i.description?.trim() || undefined,
    orderId: i.orderId, partnerId: i.partnerId, direction: i.type === 'other' ? i.direction ?? 'out' : undefined,
  };
  const b = empty();
  put(b, 'transactions', tx);
  const action = old ? (old.amount !== tx.amount ? 'Изменение суммы' : 'Изменение') : tx.type === 'capital' || tx.type === 'advance' ? 'Изменение вложений' : 'Создание';
  put(b, 'log', logEntry(action, 'Операция', tx.id, `${TX_LABELS[tx.type]} ${formatMoney(tx.amount)}${tx.description ? ' · ' + tx.description : ''}`));
  return b;
}
/** Удаление не должно ломать учёт: долг по авансам, капитал и платежи по заказам не уходят в минус. */
function assertConsistent(before: Data, txs: Transaction[]) {
  for (const p of before.partners) {
    const l = partnerLedger(p.id, txs);
    if (l.debt < 0 || l.capitalNet < 0) fail('Это нарушит учёт: возвраты партнёру превысят его вложения или авансы. Сначала удалите связанные возвраты');
  }
  for (const o of before.orders) if (orderPayments(o, txs).net < 0) fail('Это нарушит учёт платежей по заказу');
}
export function planDeleteTx(d: Data, id: string): Batch {
  const t = d.transactions.find((x) => x.id === id) ?? fail('Операция не найдена');
  const purchase = d.purchases.find((p) => p.txId === id);
  if (purchase) return planDeletePurchase(d, purchase.id);
  if (t.type === 'profit_accrual') fail('Начисление удаляется отменой или удалением распределения');
  assertConsistent(d, d.transactions.filter((x) => x.id !== id));
  const b = empty();
  del(b, 'transactions', id);
  put(b, 'log', logEntry('Удаление', 'Операция', id, `${TX_LABELS[t.type]} ${formatMoney(t.amount)}`));
  return b;
}

// ───────── Поставки: правка и удаление ─────────
const avgCost = (purchases: Purchase[], materialId: string, fallback: number) => {
  const ps = purchases.filter((p) => p.materialId === materialId);
  const q = ps.reduce((a, p) => a + p.qty, 0);
  return q > 0 ? Math.round(ps.reduce((a, p) => a + p.total, 0) / q) : fallback;
};
const clampQty = (n: number) => Math.max(0, r3(n));

export function planDeletePurchase(d: Data, id: string): Batch {
  const p = d.purchases.find((x) => x.id === id) ?? fail('Поставка не найдена');
  const m = d.materials.find((x) => x.id === p.materialId);
  assertConsistent(d, d.transactions.filter((t) => t.id !== p.txId));
  const rest = d.purchases.filter((x) => x.id !== id);
  const b = empty();
  del(b, 'purchases', id);
  if (p.txId) del(b, 'transactions', p.txId);
  if (m) put(b, 'materials', { ...m, qty: clampQty(m.qty - p.qty), unitCost: avgCost(rest, m.id, m.unitCost), updatedAt: nowISO() });
  put(b, 'log', logEntry('Удаление', 'Поставка', id, `${m?.name ?? 'Материал'}: −${p.qty} ${m?.unit ?? ''} (${formatMoney(p.total)})`));
  return b;
}

export function planUpdatePurchase(d: Data, id: string, i: PurchaseInput): Batch {
  const old = d.purchases.find((x) => x.id === id) ?? fail('Поставка не найдена');
  const m = d.materials.find((x) => x.id === i.materialId) ?? fail('Материал не найден');
  const oldM = d.materials.find((x) => x.id === old.materialId);
  if (!(i.qty > 0)) fail('Количество должно быть больше нуля');
  if (!(i.unitCost > 0)) fail('Укажите цену за единицу');
  if (i.payer !== 'business' && !d.partners.some((p) => p.id === i.payer)) fail('Партнёр не найден');
  const total = Math.round(i.qty * i.unitCost);
  const oldTx = d.transactions.find((t) => t.id === old.txId);
  const tx: Transaction = {
    ...(oldTx ?? { id: uid(), createdAt: nowISO() }), type: i.payer === 'business' ? 'expense' : 'advance', amount: total, date: i.date, category: 'Материалы',
    description: `Закупка: ${m.name}, ${i.qty} ${m.unit}`, partnerId: i.payer === 'business' ? undefined : i.payer,
  } as Transaction;
  assertConsistent(d, [...d.transactions.filter((t) => t.id !== tx.id), tx]);
  const purchase: Purchase = { ...old, materialId: m.id, date: i.date, qty: i.qty, unitCost: i.unitCost, total, txId: tx.id, note: i.note };
  const purchases = d.purchases.map((x) => (x.id === id ? purchase : x));
  const b = empty();
  put(b, 'transactions', tx);
  put(b, 'purchases', purchase);
  if (oldM && oldM.id !== m.id) {
    put(b, 'materials', { ...oldM, qty: clampQty(oldM.qty - old.qty), unitCost: avgCost(purchases, oldM.id, oldM.unitCost), updatedAt: nowISO() });
    put(b, 'materials', { ...m, qty: clampQty(m.qty + i.qty), unitCost: avgCost(purchases, m.id, m.unitCost), updatedAt: nowISO() });
  } else put(b, 'materials', { ...m, qty: clampQty(m.qty - old.qty + i.qty), unitCost: avgCost(purchases, m.id, m.unitCost), updatedAt: nowISO() });
  put(b, 'log', logEntry('Изменение', 'Поставка', id, `${m.name}: ${old.qty} → ${i.qty} ${m.unit}, ${formatMoney(old.total)} → ${formatMoney(total)}`));
  return b;
}

export function planDeleteMaterial(d: Data, id: string, withExpenses = false): Batch {
  const m = d.materials.find((x) => x.id === id) ?? fail('Материал не найден');
  const ps = d.purchases.filter((p) => p.materialId === id);
  const txIds = withExpenses ? ps.map((p) => p.txId).filter(Boolean) as string[] : [];
  if (txIds.length) assertConsistent(d, d.transactions.filter((t) => !txIds.includes(t.id)));
  const b = empty();
  del(b, 'materials', id);
  if (ps.length) del(b, 'purchases', ...ps.map((p) => p.id));
  if (txIds.length) del(b, 'transactions', ...txIds);
  // заказы больше не ссылаются на удалённый материал
  for (const o of d.orders) if (o.materials.some((x) => x.materialId === id) || o.consumed.some((x) => x.materialId === id))
    put(b, 'orders', { ...o, materials: o.materials.filter((x) => x.materialId !== id), consumed: o.consumed.filter((x) => x.materialId !== id), updatedAt: nowISO() });
  put(b, 'log', logEntry('Удаление', 'Материал', id, `${m.name}${ps.length ? ` (поставок: ${ps.length}${withExpenses ? ', расходы удалены' : ', расходы сохранены'})` : ''}`));
  return b;
}

// ───────── Партнёры ─────────
export function planSavePartner(d: Data, i: Partial<Partner> & { name: string }): Batch {
  if (!i.name.trim()) fail('Укажите имя партнёра');
  const old = i.id ? d.partners.find((p) => p.id === i.id) : undefined;
  const rec: Partner = { id: old?.id ?? uid(), joinedAt: todayISO(), ...old, ...i, name: i.name.trim(), updatedAt: nowISO() };
  const b = empty();
  put(b, 'partners', rec);
  put(b, 'log', logEntry(old ? (old.archived !== rec.archived ? (rec.archived ? 'Архивация' : 'Восстановление') : 'Изменение') : 'Создание', 'Партнёр', rec.id, rec.name));
  return b;
}

// ───────── Распределение прибыли ─────────
export interface DistInput { mode: DistMode; amount?: number; customBps?: Record<string, Bps>; note?: string; date?: string }
export function planCreateDistribution(d: Data, i: DistInput): Batch {
  const partners = d.partners.filter((p) => !p.archived);
  const pv = previewDistribution({ mode: i.mode, partners, data: d, reserve: d.settings.reserve, fixedBps: d.settings.fixedBps, customBps: i.customBps ?? {}, amount: i.amount });
  if (pv.errors.length) fail(pv.errors[0]);
  const date = i.date ?? todayISO();
  const dist: Distribution = {
    id: uid(), createdAt: nowISO(), date, mode: i.mode, reserve: pv.reserve, netProfit: pv.netProfit, alreadyDistributed: pv.alreadyDistributed,
    total: pv.total, status: 'active', note: i.note,
    rows: pv.rows.map((r) => ({ ...r, partnerName: partners.find((p) => p.id === r.partnerId)!.name })),
  };
  const b = empty();
  put(b, 'distributions', dist);
  for (const r of dist.rows) if (r.amount > 0) put(b, 'transactions', { id: uid(), type: 'profit_accrual', amount: r.amount, date, category: 'Прибыль', description: `Начисление прибыли (${r.bps / 100}%)`, partnerId: r.partnerId, distributionId: dist.id, createdAt: nowISO() } as Transaction);
  put(b, 'log', logEntry('Создание распределения', 'Распределение', dist.id, `${formatMoney(dist.total)} между ${dist.rows.length} партнёрами`));
  return b;
}
export function planPayout(d: Data, i: { distributionId: string; partnerId: string; amount: number; date?: string }): Batch {
  const dist = d.distributions.find((x) => x.id === i.distributionId) ?? fail('Распределение не найдено');
  if (dist.status !== 'active') fail('Распределение отменено');
  const row = dist.rows.find((r) => r.partnerId === i.partnerId) ?? fail('Партнёр не участвует в распределении');
  if (!Number.isInteger(i.amount) || i.amount <= 0) fail('Сумма выплаты должна быть больше нуля');
  const left = row.amount - distributionPaid(dist, i.partnerId, d.transactions);
  if (i.amount > left) fail(`К выплате осталось ${formatMoney(left)}`);
  const cash = cashBalance(d.transactions);
  if (i.amount > cash) fail(`Недостаточно денег на счёте (${formatMoney(cash)})`);
  const b = empty();
  put(b, 'transactions', { id: uid(), type: 'profit_payout', amount: i.amount, date: i.date ?? todayISO(), category: 'Прибыль', description: 'Выплата прибыли', partnerId: i.partnerId, distributionId: dist.id, createdAt: nowISO() } as Transaction);
  put(b, 'log', logEntry('Выплата', 'Распределение', dist.id, `${row.partnerName}: ${formatMoney(i.amount)}`));
  return b;
}
export function planCancelDistribution(d: Data, id: string, reason: string): Batch {
  const dist = d.distributions.find((x) => x.id === id) ?? fail('Распределение не найдено');
  if (dist.status === 'cancelled') fail('Распределение уже отменено');
  if (dist.rows.some((r) => distributionPaid(dist, r.partnerId, d.transactions) > 0)) fail('По распределению уже были выплаты. Сначала удалите ошибочные выплаты в финансах');
  const b = empty();
  put(b, 'distributions', { ...dist, status: 'cancelled', cancelledAt: nowISO(), cancelReason: reason.trim() || undefined });
  for (const t of d.transactions) if (t.distributionId === id && t.type === 'profit_accrual') put(b, 'transactions', { ...t, voided: true });
  put(b, 'log', logEntry('Отмена распределения', 'Распределение', id, `${formatMoney(dist.total)}${reason ? ' · ' + reason : ''}`));
  return b;
}

// ───────── Возврат капитала ─────────
export function planCapitalReturn(d: Data, i: { partnerId: string; amount: number; date?: string; scheduleId?: string }): Batch {
  const mode = d.settings.capitalReturnMode;
  if (mode === 'none') fail('Возврат капитала отключён в настройках');
  const b = planSaveTx(d, { type: 'capital_return', partnerId: i.partnerId, amount: i.amount, date: i.date ?? todayISO(), category: 'Возврат капитала', description: 'Возврат вложенного капитала' });
  if (mode === 'from_cash') {
    const free = Math.max(0, cashBalance(d.transactions) - d.settings.reserve);
    if (i.amount > free) fail(`Из свободных денег (за вычетом резерва) можно вернуть не более ${formatMoney(free)}`);
  }
  if (i.scheduleId) put(b, 'settings', { ...d.settings, capitalSchedule: d.settings.capitalSchedule.map((s) => (s.id === i.scheduleId ? { ...s, done: true } : s)) });
  return b;
}

// ───────── Настройки ─────────
export function planSaveSettings(d: Data, patch: Partial<Settings>): Batch {
  const next = { ...d.settings, ...patch, id: 'main' as const };
  const b = empty();
  put(b, 'settings', next);
  if (patch.fixedBps && JSON.stringify(patch.fixedBps) !== JSON.stringify(d.settings.fixedBps)) put(b, 'log', logEntry('Изменение долей', 'Настройки', 'main', 'Фиксированные доли партнёров (проведённые распределения не изменяются)'));
  if (patch.reserve !== undefined && patch.reserve !== d.settings.reserve) put(b, 'log', logEntry('Изменение резерва', 'Настройки', 'main', `${formatMoney(d.settings.reserve)} → ${formatMoney(patch.reserve)}`));
  if (patch.distributionMode && patch.distributionMode !== d.settings.distributionMode) put(b, 'log', logEntry('Изменение правил', 'Настройки', 'main', 'Режим распределения прибыли'));
  return b;
}

// ───────── Полное удаление партнёров и распределений ─────────
export function planDeletePartner(d: Data, id: string, cascade = false): Batch {
  const p = d.partners.find((x) => x.id === id) ?? fail('Партнёр не найден');
  const inDist = d.distributions.filter((x) => x.rows.some((r) => r.partnerId === id));
  if (inDist.length) fail(`Партнёр участвует в ${inDist.length} распределении(ях). Удалите их или отправьте партнёра в архив`);
  const txs = d.transactions.filter((t) => t.partnerId === id);
  if (txs.length && !cascade) fail(`У партнёра ${txs.length} операций. Удалите партнёра вместе с операциями или отправьте в архив`);
  if (txs.length) assertConsistent(d, d.transactions.filter((t) => t.partnerId !== id));
  const b = empty();
  del(b, 'partners', id);
  if (txs.length) del(b, 'transactions', ...txs.map((t) => t.id));
  const { [id]: _x, ...fixed } = d.settings.fixedBps;
  put(b, 'settings', { ...d.settings, fixedBps: fixed, capitalSchedule: d.settings.capitalSchedule.filter((s) => s.partnerId !== id) });
  put(b, 'log', logEntry('Удаление', 'Партнёр', id, `${p.name}${txs.length ? ` (вместе с операциями: ${txs.length})` : ''}`));
  return b;
}

export function planDeleteDistribution(d: Data, id: string): Batch {
  const x = d.distributions.find((r) => r.id === id) ?? fail('Распределение не найдено');
  const txs = d.transactions.filter((t) => t.distributionId === id);
  const b = empty();
  del(b, 'distributions', id);
  if (txs.length) del(b, 'transactions', ...txs.map((t) => t.id));
  put(b, 'log', logEntry('Удаление распределения', 'Распределение', id, `${formatMoney(x.total)} от ${x.date}${txs.some((t) => t.type === 'profit_payout') ? ' (вместе с выплатами)' : ''}`));
  return b;
}
