import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDemo } from '../src/domain/demo';
import { cashBalance, computeOrder, orderPayments, partnerLedger, previewDistribution, summarize, totalDebt } from '../src/domain/finance';
import { allocate, formatMoney, parseMoney } from '../src/domain/money';
import { AppError, applyBatch, planDeleteClient, planDeleteDistribution, planDeleteMaterial, planDeleteOrder, planDeletePartner, planDeletePurchase, planUpdatePurchase, planCancelDistribution, planCapitalReturn, planCreateDistribution, planDeleteTx, planPayout, planPurchase, planSaveClient, planSaveMaterial, planSaveOrder, planSavePartner, planSaveSettings, planSaveTx } from '../src/domain/ops';
import { emptyData, type Data } from '../src/domain/types';

const rub = (n: number) => n * 100;
const run = (d: Data, b: any) => applyBatch(d, b);

/** Сценарий из ТЗ, ровно по цифрам: капитал 30 000, выручка 60 000, расходы 25 000 (в т.ч. аванс Андрея 3 000), резерв 5 000. */
function spec(): { d: Data; a: string; p: string; t: string } {
  let d = emptyData();
  for (const n of ['Андрей', 'Паша', 'Третий']) d = run(d, planSavePartner(d, { name: n }));
  const [a, p, t] = d.partners.map((x) => x.id);
  for (const [id, v] of [[a, 15000], [p, 10000], [t, 5000]] as const) d = run(d, planSaveTx(d, { type: 'capital', partnerId: id, amount: rub(v), date: '2026-01-10' }));
  d = run(d, planSaveTx(d, { type: 'advance', partnerId: a, amount: rub(3000), date: '2026-01-12', category: 'Материалы', description: 'Материалы за свои' }));
  d = run(d, planSaveTx(d, { type: 'expense', amount: rub(22000), date: '2026-01-15', category: 'Прочее' }));
  d = run(d, planSaveClient(d, { name: 'Клиент' }));
  const c = d.clients[0].id;
  for (const [i, v] of [20000, 25000, 15000].entries()) {
    d = run(d, planSaveOrder(d, { clientId: c, title: `Заказ ${i}`, qty: 1, unitPrice: rub(v), unitCost: 0, costMode: 'manual', extraCost: 0, status: 'new', materials: [] }));
    d = run(d, planSaveTx(d, { type: 'income', amount: rub(v), date: '2026-02-01', orderId: d.orders[i].id }));
  }
  d = run(d, planSaveSettings(d, { reserve: rub(5000) }));
  return { d, a, p, t };
}

describe('деньги и округление', () => {
  it('разбор и формат сумм', () => {
    assert.equal(parseMoney('1 234,56'), 123456);
    assert.equal(parseMoney('0.1'), 10);
    assert.equal(parseMoney('abc'), null);
    assert.equal(formatMoney(300000).replace(/\s/g, ' '), '3 000 ₽');
  });
  it('0.1 + 0.2 в копейках точно', () => assert.equal(parseMoney('0,1')! + parseMoney('0,2')!, 30));
  it('allocate: сумма частей всегда равна total (наибольшие остатки)', () => {
    assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(allocate(10000, [15, 10, 5]), [5000, 3333, 1667]);
    for (let total = 0; total < 500; total += 7) for (const w of [[1, 1, 1], [3, 5, 7], [1, 2], [13, 17, 19, 23]]) assert.equal(allocate(total, w).reduce((x, y) => x + y, 0), total);
  });
  it('allocate работает на больших суммах без потери точности', () => {
    const r = allocate(9_007_199_254_740_000, [333333, 333333, 333334]);
    assert.equal(r.reduce((x, y) => x + y, 0), 9_007_199_254_740_000);
  });
});

