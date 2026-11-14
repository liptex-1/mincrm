import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuArrowLeft, LuCheck, LuImage, LuInfo, LuLogOut, LuMessageCircle, LuPencil, LuPlus, LuSend, LuTrash2, LuUsers, LuX } from 'react-icons/lu';
import * as cloud from '../db/cloud';
import { avatarFromFile, backgroundFromFile } from '../img';
import { ensureChatMedia, errMessage, refreshChats, useApp } from '../store/store';
import { Avatar, Btn, Card, Chip, Empty, Field, Input, Modal, RowMenu, SearchBox, Seg, Textarea, useUi } from '../ui/kit';
import { go, useRoute } from '../ui/router';
import { MemberAvatar, nameOf, seenText } from './Members';

type Chat = cloud.ChatInfo;
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayKey = (iso: string) => new Date(iso).toDateString();
const dayLabel = (iso: string) => { const d = new Date(iso), t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1); return d.toDateString() === t.toDateString() ? 'Сегодня' : d.toDateString() === y.toDateString() ? 'Вчера' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); };
const listTime = (iso: string) => { const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? hm(iso) : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }); };

/** Название, аватарка и собеседник для строки чата. */
function useChatView() {
  const me = useApp((s) => s.user?.id);
  const members = useApp((s) => s.members);
  const media = useApp((s) => s.media);
  return useCallback((c: Chat) => {
    const peerId = c.kind === 'direct' ? c.members.find((m) => m.user_id !== me)?.user_id : undefined;
    const peer = peerId ? members.find((m) => m.user_id === peerId) : undefined;
    const title = c.kind === 'group' ? c.title || 'Группа' : peer ? nameOf(peer) : 'Удалённый пользователь';
    return { peer, title, avatar: c.kind === 'group' ? media[c.id]?.avatar ?? null : peer?.avatar ?? null };
  }, [me, members, media]);
}
function ChatAvatar({ c, large }: { c: Chat; large?: boolean }) {
  const view = useChatView(); const v = view(c);
  if (c.kind === 'direct' && v.peer) return <MemberAvatar m={v.peer} large={large} />;
  return c.kind === 'group' ? <span className="av-wrap"><Avatar name={v.title} src={v.avatar} large={large} /><i className="dot grp" /></span> : <Avatar name={v.title} large={large} />;
}

