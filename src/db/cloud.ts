/**
 * Облачный режим: Supabase Auth + PostgREST через fetch (без внешних библиотек).
 * Ключ publishable публичный по замыслу — доступ ограничивают RLS-политики в базе.
 */
import { COLLECTIONS, emptyData, type Batch, type Data } from '../domain/types';
import type { StorageAdapter } from './storage';
import { optStore } from './../consent';

declare const __SB_URL__: string;
declare const __SB_KEY__: string;
export const SB_URL: string = typeof __SB_URL__ !== 'undefined' ? __SB_URL__ : '';
export const SB_KEY: string = typeof __SB_KEY__ !== 'undefined' ? __SB_KEY__ : '';
export const CLOUD = !!(SB_URL && SB_KEY);

export interface Session { access_token: string; refresh_token: string; expires_at: number }
export interface RoleDef { key: string; title: string; description: string; scope: 'all' | 'own_partner' | 'own_client'; read_collections: string[]; sections: string[]; can_write: boolean; is_system: boolean }
export interface UserRole { user_id: string; email: string | null; role: string; partner_id: string | null; client_id: string | null; created_at: string; blocked?: boolean }
export class CloudError extends Error { constructor(m: string, public status = 0) { super(m); } }

const LS = 'minicrm.session';
let session: Session | null = null;
export const getSession = () => session;
export function loadStoredSession() { try { session = JSON.parse(localStorage.getItem(LS) || sessionStorage.getItem(LS) || 'null'); } catch { session = null; } return session; }
/** Сессия хранится надолго только при согласии на cookie; иначе — до закрытия вкладки. */
function saveSession(s: Session | null) { session = s; try { localStorage.removeItem(LS); sessionStorage.removeItem(LS); if (s) optStore().setItem(LS, JSON.stringify(s)); } catch { /* приватный режим */ } }

export function jwtUser(token: string): { id: string; email: string } {
  const p = JSON.parse(decodeURIComponent(escape(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
  return { id: p.sub, email: p.email ?? '' };
}

const RU: [RegExp, string][] = [
  [/invalid login credentials/i, 'Неверная почта или пароль'], [/email not confirmed/i, 'Почта не подтверждена — откройте письмо со ссылкой'],
  [/already registered|already been registered/i, 'Этот email уже зарегистрирован — войдите'], [/at least \d+ characters/i, 'Пароль слишком короткий (минимум 6 символов)'],
  [/rate limit|too many|security purposes/i, 'Слишком много попыток — подождите минуту'], [/valid email|invalid email|unable to validate email/i, 'Некорректный адрес почты'],
  [/signups? not allowed|signup is disabled|signups not allowed for otp/i, 'Этой почты нет в системе — сначала зарегистрируйтесь'], [/banned|user is banned/i, 'Аккаунт заблокирован владельцем'], [/same password|different from the old/i, 'Новый пароль должен отличаться от старого'],
  [/expired|invalid.*(token|link)/i, 'Ссылка устарела — запросите новую'],
];
export const ruError = (m: string) => RU.find(([r]) => r.test(m))?.[1] ?? m;

async function parse(res: Response) {
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new CloudError(ruError(body?.msg || body?.message || body?.error_description || body?.error || `Ошибка ${res.status}`), res.status);
  return body;
}
const base = (token?: string): Record<string, string> => ({ apikey: SB_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) });
const redirectUrl = () => location.origin + location.pathname;

// ───────── Auth ─────────
function toSession(b: any): Session { return { access_token: b.access_token, refresh_token: b.refresh_token, expires_at: b.expires_at ?? Math.floor(Date.now() / 1000) + (b.expires_in ?? 3600) }; }

/** Разбирает ссылку из письма (#access_token=…). Возвращает тип события. */
export function consumeAuthHash(): { type?: string; error?: string } | null {
  const h = location.hash.replace(/^#/, '');
  if (!/(access_token|error_description|error_code)=/.test(h)) return null;
  const q = new URLSearchParams(h);
  history.replaceState(null, '', location.pathname + location.search + '#/');
  if (q.get('error_description')) return { error: ruError(q.get('error_description')!.replace(/\+/g, ' ')) };
  if (q.get('access_token')) { saveSession(toSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_at: Number(q.get('expires_at')) || undefined, expires_in: Number(q.get('expires_in')) || undefined })); return { type: q.get('type') ?? 'magiclink' }; }
  return null;
}
export async function signIn(email: string, password: string) {
  saveSession(toSession(await parse(await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: base(), body: JSON.stringify({ email, password }) }))));
}
/** true — сессия сразу создана; false — нужно подтвердить почту. */
export async function signUp(email: string, password: string, meta: Record<string, string> = {}): Promise<boolean> {
  const b = await parse(await fetch(`${SB_URL}/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl())}`, { method: 'POST', headers: base(), body: JSON.stringify({ email, password, data: meta }) }));
  if (b?.access_token) { saveSession(toSession(b)); return true; }
  return false;
}
export const sendMagicLink = async (email: string) => void parse(await fetch(`${SB_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectUrl())}`, { method: 'POST', headers: base(), body: JSON.stringify({ email, create_user: false }) }));
export const sendRecovery = async (email: string) => void parse(await fetch(`${SB_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectUrl())}`, { method: 'POST', headers: base(), body: JSON.stringify({ email }) }));
export async function setPassword(password: string) { await parse(await fetch(`${SB_URL}/auth/v1/user`, { method: 'PUT', headers: base(await token()), body: JSON.stringify({ password }) })); }
export async function signOut() {
  const t = session?.access_token; saveSession(null);
  if (t) fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: base(t) }).catch(() => undefined);
}