describe('сценарий из ТЗ', () => {
  it('операционная и доступная прибыль', () => {
    const { d } = spec();
    const s = summarize(d.transactions);
    assert.equal(s.revenue, rub(60000));
    assert.equal(s.expenses, rub(25000));
    assert.equal(s.operatingProfit, rub(35000));
    const pv = previewDistribution({ mode: 'capital', partners: d.partners, data: d, reserve: d.settings.reserve, fixedBps: {}, customBps: {} });
    assert.equal(pv.available, rub(30000));
  });
  it('распределение по вложениям: 15 000 / 10 000 / 5 000', () => {
    const { d, a, p, t } = spec();
    const pv = previewDistribution({ mode: 'capital', partners: d.partners, data: d, reserve: d.settings.reserve, fixedBps: {}, customBps: {} });
    const by = Object.fromEntries(pv.rows.map((r) => [r.partnerId, r.amount]));
    assert.deepEqual([by[a], by[p], by[t]], [rub(15000), rub(10000), rub(5000)]);
    assert.deepEqual(pv.rows.map((r) => r.bps), [5000, 3333, 1667]);
  });
  it('долг по авансу не смешивается с прибылью и не вычитается из неё повторно', () => {
    let { d, a } = spec();
    const before = d.transactions.length;
    d = run(d, planCreateDistribution(d, { mode: 'capital' }));
    const l = partnerLedger(a, d.transactions);
    assert.equal(l.accrued, rub(15000)); // прибыль без поправки на аванс
    assert.equal(l.debt, rub(3000)); // долг отдельно
    assert.equal(l.unpaid, rub(15000));
    assert.equal(totalDebt(d.partners, d.transactions), rub(3000));
    assert.equal(d.transactions.length, before + 3);
    // чистая прибыль после распределения не изменилась
    assert.equal(summarize(d.transactions).netProfit, rub(35000));
  });
  it('денежный остаток: аванс партнёра не уменьшает кассу бизнеса', () => {
    const { d } = spec();
    assert.equal(cashBalance(d.transactions), rub(30000 + 60000 - 22000));
  });
});

describe('частичная оплата и возвраты клиентам', () => {
  it('неоплаченный заказ не увеличивает выручку, платежи накапливаются', () => {
    let d = emptyData();
    d = run(d, planSaveClient(d, { name: 'К' }));
    d = run(d, planSaveOrder(d, { clientId: d.clients[0].id, title: 'X', qty: 10, unitPrice: rub(100), unitCost: rub(40), costMode: 'manual', extraCost: rub(50), status: 'new', materials: [] }));
    const o = d.orders[0];
    assert.deepEqual(computeOrder(o), { total: rub(1000), cost: rub(400), extra: rub(50), grossProfit: rub(600), profit: rub(550) });
    assert.equal(summarize(d.transactions).revenue, 0);
    assert.equal(orderPayments(o, d.transactions).status, 'unpaid');
    d = run(d, planSaveTx(d, { type: 'income', amount: rub(300), date: '2026-03-01', orderId: o.id }));
    assert.equal(orderPayments(o, d.transactions).status, 'partial');
    d = run(d, planSaveTx(d, { type: 'income', amount: rub(700), date: '2026-03-02', orderId: o.id }));
    assert.equal(orderPayments(o, d.transactions).status, 'paid');
    assert.throws(() => planSaveTx(d, { type: 'income', amount: 1, date: '2026-03-03', orderId: o.id }), AppError);
    assert.equal(summarize(d.transactions).revenue, rub(1000));
    d = run(d, planSaveTx(d, { type: 'refund', amount: rub(1000), date: '2026-03-04', orderId: o.id }));
    assert.equal(orderPayments(o, d.transactions).status, 'refunded');
    assert.equal(summarize(d.transactions).revenue, 0);
  });
});

describe('авансы и возврат капитала', () => {
  it('возврат аванса: уменьшает долг и кассу, не является расходом и не трогает прибыль', () => {
    let { d, a } = spec();
    const s0 = summarize(d.transactions);
    d = run(d, planSaveTx(d, { type: 'advance_repay', partnerId: a, amount: rub(1000), date: '2026-02-10' }));
    assert.equal(partnerLedger(a, d.transactions).debt, rub(2000));
    assert.deepEqual(summarize(d.transactions), s0);
    assert.equal(cashBalance(d.transactions), rub(68000 - 1000));
    assert.throws(() => planSaveTx(d, { type: 'advance_repay', partnerId: a, amount: rub(2001), date: '2026-02-10' }), AppError);
  });
  it('возврат капитала: отключён по умолчанию, затем не попадает ни в расходы, ни в выплату прибыли', () => {
    let { d, p } = spec();
    assert.throws(() => planCapitalReturn(d, { partnerId: p, amount: rub(1000) }), /отключён/);
    d = run(d, planSaveSettings(d, { capitalReturnMode: 'custom' }));
    const s0 = summarize(d.transactions);
    d = run(d, planCapitalReturn(d, { partnerId: p, amount: rub(4000) }));
    const l = partnerLedger(p, d.transactions);
    assert.equal(l.capitalNet, rub(6000));
    assert.equal(l.paid, 0);
    assert.deepEqual(summarize(d.transactions), s0);
    assert.throws(() => planCapitalReturn(d, { partnerId: p, amount: rub(6001) }), AppError);
  });
  it('режим «из свободных денег» учитывает резерв', () => {
    let { d, p } = spec();
    d = run(d, planSaveSettings(d, { capitalReturnMode: 'from_cash', reserve: rub(67000) }));
    assert.throws(() => planCapitalReturn(d, { partnerId: p, amount: rub(2000) }), /за вычетом резерва/);
  });
});

