import { useEffect, useState } from 'react';

/** Мини-роутер на hash: работает при открытии файла напрямую, без сервера. */
export const routes = ['dashboard', 'clients', 'orders', 'production', 'finance', 'partners', 'distribution', 'analytics', 'settings', 'cabinet', 'access', 'profile', 'members', 'about', 'privacy', 'terms', 'cookies'] as const;
export type Route = (typeof routes)[number];

export function currentRoute(): { route: Route; param?: string } {
  const [r, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { route: (routes as readonly string[]).includes(r) ? (r as Route) : 'dashboard', param };
}
export function useRoute() {
  const [v, setV] = useState(currentRoute());
  useEffect(() => {
    const h = () => setV(currentRoute());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return v;
}
export const go = (route: Route, param?: string) => { location.hash = `#/${route}${param ? '/' + param : ''}`; };
