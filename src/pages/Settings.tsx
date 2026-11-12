import { useRef, useState } from 'react';
import { LuDatabase, LuDownload, LuImage, LuPlus, LuTrash2, LuUpload, LuX } from 'react-icons/lu';
import { formatDate } from '../domain/money';

const dt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '');
import { planSaveSettings } from '../domain/ops';
import { MODE_LABELS, TX_LABELS, type DistMode } from '../domain/types';
import { backupText, importBackup, loadDemo, markBackup, resetAll, useApp, useData } from '../store/store';
import { download, MoneyInput, toCSV, toExcelXML, type Table } from '../ui/common';
import { BackgroundCard } from '../ui/BackgroundCard';
import { Btn, Card, Field, Input, Seg, Select, Tabs, useUi } from '../ui/kit';
import { journalCSV } from './Finance';
import { computeOrder, orderPayments, partnerLedger } from '../domain/finance';

export default function Settings() {
  const d = useData();
  const persistent = useApp((s) => s.persistent);
  const { run, toast, confirm } = useUi();
  const s = d.settings;
  const [tab, setTab] = useState<'general' | 'rules' | 'data' | 'log'>('general');
  const [name, setName] = useState(s.businessName);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const patch = (p: Partial<typeof s>, ok?: string) => run((st) => planSaveSettings(st, p), ok);

  const tables = (): Table[] => [
    { name: 'Клиенты', head: ['Имя', 'Телефон', 'Telegram', 'Почта', 'Добавлен', 'Комментарий'], rows: d.clients.map((c) => [c.name, c.phone ?? '', c.telegram ?? '', c.email ?? '', formatDate(c.createdAt), c.comment ?? '']) },
    { name: 'Заказы', head: ['№', 'Клиент', 'Товар', 'Кол-во', 'Цена', 'Себестоимость', 'Выручка', 'Прибыль', 'Оплачено', 'Создан', 'Срок'], rows: d.orders.map((o) => { const c = computeOrder(o); return [o.number, d.clients.find((x) => x.id === o.clientId)?.name ?? '', o.title, o.qty, o.unitPrice / 100, o.unitCost / 100, c.total / 100, c.profit / 100, orderPayments(o, d.transactions).net / 100, formatDate(o.createdAt), formatDate(o.dueDate)]; }) },
    { name: 'Операции', head: ['Дата', 'Тип', 'Сумма', 'Категория', 'Описание'], rows: d.transactions.filter((t) => !t.voided).map((t) => [formatDate(t.date), TX_LABELS[t.type], t.amount / 100, t.category ?? '', t.description ?? '']) },
    { name: 'Склад', head: ['Материал', 'Остаток', 'Ед.', 'Цена', 'Мин. остаток'], rows: d.materials.map((m) => [m.name, m.qty, m.unit, m.unitCost / 100, m.minQty]) },
    { name: 'Партнёры', head: ['Партнёр', 'Капитал', 'Авансы', 'Долг', 'Начислено', 'Выплачено'], rows: d.partners.map((p) => { const l = partnerLedger(p.id, d.transactions); return [p.name, l.capitalNet / 100, l.advances / 100, l.debt / 100, l.accrued / 100, l.paid / 100]; }) },
  ];
  const catEditor = (key: 'incomeCategories' | 'expenseCategories', title: string) => <CatList title={title} items={s[key]} onChange={(v) => patch({ [key]: v })} />;

  return (
    <>
      <div className="page-head"><div><h1>Настройки</h1><p>Оформление, правила учёта и данные</p></div></div>
      <Tabs value={tab} onChange={setTab} options={[['general', 'Основные'], ['rules', 'Правила учёта'], ['data', 'Данные и резервные копии'], ['log', 'Журнал изменений']]} />
      <div className="tab-body" key={tab}>
        {tab === 'general' && (
          <div className="grid g2">
            <BackgroundCard />
            <Card title="Бизнес">
              <div className="col" style={{ gap: 14 }}>
                <Field label="Название бизнеса"><Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== s.businessName && patch({ businessName: name.trim() }, 'Название сохранено')} /></Field>
                <Field label="Логотип">
                  <div className="row">{s.logo ? <img src={s.logo} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} /> : <div className="brand-logo"><LuImage size={18} /></div>}
                    <Btn size="sm" onClick={() => logoRef.current?.click()}>Загрузить</Btn>{s.logo && <Btn size="sm" kind="ghost" onClick={() => patch({ logo: undefined })}>Убрать</Btn>}
                    <input ref={logoRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 1_000_000) return toast('Логотип больше 1 МБ', true); const r = new FileReader(); r.onload = () => patch({ logo: String(r.result) }, 'Логотип обновлён'); r.readAsDataURL(f); }} /></div>
                </Field>
                <Field label="Валюта"><Select value={s.currency} onChange={(e) => patch({ currency: e.target.value })}>{['₽', '$', '€', '₸', '₴', 'Br'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
              </div>
            </Card>
            <Card title="Отображение">
              <div className="col" style={{ gap: 16 }}>
                <Field label="Тема"><Seg value={s.theme} onChange={(v) => patch({ theme: v })} options={[['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как в системе']]} /></Field>
                <Field label="Плотность интерфейса"><Seg value={s.density} onChange={(v) => patch({ density: v })} options={[['comfortable', 'Свободно'], ['compact', 'Компактно']]} /></Field>
                <Field label="Анимации"><Seg value={s.animations ? 'on' : 'off'} onChange={(v) => patch({ animations: v === 'on' })} options={[['on', 'Включены'], ['off', 'Отключены']]} /></Field>
              </div>
            </Card>
          </div>
        )}
        {tab === 'rules' && (
          <div className="grid g2">
            <Card title="Резерв и распределение">
              <div className="col" style={{ gap: 14 }}>
                <Field label="Резерв бизнеса (не распределяется)"><ReserveEditor value={s.reserve} onSave={(v) => patch({ reserve: v }, 'Резерв обновлён')} /></Field>
                <Field label="Способ распределения по умолчанию"><Select value={s.distributionMode} onChange={(e) => patch({ distributionMode: e.target.value as DistMode })}>{(Object.keys(MODE_LABELS) as DistMode[]).map((m) => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}</Select></Field>
                <div className="small muted">Изменение резерва и правил не затрагивает уже проведённые распределения — они хранят собственные снимки.</div>
              </div>
            </Card>
            <Card title="Категории операций"><div className="col" style={{ gap: 18 }}>{catEditor('incomeCategories', 'Категории доходов')}{catEditor('expenseCategories', 'Категории расходов')}</div></Card>
          </div>
        )}
        {tab === 'data' && (
          <div className="grid g2">
            <Card title="Хранение">
              <div className="alert green"><LuDatabase size={18} /><div>{persistent ? 'Данные хранятся в IndexedDB этого браузера и сохраняются после перезапуска.' : 'IndexedDB недоступна (например, приватный режим) — данные живут только до закрытия вкладки. Сделайте резервную копию.'}</div></div>
              <div className="small muted" style={{ marginTop: 12 }}>Последняя резервная копия: {s.lastBackupAt ? dt(s.lastBackupAt) : 'ещё не делали'}. Архитектура хранилища рассчитана на подключение облачной базы без переписывания интерфейса.</div>
            </Card>
            <Card title="Резервная копия">
              <div className="row">
                <Btn kind="primary" icon={<LuDownload size={16} />} onClick={async () => { download(`minicrm-backup-${new Date().toISOString().slice(0, 10)}.json`, backupText(), 'application/json'); await markBackup(); toast('Копия сохранена'); }}>Скачать копию</Btn>
                <Btn icon={<LuUpload size={16} />} onClick={() => fileRef.current?.click()}>Восстановить из файла</Btn>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
                  if (!(await confirm({ title: 'Заменить все данные?', text: 'Текущие данные будут полностью заменены содержимым резервной копии.', ok: 'Восстановить', danger: true }))) return;
                  try { await importBackup(await f.text()); toast('Данные восстановлены'); } catch (er) { toast(er instanceof Error ? er.message : 'Ошибка импорта', true); }
                }} />
              </div>
            </Card>
            <Card title="Экспорт">
              <div className="row">
                <Btn icon={<LuDownload size={16} />} onClick={() => download('operations.csv', journalCSV(d.transactions.filter((t) => !t.voided), d.partners, d.orders), 'text/csv')}>Операции CSV</Btn>
                <Btn icon={<LuDownload size={16} />} onClick={() => { const t = tables()[1]; download('orders.csv', toCSV(t), 'text/csv'); }}>Заказы CSV</Btn>
                <Btn icon={<LuDownload size={16} />} onClick={() => download('minicrm.xls', toExcelXML(tables()), 'application/vnd.ms-excel')}>Всё в Excel</Btn>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>Excel-файл содержит листы: клиенты, заказы, операции, склад, партнёры.</div>
            </Card>
            <Card title="Опасная зона">
              <div className="row"><Btn onClick={async () => { if (await confirm({ title: 'Загрузить демо-данные?', text: 'Текущие данные будут заменены демонстрационным сценарием (три партнёра, заказы, распределение).', ok: 'Загрузить' })) { await loadDemo(); toast('Демо-данные загружены'); } }}>Демо-данные</Btn>
                <Btn kind="danger" icon={<LuTrash2 size={16} />} onClick={async () => { if (await confirm({ title: 'Удалить все данные?', text: 'Это нельзя отменить. Сначала скачайте резервную копию.', ok: 'Удалить всё', danger: true })) { await resetAll(); toast('Данные очищены'); } }}>Удалить все данные</Btn></div>
            </Card>
          </div>
        )}
        {tab === 'log' && (
          <Card np>
            {d.log.length === 0 ? <div className="empty">Журнал пока пуст</div> : <div className="table-wrap"><table><thead><tr><th>Дата</th><th>Действие</th><th>Объект</th><th>Описание</th></tr></thead><tbody>{[...d.log].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300).map((l) => (
              <tr key={l.id}><td className="nowrap muted">{dt(l.at)}</td><td><b>{l.action}</b></td><td>{l.entity}</td><td className="muted">{l.summary}</td></tr>))}</tbody></table></div>}
          </Card>
        )}
      </div>
    </>
  );
}

function ReserveEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(value);
  return <div className="row"><div style={{ width: 200 }}><MoneyInput value={v} onChange={setV} key={value} /></div><Btn size="sm" kind="primary" disabled={v === value} onClick={() => onSave(v)}>Применить резерв</Btn></div>;
}

function CatList({ title, items, onChange }: { title: string; items: string[]; onChange: (v: string[]) => void }) {
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (t && !items.includes(t)) { onChange([...items, t]); setV(''); } };
  return (
    <div><b>{title}</b>
      <div className="row" style={{ margin: '10px 0' }}>{items.map((c) => <span key={c} className="chip" style={{ padding: '5px 6px 5px 11px' }}>{c}<button className="btn ghost icon sm" style={{ padding: 2 }} aria-label="Удалить" onClick={() => onChange(items.filter((x) => x !== c))}><LuX size={13} /></button></span>)}</div>
      <div className="row"><div style={{ flex: 1, minWidth: 140 }}><Input value={v} placeholder="Новая категория" onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} /></div><Btn size="sm" icon={<LuPlus size={14} />} onClick={add}>Добавить</Btn></div>
    </div>
  );
}
