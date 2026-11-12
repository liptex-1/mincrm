import { useMemo, useState } from 'react';
import { LuEye, LuMail, LuPencil, LuPhone, LuPlus, LuSend, LuTrash2, LuUsers } from 'react-icons/lu';
import { computeOrder, orderPayments } from '../domain/finance';
import { formatDate } from '../domain/money';
import { planDeleteClient, planSaveClient } from '../domain/ops';
import { PAYMENT_LABELS, PRODUCTION_LABELS, type Client } from '../domain/types';
import { useData } from '../store/store';
import { PAY_TONE, PROD_TONE, StatusChip, useMoney } from '../ui/common';
import { Avatar, Btn, Card, Empty, Field, Input, Modal, RowMenu, SearchBox, Select, Textarea, useSort, useUi } from '../ui/kit';
import { go } from '../ui/router';
import { OrderModal } from './Orders';

export function useClientStats() {
  const d = useData();
  return useMemo(() => {
    const m = new Map<string, { orders: number; total: number; last?: string }>();
    for (const c of d.clients) m.set(c.id, { orders: 0, total: 0 });
    for (const o of d.orders) {
      if (o.status === 'cancelled') continue;
      const e = m.get(o.clientId); if (!e) continue;
      e.orders++; e.total += computeOrder(o).total; if (!e.last || o.createdAt > e.last) e.last = o.createdAt;
    }
    return m;
  }, [d.clients, d.orders]);
}