export default function Chats() {
  const cloudMode = useApp((s) => s.cloud);
  const chats = useApp((s) => s.chats);
  const me = useApp((s) => s.user?.id);
  const { param } = useRoute();
  const view = useChatView();
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  useEffect(() => { refreshChats(); const t = setInterval(() => { if (!document.hidden) refreshChats(); }, 4000); return () => clearInterval(t); }, []);
  const sel = chats.find((c) => c.id === param);
  const list = useMemo(() => chats.filter((c) => !q.trim() || view(c).title.toLowerCase().includes(q.trim().toLowerCase())), [chats, q, view]);
  const requests = list.filter((c) => c.my_status === 'pending');
  const rest = list.filter((c) => c.my_status !== 'pending');
  if (!cloudMode) return <><div className="page-head"><div><h1>Чаты</h1></div></div><Card><Empty icon={<LuMessageCircle size={34} />} title="Чаты доступны в облачной версии" text="После входа по почте здесь можно общаться с участниками." /></Card></>;
  return (
    <div className="profile-page">
      <div className="page-head"><div><h1>Чаты</h1><p>Личные сообщения и группы</p></div><Btn kind="primary" icon={<LuPlus size={16} />} onClick={() => setNewOpen(true)}>Новый чат</Btn></div>
      <div className={`chats ${sel ? 'has-sel' : ''}`}>
        <aside className="chat-list card np">
          <div style={{ padding: 12 }}><SearchBox value={q} onChange={setQ} placeholder="Поиск чатов…" /></div>
          {chats.length === 0 && <Empty icon={<LuMessageCircle size={34} />} title="Чатов пока нет" text="Нажмите «Новый чат» и выберите собеседника." />}
          {requests.length > 0 && <div className="chat-sec">Запросы на чат</div>}
          {requests.map((c) => <ChatRow key={c.id} c={c} active={c.id === param} />)}
          {requests.length > 0 && rest.length > 0 && <div className="chat-sec">Чаты</div>}
          {rest.map((c) => <ChatRow key={c.id} c={c} active={c.id === param} />)}
        </aside>
        <section className="chat-pane card np">
          {sel && me ? <Conversation key={sel.id} chat={sel} me={me} /> : <div className="chat-empty"><Empty icon={<LuMessageCircle size={38} />} title="Выберите чат" text="Или начните новый — с любым участником." /></div>}
        </section>
      </div>
      {newOpen && <NewChat onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ChatRow({ c, active }: { c: Chat; active: boolean }) {
  const view = useChatView(); const v = view(c); const me = useApp((s) => s.user?.id);
  const last = c.last; const mine = last?.sender_id === me;
  const preview = c.my_status === 'pending' ? 'Хочет написать вам' : c.my_status === 'declined' ? 'Запрос отклонён' : !last ? 'Нет сообщений' : last.deleted ? 'Сообщение удалено' : `${mine ? 'Вы: ' : ''}${last.body}`;
  return (
    <button type="button" className={`chat-row ${active ? 'active' : ''}`} onClick={() => go('chats', c.id)}>
      <ChatAvatar c={c} large />
      <div className="cr-main"><div className="cr-top"><b>{v.title}</b>{last && <span className="small muted">{listTime(last.created_at)}</span>}</div>
        <div className="cr-bot"><span className="small muted cr-prev">{preview}</span>{c.unread > 0 && <span className="badge-dot">{c.unread > 99 ? '99+' : c.unread}</span>}</div></div>
    </button>
  );
}

function Conversation({ chat, me }: { chat: Chat; me: string }) {
  const { confirm, toast } = useUi();
  const members = useApp((s) => s.members);
  const role = useApp((s) => s.role);
  const media = useApp((s) => s.media[chat.id]);
  const view = useChatView(); const v = view(chat);
  const isOwner = role?.key === 'owner';
  const [msgs, setMsgs] = useState<cloud.ChatMsg[]>([]);
  const [limit, setLimit] = useState(60);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [selMsg, setSelMsg] = useState<string | null>(null);
  const [panel, setPanel] = useState<'wall' | 'info' | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef('');

  useEffect(() => { ensureChatMedia(chat, true); }, [chat.id, chat.wallpaper_v, chat.avatar_v, chat.has_wallpaper, chat.has_avatar]); // eslint-disable-line
  const load = useCallback(async () => { try { const r = await cloud.fetchMessages(chat.id, limit); setMsgs(r.reverse()); } catch { /* сеть */ } }, [chat.id, limit]);
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 3000); return () => clearInterval(t); }, [load]);
  useEffect(() => { // новое сообщение: прокрутка вниз и «прочитано»
    const last = msgs[msgs.length - 1]; if (!last || last.id === lastId.current) return; lastId.current = last.id;
    if (stick.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [msgs]);
  useEffect(() => { if (chat.unread > 0 && chat.my_status === 'active' && !document.hidden) cloud.chatMarkRead(chat.id).then(refreshChats).catch(() => undefined); }, [chat.unread, chat.id, chat.my_status, msgs.length]);

  const other = chat.kind === 'direct' ? chat.members.find((m) => m.user_id !== me) : undefined;
  const myMsgs = msgs.filter((m) => m.sender_id === me && !m.deleted_at).length;
  const iAmPendingTarget = chat.kind === 'direct' && chat.my_status === 'pending';
  const iDeclined = chat.my_status === 'declined';
  const waiting = chat.kind === 'direct' && other?.status === 'pending';
  const blockedByDecline = chat.kind === 'direct' && other?.status === 'declined';
  const canType = !iDeclined && !blockedByDecline && !(waiting && myMsgs >= 1);
  const guard = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok); await refreshChats(); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };

  const send = async () => {
    const b = text.trim(); if (!b || busy || !canType) return;
    setBusy(true);
    try { await cloud.chatSend(chat.id, b); setText(''); stick.current = true; await Promise.all([load(), refreshChats()]); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); }
  };
  const del = async (m: cloud.ChatMsg) => { if (await confirm({ title: 'Удалить сообщение?', text: 'Оно пропадёт у всех участников чата.', ok: 'Удалить', danger: true })) guard(async () => { await cloud.chatDeleteMessage(m.id); await load(); }); };
  const onScroll = () => { const el = box.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };

  const wp = media?.wallpaper && media.wallpaper_v === chat.wallpaper_v ? media.wallpaper : null;
  const nameById = (id: string | null) => { const m = members.find((x) => x.user_id === id); return m ? nameOf(m) : 'Удалённый пользователь'; };
  const menu = [
    { label: chat.kind === 'group' ? 'О группе' : 'О собеседнике', icon: <LuInfo size={15} />, onClick: () => setPanel('info') },
    { label: 'Обои чата', icon: <LuImage size={15} />, onClick: () => setPanel('wall') },
    ...(chat.kind === 'group' && !isOwner ? [{ sep: true, label: '', onClick: () => {} }, { label: 'Покинуть группу', icon: <LuLogOut size={15} />, danger: true, onClick: async () => { if (await confirm({ title: 'Покинуть группу?', text: 'Вернуться сможет только владелец, добавив вас снова.', ok: 'Покинуть', danger: true })) guard(async () => { await cloud.chatLeave(chat.id); go('chats'); }); } }] : []),
    ...(isOwner && (chat.kind === 'group' || chat.members.some((m) => m.user_id === me)) ? [{ sep: true, label: '', onClick: () => {} }, { label: chat.kind === 'group' ? 'Удалить группу' : 'Удалить чат', icon: <LuTrash2 size={15} />, danger: true, onClick: async () => { if (await confirm({ title: chat.kind === 'group' ? 'Удалить группу?' : 'Удалить чат?', text: 'Вся переписка будет удалена у всех участников без возможности восстановления.', ok: 'Удалить', danger: true })) guard(async () => { await cloud.chatDelete(chat.id); go('chats'); }); } }] : []),
  ];
  let prevDay = '';
  return (
    <div className="conv">
      <header className="conv-head">
        <button type="button" className="icon-btn conv-back" aria-label="Назад к чатам" onClick={() => go('chats')}><LuArrowLeft size={20} /></button>
        <button type="button" className="conv-title" onClick={() => setPanel('info')}>
          <ChatAvatar c={chat} />
          <span className="ct"><b>{v.title}</b><span className="small muted">{chat.kind === 'group' ? `${chat.members.filter((m) => m.status === 'active').length} участн.` : v.peer ? seenText(v.peer) : ''}</span></span>
        </button>
        <RowMenu items={menu} />
      </header>
      <div className="conv-body" style={wp ? { backgroundImage: `url("${wp}")` } : undefined}>
        <div className="conv-msgs" ref={box} onScroll={onScroll}>
          {msgs.length >= limit && <div style={{ textAlign: 'center' }}><Btn size="sm" onClick={() => setLimit(limit + 100)}>Показать ранние</Btn></div>}
          {msgs.length === 0 && <div className="conv-hint small muted">Сообщений пока нет. Напишите первым.</div>}
          {msgs.map((m) => {
            const dk = dayKey(m.created_at); const sep = dk !== prevDay; prevDay = dk; const mine = m.sender_id === me; const deleted = !!m.deleted_at; const canDel = !deleted && (mine || isOwner);
            return (
              <div key={m.id}>
                {sep && <div className="day-sep"><span>{dayLabel(m.created_at)}</span></div>}
                <div className={`msg ${mine ? 'mine' : ''}`}>
                  <div className={`bubble ${deleted ? 'deleted' : ''}`} onClick={() => canDel && setSelMsg(selMsg === m.id ? null : m.id)}>
                    {chat.kind === 'group' && !mine && <div className="who">{nameById(m.sender_id)}</div>}
                    <div className="mt">{deleted ? 'Сообщение удалено' : m.body}</div>
                    <div className="tm">{hm(m.created_at)}</div>
                  </div>
                  {selMsg === m.id && canDel && <button type="button" className="msg-del" onClick={() => { setSelMsg(null); del(m); }}><LuTrash2 size={13} /> Удалить</button>}
                </div>
              </div>);
          })}
        </div>
      </div>
      {iAmPendingTarget && <div className="conv-bar"><span><b>{v.title}</b> хочет написать вам. Ответив, вы согласитесь на чат.</span><span className="row" style={{ gap: 6 }}><Btn size="sm" kind="primary" icon={<LuCheck size={14} />} disabled={busy} onClick={() => guard(() => cloud.chatRespond(chat.id, true), 'Запрос принят')}>Принять</Btn><Btn size="sm" icon={<LuX size={14} />} disabled={busy} onClick={() => guard(() => cloud.chatRespond(chat.id, false), 'Запрос отклонён')}>Отклонить</Btn></span></div>}
      {iDeclined && <div className="conv-bar"><span>Вы отклонили этот запрос.</span><Btn size="sm" disabled={busy} onClick={() => guard(() => cloud.chatRespond(chat.id, true), 'Запрос принят')}>Принять</Btn></div>}
      {waiting && <div className="conv-bar">{myMsgs >= 1 ? 'Ждём согласия владельца. Он увидит ваше сообщение и сможет ответить.' : 'С владельцем нужно согласие: сначала можно отправить одно сообщение.'}</div>}
      {blockedByDecline && <div className="conv-bar">Владелец отклонил запрос на чат.</div>}
      <form className="conv-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea aria-label="Сообщение" rows={1} maxLength={4000} value={text} disabled={!canType} placeholder={canType ? 'Сообщение…' : 'Отправка недоступна'} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button type="submit" className="send-btn" aria-label="Отправить" disabled={!text.trim() || busy || !canType}><LuSend size={18} /></button>
      </form>
      {panel === 'wall' && <WallpaperModal chat={chat} onClose={() => setPanel(null)} />}
      {panel === 'info' && <InfoModal chat={chat} me={me} onClose={() => setPanel(null)} />}
    </div>
  );
}

