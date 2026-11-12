import { useMemo, useState } from 'react';
import { LuDownload, LuPencil, LuPlus, LuReceipt, LuTrash2 } from 'react-icons/lu';
import { cashBalance, inRange, previewDistribution, summarize, totalDebt, totalUnpaid } from '../domain/finance';
import { formatDate } from '../domain/money';
import { planDeleteTx } from '../domain/ops';
import { TX_LABELS, type Transaction, type TxType } from '../domain/types';
import { useData } from '../store/store';
import { download, PeriodFilter, toCSV, useMoney, usePeriod } from '../ui/common';
import { Btn, Card, Chip, Empty, RowMenu, SearchBox, Select, Stat, useSort, useUi } from '../ui/kit';
import { TxModal, MANUAL_TYPES } from '../ui/TxModal';

const SIGN = (t: Transaction): 1 | -1 | 0 => ({ income: 1, capital: 1, refund: -1, expense: -1, advance: 0, advance_repay: -1, capital_return: -1, profit_accrual: 0, profit_payout: -1 } as Record<string, 1 | -1 | 0>)[t.type] ?? (t.direction === 'in' ? 1 : -1);
const TONE: Record<string, '' | 'green' | 'red' | 'amber' | 'blue'> = { income: 'green', capital: 'blue', advance: 'amber', expense: 'red', refund: 'red', advance_repay: 'amber', capital_return: 'blue', profit_accrual: 'green', profit_payout: 'green', other: '' };

export function journalCSV(txs: Transaction[], partners: { id: string; name: string }[], orders: { id: string; number: string }[]) {
  return toCSV({ name: 'Операции', head: ['Дата', 'Тип', 'Сумма', 'Категория', 'Описание', 'Заказ', 'Партнёр', 'ID'], rows: [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [formatDate(t.date), TX_LABELS[t.type], t.amount / 100, t.category ?? '', t.description ?? '', orders.find((o) => o.id === t.orderId)?.number ?? '', partners.find((p) => p.id === t.partnerId)?.name ?? '', t.id]) });
}

