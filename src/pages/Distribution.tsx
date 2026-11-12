import { useMemo, useState } from 'react';
import { LuCheck, LuHistory, LuPiggyBank, LuPlus, LuUndo2 } from 'react-icons/lu';
import { allocate, formatDate, todayISO } from '../domain/money';
import { cashBalance, distributionPaid, partnerLedger, previewDistribution, sharesFor, totalDebt, totalUnpaid } from '../domain/finance';
import { planCancelDistribution, planDeleteDistribution, planCapitalReturn, planCreateDistribution, planPayout, planSaveSettings } from '../domain/ops';
import { MODE_LABELS, type Bps, type CapitalReturnMode, type Distribution, type DistMode } from '../domain/types';
import { useData } from '../store/store';
import { MoneyInput, NumInput, pct, useMoney } from '../ui/common';
import { Alert, Btn, Card, Chip, Empty, Field, Input, Modal, Progress, Seg, Select, Tabs, useUi } from '../ui/kit';

type Tab = 'new' | 'history' | 'capital';

export default function Distribution() {
  const d = useData();
  const money = useMoney();
  const [tab, setTab] = useState<Tab>('new');
  const unpaid = totalUnpaid(d.partners, d.transactions);
  return (
    <>
      <div className="page-head"><div><h1>Распределение прибыли</h1><p>Начисление и выплата — разные события</p></div>
        <div className="row"><Chip tone={unpaid > 0 ? 'amber' : 'green'}>Долг по выплатам: {money(unpaid)}</Chip></div></div>
      <Tabs value={tab} onChange={setTab} options={[['new', 'Новое распределение'], ['history', `История (${d.distributions.length})`], ['capital', 'Возврат капитала']]} />
      <div className="tab-body" key={tab}>{tab === 'new' ? <NewDistribution onDone={() => setTab('history')} /> : tab === 'history' ? <History /> : <CapitalReturn />}</div>
    </>
  );
}

