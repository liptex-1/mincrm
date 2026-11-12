import { useEffect, useState } from 'react';
import { monthKey, PERIOD_LABELS, periodRange, type PeriodKey } from '../domain/dates';
import type { Range } from '../domain/finance';
import { formatMoney, formatPercent, moneyToInput, parseMoney } from '../domain/money';
import type { PaymentStatus, ProductionStatus } from '../domain/types';
import { useData } from '../store/store';
import { Chip, Input, Seg, Field } from './kit';

export function useMoney() {
  const sym = useData().settings.currency;
  return (k: number) => formatMoney(k, sym);
}
export const pct = formatPercent;

/** Поле суммы в рублях → копейки. Хранит текст, пока пользователь печатает. */
export function MoneyInput({ value, onChange, placeholder = '0', ...rest }: { value: number; onChange: (k: number) => void; placeholder?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(moneyToInput(value));
  useEffect(() => { if (parseMoney(text) !== value && !(text === '' && value === 0)) setText(moneyToInput(value)); }, [value]); // eslint-disable-line
  const sym = useData().settings.currency;
  return (
    <div className="input-affix">
      <Input {...rest} inputMode="decimal" placeholder={placeholder} value={text} onChange={(e) => { setText(e.target.value); const v = parseMoney(e.target.value); onChange(v === null ? 0 : Math.max(0, v)); }} />
      <span>{sym}</span>
    </div>
  );
}
export function NumInput({ value, onChange, step = 1, min = 0, ...rest }: { value: number; onChange: (n: number) => void; step?: number; min?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(String(value));
  useEffect(() => { if (Number(text.replace(',', '.')) !== value) setText(String(value)); }, [value]); // eslint-disable-line
  return <Input {...rest} inputMode="decimal" value={text} onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(',', '.')); onChange(Number.isFinite(n) ? Math.max(min, n) : 0); }} />;
}

export const PROD_TONE: Record<ProductionStatus, '' | 'green' | 'red' | 'amber' | 'blue'> = { new: 'blue', pending: 'amber', in_production: 'amber', ready: 'green', handed: 'green', cancelled: 'red' };
export const PAY_TONE: Record<PaymentStatus, '' | 'green' | 'red' | 'amber' | 'blue'> = { unpaid: 'red', partial: 'amber', paid: 'green', refunded: '' };
export const StatusChip = ({ tone, children }: { tone: '' | 'green' | 'red' | 'amber' | 'blue'; children: string }) => <Chip tone={tone}>{children}</Chip>;

export function PeriodFilter({ value, onChange, custom, onCustom, keys = ['today', 'week', 'month', 'quarter', 'year', 'all', 'custom'] }: { value: PeriodKey; onChange: (k: PeriodKey) => void; custom: Range; onCustom: (r: Range) => void; keys?: PeriodKey[] }) {
  return (
    <div className="row">
      <Seg value={value} onChange={onChange} options={keys.map((k) => [k, PERIOD_LABELS[k]] as [PeriodKey, string])} />
      {value === 'custom' && (
        <div className="row" style={{ gap: 6 }}>
          <Input type="date" style={{ width: 150 }} value={custom.from ?? ''} onChange={(e) => onCustom({ ...custom, from: e.target.value || undefined })} />
          <span className="muted">—</span>
          <Input type="date" style={{ width: 150 }} value={custom.to ?? ''} onChange={(e) => onCustom({ ...custom, to: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
}
export function usePeriod(initial: PeriodKey = 'month') {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState<Range>({});
  return { key, setKey, custom, setCustom, range: periodRange(key, custom) };
}
export { monthKey, Field };

// ───────── Экспорт ─────────
export function download(name: string, content: string | Blob, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export type Table = { name: string; head: string[]; rows: (string | number)[][] };
export function toCSV(t: Table) {
  const esc = (v: string | number) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [t.head, ...t.rows].map((r) => r.map(esc).join(';')).join('\r\n');
}
/** Excel-совместимый файл (SpreadsheetML 2003): открывается в Excel/LibreOffice/Numbers, несколько листов. */
export function toExcelXML(tables: Table[]) {
  const x = (v: string | number) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v: string | number) => (typeof v === 'number' ? `<Cell><Data ss:Type="Number">${v}</Data></Cell>` : `<Cell><Data ss:Type="String">${x(v)}</Data></Cell>`);
  const sheet = (t: Table) => `<Worksheet ss:Name="${x(t.name).slice(0, 31)}"><Table>${[t.head, ...t.rows].map((r, i) => `<Row>${r.map((c) => (i === 0 ? `<Cell ss:StyleID="h"><Data ss:Type="String">${x(c)}</Data></Cell>` : cell(c))).join('')}</Row>`).join('')}</Table></Worksheet>`;
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#E7F4D9" ss:Pattern="Solid"/></Style></Styles>${tables.map(sheet).join('')}</Workbook>`;
}
