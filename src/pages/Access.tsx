import { useState } from 'react';
import { LuLock, LuPencil, LuPlus, LuShieldCheck, LuTrash2 } from 'react-icons/lu';
import type { RoleDef, UserRole } from '../db/cloud';
import { formatDate } from '../domain/money';
import { removeRole, updateUser, upsertRole, useApp, useData, errMessage, ALL_SECTIONS } from '../store/store';
import { Alert, Btn, Card, Chip, Empty, Field, Input, Modal, Select, Tabs, Textarea, useUi } from '../ui/kit';

export const SECTION_LABELS: Record<string, string> = { dashboard: 'Главная', clients: 'Клиенты', orders: 'Заказы', production: 'Производство', finance: 'Финансы', partners: 'Партнёры', distribution: 'Распределение', analytics: 'Аналитика', settings: 'Настройки', access: 'Доступ', cabinet: 'Мой кабинет' };
const COLL_LABELS: Record<string, string> = { clients: 'Клиенты', orders: 'Заказы', materials: 'Материалы', purchases: 'Закупки', transactions: 'Операции', partners: 'Партнёры', distributions: 'Распределения', log: 'Журнал', settings: 'Настройки' };
const SCOPE_LABELS = { all: 'Все данные бизнеса', own_partner: 'Только свои данные партнёра (вложения, прибыль)', own_client: 'Только свои заказы и оплаты' } as const;

export default function Access() {
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  return (
    <>
      <div className="page-head"><div><h1>Доступ</h1><p>Кто и что может видеть и делать в системе</p></div></div>
      <Tabs value={tab} onChange={setTab} options={[['users', 'Пользователи'], ['roles', 'Роли']]} />
      <div className="tab-body" key={tab}>{tab === 'users' ? <Users /> : <Roles />}</div>
    </>
  );
}