export default function Finance() {
  const d = useData();
  const money = useMoney();
  const { confirm, run } = useUi();
  const p = usePeriod('all');
  const [type, setType] = useState<TxType | ''>('');
  const [cat, setCat] = useState('');
  const [partner, setPartner] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ id?: string; preset?: Partial<{ type: TxType }> } | null>(null);

  const S = useMemo(() => summarize(d.transactions, p.range), [d.transactions, p.range.from, p.range.to]); // eslint-disable-line
  const cash = cashBalance(d.transactions);
  const debt = totalDebt(d.partners, d.transactions);
  const pv = previewDistribution({ mode: d.settings.distributionMode, partners: d.partners.filter((x) => !x.archived), data: d, reserve: d.settings.reserve, fixedBps: d.settings.fixedBps, customBps: {} });
  const allCats = [...new Set([...d.settings.expenseCategories, ...d.settings.incomeCategories, ...d.transactions.map((t) => t.category).filter(Boolean) as string[]])];

  const rows = useMemo(() => d.transactions.filter((t) => {
    if (!inRange(t.date, p.range)) return false;
    if (type && t.type !== type) return false;
    if (cat && t.category !== cat) return false;
    if (partner && t.partnerId !== partner) return false;
    const s = q.trim().toLowerCase();
    return !s || [t.description, t.category, TX_LABELS[t.type]].some((x) => x?.toLowerCase().includes(s));
  }), [d.transactions, p.range.from, p.range.to, type, cat, partner, q]); // eslint-disable-line
  const { sorted, th } = useSort(rows, { date: (t) => t.date + t.createdAt, type: (t) => TX_LABELS[t.type], amount: (t) => t.amount }, { key: 'date', dir: -1 });

  const del = async (t: Transaction) => { if (await confirm({ title: 'Удалить операцию?', text: `${TX_LABELS[t.type]} на ${money(t.amount)}. Действие попадёт в журнал изменений.`, ok: 'Удалить', danger: true })) run((s) => planDeleteTx(s, t.id), 'Операция удалена'); };
  const locked = (t: Transaction) => t.type === 'profit_accrual';
  const editable = (t: Transaction) => t.type !== 'profit_payout' && !d.purchases.some((x) => x.txId === t.id);

  return (
    <>
      <div className="page-head"><div><h1>Финансы</h1><p>Журнал операций и финансовые показатели</p></div>
        <div className="row"><Btn icon={<LuDownload size={16} />} onClick={() => download('operations.csv', journalCSV(rows, d.partners, d.orders), 'text/csv')}>CSV</Btn><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setEdit({})}>Новая операция</Btn></div></div>
      <div className="mb"><PeriodFilter value={p.key} onChange={p.setKey} custom={p.custom} onCustom={p.setCustom} /></div>
      <div className="grid g4 mb">
        <Stat hl label="Выручка" value={S.revenue} format={money} hint="Получено от клиентов за вычетом возвратов" />
        <Stat label="Расходы" value={S.expenses} format={money} hint="Из кассы + авансы партнёров" />
        <Stat label="Валовая прибыль" value={S.grossProfit} format={money} tone="pos" hint={`Выручка − материалы и упаковка (${money(S.directCosts)})`} />
        <Stat label="Операционная прибыль" value={S.operatingProfit} format={money} tone="pos" hint="Выручка − все расходы" />
        <Stat hl label="Чистая прибыль" value={S.netProfit} format={money} tone="pos" hint={S.otherNet ? `С учётом прочих операций: ${money(S.otherNet)}` : 'Операционная ± прочие операции'} />
        <Stat label="Денежный остаток" value={cash} format={money} tone="neg" hint="Реальные деньги сейчас" />
        <Stat label="Долг партнёрам" value={debt} format={money} hint="Авансы, ещё не возвращённые" />
        <Stat label="Доступно к распределению" value={pv.available} format={money} hint={`Невыплачено партнёрам: ${money(totalUnpaid(d.partners, d.transactions))}`} />
      </div>
      <div className="small muted mb">Денежный остаток, прибыль и доступная к распределению прибыль — разные величины: остаток — это реальные деньги, прибыль — финансовый результат, доступная прибыль — нераспределённая прибыль за вычетом резерва. Остаток и доступная прибыль показываются на сегодня, остальное — за выбранный период.</div>

      <Card np>
        <div className="toolbar" style={{ padding: '16px 18px 0' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Описание, категория…" />
          <Select value={type} onChange={(e) => setType(e.target.value as TxType | '')}><option value="">Все типы</option>{[...MANUAL_TYPES, 'profit_accrual', 'profit_payout'].map((t) => <option key={t} value={t}>{TX_LABELS[t as TxType]}</option>)}</Select>
          <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Все категории</option>{allCats.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={partner} onChange={(e) => setPartner(e.target.value)}><option value="">Все участники</option>{d.partners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        </div>
        {sorted.length === 0 ? <Empty icon={<LuReceipt size={34} />} title="Операций не найдено" text="Добавьте доход, расход или вложение." action={<Btn kind="primary" onClick={() => setEdit({})}>Новая операция</Btn>} /> : (
          <div className="table-wrap"><table>
            <thead><tr>{th('date', 'Дата')}{th('type', 'Тип')}<th>Описание</th><th>Категория</th><th>Связь</th>{th('amount', 'Сумма', true)}<th /></tr></thead>
            <tbody>{sorted.map((t) => { const sg = SIGN(t); return (
              <tr key={t.id} style={t.voided ? { opacity: 0.45 } : undefined}>
                <td className="nowrap">{formatDate(t.date)}</td>
                <td><Chip tone={TONE[t.type]}>{TX_LABELS[t.type]}</Chip>{t.voided && <Chip tone="red">аннулировано</Chip>}</td>
                <td>{t.description ?? <span className="muted">—</span>}</td><td className="muted">{t.category ?? '—'}</td>
                <td className="small">{t.orderId && <div>{d.orders.find((o) => o.id === t.orderId)?.number}</div>}{t.partnerId && <div className="muted">{d.partners.find((p) => p.id === t.partnerId)?.name}</div>}</td>
                <td className={`r num nowrap ${sg > 0 ? 'pos' : ''}`}><b>{sg > 0 ? '+' : sg < 0 ? '−' : ''}{money(t.amount)}</b>{(t.type === 'advance' || t.type === 'profit_accrual') && <div className="small muted">без движения денег</div>}</td>
                <td className="r">{!t.voided && !locked(t) ? <RowMenu items={[...(editable(t) ? [{ label: 'Изменить', icon: <LuPencil size={15} />, onClick: () => setEdit({ id: t.id }) }, { sep: true, label: '', onClick: () => {} }] : []), { label: d.purchases.some((x) => x.txId === t.id) ? 'Удалить вместе с поставкой' : 'Удалить', icon: <LuTrash2 size={15} />, danger: true, onClick: () => del(t) }]} /> : <span className="small muted" title="Начисление удаляется вместе с распределением">🔒</span>}</td>
              </tr>); })}</tbody>
          </table></div>
        )}
      </Card>
      {edit && <TxModal tx={edit.id ? { id: edit.id } : undefined} preset={edit.preset} onClose={() => setEdit(null)} />}
    </>
  );
}
