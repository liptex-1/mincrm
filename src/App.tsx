import { useEffect, useMemo, useState } from 'react';
import { LuChartColumn, LuCircleUser, LuInfo, LuSparkles, LuKeyRound, LuLogOut, LuUserRound, LuHandshake, LuLayoutDashboard, LuMenu, LuMoon, LuNfc, LuPiggyBank, LuSearch, LuSettings, LuShoppingBag, LuSun, LuUsers, LuWallet, LuFactory } from 'react-icons/lu';
import { computeOrder } from './domain/finance';
import { signOutUser, useApp, useData } from './store/store';
import { Avatar, Btn, UiProvider } from './ui/kit';
import { go, useRoute, type Route } from './ui/router';
import Analytics from './pages/Analytics';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Distribution from './pages/Distribution';
import Finance from './pages/Finance';
import Orders from './pages/Orders';
import Partners from './pages/Partners';
import Production from './pages/Production';
import Settings from './pages/Settings';
import Access from './pages/Access';
import Cabinet from './pages/Cabinet';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Members from './pages/Members';
import About from './pages/About';
import { CookiesDoc, PrivacyDoc, PublicLegal, TermsDoc } from './pages/Legal';
import { CookieBanner } from './ui/CookieBanner';
import { applyBg } from './bg';
import { readOpt, writeOpt } from './consent';
import { CHANGELOG, VERSION_LABEL } from './version';
import { Modal } from './ui/kit';

const NAV: [Route, string, React.ReactNode][] = [
  ['profile', 'Профиль', <LuCircleUser size={18} />], ['dashboard', 'Главная', <LuLayoutDashboard size={18} />], ['clients', 'Клиенты', <LuUsers size={18} />], ['orders', 'Заказы', <LuShoppingBag size={18} />],
  ['production', 'Производство', <LuFactory size={18} />], ['finance', 'Финансы', <LuWallet size={18} />], ['partners', 'Партнёры', <LuHandshake size={18} />],
  ['distribution', 'Распределение', <LuPiggyBank size={18} />], ['analytics', 'Аналитика', <LuChartColumn size={18} />], ['settings', 'Настройки', <LuSettings size={18} />],
  ['access', 'Доступ', <LuKeyRound size={18} />], ['cabinet', 'Мой кабинет', <LuUserRound size={18} />],
  ['members', 'Участники', <LuUsers size={18} />], ['about', 'О нас', <LuInfo size={18} />],
];
const Doc = ({ children }: { children: React.ReactNode }) => <div className="card" style={{ maxWidth: 860 }}>{children}</div>;
function PrivacyPage() { return <Doc><PrivacyDoc /></Doc>; }
function TermsPage() { return <Doc><TermsDoc /></Doc>; }
function CookiesPage() { return <Doc><CookiesDoc /></Doc>; }
const COMMON = ['profile', 'members', 'about', 'privacy', 'terms', 'cookies'];
const PAGES: Record<Route, () => React.JSX.Element> = { dashboard: Dashboard, clients: Clients, orders: Orders, production: Production, finance: Finance, partners: Partners, distribution: Distribution, analytics: Analytics, settings: Settings, access: Access, cabinet: Cabinet, profile: Profile, members: Members, about: About, privacy: PrivacyPage, terms: TermsPage, cookies: CookiesPage };

const themePref = () => readOpt('minicrm.theme');
function applyTheme(theme: string, density: string, anim: boolean) {
  theme = themePref() ?? theme;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const el = document.documentElement;
  el.dataset.theme = dark ? 'dark' : 'light'; el.dataset.density = density; el.dataset.motion = anim ? 'on' : 'off';
}

