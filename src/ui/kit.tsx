import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCircleAlert, LuCircleCheck, LuEllipsis, LuEye, LuEyeOff, LuInbox, LuSearch, LuX } from 'react-icons/lu';
import { errMessage, mutate } from '../store/store';
import type { Batch, Data } from '../domain/types';

export const cx = (...a: (string | false | undefined | null)[]) => a.filter(Boolean).join(' ');

// ───────── Тосты и подтверждения ─────────
interface Toast { id: number; text: string; err?: boolean }
interface Ctx { toast: (t: string, err?: boolean) => void; confirm: (o: { title: string; text?: string; ok?: string; danger?: boolean }) => Promise<boolean>; run: (plan: (d: Data) => Batch, okText?: string) => Promise<boolean> }
const UiCtx = createContext<Ctx>(null as never);
export const useUi = () => useContext(UiCtx);

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dlg, setDlg] = useState<{ o: Parameters<Ctx['confirm']>[0]; res: (v: boolean) => void } | null>(null);
  const toast = useCallback((text: string, err?: boolean) => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), err ? 6000 : 3200);
  }, []);
  const confirm = useCallback<Ctx['confirm']>((o) => new Promise((res) => setDlg({ o, res })), []);
  const run = useCallback(async (plan: (d: Data) => Batch, okText?: string) => {
    try { await mutate(plan); if (okText) toast(okText); return true; } catch (e) { toast(errMessage(e), true); return false; }
  }, [toast]);
  const value = useMemo(() => ({ toast, confirm, run }), [toast, confirm, run]);
  return (
    <UiCtx.Provider value={value}>
      {children}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className={cx('toast', t.err && 'err')}>{t.err ? <LuCircleAlert size={18} /> : <LuCircleCheck size={18} />}<span>{t.text}</span></div>)}</div>
      {dlg && (
        <Modal title={dlg.o.title} size="sm" onClose={() => { dlg.res(false); setDlg(null); }}
          foot={<><Btn onClick={() => { dlg.res(false); setDlg(null); }}>Отмена</Btn><Btn kind={dlg.o.danger ? 'danger solid' : 'primary'} onClick={() => { dlg.res(true); setDlg(null); }}>{dlg.o.ok ?? 'Подтвердить'}</Btn></>}>
          {dlg.o.text && <p className="muted" style={{ margin: 0 }}>{dlg.o.text}</p>}
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

// ───────── Базовые элементы ─────────
export function Btn({ kind = '', size, icon, children, ...p }: { kind?: string; size?: 'sm'; icon?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={cx('btn', ...kind.split(' '), size, p.className)}>{icon}{children}</button>;
}
export const Chip = ({ tone = '', children }: { tone?: '' | 'green' | 'red' | 'amber' | 'blue'; children: ReactNode }) => <span className={cx('chip', tone)}>{children}</span>;
export const Card = ({ title, action, children, className, np }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; np?: boolean }) => (
  <section className={cx('card', np && 'np', className)}>{(title || action) && <div className="card-head" style={np ? { padding: '20px 22px 0' } : undefined}><h3>{title}</h3>{action}</div>}{children}</section>
);
export const Empty = ({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) => (
  <div className="empty">{icon ?? <LuInbox size={34} />}<b>{title}</b>{text && <div>{text}</div>}{action && <div style={{ marginTop: 14 }}>{action}</div>}</div>
);
export const Alert = ({ tone = '', children }: { tone?: '' | 'red' | 'green'; children: ReactNode }) => <div className={cx('alert', tone)}><LuCircleAlert size={18} /><div>{children}</div></div>;

export function Field({ label, error, full, children }: { label: string; error?: string; full?: boolean; children: ReactNode }) {
  return <div className={cx('field', full && 'full')}><label>{label}</label>{children}{error && <span className="err">{error}</span>}</div>;
}
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx('input', p.className)} />;
export function PasswordInput(p: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-wrap">
      <Input {...p} type={show ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pw-eye" aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} aria-pressed={show} onClick={() => setShow((v) => !v)} onMouseDown={(e) => e.preventDefault()}>{show ? <LuEyeOff size={18} /> : <LuEye size={18} />}</button>
    </div>
  );
}
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx('textarea', p.className)} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx('select', p.className)} />;
export function Affix({ suffix, ...p }: { suffix: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <div className="input-affix"><Input {...p} /><span>{suffix}</span></div>;
}
export function SearchBox({ value, onChange, placeholder = 'Поиск' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="ibox"><LuSearch size={16} /><input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></div>;
}
export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="seg">{options.map(([k, l]) => <button key={k} className={cx(value === k && 'on')} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="tabs">{options.map(([k, l]) => <button key={k} className={cx(value === k && 'on')} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export const Progress = ({ value, tone = '' }: { value: number; tone?: '' | 'warn' | 'red' }) => <div className={cx('bar', tone)}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;

// ───────── Модальное окно ─────────
export function Modal({ title, onClose, children, foot, size }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx('modal', size)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><Btn kind="ghost icon" onClick={onClose} aria-label="Закрыть"><LuX size={18} /></Btn></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

// ───────── Контекстное меню ─────────
export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; sep?: boolean }
export function RowMenu({ items }: { items: MenuItem[] }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener('mousedown', close); window.addEventListener('scroll', close, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [pos]);
  useLayoutEffect(() => {
    if (pos && ref.current) {
      const r = ref.current.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8) setPos({ x: pos.x, y: Math.max(8, window.innerHeight - r.height - 8) });
    }
  }, [pos === null]);
  return (
    <>
      <Btn kind="ghost icon sm" aria-label="Действия" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setPos(pos ? null : { x: Math.min(r.right - 190, window.innerWidth - 200), y: r.bottom + 4 }); }}><LuEllipsis size={18} /></Btn>
      {pos && (
        <div ref={ref} className="menu" style={{ left: Math.max(8, pos.x), top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
          {items.map((it, i) => it.sep ? <hr key={i} /> : <button key={i} className={cx(it.danger && 'danger')} onClick={(e) => { e.stopPropagation(); setPos(null); it.onClick(); }}>{it.icon}{it.label}</button>)}
        </div>
      )}
    </>
  );
}

// ───────── Плавное изменение чисел ─────────
export function AnimatedValue({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (document.documentElement.dataset.motion === 'off') { setShown(value); from.current = value; return; }
    const start = from.current, t0 = performance.now(), dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      const v = start + (value - start) * e;
      setShown(v); from.current = v;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(Math.round(shown))}</>;
}

export function Stat({ label, icon, value, format, hint, hl, tone }: { label: string; icon?: ReactNode; value: number; format: (n: number) => string; hint?: ReactNode; hl?: boolean; tone?: 'pos' | 'neg' | '' }) {
  return (
    <div className={cx('card stat', hl && 'hl')}>
      <div className="label">{icon && <span className="ico">{icon}</span>}{label}</div>
      <div className={cx('value', tone === 'pos' && value > 0 && 'pos', (tone === 'neg' || tone === 'pos') && value < 0 && 'neg')}><AnimatedValue value={value} format={format} /></div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

// ───────── Сортировка ─────────
export function useSort<T>(rows: T[], accessors: Record<string, (r: T) => string | number>, initial: { key: string; dir: 1 | -1 }) {
  const [s, setS] = useState(initial);
  const sorted = useMemo(() => {
    const f = accessors[s.key];
    if (!f) return rows;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (typeof x === 'string' ? x.localeCompare(y as string, 'ru') : (x as number) - (y as number)) * s.dir; });
  }, [rows, s]); // eslint-disable-line
  const th = (key: string, label: string, right?: boolean) => (
    <th className={cx('sortable', right && 'r')} onClick={() => setS((p) => ({ key, dir: p.key === key ? (-p.dir as 1 | -1) : 1 }))}>{label}{s.key === key ? (s.dir === 1 ? ' ↑' : ' ↓') : ''}</th>
  );
  return { sorted, th };
}

export function Avatar({ name, large }: { name: string; large?: boolean }) {
  return <div className={large ? 'avatar-lg' : 'avatar'}>{(name.trim()[0] ?? '?').toUpperCase()}</div>;
}
