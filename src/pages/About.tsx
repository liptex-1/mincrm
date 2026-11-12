import { useState } from 'react';
import { LuCookie, LuFileText, LuMail, LuMapPin, LuPencil, LuPhone, LuSend, LuShieldCheck } from 'react-icons/lu';
import { updateAbout, useAbout } from '../about';
import { CLOUD, type AboutInfo } from '../db/cloud';
import { resetConsent } from '../consent';
import { errMessage, useApp } from '../store/store';
import { VERSION_LABEL } from '../version';
import { Btn, Card, Field, Input, Textarea, useUi } from '../ui/kit';
import { go } from '../ui/router';

export default function About() {
  const a = useAbout();
  const role = useApp((s) => s.role);
  const { toast } = useUi();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<AboutInfo>(a);
  const [busy, setBusy] = useState(false);
  const owner = role?.key === 'owner' && CLOUD;
  const save = async () => { setBusy(true); try { await updateAbout({ ...f, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), address: f.address.trim(), telegram: f.telegram.trim() }); setEdit(false); toast('Сохранено'); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); } };
  const tg = a.telegram.trim(); const tgUrl = tg ? (tg.startsWith('http') ? tg : `https://t.me/${tg.replace(/^@/, '')}`) : '';
  const rows: [React.ReactNode, string, React.ReactNode][] = [
    [<LuMail size={18} />, 'Почта', a.email && <a href={`mailto:${a.email}`}>{a.email}</a>],
    [<LuPhone size={18} />, 'Телефон', a.phone && <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`}>{a.phone}</a>],
    [<LuMapPin size={18} />, 'Адрес', a.address],
    [<LuSend size={18} />, 'Telegram', tgUrl && <a href={tgUrl} target="_blank" rel="noopener noreferrer">{a.telegram}</a>],
  ];
  return (
    <div className="profile-page">
      <div className="page-head"><div><h1>О нас</h1><p>Контакты и документы · версия {VERSION_LABEL}</p></div>{owner && !edit && <Btn icon={<LuPencil size={16} />} onClick={() => { setF(a); setEdit(true); }}>Редактировать</Btn>}</div>
      {edit ? (
        <Card title="Редактирование страницы">
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Название / ФИО оператора" full><Input aria-label="Название" value={f.name} maxLength={160} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ИП Иванов Иван Иванович" /></Field>
            <Field label="Почта"><Input aria-label="Почта" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Телефон"><Input aria-label="Телефон" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Адрес" full><Input aria-label="Адрес" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="Telegram"><Input aria-label="Telegram" value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" /></Field>
            <Field label="Текст «О нас» — пишите что хотите" full><Textarea aria-label="Текст" rows={7} value={f.text} maxLength={5000} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
            <div className="full row"><Btn kind="primary" type="submit" disabled={busy}>Сохранить</Btn><Btn type="button" onClick={() => setEdit(false)}>Отмена</Btn></div>
          </form>
          <div className="small muted" style={{ marginTop: 10 }}>Название, почта, телефон и адрес также подставляются в Политику и Соглашение как данные оператора.</div>
        </Card>
      ) : (
        <div className="grid g2 mb" style={{ alignItems: 'start' }}>
          <Card title={a.name || 'MiniCRM'}>
            {a.text ? <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.text}</div> : <div className="muted">{owner ? 'Нажмите «Редактировать», чтобы рассказать о себе.' : 'Информация скоро появится.'}</div>}
          </Card>
          <Card title="Контакты">
            <div className="col" style={{ gap: 14 }}>
              {rows.map(([ic, label, val]) => (
                <div key={label} className="row" style={{ flexWrap: 'nowrap', gap: 12, alignItems: 'flex-start' }}><span className="muted" style={{ marginTop: 2 }}>{ic}</span><div style={{ minWidth: 0, overflowWrap: 'anywhere' }}><div className="small muted">{label}</div>{val || <span className="muted">не указано</span>}</div></div>))}
            </div>
          </Card>
        </div>
      )}
      <Card title="Документы">
        <div className="row">
          <Btn icon={<LuShieldCheck size={16} />} onClick={() => go('privacy')}>Политика обработки персональных данных</Btn>
          <Btn icon={<LuFileText size={16} />} onClick={() => go('terms')}>Пользовательское соглашение</Btn>
          <Btn icon={<LuCookie size={16} />} onClick={() => go('cookies')}>Уведомление о cookie</Btn>
          <Btn kind="ghost" onClick={resetConsent}>Изменить выбор по cookie</Btn>
        </div>
      </Card>
    </div>
  );
}
