import { useState, useEffect, useRef } from "react";
import * as dataService from './services/dataService';

const CATEGORIES = ["Työ", "Opiskelu", "Omat projektit", "Henkilökohtainen"];
const CAT_COLORS = {
  "Työ": "#9ad4f5",
  "Opiskelu": "#6ee7b7",
  "Omat projektit": "#fbbf24",
  "Henkilökohtainen": "#c4b5fd",
};
const DAYS_FI = ["Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai", "Sunnuntai"];
const BILLING_MONTHS = [11, 12, 1, 2, 3, 4];

const fiStr = (d = new Date()) =>
  d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });

function getISOWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dow);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return { year: d.getFullYear(), week: Math.ceil(((d - yearStart) / 86400000 + 1) / 7) };
}

function getWeekDates(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() || 7;
  const monMs = jan4.getTime() - (dow - 1) * 86400000 + (week - 1) * 7 * 86400000;
  return Array.from({ length: 7 }, (_, i) => {
    const t = new Date(monMs + i * 86400000);
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  });
}

function shiftWeek(year, week, delta) {
  const dates = getWeekDates(year, week);
  const shifted = new Date(dates[0].getTime() + delta * 7 * 86400000);
  return getISOWeek(shifted);
}

function weekKey(year, week) {
  return `weeklyReview:${year}-W${String(week).padStart(2, "0")}`;
}

const defaultData = () => ({
  reflection: { wellDone: "", improve: "", learned: "" },
  mustDo: ["", "", ""],
  goals: [],
  energyAlloc: Object.fromEntries(CATEGORIES.map(c => [c, 0])),
  notes: "",
});

function loadWeekData(year, week) {
  try {
    const raw = localStorage.getItem(weekKey(year, week));
    const base = defaultData();
    if (!raw) return base;
    const saved = JSON.parse(raw);
    return {
      ...base,
      ...saved,
      reflection: { ...base.reflection, ...(saved.reflection || {}) },
      energyAlloc: { ...base.energyAlloc, ...(saved.energyAlloc || {}) },
      mustDo: saved.mustDo && saved.mustDo.length === 3 ? saved.mustDo : base.mustDo,
    };
  } catch { return defaultData(); }
}

function pruneOldReviews() {
  const prefix = "weeklyReview:";
  const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
  if (keys.length <= 12) return;
  const parsed = keys.map(k => {
    const m = k.match(/weeklyReview:(\d+)-W(\d+)/);
    return m ? { key: k, sort: parseInt(m[1]) * 100 + parseInt(m[2]) } : null;
  }).filter(Boolean);
  parsed.sort((a, b) => a.sort - b.sort);
  parsed.slice(0, parsed.length - 12).forEach(({ key }) => dataService.remove(key));
}

