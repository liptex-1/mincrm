import { useMemo, useState } from 'react';
import { LuArchive, LuArchiveRestore, LuEye, LuHandshake, LuPencil, LuPlus, LuTrash2 } from 'react-icons/lu';
import { partnerLedger, sharesFor, totalCapital } from '../domain/finance';
import { formatDate, todayISO } from '../domain/money';
import { planDeletePartner, planSavePartner } from '../domain/ops';
import { TX_LABELS, type Partner, type TxType } from '../domain/types';
import { useData } from '../store/store';
import { pct, useMoney } from '../ui/common';
import { Avatar, Btn, Card, Chip, Empty, Field, Input, Modal, RowMenu, Textarea, useUi } from '../ui/kit';
import { TxModal } from '../ui/TxModal';
import { Donut } from '../ui/charts';

export default function Partners() {
  const d = useData();
  const money = useMoney();
  const { run, confirm } = useUi();
  const [showArch, setShowArch] = useState(false);
  const [edit, setEdit] = useState<Partial<Partner> | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [tx, setTx] = useState<{ type: TxType; partnerId: string } | null>(null);
  const active = d.partners.filter((p) => !p.archived);
  const list = showArch ? d.partners : active;
  const cap = totalCapital(d.partners, d.transactions);
  const profitShares = useMemo(() => sharesFor(d.settings.distributionMode, active, d.transactions, d.settings.fixedBps, {}), [d]); // eslint-disable-line
  const capShares = useMemo(() => sharesFor('capital', active, d.transactions, {}, {}), [d]); // eslint-disable-line

  return (
    <>
      <div className="page-head"><div><h1>Партнёры</h1><p>Вложения, авансы и доли участников бизнеса</p></div>
        <div className="row"><Btn onClick={() => setShowArch(!showArch)}>{showArch ? 'Скрыть архив' : 'Показать архивных'}</Btn><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setEdit({})}>Новый партнёр</Btn></div></div>
      {active.length === 0 ? <Card><Empty icon={<LuHandshake size={36} />} title="Партнёров пока нет" text="Добавьте участников бизнеса, чтобы вести вложения и распределять прибыль." action={<Btn kind="primary" onClick={() => setEdit({})}>Добавить партнёра</Btn>} /></Card> : (
        <div className="grid g-main mb">
          <Card title="Капитал бизнеса" action={<Chip tone="green">{money(cap)}</Chip>}>
            <Donut center="Капитал" format={money} items={active.map((p) => ({ label: p.name, value: Math.max(0, partnerLedger(p.id, d.transactions).capitalNet) }))} />
          </Card>
          <Card title="Как это считается">
            <div className="small muted col" style={{ gap: 8 }}>
              <div><b style={{ color: 'var(--text)' }}>Вклад в капитал</b> — деньги партнёра в общий капитал бизнеса. Не выручка и не прибыль.</div>
              <div><b style={{ color: 'var(--text)' }}>Личный аванс</b> — партнёр оплатил расход своими деньгами. Это расход бизнеса и <i>долг</i> бизнеса перед ним; в капитал не входит.</div>
              <div>Долг по авансам и начисленная прибыль учитываются отдельно и не суммируются.</div>
            </div>
          </Card>
        </div>
      )}
      <div className="grid g2">
        {list.map((p) => {
          const l = partnerLedger(p.id, d.transactions);
          return (
            <Card key={p.id} className={p.archived ? 'flat' : ''}>
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', marginBottom: 14 }}>
                <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}><Avatar name={p.name} large /><div><h3 style={{ fontSize: 18 }}>{p.name} {p.archived && <Chip>в архиве</Chip>}</h3><div className="small muted">С {formatDate(p.joinedAt)}</div></div></div>
                <RowMenu items={[{ label: 'История операций', icon: <LuEye size={15} />, onClick: () => setView(p.id) }, { label: 'Редактировать', icon: <LuPencil size={15} />, onClick: () => setEdit(p) }, { sep: true, label: '', onClick: () => {} }, p.archived ? { label: 'Вернуть из архива', icon: <LuArchiveRestore size={15} />, onClick: () => run((s) => planSavePartner(s, { ...p, archived: false }), 'Партнёр восстановлен') } : { label: 'В архив', icon: <LuArchive size={15} />, onClick: () => run((s) => planSavePartner(s, { ...p, archived: true }), 'Партнёр в архиве') }, { label: 'Удалить', icon: <LuTrash2 size={15} />, danger: true, onClick: async () => { const n = d.transactions.filter((t) => t.partnerId === p.id).length; if (await confirm({ title: 'Удалить партнёра?', text: n ? `«${p.name}» и все его операции (${n}): вложения, авансы, возвраты — будут удалены. Это изменит капитал и расходы бизнеса.` : `«${p.name}» будет удалён.`, ok: 'Удалить', danger: true })) run((s) => planDeletePartner(s, p.id, n > 0), 'Партнёр удалён'); } }]} />
              </div>
              <div className="grid g2 keep2" style={{ gap: 10, marginBottom: 14 }}>
                <Mini label="Вложено в капитал" value={money(l.capitalIn)} />
                <Mini label="Доля в капитале" value={p.archived ? '—' : pct(capShares.bps[p.id] ?? 0)} />
                <Mini label="Личные расходы (авансы)" value={money(l.advances)} />
                <Mini label="Доля в прибыли" value={p.archived ? '—' : pct(profitShares.bps[p.id] ?? 0)} />
              </div>
              <div className="kv small" style={{ marginBottom: 14 }}>
                <span className="k">Возвращено: аванс / капитал</span><span className="v">{money(l.advanceRepaid)} / {money(l.capitalReturned)}</span>
                <span className="k">Долг бизнеса по авансам</span><span className={`v ${l.debt > 0 ? '' : 'muted'}`}>{money(l.debt)}</span>
                <span className="sep" />
                <span className="k">Начислено прибыли</span><span className="v">{money(l.accrued)}</span>
                <span className="k">Получено</span><span className="v">{money(l.paid)}</span>
                <span className="k">Не выплачено</span><span className="v pos">{money(l.unpaid)}</span>
              </div>
              {!p.archived && <div className="row"><Btn size="sm" onClick={() => setTx({ type: 'capital', partnerId: p.id })}>Вложить</Btn><Btn size="sm" onClick={() => setTx({ type: 'advance', partnerId: p.id })}>Личный расход</Btn><Btn size="sm" disabled={l.debt <= 0} onClick={() => setTx({ type: 'advance_repay', partnerId: p.id })}>Вернуть аванс</Btn><Btn size="sm" disabled={l.capitalNet <= 0 || d.settings.capitalReturnMode === 'none'} title={d.settings.capitalReturnMode === 'none' ? 'Возврат капитала отключён в настройках' : ''} onClick={() => setTx({ type: 'capital_return', partnerId: p.id })}>Вернуть капитал</Btn></div>}
            </Card>
          );
        })}
      </div>
      {edit && <PartnerModal partner={edit} onClose={() => setEdit(null)} />}
      {view && <History id={view} onClose={() => setView(null)} />}
      {tx && <TxModal preset={{ type: tx.type, partnerId: tx.partnerId, date: todayISO(), category: tx.type === 'advance' ? 'Материалы' : undefined }} onClose={() => setTx(null)} />}
    </>
  );
}