function NewDistribution({ onDone }: { onDone: () => void }) {
  const d = useData();
  const money = useMoney();
  const { run, confirm } = useUi();
  const active = d.partners.filter((p) => !p.archived);
  const [mode, setMode] = useState<DistMode>(d.settings.distributionMode);
  const [custom, setCustom] = useState<Record<string, Bps>>({});
  const [fixed, setFixed] = useState<Record<string, Bps>>(d.settings.fixedBps);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const base = previewDistribution({ mode, partners: active, data: d, reserve: d.settings.reserve, fixedBps: fixed, customBps: custom });
  const total = amount ?? base.available;
  const pv = previewDistribution({ mode, partners: active, data: d, reserve: d.settings.reserve, fixedBps: fixed, customBps: custom, amount: total });
  const src = mode === 'fixed' ? fixed : custom;
  const setSrc = (id: string, v: Bps) => (mode === 'fixed' ? setFixed : setCustom)((p) => ({ ...p, [id]: v }));
  const sumBps = active.reduce((a, p) => a + (src[p.id] ?? 0), 0);

  if (active.length === 0) return <Card><Empty icon={<LuPiggyBank size={34} />} title="Нет активных партнёров" text="Добавьте партнёров в разделе «Партнёры»." /></Card>;

  const create = async () => {
    if (!(await confirm({ title: 'Провести распределение?', text: `${money(pv.total)} будет закреплено за партнёрами. Позже его можно отменить, пока по нему нет выплат. Доли и резерв в будущем эту запись не изменят.`, ok: 'Провести' }))) return;
    if (mode === 'fixed' && JSON.stringify(fixed) !== JSON.stringify(d.settings.fixedBps)) await run((s) => planSaveSettings(s, { fixedBps: fixed }));
    if (await run((s) => planCreateDistribution(s, { mode, amount: total, customBps: custom, note: note || undefined }), 'Распределение проведено')) onDone();
  };

  return (
    <div className="grid g-main">
      <div className="col" style={{ gap: 16 }}>
        <Card title="1. Способ распределения">
          <Seg value={mode} onChange={setMode} options={(Object.keys(MODE_LABELS) as DistMode[]).map((m) => [m, MODE_LABELS[m]] as [DistMode, string])} />
          <div className="small muted" style={{ marginTop: 10 }}>{{ capital: 'Доли пропорциональны вложенному капиталу (за вычетом возвращённого).', equal: 'Прибыль делится поровну между активными партнёрами.', fixed: 'Заранее согласованные доли. Они сохраняются в настройках.', custom: 'Задайте проценты вручную только для этого распределения.' }[mode]}</div>
        </Card>
        <Card title="2. Доли и выплаты">
          <div className="table-wrap"><table>
            <thead><tr><th>Партнёр</th><th className="r">Доля</th><th className="r">К начислению</th><th className="r">Долг по авансу*</th></tr></thead>
            <tbody>{active.map((p) => { const r = pv.rows.find((x) => x.partnerId === p.id); const l = partnerLedger(p.id, d.transactions); return (
              <tr key={p.id}><td><b>{p.name}</b>{mode === 'capital' && <div className="small muted">капитал {money(l.capitalNet)}</div>}</td>
                <td className="r">{mode === 'fixed' || mode === 'custom' ? <div style={{ display: 'inline-flex', width: 110 }}><NumInput value={(src[p.id] ?? 0) / 100} onChange={(n) => setSrc(p.id, Math.round(n * 100))} /></div> : <b>{pct(r?.bps ?? 0)}</b>}{(mode === 'fixed' || mode === 'custom') && ' %'}</td>
                <td className="r num"><b className={r?.amount ? 'pos' : ''}>{money(r?.amount ?? 0)}</b></td><td className="r num muted">{money(l.debt)}</td></tr>); })}
              <tr><td><b>Итого</b></td><td className="r"><b className={(mode === 'fixed' || mode === 'custom') && sumBps !== 10000 ? 'neg' : ''}>{mode === 'fixed' || mode === 'custom' ? pct(sumBps) : '100%'}</b></td><td className="r num"><b>{money(pv.rows.reduce((a, r) => a + r.amount, 0))}</b></td><td /></tr></tbody>
          </table></div>
          <div className="small muted" style={{ marginTop: 10 }}>* Долг по личным авансам возвращается отдельно (раздел «Партнёры») — он не прибавляется к прибыли и не вычитается из неё.</div>
        </Card>
        <Card title="3. Сумма распределения">
          <div className="form-grid">
            <Field label={`Распределить (максимум ${money(base.available)})`}><MoneyInput value={total} onChange={(v) => setAmount(v)} /></Field>
            <Field label="Заметка"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: итоги месяца" /></Field>
          </div>
          <div className="row" style={{ marginTop: 10 }}><Btn size="sm" onClick={() => setAmount(null)}>Всё доступное</Btn><Btn size="sm" onClick={() => setAmount(Math.floor(base.available / 2))}>Половина</Btn></div>
        </Card>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <Card title="Расчёт доступной прибыли">
          <div className="kv">
            <span className="k">1. Выручка (получено)</span><span className="v">{money(pv.revenue)}</span>
            <span className="k">2. Расходы</span><span className="v">−{money(pv.expenses)}</span>
            <span className="k">3. Операционная прибыль</span><span className="v">{money(pv.operatingProfit)}</span>
            {pv.netProfit !== pv.operatingProfit && <><span className="k">Прочие операции</span><span className="v">{money(pv.netProfit - pv.operatingProfit)}</span></>}
            <span className="k">4. Уже распределено</span><span className="v">−{money(pv.alreadyDistributed)}</span>
            <span className="k">Нераспределённая прибыль</span><span className="v">{money(pv.undistributed)}</span>
            <span className="k">5. Резерв бизнеса</span><span className="v">−{money(pv.reserve)}</span>
            <span className="sep" />
            <span className="k"><b>6. Доступно к распределению</b></span><span className="v pos">{money(pv.available)}</span>
          </div>
          <div className="small muted" style={{ marginTop: 12 }}>Резерв меняется в «Настройках». Денежный остаток сейчас: <b>{money(pv.cash)}</b>.</div>
        </Card>
        {pv.errors.length > 0 && <Alert tone="red">{pv.errors[0]}</Alert>}
        {pv.warnings.map((w) => <Alert key={w}>{w}</Alert>)}
        <Btn kind="primary" disabled={pv.errors.length > 0} onClick={create} icon={<LuCheck size={16} />} style={{ padding: '13px 18px' }}>Провести распределение · {money(pv.total)}</Btn>
      </div>
    </div>
  );
}

