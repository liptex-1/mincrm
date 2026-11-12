import { useState } from 'react';
import { LuBoxes, LuPackage, LuPencil, LuPlus, LuTrash2, LuTriangleAlert } from 'react-icons/lu';
import { computeOrder } from '../domain/finance';
import { formatDate, formatNumber, todayISO } from '../domain/money';
import { planDeleteMaterial, planDeletePurchase, planPurchase, planSaveMaterial, planSaveOrder, planUpdatePurchase } from '../domain/ops';
import { PRODUCTION_LABELS, type Material, type Order, type ProductionStatus, type Purchase } from '../domain/types';
import { useData } from '../store/store';
import { MoneyInput, NumInput, PROD_TONE, StatusChip, useMoney } from '../ui/common';
import { Alert, Btn, Card, Chip, Empty, Field, Input, Modal, Progress, RowMenu, Select, Tabs, useUi } from '../ui/kit';
import { go } from '../ui/router';

const FLOW: ProductionStatus[] = ['new', 'pending', 'in_production', 'ready'];
const NEXT: Partial<Record<ProductionStatus, ProductionStatus>> = { new: 'pending', pending: 'in_production', in_production: 'ready', ready: 'handed' };

export default function Production() {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const [tab, setTab] = useState<'queue' | 'stock' | 'history'>('queue');
  const [edit, setEdit] = useState<Partial<Material> | null>(null);
  const [buy, setBuy] = useState<string | null>(null);
  const [editPurchase, setEditPurchase] = useState<Purchase | null>(null);
  const { confirm } = useUi();
  const mats = d.materials.filter((m) => !m.archived);
  const low = mats.filter((m) => m.qty <= m.minQty);
  const stockValue = mats.reduce((a, m) => a + Math.round(Math.max(0, m.qty) * m.unitCost), 0);
  const client = (id: string) => d.clients.find((c) => c.id === id)?.name ?? '—';
  const advance = (o: Order, s: ProductionStatus) => run((st) => { const { id, number: _n, consumed: _c, updatedAt: _u, ...rest } = o; return planSaveOrder(st, { ...rest, id, status: s }); }, `${o.number}: ${PRODUCTION_LABELS[s]}`);

  return (
    <>
      <div className="page-head"><div><h1>Производство</h1><p>Очередь заказов и склад материалов</p></div>
        <div className="row"><Btn icon={<LuPackage size={16} />} onClick={() => setBuy(mats[0]?.id ?? '')} disabled={!mats.length}>Закупка</Btn><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setEdit({})}>Новый материал</Btn></div></div>
      {low.length > 0 && <div className="mb"><Alert><b>Низкий остаток:</b> {low.map((m) => `${m.name} (${formatNumber(m.qty, 1)} ${m.unit})`).join(', ')}. Пора закупить.</Alert></div>}
      <div className="grid g3 mb">
        <div className="card"><div className="small muted">Позиций на складе</div><div style={{ fontSize: 26, fontWeight: 700 }}>{mats.length}</div></div>
        <div className="card"><div className="small muted">Стоимость остатков</div><div style={{ fontSize: 26, fontWeight: 700 }}>{money(stockValue)}</div></div>
        <div className="card"><div className="small muted">Заказов в работе</div><div style={{ fontSize: 26, fontWeight: 700 }}>{d.orders.filter((o) => ['pending', 'in_production', 'new'].includes(o.status)).length}</div></div>
      </div>
      <Tabs value={tab} onChange={setTab} options={[['queue', 'Очередь заказов'], ['stock', 'Склад'], ['history', 'История закупок']]} />
      <div className="tab-body" key={tab}>
        {tab === 'queue' && (
          <div className="grid g4">
            {FLOW.map((st) => {
              const list = d.orders.filter((o) => o.status === st);
              return (
                <Card key={st} title={<span className="row" style={{ gap: 8 }}>{PRODUCTION_LABELS[st]} <Chip tone={PROD_TONE[st]}>{list.length}</Chip></span>}>
                  {list.length === 0 ? <div className="muted small">Пусто</div> : <div className="col">{list.map((o) => (
                    <div key={o.id} className="card flat" style={{ padding: 12, cursor: 'pointer' }} onClick={() => go('orders', o.id)}>
                      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><b>{o.number}</b><span className="small muted">{formatDate(o.dueDate)}</span></div>
                      <div>{o.title} · {o.qty} шт.</div><div className="small muted">{client(o.clientId)} · {money(computeOrder(o).total)}</div>
                      <div className="row" style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>{NEXT[st] && <Btn size="sm" onClick={() => advance(o, NEXT[st]!)}>→ {PRODUCTION_LABELS[NEXT[st]!]}</Btn>}</div>
                    </div>))}</div>}
                </Card>
              );
            })}
          </div>
        )}
        {tab === 'stock' && (
          <Card np>
            {mats.length === 0 ? <Empty icon={<LuBoxes size={34} />} title="Склад пуст" text="Добавьте материалы: NFC-чипы, заготовки, смолу, упаковку." action={<Btn kind="primary" onClick={() => setEdit({})}>Добавить материал</Btn>} /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Материал</th><th className="r">Остаток</th><th style={{ width: 160 }}>Уровень</th><th className="r">Цена закупки</th><th className="r">Стоимость</th><th className="r">Мин.</th><th /></tr></thead>
                <tbody>{mats.map((m) => { const isLow = m.qty <= m.minQty; const lvl = m.minQty > 0 ? (m.qty / (m.minQty * 3)) * 100 : 100; return (
                  <tr key={m.id}>
                    <td><b>{m.name}</b> {isLow && <Chip tone="amber"><LuTriangleAlert size={12} /> мало</Chip>}</td>
                    <td className="r num"><b>{formatNumber(m.qty, 1)}</b> {m.unit}</td>
                    <td><Progress value={lvl} tone={m.qty <= 0 ? 'red' : isLow ? 'warn' : ''} /></td>
                    <td className="r num">{money(m.unitCost)} / {m.unit}</td><td className="r num">{money(Math.round(Math.max(0, m.qty) * m.unitCost))}</td><td className="r num muted">{m.minQty} {m.unit}</td>
                    <td className="r nowrap"><Btn size="sm" onClick={() => setBuy(m.id)}>Закупить</Btn> <Btn size="sm" kind="ghost icon" onClick={() => setEdit(m)} aria-label="Изменить"><LuPencil size={15} /></Btn></td>
                  </tr>); })}</tbody>
              </table></div>
            )}
          </Card>
        )}
        {tab === 'history' && (
          <Card np>
            {d.purchases.length === 0 ? <Empty title="Закупок пока не было" /> : <div className="table-wrap"><table>
              <thead><tr><th>Дата</th><th>Материал</th><th className="r">Количество</th><th className="r">Цена</th><th className="r">Итого</th><th>Оплатил</th><th /></tr></thead>
              <tbody>{[...d.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((p) => { const m = d.materials.find((x) => x.id === p.materialId); const tx = d.transactions.find((t) => t.id === p.txId); const who = tx?.partnerId ? d.partners.find((x) => x.id === tx.partnerId)?.name : null; return (
                <tr key={p.id}><td className="nowrap">{formatDate(p.date)}</td><td><b>{m?.name ?? '—'}</b>{p.note && <div className="small muted">{p.note}</div>}</td><td className="r num">{p.qty} {m?.unit}</td><td className="r num">{money(p.unitCost)}</td><td className="r num"><b>{money(p.total)}</b></td><td>{who ? <Chip tone="blue">{who} (аванс)</Chip> : <Chip>Бизнес</Chip>}</td>
                <td className="r"><RowMenu items={[{ label: 'Изменить', icon: <LuPencil size={15} />, onClick: () => setEditPurchase(p) }, { sep: true, label: '', onClick: () => {} }, { label: 'Удалить', icon: <LuTrash2 size={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Удалить поставку?', text: `${m?.name ?? ''}: ${p.qty} ${m?.unit ?? ''} за ${money(p.total)}. Остаток на складе уменьшится, связанный расход и долг партнёру будут удалены.`, ok: 'Удалить', danger: true })) run((s) => planDeletePurchase(s, p.id), 'Поставка удалена'); } }]} /></td></tr>); })}</tbody>
            </table></div>}
          </Card>
        )}
      </div>
      {edit && <MaterialModal material={edit} onClose={() => setEdit(null)} />}
      {buy !== null && <PurchaseModal materialId={buy} onClose={() => setBuy(null)} />}
      {editPurchase && <PurchaseModal materialId={editPurchase.materialId} purchase={editPurchase} onClose={() => setEditPurchase(null)} />}
    </>
  );
}

function MaterialModal({ material, onClose }: { material: Partial<Material>; onClose: () => void }) {
  const { run, confirm } = useUi();
  const [f, setF] = useState<Partial<Material>>({ unit: 'шт', minQty: 0, ...material });
  const save = async () => { if (await run((s) => planSaveMaterial(s, { ...f, name: f.name ?? '', unit: f.unit || 'шт' }), 'Материал сохранён')) onClose(); };
  const d = useData();
  const archive = async () => { if (await confirm({ title: 'Убрать материал со склада?', text: 'Он будет скрыт из списка, история закупок сохранится.', ok: 'Убрать', danger: true })) { if (await run((s) => planSaveMaterial(s, { ...f, archived: true, name: f.name!, unit: f.unit! }), 'Материал убран')) onClose(); } };
  const purge = async () => {
    const n = d.purchases.filter((p) => p.materialId === material.id).length;
    if (!(await confirm({ title: 'Удалить материал полностью?', text: n ? `Будут удалены материал и ${n} поставк(и). Расходы по ним останутся в финансах — их можно удалить отдельно.` : 'Материал будет удалён.', ok: 'Удалить', danger: true }))) return;
    const withExp = n > 0 && (await confirm({ title: 'Удалить и расходы по поставкам?', text: 'Расходы и долги партнёрам по этим поставкам тоже будут удалены.', ok: 'Удалить расходы', danger: true }));
    if (await run((s) => planDeleteMaterial(s, material.id!, withExp), 'Материал удалён')) onClose();
  };
  return (
    <Modal title={material.id ? 'Материал' : 'Новый материал'} onClose={onClose} foot={<>{material.id && <><Btn kind="danger" onClick={purge}>Удалить</Btn><Btn onClick={archive}>В архив</Btn></>}<Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить</Btn></>}>
      <div className="form-grid">
        <Field label="Название" full><Input autoFocus value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="NFC-чипы NTAG215" /></Field>
        <Field label="Единица измерения"><Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{['шт', 'мл', 'л', 'г', 'кг', 'м', 'уп'].map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Минимальный остаток"><NumInput value={f.minQty ?? 0} onChange={(n) => setF({ ...f, minQty: n })} /></Field>
        <Field label={material.id ? 'Остаток на складе (корректировка)' : 'Начальный остаток'}><NumInput value={f.qty ?? 0} onChange={(n) => setF({ ...f, qty: n })} /></Field>
        <Field label="Цена за единицу"><MoneyInput value={f.unitCost ?? 0} onChange={(v) => setF({ ...f, unitCost: v })} /></Field>
        <div className="full small muted">Остаток и цену можно поправить вручную — изменение попадёт в журнал, финансовая операция не создаётся. Для оплаченной поставки используйте «Закупка».</div>
      </div>
    </Modal>
  );
}

function PurchaseModal({ materialId, purchase, onClose }: { materialId: string; purchase?: Purchase; onClose: () => void }) {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const tx = purchase ? d.transactions.find((t) => t.id === purchase.txId) : undefined;
  const [f, setF] = useState(purchase ? { materialId, date: purchase.date, qty: purchase.qty, unitCost: purchase.unitCost, payer: tx?.partnerId ?? 'business', note: purchase.note ?? '' } : { materialId, date: todayISO(), qty: 0, unitCost: 0, payer: 'business', note: '' });
  const m = d.materials.find((x) => x.id === f.materialId);
  const save = async () => { if (await run((s) => (purchase ? planUpdatePurchase(s, purchase.id, f) : planPurchase(s, f)), purchase ? 'Поставка изменена' : 'Закупка проведена')) onClose(); };
  return (
    <Modal title={purchase ? 'Изменить поставку' : 'Закупка материала'} onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>{purchase ? 'Сохранить' : 'Провести закупку'}</Btn></>}>
      <div className="form-grid">
        <Field label="Материал" full><Select value={f.materialId} onChange={(e) => setF({ ...f, materialId: e.target.value })}>{d.materials.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label={`Количество${m ? `, ${m.unit}` : ''}`}><NumInput value={f.qty} onChange={(n) => setF({ ...f, qty: n })} autoFocus /></Field>
        <Field label="Цена за единицу"><MoneyInput value={f.unitCost} onChange={(v) => setF({ ...f, unitCost: v })} /></Field>
        <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Кто оплатил"><Select value={f.payer} onChange={(e) => setF({ ...f, payer: e.target.value })}><option value="business">Деньги бизнеса</option>{d.partners.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name} — из своих (аванс)</option>)}</Select></Field>
        <Field label="Комментарий" full><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <div className="full alert green"><div>Итого: <b>{money(Math.round(f.qty * f.unitCost))}</b>. {f.payer === 'business' ? 'Будет записан расход бизнеса.' : 'Будет записан расход бизнеса и долг бизнеса перед партнёром. В капитал эта сумма не входит.'} Одна закупка — одна финансовая запись.</div></div>
      </div>
    </Modal>
  );
}
