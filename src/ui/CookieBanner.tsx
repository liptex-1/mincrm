import { LuCookie } from 'react-icons/lu';
import { setConsent, useConsent } from '../consent';

/** Появляется один раз; решение запоминается. */
export function CookieBanner() {
  const c = useConsent();
  if (c !== null) return null;
  return (
    <div className="cookie" role="dialog" aria-label="Уведомление о cookie">
      <LuCookie size={22} className="cookie-ic" />
      <div className="cookie-t">
        Мы сохраняем данные в вашем браузере: вход в аккаунт, тему и свой фон. Если отклоните — вход и фон сохранятся только до закрытия вкладки.{' '}
        <a href="#/cookies" target="_blank" rel="noopener">Подробнее</a>
      </div>
      <div className="cookie-b">
        <button type="button" className="btn" onClick={() => setConsent('declined')}>Отклонить</button>
        <button type="button" className="btn primary" onClick={() => setConsent('accepted')}>Принять</button>
      </div>
    </div>
  );
}
