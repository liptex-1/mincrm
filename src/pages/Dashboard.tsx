import { useMemo } from 'react';
import { LuBanknote, LuCoins, LuLandmark, LuPiggyBank, LuReceipt, LuShoppingBag, LuTrendingUp, LuUsers, LuWallet, LuSparkles } from 'react-icons/lu';
import { dueSoon, monthlySeries, monthsFor, ordersStats } from '../domain/analytics';
import { daysBetween, monthLabel } from '../domain/dates';
import { cashBalance, computeOrder, previewDistribution, summarize, totalDebt } from '../domain/finance';
import { formatDate, todayISO } from '../domain/money';
import { PRODUCTION_LABELS, TX_LABELS } from '../domain/types';
import { loadDemo, useData } from '../store/store';
import { Donut, Legend, XYChart } from '../ui/charts';
import { PeriodFilter, PROD_TONE, StatusChip, useMoney, usePeriod } from '../ui/common';
import { Btn, Card, Chip, Empty, Stat, useUi } from '../ui/kit';
import { go } from '../ui/router';

const TX_SIGN: Record<string, 1 | -1 | 0> = { income: 1, capital: 1, refund: -1, expense: -1, advance: 0, advance_repay: -1, capital_return: -1, profit_accrual: 0, profit_payout: -1, other: 0 };