function WallpaperModal({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const media = useApp((s) => s.media[chat.id]); const role = useApp((s) => s.role); const { toast } = useUi();
  const ref = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const can = chat.kind === 'direct' || role?.key === 'owner';
  const wp = media?.wallpaper_v === chat.wallpaper_v ? media?.wallpaper : null;
  const run = async (fn: () => Promise<void>, ok: string) => { setBusy(true); try { await fn(); await refreshChats(); await ensureChatMedia({ ...chat }, true); toast(ok); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  return (
    <Modal title="Обои чата" size="sm" onClose={onClose}>
      <div className="bg-preview" style={wp ? { backgroundImage: `url("${wp}")` } : undefined}>{!wp && <span className="muted small"><LuImage size={22} /><br />Обои не выбраны</span>}</div>
      <input ref={ref} type="file" accept="image/*" hidden aria-label="Файл обоев" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(async () => cloud.chatUpdate(chat.id, { wallpaper: await backgroundFromFile(f, 1280, 0.72) }), 'Обои установлены'); e.target.value = ''; }} />
      {can ? <div className="row" style={{ marginTop: 14 }}><Btn kind="primary" disabled={busy} onClick={() => ref.current?.click()}>{wp ? 'Заменить' : 'Загрузить картинку'}</Btn>{wp && <Btn disabled={busy} onClick={() => run(() => cloud.chatUpdate(chat.id, { wallpaper: null }), 'Обои убраны')}>Убрать</Btn>}</div>
        : <div className="small muted" style={{ marginTop: 12 }}>Обои группы меняет только владелец.</div>}
      <div className="small muted" style={{ marginTop: 12 }}>{chat.kind === 'direct' ? 'Обои общие: их видят оба собеседника, и менять их может любой из вас.' : 'Обои видят все участники группы.'}</div>
    </Modal>
  );
}

function InfoModal({ chat, me, onClose }: { chat: Chat; me: string; onClose: () => void }) {
  const members = useApp((s) => s.members); const role = useApp((s) => s.role); const media = useApp((s) => s.media[chat.id]);
  const { toast } = useUi(); const view = useChatView(); const v = view(chat);
  const isOwner = role?.key === 'owner'; const [edit, setEdit] = useState(false);
  if (chat.kind === 'direct') {
    return <Modal title="О собеседнике" size="sm" onClose={onClose}>{v.peer ? <div className="col" style={{ gap: 12 }}><div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}><MemberAvatar m={v.peer} xl /><div style={{ minWidth: 0 }}><h2 style={{ fontSize: 20, overflowWrap: 'anywhere' }}>{nameOf(v.peer)}</h2><div className="small muted">{v.peer.role_title}</div><div className={`small ${v.peer.online ? 'pos' : 'muted'}`}>{seenText(v.peer)}</div></div></div>{v.peer.about && <div className="alert green"><div style={{ whiteSpace: 'pre-wrap' }}>{v.peer.about}</div></div>}</div> : <Empty title="Пользователь удалён" />}</Modal>;
  }
  const act = chat.members.filter((m) => m.status === 'active');
  return (
    <>
      <Modal title="О группе" onClose={onClose} foot={isOwner ? <Btn icon={<LuPencil size={15} />} onClick={() => setEdit(true)}>Редактировать группу</Btn> : undefined}>
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}><Avatar name={v.title} src={media?.avatar} xl /><div style={{ minWidth: 0 }}><h2 style={{ fontSize: 20, overflowWrap: 'anywhere' }}>{v.title}</h2><div className="small muted">{act.length} участн.</div></div></div>
          {chat.description ? <div className="alert green"><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{chat.description}</div></div> : <div className="small muted">Описания нет.</div>}
          <div className="col" style={{ gap: 8 }}>{act.map((mm) => { const m = members.find((x) => x.user_id === mm.user_id); return m ? <div key={m.user_id} className="row" style={{ gap: 10, flexWrap: 'nowrap' }}><MemberAvatar m={m} /><div style={{ minWidth: 0 }}><b>{nameOf(m)}</b>{m.user_id === me && <> <Chip>вы</Chip></>}<div className="small muted">{m.role_title} · {seenText(m)}</div></div></div> : null; })}</div>
        </div>
      </Modal>
      {edit && <GroupEdit chat={chat} onClose={() => { setEdit(false); toast('Готово'); }} />}
    </>
  );
}