describe('распределение: повторы, частичные выплаты, история', () => {
  it('повторное распределение не удваивает прибыль', () => {
    let { d } = spec();
    d = run(d, planCreateDistribution(d, { mode: 'capital' }));
    assert.throws(() => planCreateDistribution(d, { mode: 'capital' }), /Нет доступной/);
  });
  it('нельзя распределить больше доступного, частичное распределение допустимо', () => {
    let { d } = spec();
    assert.throws(() => planCreateDistribution(d, { mode: 'equal', amount: rub(30001) }), /превышает/);
    d = run(d, planCreateDistribution(d, { mode: 'equal', amount: rub(10000) }));
    assert.deepEqual(d.distributions[0].rows.map((r) => r.amount), [333334, 333333, 333333].map((x) => x * 1)); // 10 000 ₽ / 3 с копейками
    const pv = previewDistribution({ mode: 'equal', partners: d.partners, data: d, reserve: d.settings.reserve, fixedBps: {}, customBps: {} });
    assert.equal(pv.available, rub(20000));
  });
  it('частичные выплаты и защита от переплаты', () => {
    let { d, a } = spec();
    d = run(d, planCreateDistribution(d, { mode: 'capital' }));
    const id = d.distributions[0].id;
    d = run(d, planPayout(d, { distributionId: id, partnerId: a, amount: rub(5000) }));
    d = run(d, planPayout(d, { distributionId: id, partnerId: a, amount: rub(5000) }));
    assert.equal(partnerLedger(a, d.transactions).unpaid, rub(5000));
    assert.throws(() => planPayout(d, { distributionId: id, partnerId: a, amount: rub(5001) }), /осталось/);
    d = run(d, planPayout(d, { distributionId: id, partnerId: a, amount: rub(5000) }));
    assert.throws(() => planPayout(d, { distributionId: id, partnerId: a, amount: 1 }), AppError);
  });
  it('изменение долей и резерва не меняет проведённое распределение', () => {
    let { d, a, p, t } = spec();
    d = run(d, planSaveSettings(d, { fixedBps: { [a]: 1000, [p]: 1000, [t]: 8000 } }));
    d = run(d, planCreateDistribution(d, { mode: 'capital' }));
    const snapshot = JSON.stringify(d.distributions[0]);
    const accruals = JSON.stringify(d.transactions.filter((x) => x.type === 'profit_accrual'));
    d = run(d, planSaveSettings(d, { reserve: 0, distributionMode: 'equal', fixedBps: { [a]: 3333, [p]: 3333, [t]: 3334 } }));
    d = run(d, planSavePartner(d, { id: a, name: 'Андрей Новый' }));
    assert.equal(JSON.stringify(d.distributions[0]), snapshot);
    assert.equal(JSON.stringify(d.transactions.filter((x) => x.type === 'profit_accrual')), accruals);
    assert.equal(d.distributions[0].rows[0].partnerName, 'Андрей');
  });
  it('фиксированные и индивидуальные доли должны давать ровно 100%', () => {
    const { d, a, p, t } = spec();
    assert.throws(() => planCreateDistribution(d, { mode: 'custom', customBps: { [a]: 5000, [p]: 3000, [t]: 1999 } }), /100%/);
    const b = planCreateDistribution(d, { mode: 'custom', customBps: { [a]: 5000, [p]: 3000, [t]: 2000 } });
    const dd = run(d, b);
    assert.deepEqual(dd.distributions[0].rows.map((r) => r.amount), [rub(15000), rub(9000), rub(6000)]);
  });
  it('отмена: сохраняется в истории, прибыль освобождается, при выплатах запрещена', () => {
    let { d, a } = spec();
    d = run(d, planCreateDistribution(d, { mode: 'capital' }));
    const id = d.distributions[0].id;
    d = run(d, planPayout(d, { distributionId: id, partnerId: a, amount: rub(1) }));
    assert.throws(() => planCancelDistribution(d, id, 'ошибка'), /были выплаты/);
    d = run(d, planDeleteTx(d, d.transactions.find((x) => x.type === 'profit_payout')!.id));
    d = run(d, planCancelDistribution(d, id, 'ошибка'));
    assert.equal(d.distributions.length, 1);
    assert.equal(d.distributions[0].status, 'cancelled');
    assert.throws(() => planCancelDistribution(d, id, ''), /уже отменено/);
    assert.equal(partnerLedger(a, d.transactions).accrued, 0);
    const pv = previewDistribution({ mode: 'capital', partners: d.partners, data: d, reserve: d.settings.reserve, fixedBps: {}, customBps: {} });
    assert.equal(pv.available, rub(30000));
    assert.ok(d.log.some((l) => l.action === 'Отмена распределения'));
  });
});

