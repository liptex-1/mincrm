import { addDays } from './dates';
import { applyBatch, planCapitalReturn, planCreateDistribution, planPayout, planPurchase, planSaveClient, planSaveMaterial, planSaveOrder, planSavePartner, planSaveSettings, planSaveTx, type OrderInput } from './ops';
import { todayISO } from './money';
import { emptyData, type Data } from './types';

/** Демо-сценарий из ТЗ: капитал 15 000 + 10 000 + 5 000, аванс Андрея 3 000, выручка 60 000, расходы 25 000, резерв 5 000. */
export function buildDemo(): Data {
  const t = todayISO();
  const day = (n: number) => addDays(t, -n);
  let d = emptyData();
  const run = (b: any) => { d = applyBatch(d, b); };
  const idOf = (arr: { id: string; name: string }[], name: string) => arr.find((x) => x.name === name)!.id;

  for (const n of ['Андрей', 'Паша', 'Третий участник']) run(planSavePartner(d, { name: n, joinedAt: day(120) }));
  const [a, p, th] = ['Андрей', 'Паша', 'Третий участник'].map((n) => idOf(d.partners, n));
  run(planSaveSettings(d, { reserve: 500000, distributionMode: 'capital', fixedBps: { [a]: 5000, [p]: 3000, [th]: 2000 } }));
  for (const [pid, amt, off] of [[a, 1500000, 118], [p, 1000000, 117], [th, 500000, 116]] as const)
    run(planSaveTx(d, { type: 'capital', partnerId: pid, amount: amt, date: day(off), category: 'Вклад в капитал', description: 'Стартовый вклад' }));

  for (const m of [
    { name: 'NFC-чипы NTAG215', unit: 'шт', minQty: 20 },
    { name: 'Заготовки (дерево)', unit: 'шт', minQty: 15 },
    { name: 'Эпоксидная смола', unit: 'мл', minQty: 200 },
    { name: 'Упаковка (коробка)', unit: 'шт', minQty: 10 },
  ]) run(planSaveMaterial(d, m));
  const [chip, blank, resin, box] = ['NFC-чипы NTAG215', 'Заготовки (дерево)', 'Эпоксидная смола', 'Упаковка (коробка)'].map((n) => idOf(d.materials, n));
  // Андрей оплатил материалы из своих денег — 3 000 ₽ (аванс), остальное — касса бизнеса
  run(planPurchase(d, { materialId: chip, date: day(100), qty: 100, unitCost: 3000, payer: a, note: 'Заказ на AliExpress' }));
  run(planPurchase(d, { materialId: blank, date: day(100), qty: 80, unitCost: 4500, payer: 'business' }));
  run(planPurchase(d, { materialId: resin, date: day(98), qty: 1000, unitCost: 350, payer: 'business' }));
  run(planPurchase(d, { materialId: box, date: day(95), qty: 60, unitCost: 2500, payer: 'business' }));
  run(planSaveTx(d, { type: 'expense', amount: 450000, date: day(90), category: 'Оборудование', description: 'УФ-лампа и формы для смолы' }));
  run(planSaveTx(d, { type: 'expense', amount: 300000, date: day(70), category: 'Реклама', description: 'Таргет в Telegram' }));
  run(planSaveTx(d, { type: 'expense', amount: 150000, date: day(40), category: 'Доставка', description: 'СДЭК — отправки клиентам' }));

  const clients = ['Кофейня «Зерно»', 'Агентство «Вектор»', 'Мария Соколова', 'Студия Fit&Go'];
  for (const [i, c] of clients.entries()) run(planSaveClient(d, { name: c, phone: `+7 900 ${100 + i}-22-3${i}`, telegram: `@client${i + 1}`, email: i % 2 ? undefined : `client${i + 1}@mail.ru`, comment: i === 0 ? 'Постоянный клиент, оптовые заказы' : undefined }));
  const cl = clients.map((n) => idOf(d.clients, n));
  const mats = [{ materialId: chip, qtyPerUnit: 1 }, { materialId: blank, qtyPerUnit: 1 }, { materialId: resin, qtyPerUnit: 4 }, { materialId: box, qtyPerUnit: 1 }];
  const base = (over: Partial<OrderInput>): OrderInput => ({ clientId: cl[0], title: 'NFC-визитка', qty: 1, unitPrice: 0, unitCost: 0, costMode: 'auto', extraCost: 0, status: 'new', materials: mats, size: '85×55 мм', ...over });

  const orders: [Partial<OrderInput>, number, number][] = [
    [{ clientId: cl[0], title: 'NFC-визитки с логотипом', qty: 20, unitPrice: 85000, size: '85×55 мм', custom: 'Гравировка логотипа, смола', status: 'handed', createdAt: day(60), dueDate: day(50) }, 1700000, 60],
    [{ clientId: cl[1], title: 'NFC-брелоки', qty: 15, unitPrice: 120000, size: 'Ø40 мм', custom: 'Цветная заливка', status: 'handed', createdAt: day(35), dueDate: day(28) }, 1800000, 30],
    [{ clientId: cl[2], title: 'NFC-визитка премиум', qty: 10, unitPrice: 150000, size: '90×50 мм', custom: 'Дерево + смола', status: 'ready', createdAt: day(14), dueDate: day(2) }, 1500000, 8],
    [{ clientId: cl[3], title: 'NFC-визитки команды', qty: 12, unitPrice: 95000, status: 'in_production', createdAt: day(5), dueDate: addDays(t, 6) }, 400000, 3],
    [{ clientId: cl[0], title: 'NFC-стенд для кассы', qty: 4, unitPrice: 190000, status: 'pending', createdAt: day(2), dueDate: addDays(t, 12) }, 0, 0],
  ];
  for (const [o, paid, off] of orders) {
    run(planSaveOrder(d, base(o)));
    const ord = d.orders[d.orders.length - 1];
    if (paid) run(planSaveTx(d, { type: 'income', amount: paid, date: day(off), category: 'Оплата заказа', orderId: ord.id, description: `Оплата ${ord.number}` }));
  }
  run(planSaveTx(d, { type: 'expense', amount: 80000, date: day(10), category: 'Комиссии', description: 'Комиссия эквайринга' }));

  run(planCreateDistribution(d, { mode: 'capital', amount: 1000000, note: 'Первое распределение' }));
  const dist = d.distributions[0];
  run(planPayout(d, { distributionId: dist.id, partnerId: a, amount: Math.min(dist.rows.find((r) => r.partnerId === a)!.amount, 400000), date: day(1) }));
  void planCapitalReturn;
  return d;
}