function History() {
  const d = useData();
  const money = useMoney();
  const { run, confirm } = useUi();
  const [pay, setPay] = useState<{ dist: Distribution; partnerId: string } | null>(null);
  const [cancel, setCancel] = useState<Distribution | null>(null);
  const [reason, setReason] = useState('');
  const dists = [...d.distributions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (dists.length === 0) return <Card><Empty icon={<LuHistory size={34} />} title="Распределений ещё не было" /></Card>;
  return (
    <div className="col" style={{ gap: 16 }}>
      {dists.map((x) => {
        const cancelled = x.status === 'cancelled';
        const paidTotal = x.rows.reduce((a, r) => a + distributionPaid(x, r.partnerId, d.transactions), 0);
        return (
          <Card key={x.id} className={cancelled ? 'flat' : ''}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div><h3 style={{ fontSize: 17 }}>{formatDate(x.date)} · {money(x.total)} {cancelled ? <Chip tone="red">отменено</Chip> : paidTotal >= x.total ? <Chip tone="green">выплачено</Chip> : paidTotal > 0 ? <Chip tone="amber">частично выплачено</Chip> : <Chip tone="blue">начислено</Chip>}</h3>
                <div className="small muted">{MODE_LABELS[x.mode]} · резерв на момент проведения {money(x.reserve)}{x.note ? ` · ${x.note}` : ''}</div>
                {cancelled && <div className="small neg">Отменено {formatDate(x.cancelledAt)}{x.cancelReason ? `: ${x.cancelReason}` : ''}</div>}</div>
              <div className="row">{!cancelled && <Btn size="sm" kind="danger" icon={<LuUndo2 size={14} />} onClick={() => { setReason(''); setCancel(x); }}>Отменить</Btn>}
                <Btn size="sm" kind="danger" onClick={async () => { if (await confirm({ title: 'Удалить распределение?', text: `Запись на ${money(x.total)} будет удалена вместе с начислениями${paidTotal > 0 ? ` и выплатами (${money(paidTotal)})` : ''}. История изменений в журнале сохранится.`, ok: 'Удалить', danger: true })) run((s) => planDeleteDistribution(s, x.id), 'Распределение удалено'); }}>Удалить</Btn></div>
            </div>
            <div className="table-wrap"><table><thead><tr><th>Партнёр</th><th className="r">Доля</th><th className="r">Начислено</th><th style={{ width: 150 }}>Выплачено</th><th className="r">Осталось</th><th /></tr></thead><tbody>{x.rows.map((r) => {
              const paid = distributionPaid(x, r.partnerId, d.transactions), left = r.amount - paid;
              return <tr key={r.partnerId} style={cancelled ? { opacity: 0.55 } : undefined}><td><b>{r.partnerName}</b></td><td className="r">{pct(r.bps)}</td><td className="r num">{money(r.amount)}</td><td><Progress value={r.amount ? (paid / r.amount) * 100 : 0} /><div className="small muted">{money(paid)}</div></td><td className="r num"><b>{cancelled ? '—' : money(left)}</b></td>
                <td className="r">{!cancelled && left > 0 && <Btn size="sm" onClick={() => setPay({ dist: x, partnerId: r.partnerId })}>Выплатить</Btn>}</td></tr>; })}</tbody></table></div>
          </Card>
        );
      })}
      {pay && <PayModal {...pay} onClose={() => setPay(null)} />}
      {cancel && (
        <Modal title="Отменить распределение?" size="sm" onClose={() => setCancel(null)} foot={<><Btn onClick={() => setCancel(null)}>Назад</Btn><Btn kind="danger solid" onClick={async () => { if (await run((s) => planCancelDistribution(s, cancel.id, reason), 'Распределение отменено')) setCancel(null); }}>Отменить распределение</Btn></>}>
          <p className="muted" style={{ marginTop: 0 }}>Запись останется в истории со статусом «отменено», прибыль снова станет нераспределённой. Если выплаты уже были — сначала удалите их в журнале финансов.</p>
          <Field label="Причина"><Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </Modal>
      )}
    </div>
  );
}

function PayModal({ dist, partnerId, onClose }: { dist: Distribution; partnerId: string; onClose: () => void }) {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const row = dist.rows.find((r) => r.partnerId === partnerId)!;
  const left = row.amount - distributionPaid(dist, partnerId, d.transactions);
  const [amount, setAmount] = useState(Math.min(left, Math.max(0, cashBalance(d.transactions))));
  const [date, setDate] = useState(todayISO());
  return (
    <Modal title={`Выплата: ${row.partnerName}`} size="sm" onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={async () => { if (await run((s) => planPayout(s, { distributionId: dist.id, partnerId, amount, date }), 'Выплата проведена')) onClose(); }}>Выплатить</Btn></>}>
      <div className="col"><div className="small muted">К выплате осталось {money(left)} · на счёте {money(cashBalance(d.transactions))}. Можно выплатить частично.</div>
        <Field label="Сумма"><MoneyInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
    </Modal>
  );
}

