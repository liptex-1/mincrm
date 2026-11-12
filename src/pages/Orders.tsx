import { useEffect, useMemo, useState } from 'react';
import { LuCopy, LuEye, LuPencil, LuPlus, LuShoppingBag, LuTrash2, LuWand, LuX } from 'react-icons/lu';
import { computeOrder, orderPayments } from '../domain/finance';
import { formatDate, todayISO } from '../domain/money';
import { autoUnitCost, planCopyOrder, planDeleteOrder, planSaveOrder, planSaveTx, type OrderInput } from '../domain/ops';
import { PAYMENT_LABELS, PRODUCTION_LABELS, type Order, type PaymentStatus, type ProductionStatus } from '../domain/types';
import { useData } from '../store/store';
import { MoneyInput, NumInput, PAY_TONE, PROD_TONE, StatusChip, useMoney } from '../ui/common';
import { Alert, Btn, Card, Chip, Empty, Field, Input, Modal, RowMenu, SearchBox, Select, Textarea, useSort, useUi } from '../ui/kit';
import { go, useRoute } from '../ui/router';

const STATUSES = Object.keys(PRODUCTION_LABELS) as ProductionStatus[];

export default function Orders() {
  const d = useData();
  const money = useMoney();
  const { confirm, run } = useUi();
  const { param } = useRoute();
  const [q, setQ] = useState('');
  const [ps, setPs] = useState<ProductionStatus | ''>('');
  const [pay, setPay] = useState<PaymentStatus | ''>('');
  const [edit, setEdit] = useState<Partial<OrderInput> & { id?: string } | null>(null);
  const [view, setView] = useState<string | null>(param ?? null);
  useEffect(() => { if (param) setView(param); }, [param]);
  const client = (id: string) => d.clients.find((c) => c.id === id)?.name ?? '—';

  const rows = useMemo(() => d.orders.map((o) => ({ o, c: computeOrder(o), p: orderPayments(o, d.transactions), client: client(o.clientId) })).filter(({ o, p, client: cl }) => {
    if (ps && o.status !== ps) return false;
    if (pay && p.status !== pay) return false;
    const t = q.trim().toLowerCase();
    return !t || [o.number, o.title, cl, o.description, o.size, o.custom].some((x) => x?.toLowerCase().includes(t));
  }), [d.orders, d.transactions, d.clients, q, ps, pay]); // eslint-disable-line
  const { sorted, th } = useSort(rows, { number: (r) => r.o.number, client: (r) => r.client, total: (r) => r.c.total, profit: (r) => r.c.profit, date: (r) => r.o.createdAt, due: (r) => r.o.dueDate ?? '9999' }, { key: 'number', dir: -1 });

  const del = async (o: Order) => {
    const pays = d.transactions.filter((t) => t.orderId === o.id).length;
    if (await confirm({ title: 'Удалить заказ?', text: `${o.number} · ${o.title}. Материалы, списанные по заказу, вернутся на склад.${pays ? ` Вместе с заказом будут удалены его платежи и возвраты (${pays}) — выручка уменьшится.` : ''}`, ok: 'Удалить', danger: true })) run((s) => planDeleteOrder(s, o.id, pays > 0), 'Заказ удалён');
  };
  const copy = (o: Order) => run((s) => planCopyOrder(s, o.id), 'Заказ скопирован');

  return (
    <>
      <div className="page-head"><div><h1>Заказы</h1><p>{d.orders.length} всего · {d.orders.filter((o) => !['handed', 'cancelled'].includes(o.status)).length} в работе</p></div>
        <Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => (d.clients.length ? setEdit({}) : go('clients'))}>{d.clients.length ? 'Новый заказ' : 'Сначала добавьте клиента'}</Btn></div>
      <Card np>
        <div className="toolbar" style={{ padding: '16px 18px 0' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Номер, товар, клиент…" />
          <Select value={ps} onChange={(e) => setPs(e.target.value as ProductionStatus | '')}><option value="">Любой статус</option>{STATUSES.map((s) => <option key={s} value={s}>{PRODUCTION_LABELS[s]}</option>)}</Select>
          <Select value={pay} onChange={(e) => setPay(e.target.value as PaymentStatus | '')}><option value="">Любая оплата</option>{(Object.keys(PAYMENT_LABELS) as PaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_LABELS[s]}</option>)}</Select>
        </div>
        {sorted.length === 0 ? <Empty icon={<LuShoppingBag size={34} />} title={d.orders.length ? 'Ничего не найдено' : 'Заказов пока нет'} text={d.orders.length ? 'Измените фильтры.' : 'Создайте первый заказ — выручка появится после оплаты.'} /> : (
          <div className="table-wrap"><table>
            <thead><tr>{th('number', '№')}{th('client', 'Клиент')}<th>Товар</th>{th('total', 'Сумма', true)}{th('profit', 'Прибыль', true)}<th>Производство</th><th>Оплата</th>{th('due', 'Срок')}<th /></tr></thead>
            <tbody>{sorted.map(({ o, c, p, client: cl }) => (
              <tr key={o.id} className="click" onClick={() => setView(o.id)}>
                <td><b>{o.number}</b><div className="small muted">{formatDate(o.createdAt)}</div></td><td>{cl}</td>
                <td>{o.title}<div className="small muted">{o.qty} шт.{o.size ? ` · ${o.size}` : ''}</div></td>
                <td className="r num"><b>{money(c.total)}</b>{p.net > 0 && p.net < c.total && <div className="small muted">оплачено {money(p.net)}</div>}</td>
                <td className={`r num ${c.profit >= 0 ? 'pos' : 'neg'}`}>{money(c.profit)}</td>
                <td><StatusChip tone={PROD_TONE[o.status]}>{PRODUCTION_LABELS[o.status]}</StatusChip></td>
                <td><StatusChip tone={PAY_TONE[p.status]}>{PAYMENT_LABELS[p.status]}</StatusChip></td>
                <td className="nowrap muted">{formatDate(o.dueDate)}</td>
                <td className="r"><RowMenu items={[{ label: 'Просмотр', icon: <LuEye size={15} />, onClick: () => setView(o.id) }, { label: 'Редактировать', icon: <LuPencil size={15} />, onClick: () => setEdit(o) }, { label: 'Копировать', icon: <LuCopy size={15} />, onClick: () => copy(o) }, { sep: true, label: '', onClick: () => {} }, { label: 'Удалить', icon: <LuTrash2 size={15} />, danger: true, onClick: () => del(o) }]} /></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
      {edit && <OrderModal order={edit} onClose={() => setEdit(null)} />}
      {view && <OrderView id={view} onClose={() => { setView(null); if (param) go('orders'); }} onEdit={(o) => { setView(null); setEdit(o); }} />}
    </>
  );
}

export function OrderModal({ order, onClose }: { order: Partial<OrderInput> & { id?: string }; onClose: () => void }) {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const [f, setF] = useState<OrderInput>({ clientId: d.clients[0]?.id ?? '', title: 'NFC-визитка', qty: 1, unitPrice: 0, unitCost: 0, costMode: 'auto', extraCost: 0, status: 'new', materials: [], createdAt: todayISO(), ...order } as OrderInput);
  const set = <K extends keyof OrderInput>(k: K, v: OrderInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const auto = autoUnitCost(d, f.materials.filter((m) => m.materialId));
  const cost = f.costMode === 'auto' && f.materials.length ? auto : f.unitCost;
  const c = computeOrder({ qty: f.qty, unitPrice: f.unitPrice, unitCost: cost, extraCost: f.extraCost });
  const mats = d.materials.filter((m) => !m.archived);
  const willConsume = ['in_production', 'ready', 'handed'].includes(f.status);
  const save = async () => { if (await run((s) => planSaveOrder(s, { ...f, unitCost: cost }), 'Заказ сохранён')) onClose(); };
  return (
    <Modal title={f.id ? 'Редактировать заказ' : 'Новый заказ'} size="lg" onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить заказ</Btn></>}>
      <div className="form-grid">
        <Field label="Клиент"><Select value={f.clientId} onChange={(e) => set('clientId', e.target.value)}>{d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Название товара"><Input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Описание" full><Textarea style={{ minHeight: 56 }} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field>
        <Field label="Количество, шт."><NumInput value={f.qty} min={1} onChange={(n) => set('qty', Math.round(n))} /></Field>
        <Field label="Размер изделия"><Input value={f.size ?? ''} onChange={(e) => set('size', e.target.value)} placeholder="85×55 мм" /></Field>
        <Field label="Индивидуальные характеристики" full><Input value={f.custom ?? ''} onChange={(e) => set('custom', e.target.value)} placeholder="Цвет, гравировка, макет…" /></Field>
        <Field label="Цена продажи за единицу"><MoneyInput value={f.unitPrice} onChange={(v) => set('unitPrice', v)} /></Field>
        <Field label="Дополнительные расходы по заказу"><MoneyInput value={f.extraCost} onChange={(v) => set('extraCost', v)} /></Field>
        <Field label="Статус производства"><Select value={f.status} onChange={(e) => set('status', e.target.value as ProductionStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{PRODUCTION_LABELS[s]}</option>)}</Select></Field>
        <div className="form-grid" style={{ gridColumn: '1 / -1' }}>
          <Field label="Дата создания"><Input type="date" value={f.createdAt ?? ''} onChange={(e) => set('createdAt', e.target.value)} /></Field>
          <Field label="Плановая дата завершения"><Input type="date" value={f.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || undefined)} /></Field>
        </div>

        <div className="full card flat" style={{ padding: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <b>Себестоимость и материалы</b>
            <div className="seg"><button className={f.costMode === 'auto' ? 'on' : ''} onClick={() => set('costMode', 'auto')}>По материалам</button><button className={f.costMode === 'manual' ? 'on' : ''} onClick={() => set('costMode', 'manual')}>Вручную</button></div>
          </div>
          {f.materials.map((m, i) => (
            <div className="mat-line" key={i}>
              <Select value={m.materialId} onChange={(e) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, materialId: e.target.value } : x)))}><option value="">Материал…</option>{mats.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit}) · на складе {x.qty}</option>)}</Select>
              <NumInput value={m.qtyPerUnit} step={0.1} onChange={(n) => set('materials', f.materials.map((x, j) => (j === i ? { ...x, qtyPerUnit: n } : x)))} title="Расход на 1 изделие" />
              <Btn kind="ghost icon" onClick={() => set('materials', f.materials.filter((_, j) => j !== i))}><LuX size={16} /></Btn>
            </div>
          ))}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <Btn size="sm" icon={<LuPlus size={14} />} onClick={() => set('materials', [...f.materials, { materialId: '', qtyPerUnit: 1 }])} disabled={!mats.length}>{mats.length ? 'Добавить материал' : 'Нет материалов на складе'}</Btn>
            <span className="small muted">Правое поле — расход на 1 изделие</span>
          </div>
          {f.costMode === 'manual' || !f.materials.length ? (
            <div style={{ marginTop: 12, maxWidth: 260 }}><Field label="Себестоимость за единицу"><MoneyInput value={f.unitCost} onChange={(v) => set('unitCost', v)} /></Field></div>
          ) : <div className="small" style={{ marginTop: 12 }}><LuWand style={{ verticalAlign: -2 }} /> Себестоимость за единицу рассчитана автоматически: <b>{money(auto)}</b></div>}
          {willConsume && f.materials.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>При сохранении со статусом «{PRODUCTION_LABELS[f.status]}» материалы будут списаны со склада один раз; повторные сохранения скорректируют только разницу.</div>}
        </div>
        <div className="full kv card flat" style={{ padding: 16 }}>
          <span className="k">Общая стоимость (выручка по заказу)</span><span className="v">{money(c.total)}</span>
          <span className="k">Общая себестоимость</span><span className="v">{money(c.cost)}</span>
          <span className="k">Валовая прибыль</span><span className="v">{money(c.grossProfit)}</span>
          <span className="k">Дополнительные расходы</span><span className="v">−{money(c.extra)}</span>
          <span className="sep" /><span className="k"><b>Прибыль по заказу</b></span><span className={`v ${c.profit >= 0 ? 'pos' : 'neg'}`}>{money(c.profit)}</span>
        </div>
      </div>
    </Modal>
  );
}

