import { useState } from 'react';
import { LuMailCheck, LuNfc } from 'react-icons/lu';
import { LEGAL_VERSION } from '../version';
import { sendMagicLink, sendRecovery } from '../db/cloud';
import { clearNotice, finishRecovery, login, register, signOutUser, useApp } from '../store/store';
import { Alert, Btn, Field, Input, PasswordInput } from '../ui/kit';

type Mode = 'in' | 'up' | 'magic' | 'forgot';
const TITLES: Record<Mode, string> = { in: 'Вход', up: 'Регистрация', magic: 'Вход по ссылке', forgot: 'Восстановление пароля' };

export default function Login() {
  const auth = useApp((s) => s.auth);
  const notice = useApp((s) => s.notice);
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState('');
  const [terms, setTerms] = useState(false);
  const [priv, setPriv] = useState(false);

  const go = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); clearNotice(); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); } };
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = () => go(async () => {
    const e = email.trim();
    if (mode === 'in') await login(e, pw);
    else if (mode === 'up') {
      if (pw.length < 6) throw new Error('Пароль — минимум 6 символов');
      if (pw !== pw2) throw new Error('Пароли не совпадают');
      if (!terms || !priv) throw new Error('Для регистрации примите Пользовательское соглашение и согласие на обработку персональных данных');
      if (!(await register(e, pw, { terms_at: new Date().toISOString(), terms_version: LEGAL_VERSION }))) setSent(`Мы отправили письмо на ${e}. Откройте его и подтвердите почту, затем войдите.`);
    } else if (mode === 'magic') { await sendMagicLink(e); setSent(`Ссылка для входа отправлена на ${e}. Она действует ограниченное время.`); }
    else { await sendRecovery(e); setSent(`Письмо для смены пароля отправлено на ${e}.`); }
  });

  if (auth === 'recovery') return (
    <Shell title="Новый пароль">
      <div className="col" style={{ gap: 14 }}>
        <Field label="Новый пароль" error={err}><PasswordInput aria-label="Новый пароль" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
        <Btn kind="primary" disabled={busy || pw.length < 6} onClick={() => go(() => finishRecovery(pw))}>Сохранить и войти</Btn>
        <div className="small muted">Минимум 6 символов.</div>
      </div>
    </Shell>
  );
  if (auth === 'no_profile') return (
    <Shell title="Нет доступа">
      <Alert tone="red">Для вашего аккаунта не назначена роль. Обратитесь к владельцу бизнеса.</Alert>
      <Btn style={{ marginTop: 14, width: '100%' }} onClick={signOutUser}>Выйти</Btn>
    </Shell>
  );

  if (auth === 'blocked') return (
    <Shell title="Аккаунт заблокирован">
      <Alert tone="red">Владелец заблокировал ваш доступ. Если это ошибка — свяжитесь с ним, контакты указаны на странице «О нас».</Alert>
      <Btn style={{ marginTop: 14, width: '100%' }} onClick={signOutUser}>Выйти</Btn>
    </Shell>
  );

  return (
    <Shell title={TITLES[mode]}>
      {sent ? (
        <div className="col" style={{ gap: 14, textAlign: 'center' }}>
          <LuMailCheck size={40} style={{ color: 'var(--accent-strong)', margin: '0 auto' }} /><div>{sent}</div>
          <Btn onClick={() => { setSent(''); setMode('in'); }}>Вернуться ко входу</Btn>
        </div>
      ) : (
        <form className="col" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); if (valid && !busy) submit(); }}>
          {notice && <Alert>{notice}</Alert>}
          <Field label="Электронная почта"><Input type="email" aria-label="Электронная почта" autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
          {(mode === 'in' || mode === 'up') && <Field label="Пароль"><PasswordInput aria-label="Пароль" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>}
          {mode === 'up' && <Field label="Повторите пароль"><PasswordInput aria-label="Повторите пароль" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>}
          {mode === 'up' && (
            <div className="col" style={{ gap: 8 }}>
              <label className="check"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>Я принимаю <a href="#/terms" target="_blank" rel="noopener">Пользовательское соглашение</a></span></label>
              <label className="check"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /><span>Я даю согласие на обработку персональных данных согласно <a href="#/privacy" target="_blank" rel="noopener">Политике обработки персональных данных</a></span></label>
            </div>
          )}
          {mode === 'magic' && <div className="small muted">Ссылка работает для уже зарегистрированных пользователей. Нового аккаунта нет — сначала зарегистрируйтесь с паролем.</div>}
          {err && <div className="err" style={{ color: 'var(--danger)', fontSize: 13 }}>{err}</div>}
          <Btn kind="primary" type="submit" disabled={!valid || busy || (mode === 'up' && !(terms && priv))} style={{ padding: '12px 16px' }}>{busy ? 'Подождите…' : { in: 'Войти', up: 'Создать аккаунт', magic: 'Отправить ссылку', forgot: 'Отправить письмо' }[mode]}</Btn>
          <div className="row small" style={{ justifyContent: 'center', gap: 14 }}>
            {mode !== 'in' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('in'); setErr(''); }}>Войти с паролем</a>}
            {mode === 'in' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('up'); setErr(''); }}>Регистрация</a>}
            {mode !== 'magic' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('magic'); setErr(''); }}>Вход по ссылке из письма</a>}
            {mode === 'in' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('forgot'); setErr(''); }}>Забыли пароль?</a>}
          </div>
        </form>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="brand" style={{ justifyContent: 'center', paddingBottom: 10 }}><div className="brand-logo"><LuNfc size={20} /></div><div><b>MiniCRM</b><span>Управление малым бизнесом</span></div></div>
        <h1 style={{ fontSize: 22, textAlign: 'center', margin: '8px 0 18px' }}>{title}</h1>
        {children}
        <div className="login-docs small muted"><a href="#/terms" target="_blank" rel="noopener">Соглашение</a> · <a href="#/privacy" target="_blank" rel="noopener">Политика данных</a> · <a href="#/cookies" target="_blank" rel="noopener">Cookie</a></div>
      </div>
    </div>
  );
}
