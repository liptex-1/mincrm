import { useSyncExternalStore } from 'react';
import { buildDemo } from '../domain/demo';
import { applyBatch, AppError, logEntry } from '../domain/ops';
import { emptyData, type Batch, type Data } from '../domain/types';
import { createStorage, exportBackup, parseBackup, type StorageAdapter } from '../db/storage';
import * as cloud from '../db/cloud';
import type { RoleDef, UserRole } from '../db/cloud';

export type AuthState = 'loading' | 'signed_out' | 'recovery' | 'ready' | 'no_profile' | 'blocked';
export const ALL_SECTIONS = ['dashboard', 'clients', 'orders', 'production', 'finance', 'partners', 'distribution', 'analytics', 'settings', 'access'];

export interface AppState {
  ready: boolean; persistent: boolean; data: Data;
  cloud: boolean; auth: AuthState; user?: { id: string; email: string };
  me?: UserRole; role?: RoleDef; roles: RoleDef[]; users: UserRole[]; profile?: cloud.Profile; members: cloud.Member[]; canWrite: boolean; notice?: string;
}
const LOCAL_ROLE: RoleDef = { key: 'owner', title: 'Владелец', description: '', scope: 'all', read_collections: [], sections: ALL_SECTIONS, can_write: true, is_system: true };

let state: AppState = { ready: false, persistent: true, data: emptyData(), cloud: cloud.CLOUD, auth: 'loading', roles: [], users: [], members: [], canWrite: true };
const listeners = new Set<() => void>();
let adapter: StorageAdapter | null = null;
let queue: Promise<unknown> = Promise.resolve();
let pending = 0;
let poll: ReturnType<typeof setInterval> | null = null;

const emit = () => listeners.forEach((l) => l());
const set = (s: Partial<AppState>) => { state = { ...state, ...s }; emit(); };

export const getState = () => state;
export function useApp<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => sel(state));
}
export const useData = () => useApp((s) => s.data);
export const errMessage = (e: unknown) => (e instanceof AppError || e instanceof Error ? e.message : 'Неизвестная ошибка');

// ───────── Запуск ─────────
export async function init() {
  if (!cloud.CLOUD) {
    const { adapter: a, persistent } = await createStorage();
    adapter = a;
    set({ data: await a.load(), persistent, ready: true, auth: 'ready', role: LOCAL_ROLE, canWrite: true });
    return;
  }
  adapter = new cloud.SupabaseAdapter();
  const fromLink = cloud.consumeAuthHash();
  cloud.loadStoredSession();
  if (fromLink?.error) set({ notice: fromLink.error });
  set({ ready: true });
  if (!cloud.getSession()) return set({ auth: 'signed_out' });
  if (fromLink?.type === 'recovery') return set({ auth: 'recovery' });
  await enter();
}

/** Вход выполнен: подгружаем профиль, роли и данные согласно роли. */
export async function enter() {
  try {
    const s = cloud.getSession()!;
    const user = cloud.jwtUser(s.access_token);
    const { me, roles } = await cloud.fetchProfile(user.id);
    const role = roles.find((r) => r.key === me?.role);
    if (!me || !role) return set({ user, auth: 'no_profile', roles });
    if (me.blocked) { stopPolling(); return set({ user, me, auth: 'blocked', roles }); }
    const data = await adapter!.load();
    const users = role.key === 'owner' ? await cloud.fetchUsers() : [];
    const [profile, members] = await Promise.all([cloud.fetchMyProfile(user.id).catch(() => undefined), cloud.fetchMembers().catch(() => [] as cloud.Member[])]);
    cloud.touchSeen().catch(() => undefined);
    set({ user, me, role, roles, users, profile, members, data, canWrite: role.can_write, auth: 'ready', persistent: true });
    startPolling();
  } catch (e) {
    if (e instanceof cloud.CloudError && e.status === 401) { await signOutUser(); set({ notice: 'Сессия истекла — войдите снова' }); }
    else set({ auth: 'signed_out', notice: errMessage(e) });
  }
}

function startPolling() {
  stopPolling();
  let n = 0;
  const tick = async () => {
    if (document.hidden || pending > 0 || state.auth !== 'ready') return;
    try { if (n++ % 3 === 0) cloud.touchSeen().catch(() => undefined); await refreshFromCloud(); } catch { /* временная сеть — повторим */ }
  };
  poll = setInterval(tick, 20000);
  document.addEventListener('visibilitychange', tick);
}
function stopPolling() { if (poll) clearInterval(poll); poll = null; }