export default function Dashboard() {
  const d = useData();
  const money = useMoney();
  const { toast } = useUi();
  const p = usePeriod('month');
  const S = useMemo(() => summarize(d.transactions, p.range), [d.transactions, p.range.from, p.range.to]); // eslint-disable-line
  const O = useMemo(() => ordersStats(d.orders, p.range), [d.orders, p.range.from, p.range.to]); // eslint-disable-line
  const months = useMemo(() => monthsFor(d, p.range), [d, p.range.from, p.range.to]); // eslint-disable-line
  const series = useMemo(() => monthlySeries(d, months), [d, months]);
  const cash = cashBalance(d.transactions);
  const pv = previewDistribution({ mode: d.settings.distributionMode, partners: d.partners.filter((x) => !x.archived), data: d, reserve: d.settings.reserve, fixedBps: d.settings.fixedBps, customBps: {} });
  const debt = totalDebt(d.partners, d.transactions);
  const activeClients = new Set(d.orders.filter((o) => o.status !== 'cancelled' && (!p.range.from || o.createdAt >= p.range.from) && (!p.range.to || o.createdAt <= p.range.to)).map((o) => o.clientId)).size;
  const clientName = (id: string) => d.clients.find((c) => c.id === id)?.name ?? '—';
  const t = todayISO();

  if (!d.clients.length && !d.orders.length && !d.transactions.length)
    return (
      <>
        <Head />
        <Card><Empty icon={<LuSparkles size={38} />} title="Здесь пока пусто" text="Добавьте первого клиента или партнёра — либо загрузите демо-данные, чтобы сразу увидеть, как всё работает." action={<div className="row" style={{ justifyContent: 'center' }}><Btn kind="primary" onClick={() => go('partners')}>Добавить партнёров</Btn><Btn onClick={async () => { await loadDemo(); toast('Демо-данные загружены'); }}>Загрузить демо-данные</Btn></div>} /></Card>
      </>
    );

  const lastTx = [...d.transactions].filter((x) => !x.voided).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const lastOrders = [...d.orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number.localeCompare(a.number)).slice(0, 5);
  const lastClients = [...d.clients].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const due = dueSoon(d.orders, 21).slice(0, 5);
  const data = series.map((s) => ({ label: monthLabel(s.month), v: { revenue: s.revenue, expenses: s.expenses, profit: s.profit, orders: s.orders } }));
  const re = [{ key: 'revenue', name: 'Выручка', color: '#78B94D' }, { key: 'expenses', name: 'Расходы', color: '#E0715F' }];

  return (
    <>
      <Head right={<PeriodFilter value={p.key} onChange={p.setKey} custom={p.custom} onCustom={p.setCustom} />} />
      <div className="grid g4 mb">
        <Stat hl label="Общая выручка" icon={<LuBanknote size={15} />} value={S.revenue} format={money} hint="Фактически полученные деньги" />
        <Stat label="Чистая прибыль" icon={<LuTrendingUp size={15} />} value={S.netProfit} format={money} tone="pos" hint="Выручка − расходы ± прочее" />
        <Stat label="Общие расходы" icon={<LuReceipt size={15} />} value={S.expenses} format={money} hint="Включая авансы партнёров" />
        <Stat label="Заказов" icon={<LuShoppingBag size={15} />} value={O.count} format={(n) => String(n)} hint={`На сумму ${money(O.total)}`} />
        <Stat label="Средний чек" icon={<LuCoins size={15} />} value={O.avg} format={money} hint="По созданным за период заказам" />
        <Stat label="Активные клиенты" icon={<LuUsers size={15} />} value={activeClients} format={(n) => String(n)} hint={`Всего в базе: ${d.clients.length}`} />
        <Stat label="Денежный остаток" icon={<LuWallet size={15} />} value={cash} format={money} tone="neg" hint="На сегодня, за всё время" />
        <Stat hl label="Доступно к распределению" icon={<LuPiggyBank size={15} />} value={pv.available} format={money} hint={`Резерв: ${money(d.settings.reserve)}`} />
      </div>

      <div className="grid g-main mb">
        <Card title="Выручка и расходы по месяцам" action={<Legend series={re} />}><XYChart kind="bar" data={data} series={re} format={money} /></Card>
        <Card title="Доходы и расходы"><Donut items={[{ label: 'Выручка', value: Math.max(0, S.revenue), color: '#78B94D' }, { label: 'Расходы', value: S.expenses, color: '#E0715F' }]} format={money} center="За период" /></Card>
      </div>
      <div className="grid g3 mb">
        <Card title="Динамика прибыли"><XYChart kind="area" data={data} series={[{ key: 'profit', name: 'Прибыль', color: '#78B94D' }]} format={money} height={200} /></Card>
        <Card title="Количество заказов"><XYChart kind="bar" data={data} series={[{ key: 'orders', name: 'Заказы', color: '#4F86C6' }]} axis={(n) => String(n)} format={(n) => `${n} шт.`} height={200} /></Card>
        <Card title="Состояние финансов" action={<Btn kind="ghost" size="sm" onClick={() => go('finance')}>Подробнее</Btn>}>
          <div className="kv">
            <span className="k">Денежный остаток</span><span className="v">{money(cash)}</span>
            <span className="k">Долг партнёрам (авансы)</span><span className="v">{money(debt)}</span>
            <span className="k">Резерв бизнеса</span><span className="v">{money(d.settings.reserve)}</span>
            <span className="sep" />
            <span className="k">Нераспределённая прибыль</span><span className="v">{money(pv.undistributed)}</span>
            <span className="k">Доступно к распределению</span><span className="v pos">{money(pv.available)}</span>
          </div>
        </Card>
      </div>

      <div className="grid g2 mb">
        <Card title="Последние заказы" action={<Btn kind="ghost" size="sm" onClick={() => go('orders')}>Все заказы</Btn>}>
          {lastOrders.length === 0 ? <Empty title="Заказов пока нет" /> : <div className="list">{lastOrders.map((o) => (
            <div key={o.id}><div className="grow"><div className="t">{o.number} · {o.title}</div><div className="small muted">{clientName(o.clientId)} · {formatDate(o.createdAt)}</div></div><div className="right"><b className="num">{money(computeOrder(o).total)}</b><div><StatusChip tone={PROD_TONE[o.status]}>{PRODUCTION_LABELS[o.status]}</StatusChip></div></div></div>
          ))}</div>}
        </Card>
        <Card title="Предстоящие сроки" action={<Chip>{due.length}</Chip>}>
          {due.length === 0 ? <Empty title="Нет ближайших сроков" text="Заказы с плановой датой появятся здесь." /> : <div className="list">{due.map((o) => {
            const left = daysBetween(t, o.dueDate!);
            return <div key={o.id}><div className="grow"><div className="t">{o.number} · {o.title}</div><div className="small muted">{clientName(o.clientId)}</div></div><div className="right"><b>{formatDate(o.dueDate)}</b><div><Chip tone={left < 0 ? 'red' : left <= 3 ? 'amber' : 'green'}>{left < 0 ? `просрочен на ${-left} дн.` : left === 0 ? 'сегодня' : `через ${left} дн.`}</Chip></div></div></div>;
          })}</div>}
        </Card>
        <Card title="Последние операции" action={<Btn kind="ghost" size="sm" onClick={() => go('finance')}>Журнал</Btn>}>
          <div className="list">{lastTx.map((x) => { const sg = TX_SIGN[x.type] ?? (x.direction === 'in' ? 1 : -1); return (
            <div key={x.id}><div className="grow"><div className="t">{TX_LABELS[x.type]}{x.description ? ` · ${x.description}` : ''}</div><div className="small muted">{formatDate(x.date)}{x.partnerId ? ` · ${d.partners.find((p) => p.id === x.partnerId)?.name ?? ''}` : ''}</div></div><b className={`num ${sg > 0 ? 'pos' : ''}`}>{sg > 0 ? '+' : sg < 0 ? '−' : ''}{money(x.amount)}</b></div>
          ); })}</div>
        </Card>
        <Card title="Новые клиенты" action={<Btn kind="ghost" size="sm" onClick={() => go('clients')}>База клиентов</Btn>}>
          {lastClients.length === 0 ? <Empty title="Клиентов пока нет" /> : <div className="list">{lastClients.map((c) => <div key={c.id}><div className="grow"><div className="t">{c.name}</div><div className="small muted">{c.phone || c.telegram || c.email || 'без контактов'}</div></div><span className="small muted">{formatDate(c.createdAt)}</span></div>)}</div>}
        </Card>
      </div>
      <div className="small muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LuLandmark size={14} />Выручка, расходы и прибыль считаются за выбранный период. Денежный остаток и доступная прибыль — на текущий момент.</div>
    </>
  );
}

function Head({ right }: { right?: React.ReactNode }) {
  return <div className="page-head"><div><h1>Главная</h1><p>Общее состояние бизнеса</p></div>{right}</div>;
}