let refreshing: Promise<void> | null = null;
async function refresh() {
  if (!session) throw new CloudError('Требуется вход', 401);
  refreshing ??= (async () => {
    try { saveSession(toSession(await parse(await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: base(), body: JSON.stringify({ refresh_token: session!.refresh_token }) })))); }
    catch (e) { saveSession(null); throw e; } finally { refreshing = null; }
  })();
  return refreshing;
}
async function token(): Promise<string> {
  if (!session) throw new CloudError('Требуется вход', 401);
  if (session.expires_at - 60 < Date.now() / 1000) await refresh();
  return session!.access_token;
}
async function api(path: string, init: RequestInit & { headers?: Record<string, string> } = {}, retry = true): Promise<any> {
  const res = await fetch(`${SB_URL}${path}`, { ...init, headers: { ...base(await token()), ...init.headers } });
  if (res.status === 401 && retry) { await refresh(); return api(path, init, false); }
  return parse(res);
}
const rpc = (fn: string, args: object) => api(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

// ───────── Профиль и роли ─────────
export async function fetchProfile(userId: string): Promise<{ me: UserRole | null; roles: RoleDef[] }> {
  const [me, roles] = await Promise.all([api(`/rest/v1/user_roles?user_id=eq.${userId}&select=*`), api('/rest/v1/roles?select=*&order=created_at')]);
  return { me: me[0] ?? null, roles };
}
export const fetchUsers = (): Promise<UserRole[]> => api('/rest/v1/user_roles?select=*&order=created_at');
export async function patchUser(userId: string, patch: Partial<Pick<UserRole, 'role' | 'partner_id' | 'client_id'>>) {
  const rows = await api(`/rest/v1/user_roles?user_id=eq.${userId}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) });
  if (!rows.length) throw new CloudError('Не удалось изменить: недостаточно прав');
}
export async function saveRole(r: Partial<RoleDef> & { key: string }, isNew: boolean) {
  const { is_system: _s, ...body } = r as RoleDef;
  const rows = isNew ? await api('/rest/v1/roles', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...body, is_system: false }) })
    : await api(`/rest/v1/roles?key=eq.${r.key}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
  if (!rows.length) throw new CloudError('Не удалось сохранить роль');
}
export async function deleteRole(key: string) {
  const rows = await api(`/rest/v1/roles?key=eq.${key}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  if (!rows.length) throw new CloudError('Эту роль удалить нельзя');
}
export const fetchMyOrders = (): Promise<{ client: { name: string; phone?: string; telegram?: string; email?: string } | null; orders: any[] }> => rpc('my_orders', {});

// ───────── Профиль пользователя и push ─────────
export interface NotifyPrefs { new_user: boolean; orders: boolean; money: boolean; other: boolean }
export interface Profile { user_id: string; display_name: string | null; phone: string | null; about: string | null; avatar: string | null; show_phone: boolean; notify: NotifyPrefs }
export const defaultNotify: NotifyPrefs = { new_user: true, orders: true, money: true, other: false };
export async function fetchMyProfile(userId: string): Promise<Profile> {
  const rows = await api(`/rest/v1/profiles?user_id=eq.${userId}&select=user_id,display_name,phone,about,avatar,show_phone,notify`);
  return rows[0] ? { ...rows[0], notify: { ...defaultNotify, ...rows[0].notify } } : { user_id: userId, display_name: null, phone: null, about: null, avatar: null, show_phone: false, notify: defaultNotify };
}
export type ProfilePatch = Partial<Omit<Profile, 'user_id'>>;
export async function saveProfile(userId: string, p: ProfilePatch) {
  await api('/rest/v1/profiles?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: userId, ...p, updated_at: new Date().toISOString() }) });
}
export interface Member { user_id: string; email: string | null; role: string; role_title: string; display_name: string | null; avatar: string | null; about: string | null; phone: string | null; online: boolean; seen_ago_s: number | null; created_at: string; blocked: boolean; partner_id: string | null; client_id: string | null }
export const fetchMembers = (): Promise<Member[]> => rpc('members', {});
export const touchSeen = () => rpc('touch_seen', {});
export const adminSetBlocked = (target: string, flag: boolean) => rpc('admin_set_blocked', { target, flag });
export const adminDeleteUser = (target: string) => rpc('admin_delete_user', { target });

export interface AboutInfo { name: string; email: string; phone: string; address: string; telegram: string; text: string }
export const emptyAbout: AboutInfo = { name: '', email: '', phone: '', address: '', telegram: '', text: '' };
export async function fetchAbout(): Promise<AboutInfo> {
  const res = await fetch(`${SB_URL}/rest/v1/site_info?key=eq.about&select=data`, { headers: { apikey: SB_KEY } });
  const rows = await parse(res); return { ...emptyAbout, ...(rows?.[0]?.data ?? {}) };
}
export interface Brand { name: string; logo: string | null }
export async function fetchBrand(): Promise<Brand | null> {
  const rows = await parse(await fetch(`${SB_URL}/rest/v1/site_info?key=eq.brand&select=data`, { headers: { apikey: SB_KEY } }));
  const d = rows?.[0]?.data; return d ? { name: d.name ?? '', logo: d.logo ?? null } : { name: '', logo: null };
}
export async function saveBrand(b: Brand) {
  await api('/rest/v1/site_info?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'brand', data: b, updated_at: new Date().toISOString() }) });
}
export async function saveAbout(a: AboutInfo) {
  await api('/rest/v1/site_info?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ key: 'about', data: a, updated_at: new Date().toISOString() }) });
}
export async function fetchVapidKey(): Promise<string> {
  const res = await fetch(`${SB_URL}/functions/v1/push`, { headers: { apikey: SB_KEY } });
  const j = await parse(res); if (!j.key) throw new CloudError('Сервер уведомлений не настроен'); return j.key;
}
export async function savePushSub(sub: PushSubscriptionJSON) {
  const k = sub.keys ?? {};
  await api('/rest/v1/push_subscriptions?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ endpoint: sub.endpoint, p256dh: k.p256dh, auth: k.auth, user_agent: navigator.userAgent.slice(0, 200) }) });
}
export const deletePushSub = (endpoint: string) => api(`/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
export async function sendTestPush(): Promise<{ sent: number }> {
  return parse(await fetch(`${SB_URL}/functions/v1/push?action=test`, { method: 'POST', headers: { ...base(await token()) }, body: '{}' }));
}

// ───────── Хранилище данных ─────────
const PAGE = 1000;
export class SupabaseAdapter implements StorageAdapter {
  async load(): Promise<Data> {
    const data: any = emptyData();
    let settings: any = null;
    for (let from = 0; ; from += PAGE) {
      const rows: { collection: string; data: any }[] = await api('/rest/v1/records?select=collection,data&order=collection.asc,id.asc', { headers: { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' } });
      for (const r of rows) r.collection === 'settings' ? (settings = r.data) : data[r.collection]?.push(r.data);
      if (rows.length < PAGE) break;
    }
    if (settings) data.settings = { ...data.settings, ...settings, id: 'main' };
    return data as Data;
  }
  async commit(b: Batch) {
    const dedupe = (arr: any[]) => [...new Map(arr.map((x) => [x.id, x])).values()];
    const put: Record<string, any[]> = {}, del: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(b.put)) if (v?.length) put[k] = dedupe(v);
    for (const [k, v] of Object.entries(b.del)) if (v?.length) del[k] = [...new Set(v)];
    if (!Object.keys(put).length && !Object.keys(del).length) return;
    await rpc('commit_batch', { batch: { put, del } });
  }
  async replaceAll(d: Data) {
    const payload: Record<string, any[]> = { settings: [{ ...d.settings, id: 'main' }] };
    for (const c of COLLECTIONS) payload[c] = d[c] as any[];
    await rpc('replace_all', { payload });
  }
}
