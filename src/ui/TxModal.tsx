import { useState } from 'react';
import { orderPayments } from '../domain/finance';
import { todayISO } from '../domain/money';
import { planSaveTx, type TxInput } from '../domain/ops';
import { TX_LABELS, type TxType } from '../domain/types';
import { useData } from '../store/store';
import { MoneyInput, useMoney } from './common';
import { Btn, Field, Input, Modal, Select, useUi } from './kit';

export const MANUAL_TYPES: TxType[] = ['income', 'expense', 'capital', 'advance', 'advance_repay', 'capital_return', 'refund', 'other'];
const HINTS: Partial<Record<TxType, string>> = {
  income: 'Деньги, фактически полученные от клиента. Увеличивают выручку и денежный остаток.',
  expense: 'Расход, оплаченный из денег бизнеса. Уменьшает прибыль и денежный остаток.',
  capital: 'Партнёр передаёт деньги в капитал. Это не выручка и не прибыль.',
  advance: 'Партнёр оплатил расход из своих денег: это расход бизнеса и долг бизнеса перед партнёром. В капитал не входит, деньги бизнеса не уменьшает.',
  advance_repay: 'Бизнес возвращает партнёру деньги за его аванс. Это погашение долга, не расход и не выплата прибыли.',
  capital_return: 'Возврат вложенного капитала. Не расход и не выплата прибыли.',
  refund: 'Возврат денег клиенту. Уменьшает выручку.',
  other: 'Прочее движение денег. Учитывается в чистой прибыли отдельной строкой.',
};

export function TxModal({ tx, preset, onClose }: { tx?: { id: string } & Partial<TxInput>; preset?: Partial<TxInput>; onClose: () => void }) {
  const d = useData();
  const { run } = useUi();
  const money = useMoney();
  const full = tx ? d.transactions.find((t) => t.id === tx.id) : undefined;
  const init = (full ?? preset ?? {}) as Partial<TxInput>;
  const [f, setF] = useState<TxInput>({ type: 'expense', amount: 0, date: todayISO(), ...init } as TxInput);
  const set = <K extends keyof TxInput>(k: K, v: TxInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const partners = d.partners.filter((p) => !p.archived || p.id === f.partnerId);
  const needsPartner = ['capital', 'advance', 'advance_repay', 'capital_return'].includes(f.type);
  const cats = f.type === 'income' ? d.settings.incomeCategories : f.type === 'expense' || f.type === 'advance' ? d.settings.expenseCategories : [];
  const orderOpts = d.orders.filter((o) => o.status !== 'cancelled' || o.id === f.orderId);
  const orderSel = f.orderId ? d.orders.find((o) => o.id === f.orderId) : undefined;
  const left = orderSel ? orderPayments(orderSel, d.transactions.filter((t) => t.id !== f.id)).left : 0;

  async function save() {
    const ok = await run((s) => planSaveTx(s, { ...f, orderId: f.type === 'income' || f.type === 'refund' ? f.orderId : undefined }), full ? 'Операция сохранена' : 'Операция добавлена');
    if (ok) onClose();
  }
  return (
    <Modal title={full ? 'Изменить операцию' : 'Новая операция'} onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить</Btn></>}>
      <div className="form-grid">
        <Field label="Тип операции" full>
          <Select value={f.type} disabled={!!preset?.type && !full} onChange={(e) => setF({ ...f, type: e.target.value as TxType, category: undefined, orderId: undefined })}>
            {MANUAL_TYPES.map((t) => <option key={t} value={t}>{TX_LABELS[t]}</option>)}
          </Select>
        </Field>
        {HINTS[f.type] && <div className="full small muted" style={{ marginTop: -6 }}>{HINTS[f.type]}</div>}
        <Field label="Сумма"><MoneyInput value={f.amount} onChange={(v) => set('amount', v)} autoFocus /></Field>
        <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
        {needsPartner && (
          <Field label="Партнёр" full>
            <Select value={f.partnerId ?? ''} onChange={(e) => set('partnerId', e.target.value || undefined)}><option value="">Выберите…</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          </Field>
        )}
        {cats.length > 0 && (
          <Field label="Категория" full><Select value={f.category ?? ''} onChange={(e) => set('category', e.target.value || undefined)}><option value="">Без категории</option>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        )}
        {f.type === 'other' && (
          <Field label="Направление" full><Select value={f.direction ?? 'out'} onChange={(e) => set('direction', e.target.value as 'in' | 'out')}><option value="in">Поступление</option><option value="out">Списание</option></Select></Field>
        )}
        {(f.type === 'income' || f.type === 'refund') && (
          <Field label="Заказ (необязательно)" full>
            <Select value={f.orderId ?? ''} onChange={(e) => set('orderId', e.target.value || undefined)}>
              <option value="">Без привязки к заказу</option>
              {orderOpts.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.title}</option>)}
            </Select>
            {orderSel && f.type === 'income' && <span className="small muted">Осталось оплатить: {money(left)}</span>}
          </Field>
        )}
        <Field label="Описание" full><Input value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} placeholder="Например: закупка смолы" /></Field>
      </div>
    </Modal>
  );
}