export async function refreshFromCloud() {
  if (!cloud.CLOUD || !state.user) return;
  const [data, prof, members, profile] = await Promise.all([adapter!.load(), cloud.fetchProfile(state.user.id), cloud.fetchMembers().catch(() => state.members), cloud.fetchMyProfile(state.user.id).catch(() => state.profile)]);
  if (pending > 0) return; // во время записи не затираем свежие изменения
  if (prof.me?.blocked) { stopPolling(); return set({ auth: 'blocked', me: prof.me }); }
  const role = prof.roles.find((r) => r.key === prof.me?.role);
  if (!prof.me || !role) return set({ auth: 'no_profile' });
  const users = role.key === 'owner' ? await cloud.fetchUsers() : [];
  const same = JSON.stringify(data) === JSON.stringify(state.data) && JSON.stringify(members) === JSON.stringify(state.members) && JSON.stringify(profile) === JSON.stringify(state.profile) && JSON.stringify(prof) === JSON.stringify({ me: state.me, roles: state.roles }) && JSON.stringify(users) === JSON.stringify(state.users);
  if (!same) set({ data, me: prof.me, role, roles: prof.roles, users, members, profile, canWrite: role.can_write });
}

// ───────── Аутентификация ─────────
export async function login(email: string, password: string) { await cloud.signIn(email, password); await enter(); }
export async function register(email: string, password: string, meta: Record<string, string> = {}): Promise<boolean> { const ok = await cloud.signUp(email, password, meta); if (ok) await enter(); return ok; }
export async function finishRecovery(password: string) { await cloud.setPassword(password); await enter(); }
export async function signOutUser() {
  stopPolling();
  try { const { disablePush } = await import('../pwa'); await disablePush(); } catch { /* ignore */ }
  await cloud.signOut();
  set({ auth: 'signed_out', user: undefined, me: undefined, role: undefined, users: [], profile: undefined, members: [], data: emptyData(), canWrite: false, notice: undefined });
}
export async function updateProfile(p: cloud.ProfilePatch) {
  const u = state.user; if (!u) return;
  await cloud.saveProfile(u.id, p);
  const profile = { ...(state.profile ?? { user_id: u.id, display_name: null, phone: null, about: null, avatar: null, show_phone: false, notify: cloud.defaultNotify }), ...p } as cloud.Profile;
  set({ profile, members: state.members.map((m) => (m.user_id === u.id ? { ...m, display_name: profile.display_name, avatar: profile.avatar, about: profile.about, phone: profile.phone } : m)) });
}
async function reloadPeople() {
  const [members, users] = await Promise.all([cloud.fetchMembers(), state.role?.key === 'owner' ? cloud.fetchUsers() : Promise.resolve([] as UserRole[])]);
  set({ members, users });
}
/** Владелец: правка профиля другого участника. */
export async function adminEditProfile(userId: string, p: cloud.ProfilePatch) { await cloud.saveProfile(userId, p); await reloadPeople(); }
export async function adminBlock(userId: string, flag: boolean) { await cloud.adminSetBlocked(userId, flag); await reloadPeople(); }
export async function adminDelete(userId: string) { await cloud.adminDeleteUser(userId); await reloadPeople(); }
export const clearNotice = () => set({ notice: undefined });

// ───────── Запись ─────────
/**
 * Единственная точка записи. Пакет сначала сохраняется в БД одной транзакцией,
 * и только после успеха применяется к состоянию интерфейса. Операции выстраиваются в очередь.
 */
export function mutate(plan: (d: Data) => Batch): Promise<void> {
  pending++;
  const job = queue.then(async () => {
    if (!state.canWrite) throw new AppError('Режим просмотра: у вашей роли нет права изменять данные');
    const batch = plan(state.data); // бросает AppError, если правила нарушены
    await adapter!.commit(batch);
    set({ data: applyBatch(state.data, batch) });
  });
  queue = job.catch(() => undefined).then(() => { pending--; });
  return job;
}

// ───────── Резервные копии, демо, сброс ─────────
export async function importBackup(text: string) {
  const data = parseBackup(text);
  await adapter!.replaceAll(data);
  set({ data });
  await mutate(() => ({ put: { log: [logEntry('Импорт', 'Резервная копия', undefined, 'Данные заменены резервной копией')] }, del: {} }));
}
export function backupText() { return exportBackup(state.data); }
export async function markBackup() { await mutate((d) => ({ put: { settings: [{ ...d.settings, lastBackupAt: new Date().toISOString() }] }, del: {} })); }
export async function loadDemo() { const demo = buildDemo(); await adapter!.replaceAll(demo); set({ data: demo }); }
export async function resetAll() { const e = emptyData(); await adapter!.replaceAll(e); set({ data: e }); }

// ───────── Управление доступом (владелец) ─────────
export async function reloadUsers() { set({ users: await cloud.fetchUsers() }); }
export async function updateUser(id: string, patch: Parameters<typeof cloud.patchUser>[1]) { await cloud.patchUser(id, patch); await refreshFromCloud(); await reloadUsers(); }
export async function upsertRole(r: Partial<RoleDef> & { key: string }, isNew: boolean) { await cloud.saveRole(r, isNew); await refreshFromCloud(); }
export async function removeRole(key: string) { await cloud.deleteRole(key); await refreshFromCloud(); }