function GroupEdit({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const members = useApp((s) => s.members); const media = useApp((s) => s.media[chat.id]); const me = useApp((s) => s.user?.id);
  const { toast } = useUi(); const [title, setTitle] = useState(chat.title ?? ''); const [desc, setDesc] = useState(chat.description ?? ''); const [busy, setBusy] = useState(false); const [add, setAdd] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const act = chat.members.filter((m) => m.status === 'active').map((m) => m.user_id);
  const run = async (fn: () => Promise<unknown>, ok?: string) => { setBusy(true); try { await fn(); await refreshChats(); if (ok) toast(ok); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  return (
    <Modal title="Редактировать группу" onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
          <Avatar name={title || 'Г'} src={media?.avatar} xl />
          <div className="row" style={{ gap: 6 }}>
            <input ref={ref} type="file" accept="image/*" hidden aria-label="Файл аватарки группы" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(async () => cloud.chatUpdate(chat.id, { avatar: await avatarFromFile(f) }), 'Аватарка группы обновлена'); e.target.value = ''; }} />
            <Btn size="sm" disabled={busy} onClick={() => ref.current?.click()}>Загрузить фото</Btn>{chat.has_avatar && <Btn size="sm" disabled={busy} onClick={() => run(() => cloud.chatUpdate(chat.id, { avatar: null }), 'Аватарка убрана')}>Убрать</Btn>}
          </div>
        </div>
        <Field label="Название"><Input aria-label="Название группы" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Описание"><Textarea aria-label="Описание группы" rows={3} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        <Btn kind="primary" disabled={busy || !title.trim()} onClick={() => run(() => cloud.chatUpdate(chat.id, { title, description: desc }), 'Сохранено')}>Сохранить название и описание</Btn>
        <h3>Участники</h3>
        <div className="col" style={{ gap: 8 }}>{act.map((id) => { const m = members.find((x) => x.user_id === id); return <div key={id} className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><span className="row" style={{ gap: 10, flexWrap: 'nowrap', minWidth: 0 }}>{m ? <MemberAvatar m={m} /> : null}<b style={{ overflowWrap: 'anywhere' }}>{m ? nameOf(m) : 'Удалённый пользователь'}</b></span>{id !== me && <Btn size="sm" disabled={busy} onClick={() => run(() => cloud.chatGroupMembers(chat.id, [], [id]), 'Участник удалён')}>Убрать</Btn>}</div>; })}</div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <select className="select" aria-label="Добавить участника" value={add} onChange={(e) => setAdd(e.target.value)} style={{ flex: 1, minWidth: 0 }}><option value="">Добавить участника…</option>{members.filter((m) => !act.includes(m.user_id) && !m.blocked).map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m)}</option>)}</select>
          <Btn disabled={!add || busy} onClick={() => run(async () => { await cloud.chatGroupMembers(chat.id, [add], []); setAdd(''); }, 'Участник добавлен')}>Добавить</Btn>
        </div>
      </div>
    </Modal>
  );
}

