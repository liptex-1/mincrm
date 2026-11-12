import { useEffect, useRef, useState } from 'react';

export const PALETTE = ['#78B94D', '#4F86C6', '#E0A545', '#B07CC6', '#E0715F', '#4DB6A8', '#8A8F86'];

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function niceScale(min: number, max: number, ticks = 4) {
  if (max === min) { max = min + 1; }
  const span = max - min, raw = span / ticks, pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return { lo, hi, ticks: out };
}
export const short = (kop: number) => {
  const r = kop / 100, a = Math.abs(r);
  if (a >= 1e6) return `${(r / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} млн`;
  if (a >= 1e3) return `${(r / 1e3).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} тыс`;
  return r.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
};

export interface Series { key: string; name: string; color: string }
export interface Point { label: string; v: Record<string, number> }

interface XYProps { data: Point[]; series: Series[]; format?: (n: number) => string; axis?: (n: number) => string; height?: number; kind: 'bar' | 'line' | 'area' }

export function XYChart({ data, series, format = (n) => String(n), axis = short, height = 240, kind }: XYProps) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(t); }, []);
  const m = { l: 46, r: 12, t: 10, b: 26 }, H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = data.flatMap((d) => series.map((s) => d.v[s.key] ?? 0));
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v: number) => m.t + ih - ((v - sc.lo) / (sc.hi - sc.lo)) * ih;
  const n = Math.max(1, data.length), band = iw / n;
  const xc = (i: number) => m.l + band * i + band / 2;
  const step = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
  const path = (key: string) => data.map((d, i) => `${i ? 'L' : 'M'}${xc(i).toFixed(1)},${y(d.v[key] ?? 0).toFixed(1)}`).join(' ');
  const bw = Math.min(34, (band * 0.7) / series.length);
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img">
        {sc.ticks.map((t) => (<g key={t}><line className="grid-line" x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} /><text x={m.l - 8} y={y(t) + 4} textAnchor="end">{axis(t)}</text></g>))}
        <line x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {kind === 'bar' && data.map((d, i) => series.map((s, k) => {
          const v = d.v[s.key] ?? 0, x = xc(i) - (bw * series.length) / 2 + k * bw, top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
          return <rect key={s.key + i} className={`bar-rect ${hover !== null && hover !== i ? 'dim' : ''}`} x={x + 1} width={Math.max(2, bw - 2)} y={shown ? top : y(0)} height={shown ? h : 0} rx={5} fill={s.color} />;
        }))}
        {kind !== 'bar' && series.map((s) => (
          <g key={s.key}>
            {kind === 'area' && <path d={`${path(s.key)} L${xc(n - 1)},${y(0)} L${xc(0)},${y(0)} Z`} fill={s.color} opacity=".13" />}
            <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => <circle key={i} cx={xc(i)} cy={y(d.v[s.key] ?? 0)} r={hover === i ? 5 : 3} fill="var(--card)" stroke={s.color} strokeWidth="2" />)}
          </g>
        ))}
        {data.map((d, i) => (<g key={i}>{i % step === 0 && <text x={xc(i)} y={H - 6} textAnchor="middle">{d.label}</text>}<rect x={m.l + band * i} y={m.t} width={band} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} /></g>))}
      </svg>
      {hover !== null && data[hover] && (
        <div className="tip" style={{ left: Math.min(Math.max(xc(hover), 90), W - 90), top: m.t + 28 }}>
          <b>{data[hover].label}</b>
          {series.map((s) => <div key={s.key}><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: s.color, marginRight: 6 }} />{series.length > 1 ? s.name + ': ' : ''}<b>{format(data[hover!].v[s.key] ?? 0)}</b></div>)}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}</div>;
}

export function Donut({ items, format, center }: { items: { label: string; value: number; color?: string }[]; format: (n: number) => string; center?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((a, b) => a + Math.max(0, b.value), 0);
  const R = 62, r = 42, C = 2 * Math.PI * ((R + r) / 2);
  let acc = 0;
  return (
    <div className="row" style={{ gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width="170" height="170" viewBox="0 0 170 170" style={{ flex: 'none' }}>
        <circle cx="85" cy="85" r={(R + r) / 2} fill="none" stroke="var(--hover)" strokeWidth={R - r} />
        {total > 0 && items.map((it, i) => {
          const len = (Math.max(0, it.value) / total) * C, off = acc; acc += len;
          return <circle key={i} cx="85" cy="85" r={(R + r) / 2} fill="none" stroke={it.color ?? PALETTE[i % PALETTE.length]} strokeWidth={hover === i ? R - r + 6 : R - r} strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 85 85)" style={{ transition: 'stroke-width .15s' }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />;
        })}
        <text x="85" y="82" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--muted)' }}>{hover !== null ? items[hover].label : center ?? 'Всего'}</text>
        <text x="85" y="100" textAnchor="middle" style={{ fontSize: 14, fontWeight: 700, fill: 'var(--text)' }}>{format(hover !== null ? items[hover].value : total)}</text>
      </svg>
      <div className="col" style={{ gap: 7, flex: 1, minWidth: 150 }}>
        {items.map((it, i) => (
          <div key={i} className="row small" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', opacity: hover !== null && hover !== i ? 0.45 : 1 }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span><i style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 3, background: it.color ?? PALETTE[i % PALETTE.length], marginRight: 8 }} />{it.label}</span>
            <b className="num">{total ? Math.round((it.value / total) * 100) : 0}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HBars({ items, format, color = 'var(--accent-strong)' }: { items: { label: string; value: number; sub?: string }[]; format: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="col" style={{ gap: 14 }}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap', marginBottom: 6 }}><span style={{ fontWeight: 600 }}>{it.label}{it.sub && <span className="muted small"> · {it.sub}</span>}</span><b className="num nowrap">{format(it.value)}</b></div>
          <div className="bar"><i style={{ width: `${(Math.abs(it.value) / max) * 100}%`, background: it.value < 0 ? 'var(--danger)' : color }} /></div>
        </div>
      ))}
    </div>
  );
}