function Users() {
  const users = useApp((s) => s.users);
  const roles = useApp((s) => s.roles);
  const me = useApp((s) => s.user);
  const names = useApp((s) => s.names);
  const d = useData();
  const { toast } = useUi();
  const act = async (u: UserRole, patch: Parameters<typeof updateUser>[1]) => { try { await updateUser(u.user_id, patch); toast('Сохранено'); } catch (e) { toast(errMessage(e), true); } };
  return (
    <>
      <div className="mb"><Alert tone="green">Новые пользователи регистрируются сами и по умолчанию получают роль «Покупатель» без привязки — ничего не видят, пока вы не назначите роль. Первый зарегистрированный пользователь автоматически становится владельцем.</Alert></div>
      <Card np>
        {users.length === 0 ? <Empty title="Пользователей пока нет" /> : <div className="table-wrap"><table>
          <thead><tr><th>Почта</th><th>Роль</th><th>Привязка</th><th>Регистрация</th></tr></thead>
          <tbody>{users.map((u) => { const role = roles.find((r) => r.key === u.role); return (
            <tr key={u.user_id}>
              <td><b>{names[u.user_id] ?? u.email ?? '—'}</b>{names[u.user_id] && <div className="small muted">{u.email}</div>}{u.user_id === me?.id && <> <Chip tone="green">это вы</Chip></>}</td>
              <td style={{ minWidth: 190 }}><Select value={u.role} onChange={(e) => act(u, { role: e.target.value })}>{roles.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}</Select></td>
              <td style={{ minWidth: 220 }}>
                {role?.scope === 'own_partner' && <Select value={u.partner_id ?? ''} onChange={(e) => act(u, { partner_id: e.target.value || null })}><option value="">Выберите партнёра…</option>{d.partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
                {role?.scope === 'own_client' && <Select value={u.client_id ?? ''} onChange={(e) => act(u, { client_id: e.target.value || null })}><option value="">Выберите клиента…</option>{d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
                {role?.scope === 'all' && <span className="muted small">не требуется</span>}
              </td>
              <td className="muted nowrap">{formatDate(u.created_at)}</td>
            </tr>); })}</tbody>
        </table></div>}
      </Card>
    </>
  );
}

function Roles() {
  const roles = useApp((s) => s.roles);
  const { confirm, toast } = useUi();
  const [edit, setEdit] = useState<{ role: Partial<RoleDef> & { key: string }; isNew: boolean } | null>(null);
  const del = async (r: RoleDef) => {
    if (!(await confirm({ title: `Удалить роль «${r.title}»?`, text: 'Роль нельзя удалить, пока она назначена пользователям.', ok: 'Удалить', danger: true }))) return;
    try { await removeRole(r.key); toast('Роль удалена'); } catch (e) { toast(errMessage(e).includes('violates') ? 'Роль назначена пользователям' : errMessage(e), true); }
  };
  return (
    <>
      <div className="row mb" style={{ justifyContent: 'flex-end' }}><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setEdit({ isNew: true, role: { key: '', title: '', description: '', scope: 'all', read_collections: [], sections: [], can_write: false } })}>Новая роль</Btn></div>
      <div className="grid g2">{roles.map((r) => (
        <Card key={r.key}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <div><h3 style={{ fontSize: 17 }}>{r.title} {r.key === 'owner' && <LuLock size={14} style={{ verticalAlign: -1 }} />}</h3><div className="small muted">{r.description}</div></div>
            {r.can_write ? <Chip tone="amber">может изменять</Chip> : <Chip>только просмотр</Chip>}
          </div>
          <div className="small" style={{ margin: '12px 0 6px' }}><b>Данные:</b> {SCOPE_LABELS[r.scope]}</div>
          <div className="row" style={{ gap: 6, marginBottom: 8 }}>{r.sections.map((s) => <Chip key={s} tone="green">{SECTION_LABELS[s] ?? s}</Chip>)}</div>
          {r.key !== 'owner' && <div className="row" style={{ marginTop: 10 }}><Btn size="sm" icon={<LuPencil size={14} />} onClick={() => setEdit({ isNew: false, role: r })}>Изменить</Btn>{!r.is_system && <Btn size="sm" kind="danger" icon={<LuTrash2 size={14} />} onClick={() => del(r)}>Удалить</Btn>}</div>}
          {r.key === 'owner' && <div className="small muted">Роль владельца защищена от изменений.</div>}
        </Card>))}</div>
      {edit && <RoleModal {...edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function RoleModal({ role, isNew, onClose }: { role: Partial<RoleDef> & { key: string }; isNew: boolean; onClose: () => void }) {
  const { toast } = useUi();
  const [f, setF] = useState(role as RoleDef);
  const [err, setErr] = useState('');
  const toggle = (k: 'sections' | 'read_collections', v: string) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));
  const sections = f.scope === 'all' ? ALL_SECTIONS.filter((s) => s !== 'access') : ['cabinet'];
  const save = async () => {
    if (!f.title.trim()) return setErr('Укажите название роли');
    if (isNew && !/^[a-z0-9_]{2,30}$/.test(f.key)) return setErr('Ключ — латиница, цифры и _ (2–30 символов)');
    try { await upsertRole({ ...f, title: f.title.trim() }, isNew); toast('Роль сохранена'); onClose(); } catch (e) { setErr(errMessage(e)); }
  };
  return (
    <Modal title={isNew ? 'Новая роль' : `Роль: ${role.title}`} onClose={onClose} foot={<><Btn onClick={onClose}>Отмена</Btn><Btn kind="primary" onClick={save}>Сохранить</Btn></>}>
      <div className="form-grid">
        <Field label="Название"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Ключ (нельзя изменить позже)"><Input disabled={!isNew} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value.toLowerCase() })} placeholder="manager" /></Field>
        <Field label="Описание" full><Textarea style={{ minHeight: 52 }} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Какие данные видит" full><Select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as RoleDef['scope'], sections: e.target.value === 'all' ? [] : ['cabinet'] })}>{(Object.keys(SCOPE_LABELS) as RoleDef['scope'][]).map((k) => <option key={k} value={k}>{SCOPE_LABELS[k]}</option>)}</Select></Field>
        <Field label="Разделы меню" full><div className="row" style={{ gap: 8 }}>{sections.map((s) => <label key={s} className="chip" style={{ cursor: 'pointer', background: f.sections.includes(s) ? 'var(--accent-soft)' : undefined }}><input type="checkbox" checked={f.sections.includes(s)} onChange={() => toggle('sections', s)} /> {SECTION_LABELS[s]}</label>)}</div></Field>
        <Field label="Таблицы, доступные для чтения (проверяется базой данных)" full><div className="row" style={{ gap: 8 }}>{Object.keys(COLL_LABELS).map((c) => <label key={c} className="chip" style={{ cursor: 'pointer', background: f.read_collections.includes(c) ? 'var(--accent-soft)' : undefined }}><input type="checkbox" checked={f.read_collections.includes(c)} onChange={() => toggle('read_collections', c)} /> {COLL_LABELS[c]}</label>)}</div></Field>
        <Field label="Право изменять данные" full><label className="row" style={{ cursor: 'pointer' }}><input type="checkbox" checked={f.can_write} onChange={(e) => setF({ ...f, can_write: e.target.checked })} /> Может создавать, изменять и удалять записи{f.can_write && <LuShieldCheck size={15} style={{ color: 'var(--warn)' }} />}</label></Field>
        {f.scope !== 'all' && <div className="full small muted">Роли с ограниченной областью видят только записи, привязанные к ним в разделе «Пользователи». Если вы дадите такой роли чтение «Заказов» или «Клиентов», пользователь увидит и внутренние поля — себестоимость и заметки.</div>}
        {err && <div className="full" style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
      </div>
    </Modal>
  );
}