describe('склад и заказы', () => {
  function stock() {
    let d = emptyData();
    d = run(d, planSavePartner(d, { name: 'А' }));
    d = run(d, planSaveClient(d, { name: 'К' }));
    d = run(d, planSaveMaterial(d, { name: 'Чип', unit: 'шт', minQty: 5 }));
    d = run(d, planPurchase(d, { materialId: d.materials[0].id, date: '2026-01-01', qty: 100, unitCost: 3000, payer: d.partners[0].id }));
    return d;
  }
  const base = (d: Data, over = {}) => ({ clientId: d.clients[0].id, title: 'X', qty: 10, unitPrice: 50000, unitCost: 0, costMode: 'auto' as const, extraCost: 0, status: 'new' as const, materials: [{ materialId: d.materials[0].id, qtyPerUnit: 1 }], ...over });
  it('закупка за счёт партнёра создаёт ровно одну операцию-аванс и долг', () => {
    const d = stock();
    assert.equal(d.transactions.length, 1);
    assert.equal(d.transactions[0].type, 'advance');
    assert.equal(partnerLedger(d.partners[0].id, d.transactions).debt, 300000);
    assert.equal(cashBalance(d.transactions), 0);
    assert.equal(d.materials[0].qty, 100);
  });
  it('себестоимость считается по материалам', () => {
    let d = stock();
    d = run(d, planSaveOrder(d, base(d)));
    assert.equal(d.orders[0].unitCost, 3000);
  });
  it('списание не дублируется при повторном сохранении и корректируется при правке', () => {
    let d = stock();
    d = run(d, planSaveOrder(d, base(d, { status: 'in_production' })));
    assert.equal(d.materials[0].qty, 90);
    const id = d.orders[0].id;
    for (let k = 0; k < 3; k++) d = run(d, planSaveOrder(d, { ...base(d, { status: 'in_production' }), id }));
    assert.equal(d.materials[0].qty, 90);
    d = run(d, planSaveOrder(d, { ...base(d, { status: 'in_production', qty: 25 }), id }));
    assert.equal(d.materials[0].qty, 75);
    d = run(d, planSaveOrder(d, { ...base(d, { status: 'cancelled', qty: 25 }), id }));
    assert.equal(d.materials[0].qty, 100);
  });
  it('нельзя списать больше, чем есть на складе — ничего не меняется', () => {
    const d = stock();
    assert.throws(() => planSaveOrder(d, base(d, { status: 'in_production', qty: 101 })), /Недостаточно материала/);
    assert.equal(d.materials[0].qty, 100);
  });
  it('номера заказов уникальны и растут', () => {
    let d = stock();
    d = run(d, planSaveOrder(d, base(d)));
    d = run(d, planSaveOrder(d, base(d)));
    assert.deepEqual(d.orders.map((o) => o.number), ['№0001', '№0002']);
  });
  it('закупка пересчитывает среднюю цену', () => {
    let d = stock();
    d = run(d, planPurchase(d, { materialId: d.materials[0].id, date: '2026-01-05', qty: 100, unitCost: 5000, payer: 'business' }));
    assert.equal(d.materials[0].unitCost, 4000);
    assert.equal(d.materials[0].qty, 200);
  });
});