function Shell() {
  const d = useData();
  const { route: wanted } = useRoute();
  const role = useApp((x) => x.role);
  const user = useApp((x) => x.user);
  const canWrite = useApp((x) => x.canWrite);
  const isCloud = useApp((x) => x.cloud);
  const allowed = [...(role?.sections ?? []), ...COMMON];
  const home = ((role?.sections ?? [])[0] as Route) ?? 'profile';
  const route: Route = allowed.includes(wanted) ? wanted : home;
  const profile = useApp((x) => x.profile);
  const shownName = profile?.display_name || user?.email || '';
  const [open, setOpen] = useState(false);
  const [news, setNews] = useState(false);
  const [, bump] = useState(0);
  const s = d.settings;
  useEffect(() => { document.documentElement.dataset.readonly = canWrite ? '0' : '1'; }, [canWrite]);
  useEffect(() => { if (wanted !== route) go(route); }, [wanted, route]);
  useEffect(() => { applyTheme(s.theme, s.density, s.animations); document.title = `${s.businessName} · MiniCRM`; }, [s.theme, s.density, s.animations, s.businessName, canWrite]);
  useEffect(() => {
    if (s.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); const h = () => applyTheme(s.theme, s.density, s.animations);
    mq.addEventListener('change', h); return () => mq.removeEventListener('change', h);
  }, [s.theme, s.density, s.animations]);
  useEffect(() => setOpen(false), [route]);
  const Page = PAGES[route];
  const lowStock = d.materials.filter((m) => !m.archived && m.qty <= m.minQty).length;
  const dark = document.documentElement.dataset.theme === 'dark';

  return (
    <div className="app">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><div className="brand-logo">{s.logo ? <img src={s.logo} alt="" /> : <LuNfc size={20} />}</div><div><b>{s.businessName}</b><span>MiniCRM</span></div></div>
        <nav className="nav col" style={{ gap: 2 }}>{NAV.filter(([r]) => allowed.includes(r)).map(([r, label, icon]) => (
          <a key={r} href={`#/${r}`} className={route === r ? 'active' : ''}>{icon}{label}{r === 'production' && lowStock > 0 && <span className="badge-dot">{lowStock}</span>}</a>))}</nav>
        <div className="side-foot">{isCloud ? 'Данные в облаке · синхронизация между устройствами' : 'Данные хранятся локально на этом устройстве'}
          <button type="button" className="ver" onClick={() => setNews(true)}><LuSparkles size={13} /> Обновление {VERSION_LABEL}</button></div>
      </aside>
      <div className="main">
        <header className="topbar">
          <Btn kind="ghost icon menu-btn" onClick={() => setOpen(true)} aria-label="Меню"><LuMenu size={20} /></Btn>
          {role?.scope === 'all' ? <GlobalSearch /> : null}
          <div className="spacer" />
          <Btn kind="ghost icon" aria-label="Сменить тему" onClick={() => { writeOpt('minicrm.theme', dark ? 'light' : 'dark'); applyTheme(s.theme, s.density, s.animations); bump((n) => n + 1); }}>{dark ? <LuSun size={18} /> : <LuMoon size={18} />}</Btn>
          <a className="profile" href={isCloud ? '#/profile' : undefined} title={user?.email} aria-label="Профиль"><span className="pn">{isCloud ? `${shownName} · ${role?.title ?? ''}` : s.businessName}</span><Avatar name={isCloud ? shownName || '?' : s.businessName} src={isCloud ? profile?.avatar : null} /></a>
          {isCloud && <Btn kind="ghost icon" aria-label="Выйти" title="Выйти" onClick={signOutUser}><LuLogOut size={18} /></Btn>}
        </header>
        {!canWrite && isCloud && role?.scope === 'all' && <div className="ro-banner">Режим просмотра — ваша роль «{role?.title}» не может изменять данные</div>}
        <main className="content" key={route}><Page /></main>
        {news && <Modal title={`Что нового · ${VERSION_LABEL}`} onClose={() => setNews(false)}>{CHANGELOG.map((c) => <div key={c.v} style={{ marginBottom: 16 }}><h3>Версия {c.v}v <span className="muted small">· {c.date}</span></h3><ul style={{ margin: '6px 0 0 18px', padding: 0 }}>{c.items.map((i) => <li key={i} className="small" style={{ marginBottom: 4 }}>{i}</li>)}</ul></div>)}</Modal>}
      </div>
    </div>
  );
}

function GlobalSearch() {
  const d = useData();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const res = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return null;
    const m = (...x: (string | undefined)[]) => x.some((v) => v?.toLowerCase().includes(t));
    return {
      clients: d.clients.filter((c) => m(c.name, c.phone, c.telegram, c.email)).slice(0, 4),
      orders: d.orders.filter((o) => m(o.number, o.title, d.clients.find((c) => c.id === o.clientId)?.name)).slice(0, 4),
    };
  }, [q, d.clients, d.orders]);
  const pick = (r: Route, p?: string) => { setQ(''); go(r, p); };
  return (
    <div className="search">
      <LuSearch size={16} />
      <input placeholder="Поиск клиентов и заказов…" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
      {focus && res && (
        <div className="search-pop">
          {res.clients.length + res.orders.length === 0 && <div className="muted small" style={{ padding: 12 }}>Ничего не найдено</div>}
          {res.clients.length > 0 && <div className="search-group">Клиенты</div>}
          {res.clients.map((c) => <button key={c.id} onMouseDown={() => pick('clients')}><Avatar name={c.name} /><div><b>{c.name}</b><small>{c.phone || c.telegram || c.email || ''}</small></div></button>)}
          {res.orders.length > 0 && <div className="search-group">Заказы</div>}
          {res.orders.map((o) => <button key={o.id} onMouseDown={() => pick('orders', o.id)}><LuShoppingBag size={18} /><div><b>{o.number} · {o.title}</b><small>{computeOrder(o).total / 100} {d.settings.currency}</small></div></button>)}
        </div>
      )}
    </div>
  );
}

function Inner() {
  const ready = useApp((s) => s.ready);
  const auth = useApp((s) => s.auth);
  const { route } = useRoute();
  useEffect(() => { applyBg(); }, []);
  if (!ready) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--muted)' }}>Загрузка…</div>;
  if (auth !== 'ready') {
    if (route === 'privacy' || route === 'terms' || route === 'cookies') return <PublicLegal doc={route} />;
    return auth === 'loading' ? <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: 'var(--muted)' }}>Загрузка…</div> : <Login />;
  }
  return <UiProvider><Shell /></UiProvider>;
}
export default function App() { return <><Inner /><CookieBanner /></>; }