function CapitalReturn() {
  const d = useData();
  const money = useMoney();
  const { run } = useUi();
  const mode = d.settings.capitalReturnMode;
  const active = d.partners.filter((p) => !p.archived);
  const cash = cashBalance(d.transactions);
  const debt = totalDebt(d.partners, d.transactions);
  const free = Math.max(0, cash - d.settings.reserve - debt);
  const caps = active.map((p) => partnerLedger(p.id, d.transactions).capitalNet);
  const totalCap = caps.reduce((a, b) => a + b, 0);
  const suggest = useMemo(() => allocate(Math.min(free, totalCap), caps.map((c) => Math.max(0, c))), [free, totalCap, d.transactions]); // eslint-disable-line
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [sch, setSch] = useState({ partnerId: active[0]?.id ?? '', date: todayISO(), amount: 0 });
  const setMode = (m: CapitalReturnMode) => run((s) => planSaveSettings(s, { capitalReturnMode: m }), 'Настройка сохранена');
  const val = (i: number) => amounts[active[i].id] ?? (mode === 'from_cash' ? suggest[i] : 0);

  return (
    <div className="col" style={{ gap: 16 }}>
      <Card title="Политика возврата вложенного капитала">
        <Seg value={mode} onChange={setMode} options={[['none', 'Не возвращать'], ['schedule', 'По графику'], ['from_cash', 'Из свободных денег'], ['custom', 'Индивидуальные суммы']]} />
        <div className="small muted" style={{ marginTop: 10 }}>Возврат капитала — это не расход и не выплата прибыли: он уменьшает вложенный капитал партнёра и деньги на счёте, но не влияет на прибыль.</div>
      </Card>
      {mode === 'none' ? <Card><Empty icon={<LuPiggyBank size={34} />} title="Возврат капитала отключён" text="Капитал остаётся в бизнесе. Выберите режим выше, чтобы возвращать вложения." /></Card> : (
        <>
          <div className="grid g3">
            <div className="card flat"><div className="small muted">Денежный остаток</div><b style={{ fontSize: 20 }}>{money(cash)}</b></div>
            <div className="card flat"><div className="small muted">Резерв + долги по авансам</div><b style={{ fontSize: 20 }}>{money(d.settings.reserve + debt)}</b></div>
            <div className="card flat"><div className="small muted">Свободно для возврата</div><b className="pos" style={{ fontSize: 20 }}>{money(free)}</b></div>
          </div>
          {mode === 'schedule' ? (
            <Card title="График возврата">
              {d.settings.capitalSchedule.length === 0 ? <div className="muted small mb">График пуст.</div> : <div className="table-wrap mb"><table><tbody>{[...d.settings.capitalSchedule].sort((a, b) => a.date.localeCompare(b.date)).map((s) => (
                <tr key={s.id}><td className="nowrap">{formatDate(s.date)}</td><td><b>{d.partners.find((p) => p.id === s.partnerId)?.name}</b></td><td className="r num">{money(s.amount)}</td>
                  <td className="r nowrap">{s.done ? <Chip tone="green">проведено</Chip> : <><Btn size="sm" kind="primary" onClick={() => run((st) => planCapitalReturn(st, { partnerId: s.partnerId, amount: s.amount, scheduleId: s.id }), 'Капитал возвращён')}>Провести</Btn> <Btn size="sm" kind="ghost" onClick={() => run((st) => planSaveSettings(st, { capitalSchedule: st.settings.capitalSchedule.filter((x) => x.id !== s.id) }))}>Убрать</Btn></>}</td></tr>))}</tbody></table></div>}
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <Field label="Партнёр"><Select value={sch.partnerId} onChange={(e) => setSch({ ...sch, partnerId: e.target.value })}>{active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Дата"><Input type="date" value={sch.date} onChange={(e) => setSch({ ...sch, date: e.target.value })} /></Field>
                <Field label="Сумма"><MoneyInput value={sch.amount} onChange={(v) => setSch({ ...sch, amount: v })} /></Field>
              </div>
              <Btn style={{ marginTop: 12 }} icon={<LuPlus size={15} />} disabled={!sch.partnerId || sch.amount <= 0} onClick={() => run((st) => planSaveSettings(st, { capitalSchedule: [...st.settings.capitalSchedule, { id: Math.random().toString(36).slice(2), ...sch }] }), 'Добавлено в график')}>Добавить в график</Btn>
            </Card>
          ) : (
            <Card title={mode === 'from_cash' ? 'Возврат из свободных денег' : 'Индивидуальные суммы возврата'}>
              <div className="table-wrap"><table><thead><tr><th>Партнёр</th><th className="r">Капитал в бизнесе</th><th style={{ width: 190 }}>Вернуть</th><th /></tr></thead><tbody>{active.map((p, i) => (
                <tr key={p.id}><td><b>{p.name}</b></td><td className="r num">{money(caps[i])}</td><td><MoneyInput value={val(i)} onChange={(v) => setAmounts({ ...amounts, [p.id]: v })} /></td>
                  <td className="r"><Btn size="sm" kind="primary" disabled={val(i) <= 0} onClick={async () => { if (await run((st) => planCapitalReturn(st, { partnerId: p.id, amount: val(i) }), 'Капитал возвращён')) setAmounts({ ...amounts, [p.id]: 0 }); }}>Вернуть</Btn></td></tr>))}</tbody></table></div>
              {mode === 'from_cash' && <div className="small muted" style={{ marginTop: 10 }}>Предложение распределено пропорционально капиталу с точностью до копейки и ограничено свободными деньгами.</div>}
            </Card>
          )}
        </>
      )}
      <div className="small muted">{sharesFor('capital', active, d.transactions, {}, {}).errors[0] ?? ''}</div>
    </div>
  );
}