const Mini = ({ label, value }: { label: string; value: string }) => <div className="card flat" style={{ padding: 12 }}><div className="small muted">{label}</div><div style={{ fontWeight: 700, fontSize: 17 }} className="num">{value}</div></div>;

function PartnerModal({ partner, onClose }: { partner: Partial<Partner>; onClose: () => void }) {
  const { run } = useUi();
  const [f, setF] = useState<Partial<Partner>>({ joinedAt: todayISO(), ...partner });
  const save = async () => { if (await run((s) => planSavePartner(s, { ...f, name: f.name ?? '' }), 'Партнёр сохранён')) onClose(); };
  return (
    <Modal title={partner.id ? 'Редактировать партнёра' : 'Новый партнёр'} size="sm" onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить</Btn></>}>
      <div className="col">
        <Field label="Имя"><Input autoFocus value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Дата присоединения"><Input type="date" value={f.joinedAt ?? ''} onChange={(e) => setF({ ...f, joinedAt: e.target.value })} /></Field>
        <Field label="Заметка"><Textarea value={f.note ?? ''} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        {!partner.id && <div className="small muted">Вложения партнёра вносятся отдельной операцией после создания.</div>}
      </div>
    </Modal>
  );
}

function History({ id, onClose }: { id: string; onClose: () => void }) {
  const d = useData();
  const money = useMoney();
  const p = d.partners.find((x) => x.id === id)!;
  const txs = d.transactions.filter((t) => t.partnerId === id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const plus: TxType[] = ['capital', 'advance', 'profit_accrual'];
  return (
    <Modal title={`История: ${p.name}`} size="lg" onClose={onClose}>
      {txs.length === 0 ? <Empty title="Операций нет" /> : <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Операция</th><th>Описание</th><th className="r">Сумма</th></tr></thead><tbody>{txs.map((t) => (
        <tr key={t.id} style={t.voided ? { opacity: 0.45 } : undefined}><td className="nowrap">{formatDate(t.date)}</td><td><Chip tone={plus.includes(t.type) ? 'green' : 'amber'}>{TX_LABELS[t.type]}</Chip>{t.voided && <Chip tone="red">аннулировано</Chip>}</td><td className="muted">{t.description ?? t.category ?? ''}</td><td className="r num"><b>{money(t.amount)}</b></td></tr>))}</tbody></table></div>}
    </Modal>
  );
}
