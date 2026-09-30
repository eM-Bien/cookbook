"use client";

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { addDays, daysBetween, formatDayMonth, formatShort } from "@/lib/dates";
import { fitLine, formatKg, sortByDay, weightTrend, type WeightEntry } from "@/lib/weights";
import { deleteWeight, saveWeight, type ProfileState } from "./actions";

const initialState: ProfileState = { error: null, saved: false };

const RANGES = [
  { key: "30", label: "Miesiąc", days: 30 },
  { key: "90", label: "3 miesiące", days: 90 },
  { key: "365", label: "Rok", days: 365 },
  { key: "all", label: "Wszystko", days: null },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const VERDICT = {
  losing: "Chudniesz",
  gaining: "Tyjesz",
  steady: "Waga trzyma się na miejscu",
};

/** One person's weight diary: today's entry, the chart and the last few entries. */
export function WeightSection({ entries, today }: { entries: WeightEntry[]; today: string }) {
  const [state, action, pending] = useActionState(saveWeight, initialState);
  const [range, setRange] = useState<RangeKey>("30");
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [, startRemoving] = useTransition();
  const [shown, hide] = useOptimistic(sortByDay(entries), (current, day: string) =>
    current.filter((entry) => entry.day !== day),
  );

  const latest = shown.at(-1) ?? null;
  const rangeDays = RANGES.find((r) => r.key === range)!.days;
  const since = rangeDays ? addDays(today, -rangeDays) : null;
  const inRange = since ? shown.filter((entry) => entry.day >= since) : shown;
  const trend = weightTrend(inRange);

  function remove(day: string) {
    setRemoveError(null);
    startRemoving(async () => {
      hide(day);
      const result = await deleteWeight(day);
      if (!result.ok) setRemoveError(result.error);
    });
  }

  return (
    <section className="card stack" aria-labelledby="weight-title">
      <div className="row row-between">
        <h2 id="weight-title">Waga</h2>
        {latest && (
          <span className="muted small">
            Ostatnio {formatKg(latest.kg)} · {latest.day === today ? "dziś" : formatDayMonth(latest.day)}
          </span>
        )}
      </div>

      {/* The form is uncontrolled, so React empties it once the action succeeds. */}
      <form action={action} className="weight-form">
        <label className="field">
          <span>Dzień</span>
          <input className="input" type="date" name="day" defaultValue={today} max={today} required />
        </label>
        <label className="field">
          <span>Waga (kg)</span>
          <input
            className="input"
            name="kg"
            inputMode="decimal"
            placeholder={latest ? String(latest.kg).replace(".", ",") : "np. 72,4"}
            pattern="[0-9]{2,3}([.,][0-9])?"
            title="Waga w kilogramach, np. 72,4"
            required
          />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz wagę"}
        </button>
      </form>
      {state.error && (
        <p className="message message-error" role="alert">
          {state.error}
        </p>
      )}
      {!state.error && state.saved && !pending && (
        <p className="message message-success" role="status">
          Zapisano.
        </p>
      )}

      {shown.length === 0 ? (
        <p className="muted">Zapisz pierwszą wagę — wykres pojawi się po dwóch wpisach.</p>
      ) : (
        <>
          <nav className="chips chips-sm" aria-label="Okres">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className="chip"
                aria-current={range === r.key ? "true" : undefined}
                onClick={() => setRange(r.key)}
              >
                {r.label}
              </button>
            ))}
          </nav>

          {trend ? (
            <p className="weight-verdict" data-verdict={trend.verdict}>
              <strong>{VERDICT[trend.verdict]}</strong>
              <span className="muted">
                {" "}
                · {formatKg(trend.change, true)} od {formatDayMonth(sortByDay(inRange)[0].day)}
                {trend.verdict !== "steady" && <> · ok. {formatKg(trend.perWeek, true)} na tydzień</>}
              </span>
            </p>
          ) : (
            <p className="muted small">
              {inRange.length < 2
                ? "W tym okresie jest za mało wpisów, żeby pokazać trend."
                : "Wpisy z tego samego dnia — dodaj kolejny innego dnia."}
            </p>
          )}

          {inRange.length >= 2 && <WeightChart entries={sortByDay(inRange)} />}

          <ul className="weight-list" aria-label="Ostatnie wpisy">
            {[...shown].reverse().slice(0, 7).map((entry) => (
              <li key={entry.day} className="weight-entry">
                <span className="muted">{entry.day === today ? "dziś" : formatDayMonth(entry.day)}</span>
                <strong>{formatKg(entry.kg)}</strong>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Usuń wpis z ${formatDayMonth(entry.day)}`}
                  onClick={() => remove(entry.day)}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
          {removeError && (
            <p className="message message-error" role="alert">
              {removeError}
            </p>
          )}
        </>
      )}
    </section>
  );
}

const H = 220;
const PAD = { top: 12, right: 16, bottom: 28, left: 44 };

/** Measurements as dots on a line, with the fitted trend dashed behind them. */
function WeightChart({ entries }: { entries: WeightEntry[] }) {
  // The drawing is done in screen pixels (viewBox = real width), so labels stay
  // readable on a phone instead of shrinking with the chart.
  const box = useRef<HTMLElement>(null);
  const [W, setWidth] = useState(640);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const first = entries[0].day;
  const last = entries[entries.length - 1].day;
  const span = Math.max(1, daysBetween(first, last));
  const kgs = entries.map((entry) => entry.kg);
  // At least a 2 kg window, so a flat week does not look like a mountain range.
  const mid = (Math.min(...kgs) + Math.max(...kgs)) / 2;
  const half = Math.max(1, (Math.max(...kgs) - Math.min(...kgs)) / 2 + 0.3);
  const yMin = mid - half;
  const yMax = mid + half;

  const x = (day: string) => PAD.left + (daysBetween(first, day) / span) * (W - PAD.left - PAD.right);
  const y = (kg: number) => PAD.top + ((yMax - kg) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const line = fitLine(entries);
  const points = entries.map((entry) => `${x(entry.day).toFixed(1)},${y(entry.kg).toFixed(1)}`);
  const ticks = [yMax, (yMax + yMin) / 2, yMin];

  return (
    <figure className="weight-chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} height={H} role="img" aria-label={`Wykres wagi od ${formatShort(first)} do ${formatShort(last)}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" className="chart-label">
              {tick.toFixed(1).replace(".", ",")}
            </text>
          </g>
        ))}
        {line && (
          <line
            x1={x(first)}
            y1={y(line.at(first))}
            x2={x(last)}
            y2={y(line.at(last))}
            className="chart-trend"
          />
        )}
        <polyline points={points.join(" ")} className="chart-line" />
        {entries.map((entry) => (
          <circle key={entry.day} cx={x(entry.day)} cy={y(entry.kg)} r={4} className="chart-dot">
            {/* One string on purpose: React drops a <title> given several children. */}
            <title>{`${formatDayMonth(entry.day)}: ${formatKg(entry.kg)}`}</title>
          </circle>
        ))}
        <text x={x(first)} y={H - 8} textAnchor="start" className="chart-label">
          {formatShort(first)}
        </text>
        {span > 0 && (
          <text x={x(last)} y={H - 8} textAnchor="end" className="chart-label">
            {formatShort(last)}
          </text>
        )}
      </svg>
    </figure>
  );
}