function OrderView({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (o: Order) => void }) {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const [payOpen, setPayOpen] = useState<'income' | 'refund' | null>(null);
  const o = d.orders.find((x) => x.id === id);
  if (!o) return null;
  const c = computeOrder(o), p = orderPayments(o, d.transactions);
  const client = d.clients.find((x) => x.id === o.clientId);
  const payments = d.transactions.filter((t) => t.orderId === id && !t.voided).sort((a, b) => a.date.localeCompare(b.date));
  const setStatus = (s: ProductionStatus) => run((st) => { const cur = st.orders.find((x) => x.id === id)!; const { id: _i, number: _n, consumed: _c, updatedAt: _u, ...rest } = cur; return planSaveOrder(st, { ...rest, id, status: s }); }, 'Статус обновлён');
  return (
    <Modal title={`${o.number} · ${o.title}`} size="lg" onClose={onClose} foot={<Btn icon={<LuPencil size={15} />} onClick={() => onEdit(o)}>Редактировать</Btn>}>
      <div className="row mb" style={{ justifyContent: 'space-between' }}>
        <div className="row"><StatusChip tone={PROD_TONE[o.status]}>{PRODUCTION_LABELS[o.status]}</StatusChip><StatusChip tone={PAY_TONE[p.status]}>{PAYMENT_LABELS[p.status]}</StatusChip></div>
        <Select style={{ width: 230 }} value={o.status} onChange={(e) => setStatus(e.target.value as ProductionStatus)}>{STATUSES.map((s) => <option key={s} value={s}>{PRODUCTION_LABELS[s]}</option>)}</Select>
      </div>
      <div className="grid g2 mb">
        <div className="card flat kv">
          <span className="k">Клиент</span><span className="v">{client?.name ?? '—'}</span>
          <span className="k">Количество</span><span className="v">{o.qty} шт.</span>
          <span className="k">Размер</span><span className="v">{o.size || '—'}</span>
          <span className="k">Создан</span><span className="v">{formatDate(o.createdAt)}</span>
          <span className="k">Срок</span><span className="v">{formatDate(o.dueDate)}</span>
          {o.custom && <><span className="k">Характеристики</span><span className="v">{o.custom}</span></>}
        </div>
        <div className="card flat kv">
          <span className="k">Цена за единицу</span><span className="v">{money(o.unitPrice)}</span>
          <span className="k">Общая стоимость</span><span className="v">{money(c.total)}</span>
          <span className="k">Себестоимость ({money(o.unitCost)}/шт.)</span><span className="v">{money(c.cost)}</span>
          <span className="k">Валовая прибыль</span><span className="v">{money(c.grossProfit)}</span>
          <span className="k">Доп. расходы</span><span className="v">−{money(c.extra)}</span>
          <span className="sep" /><span className="k"><b>Прибыль</b></span><span className={`v ${c.profit >= 0 ? 'pos' : 'neg'}`}>{money(c.profit)}</span>
        </div>
      </div>
      {o.description && <p className="muted" style={{ marginTop: 0 }}>{o.description}</p>}
      {o.materials.length > 0 && <div className="mb small"><b>Материалы на 1 изделие: </b>{o.materials.map((m) => { const mm = d.materials.find((x) => x.id === m.materialId); return mm ? `${mm.name} — ${m.qtyPerUnit} ${mm.unit}` : ''; }).filter(Boolean).join(' · ')}{o.consumed.length > 0 ? <Chip tone="green">списано со склада</Chip> : <Chip>ещё не списано</Chip>}</div>}

      <div className="row" style={{ justifyContent: 'space-between', margin: '8px 0 6px' }}>
        <h3>Оплата: {money(p.net)} из {money(p.total)}</h3>
        <div className="row"><Btn size="sm" kind="primary" disabled={p.left <= 0} onClick={() => setPayOpen('income')}>Принять платёж</Btn><Btn size="sm" disabled={p.net <= 0} onClick={() => setPayOpen('refund')}>Вернуть деньги</Btn></div>
      </div>
      {o.status === 'cancelled' && p.net > 0 && <Alert>Заказ отменён, но по нему оплачено {money(p.net)}. Оформите возврат клиенту.</Alert>}
      {payments.length === 0 ? <div className="muted small">Платежей пока нет. Пока заказ не оплачен, выручка не увеличивается.</div> : (
        <div className="list">{payments.map((t) => <div key={t.id}><div className="grow"><div className="t">{t.type === 'refund' ? 'Возврат клиенту' : 'Платёж'}{t.description ? ` · ${t.description}` : ''}</div><div className="small muted">{formatDate(t.date)}</div></div><b className={`num ${t.type === 'refund' ? 'neg' : 'pos'}`}>{t.type === 'refund' ? '−' : '+'}{money(t.amount)}</b></div>)}</div>
      )}
      {payOpen && <PayModal order={o} kind={payOpen} onClose={() => setPayOpen(null)} />}
    </Modal>
  );
}

function PayModal({ order, kind, onClose }: { order: Order; kind: 'income' | 'refund'; onClose: () => void }) {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const p = orderPayments(order, d.transactions);
  const [amount, setAmount] = useState(kind === 'income' ? p.left : p.net);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const save = async () => { if (await run((s) => planSaveTx(s, { type: kind, amount, date, orderId: order.id, category: kind === 'income' ? 'Оплата заказа' : 'Возврат', description: note || (kind === 'income' ? `Оплата ${order.number}` : `Возврат по ${order.number}`) }), kind === 'income' ? 'Платёж принят' : 'Возврат оформлен')) onClose(); };
  return (
    <Modal title={kind === 'income' ? 'Принять платёж' : 'Вернуть деньги клиенту'} size="sm" onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Провести</Btn></>}>
      <div className="col">
        <div className="small muted">{kind === 'income' ? `Осталось оплатить: ${money(p.left)}` : `Можно вернуть: ${money(p.net)}`}</div>
        <Field label="Сумма"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Комментарий"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
