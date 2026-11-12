import { useEffect, useState } from 'react';
import { LuBell, LuBellOff, LuLogOut, LuSend, LuShare, LuSmartphone } from 'react-icons/lu';
import { defaultNotify, sendTestPush, setPassword, type NotifyPrefs } from '../db/cloud';
import { currentSub, disablePush, enablePush, isIOS, isStandalone, pushSupported } from '../pwa';
import { errMessage, signOutUser, updateProfile, useApp } from '../store/store';
import { Alert, Avatar, Btn, Card, Chip, Field, Input, PasswordInput, useUi } from '../ui/kit';

const KINDS: [keyof NotifyPrefs, string, string][] = [
  ['new_user', 'Новые пользователи', 'Кто-то зарегистрировался и ждёт назначения роли (для владельца)'],
  ['orders', 'Заказы', 'Новые заказы и смена их статуса'],
  ['money', 'Деньги', 'Платежи, выплаты, вложения, начисление прибыли'],
  ['other', 'Прочее', 'Новые клиенты, партнёры, поставки'],
];

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className={`switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><i /></button>;
}

export default function Profile() {
  const cloud = useApp((s) => s.cloud);
  const user = useApp((s) => s.user);
  const role = useApp((s) => s.role);
  const profile = useApp((s) => s.profile);
  const { toast } = useUi();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [notify, setNotify] = useState<NotifyPrefs>(profile?.notify ?? defaultNotify);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [perm, setPerm] = useState<string>(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  useEffect(() => { setName(profile?.display_name ?? ''); setPhone(profile?.phone ?? ''); setNotify(profile?.notify ?? defaultNotify); }, [profile]);
  useEffect(() => { currentSub().then((s) => setSubscribed(!!s)); }, []);

  const ios = isIOS();
  const needInstall = ios && !isStandalone();
  const canPush = pushSupported() && !needInstall;
  const guard = async (fn: () => Promise<void>, ok?: string) => { setBusy(true); try { await fn(); if (ok) toast(ok); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  const save = (next = notify) => guard(() => updateProfile({ display_name: name.trim() || null, phone: phone.trim() || null, notify: next }), 'Профиль сохранён');
  const toggle = (k: keyof NotifyPrefs, v: boolean) => { const n = { ...notify, [k]: v }; setNotify(n); guard(() => updateProfile({ display_name: name.trim() || null, phone: phone.trim() || null, notify: n })); };
  const turnOn = () => guard(async () => { try { await enablePush(); setSubscribed(true); } finally { setPerm(Notification.permission); } }, 'Уведомления включены');
  const turnOff = () => guard(async () => { await disablePush(); setSubscribed(false); }, 'Уведомления отключены на этом устройстве');
  const test = () => guard(async () => { const r = await sendTestPush(); if (!r.sent) throw new Error('Не удалось отправить: сначала включите уведомления на этом устройстве'); }, 'Тестовое уведомление отправлено');
  const changePw = () => guard(async () => {
    setPwErr('');
    if (pw.length < 6) { setPwErr('Минимум 6 символов'); throw new Error('Пароль слишком короткий'); }
    if (pw !== pw2) { setPwErr('Пароли не совпадают'); throw new Error('Пароли не совпадают'); }
    await setPassword(pw); setPw(''); setPw2('');
  }, 'Пароль изменён');

  if (!cloud) return (<><div className="page-head"><div><h1>Профиль</h1></div></div><Alert>Профиль и уведомления доступны в облачной версии — после входа по почте. Сейчас приложение работает локально на этом устройстве.</Alert></>);

  return (
    <div className="profile-page">
      <div className="page-head"><div><h1>Профиль</h1><p>Личные данные, пароль и уведомления</p></div><Btn icon={<LuLogOut size={16} />} onClick={signOutUser}>Выйти</Btn></div>
      <div className="grid g2 mb" style={{ alignItems: 'start' }}>
        <Card title="Личные данные">
          <div className="row" style={{ gap: 14, marginBottom: 16, flexWrap: 'nowrap' }}>
            <Avatar name={name || user?.email || '?'} large />
            <div style={{ minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{user?.email}</b><div style={{ marginTop: 4 }}><Chip tone="green">{role?.title}</Chip></div></div>
          </div>
          <form className="col" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Имя"><Input aria-label="Имя" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" autoComplete="name" /></Field>
            <Field label="Телефон"><Input aria-label="Телефон" type="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} placeholder="+7 900 000-00-00" autoComplete="tel" /></Field>
            <Btn kind="primary" type="submit" disabled={busy}>Сохранить</Btn>
          </form>
        </Card>

        <Card title="Смена пароля">
          <form className="col" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); changePw(); }}>
            <Field label="Новый пароль" error={pwErr}><PasswordInput aria-label="Новый пароль" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
            <Field label="Повторите пароль"><PasswordInput aria-label="Повторите пароль" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
            <Btn type="submit" disabled={busy || !pw}>Изменить пароль</Btn>
            <div className="small muted">Минимум 6 символов. Вход по ссылке из письма продолжит работать.</div>
          </form>
        </Card>
      </div>

      <Card title="Уведомления" action={subscribed ? <Chip tone="green">включены на этом устройстве</Chip> : <Chip>выключены</Chip>}>
        {needInstall && (
          <div className="mb"><Alert>
            <div><b>Сначала добавьте приложение на экран «Домой».</b> На iPhone уведомления работают только из установленного приложения (iOS 16.4 и новее).
              <ol className="small" style={{ margin: '8px 0 0 18px', padding: 0 }}>
                <li>Откройте этот сайт в Safari.</li>
                <li>Нажмите <LuShare size={14} style={{ verticalAlign: '-2px' }} /> «Поделиться» → «На экран „Домой“».</li>
                <li>Запустите приложение с иконки и вернитесь на эту страницу.</li>
              </ol></div>
          </Alert></div>
        )}
        {!pushSupported() && !needInstall && <div className="mb"><Alert tone="red">Этот браузер не поддерживает push-уведомления.</Alert></div>}
        {perm === 'denied' && <div className="mb"><Alert tone="red">Уведомления запрещены в настройках телефона или браузера. Разрешите их для этого приложения и повторите.</Alert></div>}
        <div className="row mb">
          {subscribed
            ? <><Btn icon={<LuBellOff size={16} />} disabled={busy} onClick={turnOff}>Отключить на этом устройстве</Btn><Btn icon={<LuSend size={16} />} disabled={busy} onClick={test}>Отправить тест</Btn></>
            : <Btn kind="primary" icon={<LuBell size={16} />} disabled={busy || !canPush} onClick={turnOn}>Включить уведомления</Btn>}
          {ios && isStandalone() && <span className="small muted row" style={{ gap: 5 }}><LuSmartphone size={14} />Приложение установлено</span>}
        </div>
        <div className="col" style={{ gap: 0 }}>
          {KINDS.filter(([k]) => k !== 'new_user' || role?.scope === 'all').map(([k, title, text]) => (
            <div key={k} className="notify-row"><div><b>{title}</b><div className="small muted">{text}</div></div><Switch on={notify[k]} label={title} onChange={(v) => toggle(k, v)} /></div>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 12 }}>Настройки типов уведомлений действуют на всех ваших устройствах. Изменения сделанные вами самими не присылаются.</div>
      </Card>
    </div>
  );
}
