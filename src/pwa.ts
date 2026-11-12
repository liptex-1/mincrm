import { CLOUD, deletePushSub, fetchVapidKey, savePushSub } from './db/cloud';

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
  // уведомление открыло приложение — переходим в нужный раздел
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'navigate' && typeof e.data.url === 'string') location.hash = e.data.url.replace(/^.*#/, '#'); });
}

const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };

async function reg() { return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready); }

export async function currentSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try { return await (await reg()).pushManager.getSubscription(); } catch { return null; }
}

/** Вызывать только из обработчика нажатия (требование iOS). */
export async function enablePush(): Promise<void> {
  if (!CLOUD) throw new Error('Уведомления работают в облачном режиме');
  if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? 'На iPhone уведомления работают только после добавления на экран «Домой»' : 'Этот браузер не поддерживает уведомления');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Разрешение на уведомления не выдано. Включите его в настройках телефона.');
  const key = await fetchVapidKey();
  const r = await reg();
  let sub = await r.pushManager.getSubscription();
  if (sub) { // подписка на другой ключ — пересоздаём
    const cur = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    const want = b64(key);
    if (!cur || cur.length !== want.length || cur.some((v, i) => v !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ??= await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await savePushSub(sub.toJSON());
}

export async function disablePush(): Promise<void> {
  const sub = await currentSub(); if (!sub) return;
  try { await deletePushSub(sub.endpoint); } catch { /* ignore */ }
  await sub.unsubscribe().catch(() => undefined);
}