function NewChat({ onClose }: { onClose: () => void }) {
  const members = useApp((s) => s.members); const me = useApp((s) => s.user?.id); const role = useApp((s) => s.role);
  const { toast } = useUi(); const isOwner = role?.key === 'owner';
  const [tab, setTab] = useState<'direct' | 'group'>('direct'); const [q, setQ] = useState('');
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState(''); const [pick, setPick] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const list = members.filter((m) => m.user_id !== me && !m.blocked && (!q.trim() || [m.display_name, m.email].some((x) => x?.toLowerCase().includes(q.trim().toLowerCase()))));
  const open = async (id: string) => { setBusy(true); try { const cid = await cloud.chatOpenDirect(id); await refreshChats(); onClose(); go('chats', cid); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  const create = async () => { setBusy(true); try { const cid = await cloud.chatCreateGroup(title, desc, pick); await refreshChats(); onClose(); go('chats', cid); toast('Группа создана'); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  return (
    <Modal title="Новый чат" onClose={onClose} foot={tab === 'group' ? <Btn kind="primary" disabled={busy || !title.trim()} onClick={create}>Создать группу{pick.length ? ` (${pick.length})` : ''}</Btn> : undefined}>
      <div className="col" style={{ gap: 14 }}>
        {isOwner && <Seg value={tab} onChange={setTab} options={[['direct', 'Личный чат'], ['group', 'Группа']]} />}
        {tab === 'group' && <><Field label="Название группы"><Input aria-label="Название группы" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} /></Field><Field label="Описание"><Textarea aria-label="Описание группы" rows={2} maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field><div className="small muted">Аватарку группы можно добавить после создания.</div></>}
        <SearchBox value={q} onChange={setQ} placeholder="Ник или почта…" />
        <div className="pick-list">{list.length === 0 && <div className="muted small">Никого не найдено</div>}{list.map((m) => (
          <button key={m.user_id} type="button" className={`pick ${pick.includes(m.user_id) ? 'on' : ''}`} disabled={busy} onClick={() => tab === 'direct' ? open(m.user_id) : setPick((p) => (p.includes(m.user_id) ? p.filter((x) => x !== m.user_id) : [...p, m.user_id]))}>
            <MemberAvatar m={m} /><span className="pk"><b>{nameOf(m)}</b><span className="small muted">{m.role_title}{tab === 'direct' && m.role === 'owner' ? ' · нужно согласие' : ''}</span></span>{tab === 'group' && pick.includes(m.user_id) && <LuCheck size={18} />}
          </button>))}</div>
        {tab === 'direct' && <div className="small muted"><LuUsers size={13} /> С владельцем чат начинается с запроса — он должен согласиться. С остальными можно писать сразу.</div>}
        {!isOwner && <div className="small muted">Группы создаёт только владелец.</div>}
      </div>
    </Modal>
  );
}
