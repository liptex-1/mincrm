import { useRef, useState } from 'react';
import { LuImage, LuTrash2, LuUpload } from 'react-icons/lu';
import { saveBg, useBg } from '../bg';
import { useConsent } from '../consent';
import { backgroundFromFile } from '../img';
import { errMessage } from '../store/store';
import { Btn, Card, useUi } from './kit';

/** Свой фон приложения. Хранится на этом устройстве, видит только сам пользователь. */
export function BackgroundCard() {
  const bg = useBg();
  const consent = useConsent();
  const { toast } = useUi();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return; setBusy(true);
    try { saveBg({ ...bg, img: await backgroundFromFile(f) }); toast('Фон установлен'); } catch (e) { toast(errMessage(e), true); } finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <Card title="Свой фон">
      <div className="bg-preview" style={bg.img ? { backgroundImage: `url("${bg.img}")` } : undefined}>{!bg.img && <span className="muted small"><LuImage size={22} /><br />Фон не выбран</span>}</div>
      <input ref={ref} type="file" accept="image/*" hidden aria-label="Файл фона" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="row" style={{ margin: '14px 0' }}>
        <Btn kind="primary" icon={<LuUpload size={16} />} disabled={busy} onClick={() => ref.current?.click()}>{bg.img ? 'Заменить картинку' : 'Загрузить картинку'}</Btn>
        {bg.img && <Btn icon={<LuTrash2 size={16} />} onClick={() => { saveBg({ ...bg, img: null }); toast('Фон убран'); }}>Убрать</Btn>}
      </div>
      {bg.img && (
        <div className="col" style={{ gap: 12 }}>
          <label className="small">Затемнение подложки: {bg.dim}%<input className="range" type="range" min={40} max={95} value={bg.dim} onChange={(e) => saveBg({ ...bg, dim: +e.target.value })} /></label>
          <label className="small">Размытие: {bg.blur}px<input className="range" type="range" min={0} max={20} value={bg.blur} onChange={(e) => saveBg({ ...bg, blur: +e.target.value })} /></label>
        </div>
      )}
      <div className="small muted" style={{ marginTop: 12 }}>Фон виден только вам и хранится на этом устройстве — на другом телефоне или компьютере его нужно выбрать заново.{consent !== 'accepted' && ' Вы не приняли cookie, поэтому фон сохранится только до закрытия вкладки.'}</div>
    </Card>
  );
}
