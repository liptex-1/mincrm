import { useMemo } from 'react';
import { monthlySeries, monthsFor, topProducts } from '../domain/analytics';
import { monthLabel } from '../domain/dates';
import { partnerLedger } from '../domain/finance';
import { useData } from '../store/store';
import { Donut, HBars, PALETTE, XYChart } from '../ui/charts';
import { PeriodFilter, useMoney, usePeriod } from '../ui/common';
import { Card, Empty } from '../ui/kit';

export default function Analytics() {
  const d = useData();
  const money = useMoney();
  const p = usePeriod('year');
  const months = useMemo(() => monthsFor(d, p.range), [d, p.range.from, p.range.to]); // eslint-disable-line
  const ms = useMemo(() => monthlySeries(d, months), [d, months]);
  const top = useMemo(() => topProducts(d.orders, p.range), [d.orders, p.range.from, p.range.to]); // eslint-disable-line
  const pts = (f: (r: (typeof ms)[number]) => Record<string, number>) => ms.map((r) => ({ label: monthLabel(r.month), v: f(r) }));
  const green = (k: string, name: string) => [{ key: k, name, color: '#78B94D' }];
  const act = d.partners.filter((x) => !x.archived);
  const paidToPartners = d.distributions.filter((x) => x.status === 'active').flatMap((x) => x.rows);
  const byPartner = act.map((x) => ({ label: x.name, value: paidToPartners.filter((r) => r.partnerId === x.id).reduce((a, r) => a + r.amount, 0) }));
  const hasData = d.transactions.length > 0 || d.orders.length > 0;

  return (
    <>
      <div className="page-head"><div><h1>Аналитика</h1><p>Все графики строятся автоматически по данным приложения</p></div><PeriodFilter value={p.key} onChange={p.setKey} custom={p.custom} onCustom={p.setCustom} keys={['month', 'quarter', 'year', 'all', 'custom']} /></div>
      {!hasData ? <Card><Empty title="Пока нет данных для аналитики" text="Добавьте заказы и операции — графики появятся сами." /></Card> : (
        <div className="grid g2">
          <Card title="Выручка по месяцам"><XYChart kind="bar" data={pts((r) => ({ v: r.revenue }))} series={green('v', 'Выручка')} format={money} /></Card>
          <Card title="Расходы по месяцам"><XYChart kind="bar" data={pts((r) => ({ v: r.expenses }))} series={[{ key: 'v', name: 'Расходы', color: '#E0715F' }]} format={money} /></Card>
          <Card title="Чистая прибыль"><XYChart kind="area" data={pts((r) => ({ v: r.profit }))} series={green('v', 'Прибыль')} format={money} /></Card>
          <Card title="Динамика заказов"><XYChart kind="line" data={pts((r) => ({ v: r.orders }))} series={[{ key: 'v', name: 'Заказы', color: '#4F86C6' }]} axis={(n) => String(n)} format={(n) => `${n} шт.`} /></Card>
          <Card title="Средний чек"><XYChart kind="line" data={pts((r) => ({ v: r.avgCheck }))} series={[{ key: 'v', name: 'Средний чек', color: '#E0A545' }]} format={money} /></Card>
          <Card title="Рентабельность, %"><XYChart kind="bar" data={pts((r) => ({ v: Math.round(r.margin * 100) }))} series={[{ key: 'v', name: 'Рентабельность', color: '#4DB6A8' }]} axis={(n) => `${n / 100}%`} format={(n) => `${n / 100}%`} /></Card>
          <Card title="Динамика денежного остатка"><XYChart kind="area" data={pts((r) => ({ v: r.cash }))} series={[{ key: 'v', name: 'Остаток', color: '#78B94D' }]} format={money} /></Card>
          <Card title="Самые прибыльные товары">
            {top.length === 0 ? <Empty title="Нет заказов за период" /> : <HBars items={top.slice(0, 6).map((t) => ({ label: t.title, value: t.profit, sub: `${t.qty} шт.` }))} format={money} />}
          </Card>
          <Card title="Вложения партнёров"><Donut center="Капитал" format={money} items={act.map((x, i) => ({ label: x.name, value: Math.max(0, partnerLedger(x.id, d.transactions).capitalNet), color: PALETTE[i % PALETTE.length] }))} /></Card>
          <Card title="Распределение прибыли">
            {byPartner.every((x) => !x.value) ? <Empty title="Распределений ещё не было" /> : <Donut center="Начислено" format={money} items={byPartner.map((x, i) => ({ ...x, color: PALETTE[i % PALETTE.length] }))} />}
          </Card>
        </div>
      )}
    </>
  );
}