describe('целостность', () => {
  it('удаление операции не может увести долг в минус', () => {
    let { d, a } = spec();
    d = run(d, planSaveTx(d, { type: 'advance_repay', partnerId: a, amount: rub(3000), date: '2026-02-10' }));
    const adv = d.transactions.find((x) => x.type === 'advance')!;
    assert.throws(() => planDeleteTx(d, adv.id), /нарушит учёт/);
  });
  it('демо-данные согласованы', () => {
    const d = buildDemo();
    const s = summarize(d.transactions);
    assert.ok(s.revenue > 0 && cashBalance(d.transactions) > 0);
    for (const p of d.partners) assert.ok(partnerLedger(p.id, d.transactions).unpaid >= 0);
  });
});

describe('владелец: правка и удаление любых данных', () => {
  function shop() {
    let d = emptyData();
    d = run(d, planSavePartner(d, { name: 'А' }));
    d = run(d, planSavePartner(d, { name: 'Б' }));
    d = run(d, planSaveClient(d, { name: 'К' }));
    d = run(d, planSaveMaterial(d, { name: 'Чип', unit: 'шт', minQty: 5 }));
    const [a, b2] = d.partners.map((x) => x.id), m = d.materials[0].id;
    d = run(d, planPurchase(d, { materialId: m, date: '2026-01-01', qty: 100, unitCost: 3000, payer: a }));
    d = run(d, planPurchase(d, { materialId: m, date: '2026-01-02', qty: 100, unitCost: 5000, payer: 'business' }));
    return { d, a, b2, m };
  }
  it('удаление поставки возвращает склад, удаляет расход и долг, пересчитывает цену', () => {
    let { d, a, m } = shop();
    assert.equal(d.materials[0].qty, 200); assert.equal(d.materials[0].unitCost, 4000);
    d = run(d, planDeletePurchase(d, d.purchases[0].id));
    assert.equal(d.materials[0].qty, 100); assert.equal(d.materials[0].unitCost, 5000);
    assert.equal(d.purchases.length, 1); assert.equal(d.transactions.length, 1);
    assert.equal(partnerLedger(a, d.transactions).debt, 0);
    assert.equal(d.materials[0].id, m);
  });
  it('удаление операции расхода из журнала удаляет и поставку', () => {
    let { d } = shop();
    d = run(d, planDeleteTx(d, d.purchases[1].txId!));
    assert.equal(d.purchases.length, 1); assert.equal(d.materials[0].qty, 100);
  });
  it('правка поставки: количество, цена и плательщик пересчитывают склад, расход и долг', () => {
    let { d, a } = shop();
    const id = d.purchases[0].id;
    d = run(d, planUpdatePurchase(d, id, { materialId: d.materials[0].id, date: '2026-01-05', qty: 50, unitCost: 4000, payer: 'business' }));
    assert.equal(d.materials[0].qty, 150);
    assert.equal(partnerLedger(a, d.transactions).debt, 0);
    const tx = d.transactions.find((t) => t.id === d.purchases.find((p) => p.id === id)!.txId)!;
    assert.deepEqual([tx.type, tx.amount, tx.date, tx.partnerId], ['expense', 200000, '2026-01-05', undefined]);
    assert.equal(summarize(d.transactions).expenses, 200000 + 500000);
  });
  it('нельзя удалить поставку, если по её авансу партнёру уже вернули деньги', () => {
    let { d, a } = shop();
    d = run(d, planSaveTx(d, { type: 'capital', partnerId: a, amount: rub(100000), date: '2026-01-03' }));
    d = run(d, planSaveTx(d, { type: 'advance_repay', partnerId: a, amount: rub(2000), date: '2026-01-04' }));
    assert.throws(() => planDeletePurchase(d, d.purchases[0].id), /нарушит учёт/);
  });
  it('склад можно скорректировать вручную с записью в журнал', () => {
    let { d, m } = shop();
    d = run(d, planSaveMaterial(d, { id: m, name: 'Чип', unit: 'шт', qty: 37 }));
    assert.equal(d.materials[0].qty, 37);
    assert.ok(d.log.some((l) => l.action === 'Корректировка склада'));
    assert.throws(() => planSaveMaterial(d, { id: m, name: 'Чип', unit: 'шт', qty: -1 }), AppError);
  });
  it('удаление материала: расходы сохраняются или удаляются по выбору, заказы очищаются от ссылок', () => {
    let { d, m } = shop();
    d = run(d, planSaveOrder(d, { clientId: d.clients[0].id, title: 'X', qty: 5, unitPrice: 1000, unitCost: 0, costMode: 'auto', extraCost: 0, status: 'in_production', materials: [{ materialId: m, qtyPerUnit: 1 }] }));
    const keep = run(d, planDeleteMaterial(d, m, false));
    assert.equal(keep.materials.length, 0); assert.equal(keep.purchases.length, 0); assert.equal(keep.transactions.length, 2); assert.deepEqual(keep.orders[0].materials, []);
    const all = run(d, planDeleteMaterial(d, m, true));
    assert.equal(all.transactions.length, 0); assert.equal(partnerLedger(d.partners[0].id, all.transactions).debt, 0);
  });
  it('каскад: удаление заказа с платежами и клиента с заказами возвращает материалы ровно один раз', () => {
    let { d, m } = shop();
    const c = d.clients[0].id;
    for (const q of [10, 20]) {
      d = run(d, planSaveOrder(d, { clientId: c, title: 'X', qty: q, unitPrice: rub(100), unitCost: 0, costMode: 'auto', extraCost: 0, status: 'in_production', materials: [{ materialId: m, qtyPerUnit: 1 }] }));
      d = run(d, planSaveTx(d, { type: 'income', amount: rub(100), date: '2026-02-01', orderId: d.orders[d.orders.length - 1].id }));
    }
    assert.equal(d.materials[0].qty, 170);
    assert.throws(() => planDeleteOrder(d, d.orders[0].id), /есть платежи/);
    assert.throws(() => planDeleteClient(d, c), /заказ/);
    const after = run(d, planDeleteClient(d, c, true));
    assert.equal(after.clients.length, 0); assert.equal(after.orders.length, 0);
    assert.equal(after.materials[0].qty, 200);
    assert.equal(after.transactions.filter((t) => t.orderId).length, 0);
  });
  it('партнёр: удаление с операциями; запрещено, если участвует в распределении', () => {
    let { d, a, b2 } = shop();
    assert.throws(() => planDeletePartner(d, a), /операций/);
    const gone = run(d, planDeletePartner(d, a, true));
    assert.equal(gone.partners.length, 1); assert.equal(gone.transactions.some((t) => t.partnerId === a), false);
    d = run(d, planSaveTx(d, { type: 'capital', partnerId: a, amount: rub(10), date: '2026-01-01' }));
    d = run(d, planSaveTx(d, { type: 'capital', partnerId: b2, amount: rub(10), date: '2026-01-01' }));
    d = run(d, planSaveTx(d, { type: 'other', direction: 'in', amount: rub(20000), date: '2026-01-02' }));
    d = run(d, planCreateDistribution(d, { mode: 'equal', amount: rub(1000) }));
    assert.throws(() => planDeletePartner(d, b2, true), /распределении/);
  });
  it('выплату можно удалить, затем отменить распределение; распределение можно удалить целиком', () => {
    let { d, a, b2 } = shop();
    d = run(d, planSaveTx(d, { type: 'capital', partnerId: a, amount: rub(100), date: '2026-01-01' }));
    d = run(d, planSaveTx(d, { type: 'capital', partnerId: b2, amount: rub(100), date: '2026-01-01' }));
    d = run(d, planSaveTx(d, { type: 'other', direction: 'in', amount: rub(20000), date: '2026-01-02' }));
    d = run(d, planCreateDistribution(d, { mode: 'equal', amount: rub(2000) }));
    const dist = d.distributions[0].id;
    d = run(d, planPayout(d, { distributionId: dist, partnerId: a, amount: rub(500) }));
    assert.throws(() => planCancelDistribution(d, dist, ''), /выплаты/);
    d = run(d, planDeleteTx(d, d.transactions.find((t) => t.type === 'profit_payout')!.id));
    d = run(d, planCancelDistribution(d, dist, 'тест'));
    d = run(d, planCreateDistribution(d, { mode: 'equal', amount: rub(2000) }));
    d = run(d, planPayout(d, { distributionId: d.distributions[1].id, partnerId: a, amount: rub(300) }));
    d = run(d, planDeleteDistribution(d, d.distributions[1].id));
    assert.equal(d.distributions.length, 1);
    assert.equal(d.transactions.filter((t) => t.type === 'profit_payout' || (t.type === 'profit_accrual' && !t.voided)).length, 0);
  });
});
