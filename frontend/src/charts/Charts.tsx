import { useState } from "react";

export type Slice = { key: string; label: string; value: number; color: string };

const sum = (s: Slice[]) => s.reduce((a, b) => a + b.value, 0);

/** Donut. The legend underneath is the text version of the chart, with real numbers. */
export function Donut({ slices, title, onSelect, centre }: {
  slices: Slice[]; title: string; onSelect?: (key: string) => void; centre: { big: string; small: string };
}) {
  const [hot, setHot] = useState<string | null>(null);
  const total = sum(slices);
  const R = 70, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="chart">
      <svg viewBox="0 0 200 200" role="img" aria-label={`${title}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`} className="chart-in">
        <circle cx="100" cy="100" r={R} fill="none" stroke="var(--surface-sunk)" strokeWidth="26" />
        {total > 0 && slices.map((s) => {
          const len = (s.value / total) * C;
          const el = (
            <circle key={s.key} cx="100" cy="100" r={R} fill="none" stroke={s.color} strokeWidth={hot === s.key ? 32 : 26}
              strokeDasharray={`${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}`} strokeDashoffset={-offset}
              transform="rotate(-90 100 100)" style={{ cursor: onSelect ? "pointer" : "default", transition: "stroke-width 200ms var(--ease)" }}
              onMouseEnter={() => setHot(s.key)} onMouseLeave={() => setHot(null)} onClick={() => onSelect?.(s.key)} />
          );
          offset += len;
          return el;
        })}
        <text x="100" y="98" textAnchor="middle" className="chart-big">{centre.big}</text>
        <text x="100" y="120" textAnchor="middle" className="chart-small">{centre.small}</text>
      </svg>
      <ul className="legend">
        {slices.map((s) => (
          <li key={s.key}>
            <button className={`legend-btn${hot === s.key ? " is-hot" : ""}`} disabled={!onSelect}
              onMouseEnter={() => setHot(s.key)} onMouseLeave={() => setHot(null)} onClick={() => onSelect?.(s.key)}>
              <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
              <span className="body-5">{s.label}</span>
              <span className="body-5 legend-n">{s.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Bar = { key: string; label: string; value: number; display: string };

/** Vertical bars with the value above each bar and the label below. */
export function Bars({ bars, title, color = "var(--accent)" }: { bars: Bar[]; title: string; color?: string }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="chart">
      <div className="bars" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${b.display}`).join(", ")}`}>
        {bars.map((b) => (
          <div className="bar-col" key={b.key}>
            <span className="caption-3 bar-val">{b.display}</span>
            <div className="bar-track">
              <div className="bar-fill bar-in" style={{ height: `${Math.max((b.value / max) * 100, b.value > 0 ? 4 : 0)}%`, background: color }} />
            </div>
            <span className="caption-5 bar-lab">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One horizontal bar split into parts, with a legend that carries the numbers. */
export function StackBar({ parts, title }: { parts: Slice[]; title: string }) {
  const total = sum(parts);
  return (
    <div className="chart">
      <div className="stackbar" role="img" aria-label={`${title}: ${parts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        {total === 0 ? <div className="stack-empty" /> : parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.key} className="stack-part bar-in-x" style={{ flexGrow: p.value, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <ul className="legend legend-row">
        {parts.map((p) => (
          <li key={p.key} className="legend-item"><span className="swatch" style={{ background: p.color }} aria-hidden="true" />
            <span className="body-5">{p.label}</span><span className="body-5 legend-n">{p.value}</span></li>
        ))}
      </ul>
    </div>
  );
}

/** Small progress ring, used for the roll rate. */
export function Ring({ percent, label, caption }: { percent: number | null; label: string; caption: string }) {
  const R = 52, C = 2 * Math.PI * R;
  const p = percent === null ? 0 : Math.min(Math.max(percent, 0), 100);
  return (
    <svg viewBox="0 0 140 140" role="img" aria-label={`${caption}: ${label}`} className="ring chart-in">
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-sunk)" strokeWidth="14" />
      <circle cx="70" cy="70" r={R} fill="none" stroke={p >= 15 ? "var(--band-high)" : "var(--accent)"} strokeWidth="14" strokeLinecap="round"
        strokeDasharray={`${(p / 100) * C} ${C}`} transform="rotate(-90 70 70)" />
      <text x="70" y="76" textAnchor="middle" className="chart-ring-n">{label}</text>
    </svg>
  );
}
