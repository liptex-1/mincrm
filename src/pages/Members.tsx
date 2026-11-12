import { useMemo, useState } from 'react';
import { LuBan, LuCircleCheck, LuMail, LuPhone, LuTrash2, LuUsers } from 'react-icons/lu';
import type { Member } from '../db/cloud';
import { adminBlock, adminDelete, adminEditProfile, errMessage, useApp } from '../store/store';
import { formatDate } from '../domain/money';
import { Avatar, Btn, Card, Chip, Empty, Field, Input, Modal, SearchBox, Seg, Textarea, useUi } from '../ui/kit';

export const nameOf = (m: Pick<Member, 'display_name' | 'email'>) => m.display_name?.trim() || m.email || 'Без имени';
export const seenText = (m: Member) => {
  if (m.online) return 'В сети';
  const s = m.seen_ago_s; if (s === null || s === undefined) return 'Не заходил(а)';
  if (s < 3600) return `Был(а) ${Math.max(1, Math.round(s / 60))} мин назад`;
  if (s < 86400) return `Был(а) ${Math.round(s / 3600)} ч назад`;
  return `Был(а) ${Math.round(s / 86400)} дн назад`;
};
export function MemberAvatar({ m, large, xl }: { m: Member; large?: boolean; xl?: boolean }) {
  return <span className="av-wrap"><Avatar name={nameOf(m)} src={m.avatar} large={large} xl={xl} /><i className={`dot ${m.online ? 'on' : ''}`} title={m.online ? 'В сети' : 'Не в сети'} /></span>;
}