const msToHrs = (ms) => {
  if (ms < 60000) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

function Sec({ children }) {
  return (
    <div style={{ fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#4a5a4a", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {children}
    </div>
  );
}

export default function WeeklyReviewOverlay({ onClose, now, gcEvents = {} }) {
  const { year: ty, week: tw } = getISOWeek(now);
  const { year: ny, week: nw } = shiftWeek(ty, tw, 1);
  const { year: py, week: pw } = shiftWeek(ty, tw, -1);

  const [tab, setTab] = useState("katsaus");
  const [prevOpen, setPrevOpen] = useState(false);

  const [thisData, setThisData] = useState(() => loadWeekData(ty, tw));
  const [nextData, setNextData] = useState(() => loadWeekData(ny, nw));

  const prevData = (() => { try { return loadWeekData(py, pw); } catch { return defaultData(); } })();

  // Real-time sync: update review data when another device saves a weeklyReview key
  useEffect(() => {
    const h = (e) => {
      const k = e.detail?.key;
      if (!k?.startsWith('weeklyReview:')) return;
      if (k === weekKey(ty, tw)) setThisData(loadWeekData(ty, tw));
      if (k === weekKey(ny, nw)) setNextData(loadWeekData(ny, nw));
    };
    window.addEventListener('dashboard:sync', h);
    return () => window.removeEventListener('dashboard:sync', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initDoneRef = useRef(false);
  useEffect(() => { dataService.init().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => {
    if (!initDoneRef.current) return;
    dataService.save(weekKey(ty, tw), thisData);
    pruneOldReviews();
  }, [thisData, ty, tw]);

  useEffect(() => {
    if (!initDoneRef.current) return;
    dataService.save(weekKey(ny, nw), nextData);
  }, [nextData, ny, nw]);

  // Read external localStorage sources once on mount
  const [ttStore] = useState(() => { try { return JSON.parse(localStorage.getItem("timeTracker")) || {}; } catch { return {}; } });
  const [wgStore] = useState(() => { try { return JSON.parse(localStorage.getItem("weeklyGoals")) || {}; } catch { return {}; } });
  const [rtStore] = useState(() => { try { return JSON.parse(localStorage.getItem("routines")) || {}; } catch { return {}; } });
  const [spStore] = useState(() => { try { return JSON.parse(localStorage.getItem("studiesProjects")) || {}; } catch { return {}; } });
  const [wpStore] = useState(() => { try { return JSON.parse(localStorage.getItem("weekPlan")) || {}; } catch { return {}; } });
  const [leviData] = useState(() => { try { return JSON.parse(localStorage.getItem("leviData")) || {}; } catch { return {}; } });

  // This week's date strings for matching time tracker history
  const thisWeekDates = getWeekDates(ty, tw);
  const thisWeekStrs = thisWeekDates.map(d => fiStr(d));

  // Aggregate time tracker totals for this week
  const weekTotals = (() => {
    const totals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
    (ttStore.history || []).forEach(entry => {
      if (thisWeekStrs.includes(entry.date)) {
        Object.entries(entry.totals || {}).forEach(([c, ms]) => { totals[c] = (totals[c] || 0) + ms; });
      }
    });
    if (thisWeekStrs.includes(ttStore.today?.date)) {
      const acc = ttStore.today?.accumulated || {};
      Object.entries(acc).forEach(([c, ms]) => { totals[c] = (totals[c] || 0) + ms; });
      const active = ttStore.today?.active;
      if (active) totals[active.category] = (totals[active.category] || 0) + (Date.now() - active.startedAt);
    }
    return totals;
  })();
  const weekTotalMs = Object.values(weekTotals).reduce((a, b) => a + b, 0);

  // Habits for this week
  const habitNames = rtStore.config?.habits || [];
  const habitWeekData = habitNames.map(h => ({
    name: h,
    days: thisWeekDates.map(d => !!(rtStore.days?.[fiStr(d)]?.habits?.[h])),
  }));

  // Deadlines
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const deadlines = (spStore.courses || [])
    .filter(c => c.deadline)
    .map(c => {
      const dl = new Date(c.deadline + "T00:00:00");
      const days = Math.round((dl.getTime() - todayMs) / 86400000);
      return { name: c.name, deadline: c.deadline, days };
    })
    .filter(c => c.days >= -7 && c.days <= 14)
    .sort((a, b) => a.days - b.days);

  // Next week dates for calendar
  const nextWeekDates = getWeekDates(ny, nw);

  // Current weekly goals
  const currentGoals = wgStore.current?.goals || [];
  const unfinishedGoals = currentGoals.filter(g => !g.done);

  // Levi billing
  const month = now.getMonth() + 1;
  const isLeviBillingSeason = BILLING_MONTHS.includes(month);
  const mKey = `${now.getFullYear()}-${String(month).padStart(2, "0")}`;
  const leviTenants = leviData.tenants || [];
  const todayDay = now.getDate();

  // Next week planned hours
  const nextPlannedH = Object.values(nextData.energyAlloc).reduce((a, b) => a + b, 0);

  // Close on Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const inputStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, color: "#e8e8e8", padding: "6px 10px", fontFamily: "'DM Mono', monospace", fontSize: 12, outline: "none", boxSizing: "border-box" };
  const taStyle = { ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.6 };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#0a0f0a",
      backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(16,42,32,0.7) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(10,28,48,0.6) 0%, transparent 60%)",
      overflowY: "auto",
      fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
      color: "#e8e8e8",
    }}>

      {/* Sticky header */}
      <div style={{ padding: "22px 32px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.06)", position: "sticky", top: 0, background: "#0a0f0a", zIndex: 1 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#f0f0f0" }}>Viikkokatsaus</div>
          <div style={{ fontSize: 10, color: "#4a5a4a", marginTop: 3, letterSpacing: "0.08em" }}>Viikko {tw} · {ty}</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "#6a7a6a", padding: "6px 16px", borderRadius: 2, fontSize: 11, fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.08em" }}
          onMouseOver={e => { e.currentTarget.style.borderColor = "#f87171"; e.currentTarget.style.color = "#f87171"; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.color = "#6a7a6a"; }}
        >✕ Sulje</button>
      </div>

      {/* Tabs */}
      <div style={{ padding: "0 32px", display: "flex", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {[["katsaus", "← Katsaus"], ["suunnittelu", "Suunnittelu →"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: "transparent", border: "none",
            borderBottom: `2px solid ${tab === key ? "#6ee7b7" : "transparent"}`,
            color: tab === key ? "#6ee7b7" : "#5a6a5a",
            padding: "14px 22px", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
            cursor: "pointer", fontFamily: "inherit", transition: "color 0.2s",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ padding: "28px 32px 48px", maxWidth: 880, margin: "0 auto" }}>

        {tab === "katsaus" ? (

          // ── KATSAUS ──────────────────────────────────────────────────────────
          <div style={{ display: "grid", gap: 32 }}>

            {/* Time tracker */}
            <section>
              <Sec>Ajankäyttö tällä viikolla</Sec>
              {weekTotalMs === 0 ? (
                <div style={{ fontSize: 11, color: "#3a4a3a" }}>Ei seurattua aikaa tälle viikolle.</div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                  {CATEGORIES.map(cat => {
                    const actualMs = weekTotals[cat] || 0;
                    const plannedH = thisData.energyAlloc[cat] || 0;
                    const plannedMs = plannedH * 3600000;
                    const maxMs = Math.max(actualMs, plannedMs, 1800000);
                    const color = CAT_COLORS[cat];
                    return (
                      <div key={cat}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11 }}>
                          <span style={{ color: "#b4b4b4" }}>{cat}</span>
                          <span>
                            <span style={{ color }}>{msToHrs(actualMs)}</span>
                            {plannedMs > 0 && <span style={{ color: "#3a4a3a" }}> / {plannedH}h suunn.</span>}
                          </span>
                        </div>
                        <div style={{ height: 7, background: "rgba(255,255,255,0.05)", borderRadius: 2, position: "relative" }}>
                          <div style={{ width: `${Math.min(100, (actualMs / maxMs) * 100)}%`, height: "100%", background: color, borderRadius: 2, opacity: 0.85 }} />
                          {plannedMs > 0 && (
                            <div style={{ position: "absolute", top: -2, left: `${Math.min(100, (plannedMs / maxMs) * 100)}%`, width: 2, height: 11, background: "rgba(255,255,255,0.3)", borderRadius: 1 }} title="Suunniteltu" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ fontSize: 10, color: "#4a5a4a", marginTop: 2 }}>
                    Yhteensä: <span style={{ color: "#8a8a8a" }}>{msToHrs(weekTotalMs)}</span>
                    {Object.values(thisData.energyAlloc).some(h => h > 0) && (
                      <span style={{ marginLeft: 12, color: "#3a4a3a" }}>│ = suunniteltu</span>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Weekly goals */}
            <section>
              <Sec>Viikon tavoitteet</Sec>
              {currentGoals.length === 0 ? (
                <div style={{ fontSize: 11, color: "#3a4a3a" }}>Ei tavoitteita tälle viikolle.</div>
              ) : (
                <div style={{ display: "grid", gap: 7 }}>
                  <div style={{ fontSize: 11, color: "#6ee7b7", marginBottom: 4 }}>
                    {currentGoals.filter(g => g.done).length}/{currentGoals.length} tavoitetta saavutettu
                  </div>
                  {currentGoals.map(g => (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${g.done ? "#6ee7b7" : "#3a4a3a"}`, background: g.done ? "rgba(110,231,183,0.2)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {g.done && <span style={{ fontSize: 9, color: "#6ee7b7" }}>✓</span>}
                      </div>
                      <span style={{ color: g.done ? "#4a5a4a" : "#c4c4c4", textDecoration: g.done ? "line-through" : "none", flex: 1 }}>{g.title}</span>
                      {g.category && <span style={{ fontSize: 9, color: "#4a5a4a" }}>[{g.category}]</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Habits */}
            <section>
              <Sec>Tavat tällä viikolla</Sec>
              {habitWeekData.length === 0 ? (
                <div style={{ fontSize: 11, color: "#3a4a3a" }}>Ei seurattuja tapoja.</div>
              ) : (
                <div style={{ display: "grid", gap: 9 }}>
                  {habitWeekData.map(({ name, days }) => {
                    const count = days.filter(Boolean).length;
                    return (
                      <div key={name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, color: "#b4b4b4", flex: 1 }}>{name}</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {days.map((done, i) => (
                            <div key={i} title={DAYS_FI[i]} style={{ width: 11, height: 11, borderRadius: "50%", background: done ? "#c4b5fd" : "rgba(196,181,253,0.1)", border: `1px solid ${done ? "#c4b5fd" : "rgba(196,181,253,0.15)"}` }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: count >= 6 ? "#6ee7b7" : count >= 4 ? "#fbbf24" : "#5a6a5a", minWidth: 28, textAlign: "right" }}>{count}/7</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Deadlines */}
            <section>
              <Sec>Deadlinet</Sec>
              {deadlines.length === 0 ? (
                <div style={{ fontSize: 11, color: "#3a4a3a" }}>Ei lähestyviä deadlineja seuraavan 14 pv aikana.</div>
              ) : (
                <div style={{ display: "grid", gap: 7 }}>
                  {deadlines.map((dl, i) => {
                    const past = dl.days < 0;
                    const color = past ? "#5a6a5a" : dl.days === 0 ? "#f87171" : dl.days <= 2 ? "#f87171" : dl.days <= 7 ? "#fbbf24" : "#7a8a7a";
                    const label = past ? `${Math.abs(dl.days)} pv sitten` : dl.days === 0 ? "TÄNÄÄN" : `${dl.days} pv`;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                        <span style={{ flex: 1, color: past ? "#4a5a4a" : "#c4c4c4" }}>{dl.name}</span>
                        <span style={{ fontSize: 10, color, flexShrink: 0 }}>{label}</span>
                        <span style={{ fontSize: 9, color: "#3a4a3a", flexShrink: 0 }}>{dl.deadline}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Reflection */}
            <section>
              <Sec>Reflektio</Sec>
              <div style={{ display: "grid", gap: 16 }}>
                {[["wellDone", "Mikä meni hyvin?"], ["improve", "Mitä voisi parantaa?"], ["learned", "Tärkeimmät opit"]].map(([key, label]) => (
                  <div key={key}>
                    <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 6, letterSpacing: "0.08em" }}>{label}</div>
                    <textarea
                      rows={3}
                      value={thisData.reflection[key]}
                      onChange={e => setThisData(d => ({ ...d, reflection: { ...d.reflection, [key]: e.target.value } }))}
                      style={taStyle}
                      onFocus={e => e.currentTarget.style.borderColor = "#6ee7b7"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                    />
                  </div>
                ))}
                <div style={{ fontSize: 9, color: "#3a4a3a" }}>Tallennetaan automaattisesti · Viikko {tw}/{ty}</div>
              </div>
            </section>

          </div>

        ) : (

          // ── SUUNNITTELU ───────────────────────────────────────────────────────
          <div style={{ display: "grid", gap: 32 }}>

            {/* Previous week collapsible reference */}
            <section>
              <button onClick={() => setPrevOpen(o => !o)} style={{ background: "transparent", border: "none", color: "#3a4a3a", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, padding: 0 }}>
                <span style={{ display: "inline-block", transition: "transform 0.2s", transform: prevOpen ? "rotate(90deg)" : "none" }}>▶</span>
                Viime viikon katsaus (viikko {pw})
              </button>
              {prevOpen && (
                <div style={{ marginTop: 10, padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 2 }}>
                  {[["wellDone", "Mikä meni hyvin"], ["improve", "Parannettavaa"], ["learned", "Opit"]].map(([key, label]) => {
                    const val = prevData.reflection?.[key];
                    if (!val) return null;
                    return (
                      <div key={key} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9, color: "#4a5a4a", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                        <div style={{ fontSize: 12, color: "#6a7a6a", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{val}</div>
                      </div>
                    );
                  })}
                  {!prevData.reflection?.wellDone && !prevData.reflection?.improve && !prevData.reflection?.learned && (
                    <div style={{ fontSize: 11, color: "#3a4a3a" }}>Ei reflektiotietoja viime viikolta.</div>
                  )}
                </div>
              )}
            </section>

            {/* Week heading */}
            <div style={{ paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "#5a6a5a" }}>
                Suunnittelet viikkoa <span style={{ color: "#6ee7b7" }}>{nw} / {ny}</span>
              </div>
              <div style={{ fontSize: 10, color: "#3a4a3a", marginTop: 4 }}>
                {nextWeekDates[0].toLocaleDateString("fi-FI", { day: "numeric", month: "long" })} – {nextWeekDates[6].toLocaleDateString("fi-FI", { day: "numeric", month: "long" })}
              </div>
            </div>

            {/* Must-do */}
            <section>
              <Sec>Tärkeimmät tehtävät (max 3)</Sec>
              <div style={{ display: "grid", gap: 8 }}>
                {nextData.mustDo.map((task, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, color: "#4a5a4a", minWidth: 16 }}>{i + 1}.</span>
                    <input
                      type="text"
                      value={task}
                      onChange={e => setNextData(d => { const m = [...d.mustDo]; m[i] = e.target.value; return { ...d, mustDo: m }; })}
                      placeholder={`Must-do ${i + 1}`}
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => e.currentTarget.style.borderColor = "#6ee7b7"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Goals */}
            <section>
              <Sec>Viikon tavoitteet (max 5)</Sec>
              {nextData.goals.length === 0 && unfinishedGoals.length > 0 && (
                <button
                  onClick={() => setNextData(d => ({
                    ...d,
                    goals: unfinishedGoals.slice(0, 5).map(g => ({ ...g, id: Date.now() + Math.random(), carried: true, done: false })),
                  }))}
                  style={{ ...inputStyle, padding: "5px 12px", color: "#fbbf24", borderColor: "rgba(251,191,36,0.25)", cursor: "pointer", marginBottom: 10, fontSize: 10, letterSpacing: "0.08em", background: "rgba(251,191,36,0.05)" }}
                >
                  ↳ Siirrä suorittamattomat tältä viikolta ({unfinishedGoals.length})
                </button>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {nextData.goals.map((g, i) => (
                  <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 10, color: "#4a5a4a", minWidth: 14 }}>·</span>
                    <input
                      type="text"
                      value={g.title}
                      onChange={e => setNextData(d => ({ ...d, goals: d.goals.map((x, xi) => xi === i ? { ...x, title: e.target.value } : x) }))}
                      placeholder="Tavoite"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => e.currentTarget.style.borderColor = "#6ee7b7"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                    />
                    <input
                      type="text"
                      value={g.category || ""}
                      onChange={e => setNextData(d => ({ ...d, goals: d.goals.map((x, xi) => xi === i ? { ...x, category: e.target.value } : x) }))}
                      placeholder="Kategoria"
                      style={{ ...inputStyle, width: 120 }}
                      onFocus={e => e.currentTarget.style.borderColor = "#6ee7b7"}
                      onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
                    />
                    {g.carried && (
                      <span style={{ fontSize: 9, color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 2, padding: "1px 5px", flexShrink: 0 }}>siirretty</span>
                    )}
                    <button
                      onClick={() => setNextData(d => ({ ...d, goals: d.goals.filter((_, xi) => xi !== i) }))}
                      style={{ background: "transparent", border: "none", color: "#3a4a3a", fontSize: 14, cursor: "pointer", padding: "0 2px", fontFamily: "inherit" }}
                      onMouseOver={e => e.currentTarget.style.color = "#f87171"}
                      onMouseOut={e => e.currentTarget.style.color = "#3a4a3a"}
                    >✕</button>
                  </div>
                ))}
                {nextData.goals.length < 5 && (
                  <button
                    onClick={() => setNextData(d => ({ ...d, goals: [...d.goals, { id: Date.now(), title: "", category: "", done: false, carried: false }] }))}
                    style={{ ...inputStyle, alignSelf: "start", padding: "5px 12px", color: "#6ee7b7", borderColor: "rgba(110,231,183,0.2)", cursor: "pointer", fontSize: 10, letterSpacing: "0.08em", background: "rgba(110,231,183,0.05)", marginTop: 4 }}
                  >+ Lisää tavoite</button>
                )}
              </div>
            </section>

            {/* Energy allocation */}
            <section>
              <Sec>Energian jako (tuntia per kategoria)</Sec>
              <div style={{ display: "grid", gap: 10 }}>
                {CATEGORIES.map(cat => {
                  const color = CAT_COLORS[cat];
                  const val = nextData.energyAlloc[cat] || 0;
                  return (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "#b4b4b4", flex: 1 }}>{cat}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <button
                          onClick={() => setNextData(d => ({ ...d, energyAlloc: { ...d.energyAlloc, [cat]: Math.max(0, (d.energyAlloc[cat] || 0) - 1) } }))}
                          style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.08)", color: "#6a7a6a", width: 24, height: 24, borderRadius: 2, cursor: "pointer", fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >−</button>
                        <input
                          type="number"
                          min={0} max={80}
                          value={val}
                          onChange={e => setNextData(d => ({ ...d, energyAlloc: { ...d.energyAlloc, [cat]: Math.max(0, parseInt(e.target.value) || 0) } }))}
                          style={{ ...inputStyle, width: 54, textAlign: "center", padding: "5px 8px" }}
                        />
                        <button
                          onClick={() => setNextData(d => ({ ...d, energyAlloc: { ...d.energyAlloc, [cat]: (d.energyAlloc[cat] || 0) + 1 } }))}
                          style={{ background: "transparent", border: `1px solid ${color}44`, color, width: 24, height: 24, borderRadius: 2, cursor: "pointer", fontFamily: "inherit", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}
                        >+</button>
                      </div>
                      <span style={{ fontSize: 10, color: "#5a6a5a", minWidth: 30, textAlign: "right" }}>{val}h</span>
                    </div>
                  );
                })}
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11 }}>
                  <span style={{ color: "#6a7a6a" }}>Yhteensä:</span>
                  <span style={{ color: nextPlannedH > 50 ? "#f87171" : "#9a9a9a", fontWeight: 500 }}>{nextPlannedH}h</span>
                  {nextPlannedH > 50 && <span style={{ fontSize: 10, color: "#f87171" }}>⚠ yli 50h — muista palautuminen</span>}
                </div>
              </div>
            </section>

            {/* Calendar Mon–Fri */}
            <section>
              <Sec>Kalenteri — ensi viikko</Sec>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                {nextWeekDates.slice(0, 5).map((date, i) => {
                  const dayName   = DAYS_FI[i];
                  const manEvents = wpStore[dayName] || [];
                  const dateStr   = fiStr(date);
                  const gcDayEvs  = (gcEvents[dateStr] || []).filter(e => e.time);
                  const dateLabel = date.toLocaleDateString("fi-FI", { day: "numeric", month: "numeric" });
                  const hasAny    = manEvents.length > 0 || gcDayEvs.length > 0;
                  return (
                    <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 2, padding: "10px 10px", minHeight: 80 }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a5a4a", marginBottom: 7 }}>
                        {DAYS_FI[i].slice(0, 2)} · {dateLabel}
                      </div>
                      {!hasAny ? (
                        <div style={{ fontSize: 10, color: "#2a3a2a" }}>—</div>
                      ) : (
                        <>
                          {manEvents.map((ev, ei) => (
                            <div key={`m-${ei}`} style={{ fontSize: 10, color: "#7a8a7a", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                              <span style={{ color: "#6ee7b7", marginRight: 4 }}>{ev.time}</span>{ev.title}
                            </div>
                          ))}
                          {gcDayEvs.map((ev, ei) => (
                            <div key={`gc-${ei}`} title={ev.calendarName || ''} style={{ fontSize: 10, color: "#6a7a8a", padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.03)", display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: ev.calendarColor || '#4285f4', flexShrink: 0 }} />
                              <span style={{ color: ev.calendarColor || '#4285f4', marginRight: 3 }}>{ev.time}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Levi billing reminder */}
            {isLeviBillingSeason && leviTenants.length > 0 && (
              <section>
                <Sec>Levi — Laskutusmuistutus</Sec>
                <div style={{ padding: "10px 14px", background: "rgba(110,231,183,0.04)", border: "1px solid rgba(110,231,183,0.12)", borderRadius: 2, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: "#6ee7b7" }}>Muista laskuttaa vuokralaiset</span>
                </div>
                <div style={{ display: "grid", gap: 7 }}>
                  {leviTenants.map(t => {
                    const billed = leviData.billingLog?.[t.id]?.[mKey];
                    const daysUntil = t.billingDay - todayDay;
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11 }}>
                        <span style={{ flex: 1, color: "#b4b4b4" }}>{t.name}</span>
                        <span style={{ color: "#5a6a5a" }}>laskutuspäivä {t.billingDay}.</span>
                        {billed ? (
                          <span style={{ fontSize: 9, color: "#6ee7b7", border: "1px solid rgba(110,231,183,0.3)", borderRadius: 2, padding: "1px 6px" }}>Laskutettu</span>
                        ) : daysUntil <= 0 ? (
                          <span style={{ fontSize: 9, color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 2, padding: "1px 6px" }}>Myöhässä</span>
                        ) : daysUntil <= 3 ? (
                          <span style={{ fontSize: 9, color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 2, padding: "1px 6px" }}>Pian {daysUntil}pv</span>
                        ) : (
                          <span style={{ fontSize: 9, color: "#4a5a4a" }}>{daysUntil} pv</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Week notes */}
            <section>
              <Sec>Viikon muistiinpanot</Sec>
              <textarea
                rows={5}
                value={nextData.notes}
                onChange={e => setNextData(d => ({ ...d, notes: e.target.value }))}
                placeholder="Vapaat muistiinpanot, aikomukset, reunaehdot..."
                style={taStyle}
                onFocus={e => e.currentTarget.style.borderColor = "#6ee7b7"}
                onBlur={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"}
              />
              <div style={{ fontSize: 9, color: "#3a4a3a", marginTop: 6 }}>Tallennetaan automaattisesti · Viikko {nw}/{ny}</div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}