export default function Clients() {
  const d = useData();
  const money = useMoney();
  const { confirm, run } = useUi();
  const stats = useClientStats();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'with' | 'without'>('all');
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [view, setView] = useState<string | null>(null);

  const rows = useMemo(() => d.clients.filter((c) => {
    const s = stats.get(c.id)!;
    if (filter === 'with' && !s.orders) return false;
    if (filter === 'without' && s.orders) return false;
    const t = q.trim().toLowerCase();
    return !t || [c.name, c.phone, c.telegram, c.email, c.comment].some((x) => x?.toLowerCase().includes(t));
  }), [d.clients, q, filter, stats]);
  const { sorted, th } = useSort(rows, { name: (c) => c.name, orders: (c) => stats.get(c.id)!.orders, total: (c) => stats.get(c.id)!.total, date: (c) => c.createdAt }, { key: 'date', dir: -1 });

  const del = async (c: Client) => {
    const n = d.orders.filter((o) => o.clientId === c.id).length;
    if (await confirm({ title: 'Удалить клиента?', text: n ? `«${c.name}» и его заказы (${n}) вместе с платежами будут удалены без возможности восстановления. Материалы вернутся на склад.` : `«${c.name}» будет удалён без возможности восстановления.`, ok: 'Удалить', danger: true })) run((s) => planDeleteClient(s, c.id, n > 0), 'Клиент удалён');
  };
  return (
    <>
      <div className="page-head"><div><h1>Клиенты</h1><p>{d.clients.length} в базе</p></div><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setEdit({})}>Новый клиент</Btn></div>
      <Card np>
        <div className="toolbar" style={{ padding: '16px 18px 0' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Имя, телефон, Telegram, почта…" />
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">Все клиенты</option><option value="with">С заказами</option><option value="without">Без заказов</option></Select>
        </div>
        {sorted.length === 0 ? <Empty icon={<LuUsers size={34} />} title={d.clients.length ? 'Никого не найдено' : 'Клиентов пока нет'} text={d.clients.length ? 'Измените поиск или фильтр.' : 'Добавьте первого клиента — он появится в заказах.'} action={!d.clients.length && <Btn kind="primary" onClick={() => setEdit({})}>Добавить клиента</Btn>} /> : (
          <div className="table-wrap"><table>
            <thead><tr>{th('name', 'Клиент')}<th>Контакты</th>{th('orders', 'Заказов', true)}{th('total', 'Сумма покупок', true)}{th('date', 'Добавлен')}<th /></tr></thead>
            <tbody>{sorted.map((c) => { const s = stats.get(c.id)!; return (
              <tr key={c.id} className="click" onClick={() => setView(c.id)}>
                <td><div className="row" style={{ flexWrap: 'nowrap' }}><Avatar name={c.name} /><div><b>{c.name}</b>{c.comment && <div className="small muted" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.comment}</div>}</div></div></td>
                <td className="small">{c.phone && <div>{c.phone}</div>}{c.telegram && <div className="muted">{c.telegram}</div>}{c.email && <div className="muted">{c.email}</div>}{!c.phone && !c.telegram && !c.email && <span className="muted">—</span>}</td>
                <td className="r num">{s.orders}</td><td className="r num"><b>{money(s.total)}</b></td><td className="muted nowrap">{formatDate(c.createdAt)}</td>
                <td className="r"><RowMenu items={[{ label: 'Открыть карточку', icon: <LuEye size={15} />, onClick: () => setView(c.id) }, { label: 'Редактировать', icon: <LuPencil size={15} />, onClick: () => setEdit(c) }, { sep: true, label: '', onClick: () => {} }, { label: 'Удалить', icon: <LuTrash2 size={15} />, danger: true, onClick: () => del(c) }]} /></td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </Card>
      {edit && <ClientModal client={edit} onClose={() => setEdit(null)} />}
      {view && <ClientCard id={view} onClose={() => setView(null)} onEdit={(c) => { setView(null); setEdit(c); }} />}
    </>
  );
}

function ClientModal({ client, onClose, onSaved }: { client: Partial<Client>; onClose: () => void; onSaved?: (id: string) => void }) {
  const { run } = useUi();
  const [f, setF] = useState<Partial<Client>>(client);
  const [err, setErr] = useState('');
  const save = async () => {
    if (!f.name?.trim()) { setErr('Укажите имя или название компании'); return; }
    if (await run((s) => planSaveClient(s, { ...f, name: f.name! }), 'Клиент сохранён')) onClose();
  };
  const set = (k: keyof Client, v: string) => setF((p) => ({ ...p, [k]: v }));
  void onSaved;
  return (
    <Modal title={client.id ? 'Редактировать клиента' : 'Новый клиент'} onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить</Btn></>}>
      <div className="form-grid">
        <Field label="Имя или компания" full error={err}><Input autoFocus value={f.name ?? ''} onChange={(e) => { set('name', e.target.value); setErr(''); }} /></Field>
        <Field label="Телефон"><Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+7 900 000-00-00" /></Field>
        <Field label="Telegram"><Input value={f.telegram ?? ''} onChange={(e) => set('telegram', e.target.value)} placeholder="@username" /></Field>
        <Field label="Электронная почта" full><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Комментарий" full><Textarea value={f.comment ?? ''} onChange={(e) => set('comment', e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function ClientCard({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: Client) => void }) {
  const d = useData();
  const money = useMoney();
  const [newOrder, setNewOrder] = useState(false);
  const c = d.clients.find((x) => x.id === id);
  if (!c) return null;
  const orders = d.orders.filter((o) => o.clientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const real = orders.filter((o) => o.status !== 'cancelled');
  const total = real.reduce((a, o) => a + computeOrder(o).total, 0);
  const paid = orders.reduce((a, o) => a + orderPayments(o, d.transactions).net, 0);
  return (
    <Modal title="Карточка клиента" size="lg" onClose={onClose} foot={<><Btn onClick={() => onEdit(c)} icon={<LuPencil size={15} />}>Редактировать</Btn><Btn kind="primary" icon={<LuPlus size={15} />} onClick={() => setNewOrder(true)}>Новый заказ</Btn></>}>
      <div className="row" style={{ gap: 16, marginBottom: 18, flexWrap: 'nowrap' }}>
        <Avatar name={c.name} large />
        <div style={{ minWidth: 0 }}><h2 style={{ fontSize: 21 }}>{c.name}</h2><div className="small muted">Клиент с {formatDate(c.createdAt)}</div>
          <div className="row small" style={{ marginTop: 6, gap: 14 }}>{c.phone && <span className="row" style={{ gap: 5 }}><LuPhone size={13} />{c.phone}</span>}{c.telegram && <span className="row" style={{ gap: 5 }}><LuSend size={13} />{c.telegram}</span>}{c.email && <span className="row" style={{ gap: 5 }}><LuMail size={13} />{c.email}</span>}</div></div>
      </div>
      {c.comment && <div className="alert green" style={{ marginBottom: 16 }}><div>{c.comment}</div></div>}
      <div className="grid g3 mb">
        <div className="card flat"><div className="small muted">Заказов</div><div style={{ fontSize: 24, fontWeight: 700 }}>{real.length}</div></div>
        <div className="card flat"><div className="small muted">Сумма покупок</div><div style={{ fontSize: 24, fontWeight: 700 }}>{money(total)}</div></div>
        <div className="card flat"><div className="small muted">Фактически оплачено</div><div className="pos" style={{ fontSize: 24, fontWeight: 700 }}>{money(paid)}</div></div>
      </div>
      <h3 style={{ marginBottom: 8 }}>История заказов</h3>
      {orders.length === 0 ? <Empty title="Заказов ещё не было" /> : <div className="table-wrap"><table><tbody>{orders.map((o) => { const p = orderPayments(o, d.transactions); return (
        <tr key={o.id} className="click" onClick={() => { onClose(); go('orders', o.id); }}>
          <td><b>{o.number}</b> · {o.title}<div className="small muted">{formatDate(o.createdAt)} · {o.qty} шт.</div></td>
          <td className="r num"><b>{money(computeOrder(o).total)}</b></td>
          <td className="r"><StatusChip tone={PROD_TONE[o.status]}>{PRODUCTION_LABELS[o.status]}</StatusChip> <StatusChip tone={PAY_TONE[p.status]}>{PAYMENT_LABELS[p.status]}</StatusChip></td>
        </tr>); })}</tbody></table></div>}
      {newOrder && <OrderModal order={{ clientId: id }} onClose={() => setNewOrder(false)} />}
    </Modal>
  );
}
export { ClientModal };