export default function Members() {
  const cloud = useApp((s) => s.cloud);
  const members = useApp((s) => s.members);
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'all' | 'online'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return members.filter((m) => (mode === 'all' || m.online) && (!t || [m.display_name, m.email, m.role_title].some((x) => x?.toLowerCase().includes(t))))
      .sort((a, b) => Number(b.online) - Number(a.online) || nameOf(a).localeCompare(nameOf(b), 'ru'));
  }, [members, q, mode]);
  const online = members.filter((m) => m.online).length;
  if (!cloud) return <><div className="page-head"><div><h1>Участники</h1></div></div><Card><Empty icon={<LuUsers size={34} />} title="Раздел доступен в облачной версии" text="После входа по почте здесь будут все зарегистрированные участники." /></Card></>;
  return (
    <>
      <div className="page-head"><div><h1>Участники</h1><p>{members.length} зарегистрировано · {online} в сети</p></div></div>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="Ник или почта…" /><Seg value={mode} onChange={setMode} options={[['all', 'Все'], ['online', 'В сети']]} /></div>
      {list.length === 0 ? <Card><Empty icon={<LuUsers size={34} />} title="Никого не найдено" /></Card> : (
        <div className="members">{list.map((m) => (
          <button key={m.user_id} type="button" className={`member ${m.blocked ? 'is-blocked' : ''}`} onClick={() => setOpen(m.user_id)}>
            <MemberAvatar m={m} large />
            <div className="mi"><b>{nameOf(m)}</b><span className="small muted">{m.display_name ? m.email : m.role_title}</span><span className={`small ${m.online ? 'pos' : 'muted'}`}>{m.blocked ? 'Заблокирован' : seenText(m)}</span></div>
          </button>))}</div>
      )}
      {open && <MemberModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function MemberModal({ id, onClose }: { id: string; onClose: () => void }) {
  const m = useApp((s) => s.members.find((x) => x.user_id === id));
  const me = useApp((s) => s.user);
  const role = useApp((s) => s.role);
  const { toast, confirm } = useUi();
  const isOwner = role?.key === 'owner';
  const mine = me?.id === id;
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ display_name: m?.display_name ?? '', phone: m?.phone ?? '', about: m?.about ?? '' });
  const [busy, setBusy] = useState(false);
  if (!m) return null;
  const act = async (fn: () => Promise<void>, ok: string, close = false) => { setBusy(true); try { await fn(); toast(ok); if (close) onClose(); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  const save = () => act(async () => { await adminEditProfile(id, { display_name: f.display_name.trim() || null, phone: f.phone.trim() || null, about: f.about.trim() || null }); setEdit(false); }, 'Профиль сохранён');
  const del = async () => { if (await confirm({ title: 'Удалить аккаунт полностью?', text: `«${nameOf(m)}» (${m.email}) будет удалён вместе с профилем, аватаркой и настройками. Войти он больше не сможет. Данные бизнеса (заказы, клиенты) останутся. Действие необратимо.`, ok: 'Удалить аккаунт', danger: true })) act(() => adminDelete(id), 'Аккаунт удалён', true); };
  const block = async () => {
    if (m.blocked) return act(() => adminBlock(id, false), 'Аккаунт разблокирован');
    if (await confirm({ title: 'Заблокировать аккаунт?', text: `«${nameOf(m)}» сразу потеряет доступ: его выкинет из приложения, а вход будет закрыт, пока вы не разблокируете аккаунт.`, ok: 'Заблокировать', danger: true })) act(() => adminBlock(id, true), 'Аккаунт заблокирован');
  };
  return (
    <Modal title="Профиль участника" onClose={onClose} foot={isOwner && !mine ? <>
      <Btn icon={<LuTrash2 size={15} />} disabled={busy} className="danger" onClick={del}>Удалить аккаунт</Btn>
      <Btn icon={m.blocked ? <LuCircleCheck size={15} /> : <LuBan size={15} />} disabled={busy} onClick={block}>{m.blocked ? 'Разблокировать' : 'Заблокировать'}</Btn>
    </> : undefined}>
      <div className="col" style={{ gap: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
          <MemberAvatar m={m} xl />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 21, overflowWrap: 'anywhere' }}>{nameOf(m)}</h2>
            <div className="row" style={{ gap: 6, marginTop: 6 }}><Chip tone="green">{m.role_title}</Chip>{m.blocked && <Chip tone="red">заблокирован</Chip>}{mine && <Chip>это вы</Chip>}</div>
            <div className={`small ${m.online ? 'pos' : 'muted'}`} style={{ marginTop: 6 }}>{seenText(m)}</div>
          </div>
        </div>
        {!edit ? (
          <>
            {m.about && <div className="alert green"><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.about}</div></div>}
            <div className="kv small">
              <span className="k"><LuMail size={13} /> Почта</span><span className="v" style={{ overflowWrap: 'anywhere' }}>{m.email ? <a href={`mailto:${m.email}`}>{m.email}</a> : '—'}</span>
              <span className="k"><LuPhone size={13} /> Телефон</span><span className="v">{m.phone ? <a href={`tel:${m.phone.replace(/[^\d+]/g, '')}`}>{m.phone}</a> : <span className="muted">скрыт или не указан</span>}</span>
              <span className="k">Роль</span><span className="v">{m.role_title}</span>
              <span className="k">Регистрация</span><span className="v">{formatDate(m.created_at)}</span>
            </div>
            {isOwner && <div><Btn onClick={() => { setF({ display_name: m.display_name ?? '', phone: m.phone ?? '', about: m.about ?? '' }); setEdit(true); }}>Редактировать профиль</Btn>{m.avatar && !mine && <Btn style={{ marginLeft: 8 }} disabled={busy} onClick={() => act(() => adminEditProfile(id, { avatar: null }), 'Аватарка удалена')}>Убрать аватарку</Btn>}</div>}
          </>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            <Field label="Ник"><Input aria-label="Ник" maxLength={80} value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></Field>
            <Field label="Телефон"><Input aria-label="Телефон" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="О себе"><Textarea aria-label="О себе" maxLength={400} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} /></Field>
            <div className="row"><Btn kind="primary" disabled={busy} onClick={save}>Сохранить</Btn><Btn onClick={() => setEdit(false)}>Отмена</Btn></div>
          </div>
        )}
      </div>
    </Modal>
  );
}
