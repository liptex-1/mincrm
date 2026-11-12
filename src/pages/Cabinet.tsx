import { useEffect, useState } from 'react';
import { LuCoins, LuHandCoins, LuPiggyBank, LuReceipt, LuUserRound, LuWallet } from 'react-icons/lu';
import { fetchMyOrders } from '../db/cloud';
import { orderPayments, partnerLedger } from '../domain/finance';
import { formatDate } from '../domain/money';
import { PAYMENT_LABELS, PRODUCTION_LABELS, TX_LABELS, type Order, type ProductionStatus } from '../domain/types';
import { useApp, useData } from '../store/store';
import { PAY_TONE, PROD_TONE, StatusChip, useMoney } from '../ui/common';
import { Alert, Card, Chip, Empty, Stat } from '../ui/kit';

export default function Cabinet() {
  const role = useApp((s) => s.role);
  const me = useApp((s) => s.me);
  if (role?.scope === 'own_partner') return me?.partner_id ? <Sponsor /> : <Unlinked what="партнёру" />;
  if (role?.scope === 'own_client') return me?.client_id ? <Customer /> : <Unlinked what="клиенту" />;
  return <Card><Empty title="Кабинет недоступен для вашей роли" /></Card>;
}

const Unlinked = ({ what }: { what: string }) => (
  <>
    <div className="page-head"><div><h1>Мой кабинет</h1></div></div>
    <Alert>Ваш аккаунт ещё не привязан к {what}. Попросите владельца бизнеса назначить привязку в разделе «Доступ» — после этого здесь появятся ваши данные.</Alert>
  </>
);

function Sponsor() {
  const d = useData();
  const money = useMoney();
  const me = useApp((s) => s.me)!;
  const p = d.partners.find((x) => x.id === me.partner_id);
  if (!p) return <Unlinked what="партнёру" />;
  const l = partnerLedger(p.id, d.transactions);
  const txs = d.transactions.filter((t) => t.partnerId === p.id && !t.voided).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const plus = ['capital', 'advance', 'profit_accrual'];
  return (
    <>
      <div className="page-head"><div><h1>Мой кабинет</h1><p>{p.name} · с {formatDate(p.joinedAt)}</p></div></div>
      <div className="grid g4 mb">
        <Stat hl label="Вложено в капитал" icon={<LuPiggyBank size={15} />} value={l.capitalNet} format={money} hint={l.capitalReturned ? `Возвращено: ${money(l.capitalReturned)}` : 'Ваша доля вложений'} />
        <Stat label="Личные расходы (авансы)" icon={<LuReceipt size={15} />} value={l.advances} format={money} hint={`Возвращено: ${money(l.advanceRepaid)}`} />
        <Stat label="Бизнес должен вам" icon={<LuHandCoins size={15} />} value={l.debt} format={money} hint="Долг по авансам" />
        <Stat label="Начислено прибыли" icon={<LuCoins size={15} />} value={l.accrued} format={money} hint={`Получено: ${money(l.paid)}`} />
        <Stat hl label="К выплате" icon={<LuWallet size={15} />} value={l.unpaid} format={money} tone="pos" hint="Начислено, но ещё не выплачено" />
      </div>
      <Card title="История операций" np>
        {txs.length === 0 ? <Empty title="Операций пока нет" /> : <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Операция</th><th>Описание</th><th className="r">Сумма</th></tr></thead><tbody>{txs.map((t) => (
          <tr key={t.id}><td className="nowrap">{formatDate(t.date)}</td><td><Chip tone={plus.includes(t.type) ? 'green' : 'amber'}>{TX_LABELS[t.type]}</Chip></td><td className="muted">{t.description ?? t.category ?? ''}</td><td className="r num"><b>{money(t.amount)}</b></td></tr>))}</tbody></table></div>}
      </Card>
    </>
  );
}

function Customer() {
  const d = useData();
  const money = useMoney();
  const [res, setRes] = useState<Awaited<ReturnType<typeof fetchMyOrders>> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetchMyOrders().then(setRes).catch((e) => setErr(e.message)); const t = setInterval(() => fetchMyOrders().then(setRes).catch(() => undefined), 20000); return () => clearInterval(t); }, []);
  if (err) return <Alert tone="red">{err}</Alert>;
  if (!res) return <div className="muted">Загрузка…</div>;
  const orders = res.orders as (Pick<Order, 'id' | 'number' | 'title' | 'description' | 'qty' | 'size' | 'custom' | 'unitPrice' | 'createdAt' | 'dueDate'> & { status: ProductionStatus })[];
  const rows = orders.map((o) => ({ o, p: orderPayments(o, d.transactions) }));
  const total = rows.filter((r) => r.o.status !== 'cancelled').reduce((a, r) => a + r.p.total, 0);
  const paid = rows.reduce((a, r) => a + r.p.net, 0);
  return (
    <>
      <div className="page-head"><div><h1>Мои заказы</h1><p className="row" style={{ gap: 6 }}><LuUserRound size={14} />{res.client?.name ?? ''}</p></div></div>
      <div className="grid g3 mb">
        <Stat label="Заказов" value={orders.length} format={String} />
        <Stat label="Общая сумма" value={total} format={money} />
        <Stat hl label="Оплачено" value={paid} format={money} hint={total - paid > 0 ? `Осталось оплатить: ${money(total - paid)}` : 'Всё оплачено'} />
      </div>
      {rows.length === 0 ? <Card><Empty title="Заказов пока нет" /></Card> : (
        <div className="grid g2">{rows.map(({ o, p }) => (
          <Card key={o.id}>
            <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', marginBottom: 8 }}><div><h3 style={{ fontSize: 17 }}>{o.number} · {o.title}</h3><div className="small muted">{formatDate(o.createdAt)} · {o.qty} шт.{o.size ? ` · ${o.size}` : ''}</div></div><b className="num nowrap">{money(p.total)}</b></div>
            {o.custom && <div className="small muted mb">{o.custom}</div>}
            <div className="row"><StatusChip tone={PROD_TONE[o.status]}>{PRODUCTION_LABELS[o.status]}</StatusChip><StatusChip tone={PAY_TONE[p.status]}>{PAYMENT_LABELS[p.status]}</StatusChip></div>
            <div className="kv small" style={{ marginTop: 12 }}><span className="k">Оплачено</span><span className="v">{money(p.net)}</span><span className="k">Осталось</span><span className="v">{money(p.left)}</span><span className="k">Срок готовности</span><span className="v">{formatDate(o.dueDate)}</span></div>
          </Card>))}</div>
      )}
    </>
  );
}
