import { useState, useEffect } from "react";

const DAYS = ["Maanantai", "Tiistai", "Keskiviikko", "Torstai", "Perjantai", "Lauantai", "Sunnuntai"];
const DAYS_SHORT = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];

const FOREST_REMINDERS = {
  1: "Tarkista metsävakuutukset ja suunnitelmat",
  2: "Lumituhot — tarkasta talvikaatumat",
  3: "Kevätinventointi, myrskytuhot",
  4: "Raivaussahatyöt ennen lehtien tuloa",
  5: "Taimien istutus, uudistusalat",
  6: "Kesäinventointi, hyönteistuhot",
  7: "Hakkuusuunnittelu syksylle",
  8: "Energiapuun korjuu, syysistutukset",
  9: "Syysraivaukset, taimikonhoito",
  10: "Syysistutukset, viimeistely ennen pakkaisia",
  11: "Metsäsuunnitelma ensi vuodelle",
  12: "Vuosiyhteenveto, budjetti ensi vuodelle",
};

const INITIAL_WEEK = DAYS.reduce((acc, d) => ({ ...acc, [d]: [] }), {});

const MOCK_LEVI_BOOKINGS = [
  { dates: "31.5–4.6", guests: "Virtanen (2 hlö)", status: "confirmed" },
  { dates: "14.6–21.6", guests: "Korhonen (4 hlö)", status: "confirmed" },
  { dates: "28.6–5.7", guests: "—", status: "free" },
];

const MOCK_MAINTENANCE = [
  { id: 1, task: "Tarkista lämminvesivaraaja", done: false },
  { id: 2, task: "Vaihda suodattimet ilmanvaihtoon", done: false },
  { id: 3, task: "Tarkista terassin laudoitus", done: true },
  { id: 4, task: "Tilaa polttopuut syksylle", done: false },
];

const MOCK_ELECTRICITY = [6.2, 8.1, 7.4, 5.9, 9.3, 11.2, 10.8, 8.7, 7.1, 6.4, 5.8, 7.2, 8.9, 10.1, 9.4, 8.2, 7.6, 6.8, 5.5, 6.1, 7.8, 9.2, 10.5, 8.3];

export default function MorningDashboard() {
  const [now, setNow] = useState(new Date());
  const [weekPlan, setWeekPlan] = useState(() => {
    try { return JSON.parse(localStorage.getItem("weekPlan")) || INITIAL_WEEK; } catch { return INITIAL_WEEK; }
  });
  const [maintenance, setMaintenance] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maintenance")) || MOCK_MAINTENANCE; } catch { return MOCK_MAINTENANCE; }
  });
  const [editMode, setEditMode] = useState(false);
  const [editDay, setEditDay] = useState(null);
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newTask, setNewTask] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    localStorage.setItem("weekPlan", JSON.stringify(weekPlan));
  }, [weekPlan]);

  useEffect(() => {
    localStorage.setItem("maintenance", JSON.stringify(maintenance));
  }, [maintenance]);

  const dayIndex = (now.getDay() + 6) % 7;
  const todayName = DAYS[dayIndex];
  const todayEvents = weekPlan[todayName] || [];
  const month = now.getMonth() + 1;
  const forestReminder = FOREST_REMINDERS[month];
  const currentHour = now.getHours();
  const currentPrice = MOCK_ELECTRICITY[currentHour];
  const avgPrice = (MOCK_ELECTRICITY.reduce((a, b) => a + b, 0) / 24).toFixed(1);
  const priceColor = currentPrice < 7 ? "#4ade80" : currentPrice < 10 ? "#fbbf24" : "#f87171";

  const addEvent = (day) => {
    if (!newEventTime || !newEventTitle) return;
    const updated = {
      ...weekPlan,
      [day]: [...(weekPlan[day] || []), { time: newEventTime, title: newEventTitle }]
        .sort((a, b) => a.time.localeCompare(b.time))
    };
    setWeekPlan(updated);
    setNewEventTime("");
    setNewEventTitle("");
  };

  const removeEvent = (day, idx) => {
    const updated = { ...weekPlan, [day]: weekPlan[day].filter((_, i) => i !== idx) };
    setWeekPlan(updated);
  };

  const toggleMaintenance = (id) => {
    setMaintenance(maintenance.map(m => m.id === id ? { ...m, done: !m.done } : m));
  };

  const addMaintenanceTask = () => {
    if (!newTask.trim()) return;
    const next = { id: Date.now(), task: newTask.trim(), done: false };
    setMaintenance([...maintenance, next]);
    setNewTask("");
  };

  const dateStr = now.toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      color: "#e8e8e8",
      fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
      padding: "0",
      backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(16,42,32,0.7) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(10,28,48,0.6) 0%, transparent 60%)",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0d1117; } ::-webkit-scrollbar-thumb { background: #2a3a2a; }
        .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 2px; padding: 20px; }
        .card:hover { border-color: rgba(255,255,255,0.14); transition: border-color 0.3s; }
        .label { font-size: 10px; letter-spacing: 0.15em; text-transform: uppercase; color: #5a6a5a; margin-bottom: 8px; }
        .accent { color: #6ee7b7; }
        .event-row { display: flex; align-items: baseline; gap: 12px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .event-row:last-child { border-bottom: none; }
        .event-time { color: #6ee7b7; font-size: 12px; min-width: 42px; }
        .event-title { font-size: 13px; color: #d4d4d4; flex: 1; }
        .day-col { flex: 1; min-width: 0; }
        .day-header { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #5a6a5a; padding-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 8px; }
        .day-header.today { color: #6ee7b7; }
        .mini-event { font-size: 11px; color: #9a9a9a; padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .mini-event .t { color: #6ee7b7; margin-right: 4px; }
        .booking-row { display: flex; gap: 12px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px; }
        .booking-row:last-child { border-bottom: none; }
        .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .check-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 12px; cursor: pointer; }
        .check-row:hover { color: #e8e8e8; }
        .check-box { width: 14px; height: 14px; border: 1px solid #3a4a3a; border-radius: 2px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        input[type="text"], input[type="time"] { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 2px; color: #e8e8e8; padding: 6px 10px; font-family: inherit; font-size: 12px; outline: none; }
        input:focus { border-color: #6ee7b7; }
        button { cursor: pointer; font-family: inherit; }
        .btn { background: rgba(110,231,183,0.1); border: 1px solid rgba(110,231,183,0.3); color: #6ee7b7; padding: 6px 14px; border-radius: 2px; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; transition: background 0.2s; }
        .btn:hover { background: rgba(110,231,183,0.2); }
        .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: #9a9a9a; padding: 4px 10px; border-radius: 2px; font-size: 10px; }
        .btn-ghost:hover { border-color: #f87171; color: #f87171; }
        .bar { height: 28px; border-radius: 1px; display: inline-block; vertical-align: bottom; transition: opacity 0.2s; }
        .bar:hover { opacity: 0.7; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "28px 32px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#f0f0f0" }}>
            Hyvää huomenta
          </div>
          <div style={{ fontSize: 12, color: "#5a6a5a", marginTop: 4, textTransform: "capitalize" }}>{dateStr}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400, color: "#6ee7b7", letterSpacing: "-0.03em" }}>{timeStr}</div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>

        {/* TODAY */}
        <div className="card" style={{ gridColumn: "span 1" }}>
          <div className="label">Tänään — {todayName}</div>
          {todayEvents.length === 0 ? (
            <div style={{ color: "#5a6a5a", fontSize: 12, padding: "8px 0" }}>Ei merkintöjä tänään</div>
          ) : (
            todayEvents.map((e, i) => (
              <div className="event-row" key={i}>
                <span className="event-time">{e.time}</span>
                <span className="event-title">{e.title}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="label" style={{ marginBottom: 6 }}>🌲 Metsämuistutus</div>
            <div style={{ fontSize: 12, color: "#a8c4a8", lineHeight: 1.5 }}>{forestReminder}</div>
          </div>
        </div>

        {/* ELECTRICITY */}
        <div className="card">
          <div className="label">Pörssisähkö</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <div>
              <span style={{ fontSize: 32, fontWeight: 500, color: priceColor, fontFamily: "'Playfair Display', serif" }}>{currentPrice.toFixed(1)}</span>
              <span style={{ fontSize: 12, color: "#5a6a5a", marginLeft: 4 }}>snt/kWh nyt</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#5a6a5a" }}>Päiväkeskiarvo</div>
              <div style={{ fontSize: 16, color: "#9a9a9a" }}>{avgPrice} snt</div>
            </div>
          </div>
          {/* Bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
            {MOCK_ELECTRICITY.map((v, i) => {
              const h = Math.max(4, (v / 14) * 40);
              const c = v < 7 ? "#4ade80" : v < 10 ? "#fbbf24" : "#f87171";
              const isCurrent = i === currentHour;
              return (
                <div key={i} title={`${i}:00 — ${v} snt`}
                  className="bar"
                  style={{ height: h, flex: 1, background: c, opacity: isCurrent ? 1 : 0.35, outline: isCurrent ? `1px solid ${c}` : "none" }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 9, color: "#3a4a3a" }}>00</span>
            <span style={{ fontSize: 9, color: "#3a4a3a" }}>12</span>
            <span style={{ fontSize: 9, color: "#3a4a3a" }}>23</span>
          </div>
        </div>

        {/* WEATHER */}
        <div className="card">
          <div className="label">Sää</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 6 }}>📍 Kotipaikka</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#e8e8e8" }}>+14°</div>
              <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 4 }}>Puolipilvistä</div>
              <div style={{ fontSize: 11, color: "#5a6a5a", marginTop: 2 }}>Tuuli 4 m/s</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 6 }}>⛰ Levi</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, color: "#9ad4f5" }}>+6°</div>
              <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 4 }}>Selkeää</div>
              <div style={{ fontSize: 11, color: "#5a6a5a", marginTop: 2 }}>Tuuli 7 m/s</div>
            </div>
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 10, color: "#3a4a3a", letterSpacing: "0.05em" }}>
            MOCK-DATA — Open-Meteo API lisätään vaiheessa 2
          </div>
        </div>

        {/* LEVI BOOKINGS */}
        <div className="card">
          <div className="label">Levi — Varaukset</div>
          {MOCK_LEVI_BOOKINGS.map((b, i) => (
            <div className="booking-row" key={i}>
              <div className="dot" style={{ background: b.status === "confirmed" ? "#6ee7b7" : "#3a4a3a" }} />
              <div style={{ flex: 1 }}>
                <span style={{ color: b.status === "free" ? "#5a6a5a" : "#d4d4d4" }}>{b.dates}</span>
                {b.status === "confirmed" && <span style={{ color: "#7a8a7a", marginLeft: 8 }}>{b.guests}</span>}
                {b.status === "free" && <span style={{ color: "#4a5a4a", marginLeft: 8, fontStyle: "italic" }}>vapaana</span>}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="label">Huoltolista</div>
            {maintenance.map(m => (
              <div className="check-row" key={m.id} onClick={() => toggleMaintenance(m.id)}
                style={{ color: m.done ? "#3a4a3a" : "#c4c4c4", textDecoration: m.done ? "line-through" : "none" }}>
                <div className="check-box" style={{ borderColor: m.done ? "#2a3a2a" : "#4a6a4a", background: m.done ? "#2a3a2a" : "transparent" }}>
                  {m.done && <span style={{ fontSize: 9, color: "#6ee7b7" }}>✓</span>}
                </div>
                {m.task}
              </div>
            ))}
            {editMode && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input type="text" value={newTask} onChange={e => setNewTask(e.target.value)}
                  placeholder="Uusi tehtävä..." style={{ flex: 1 }}
                  onKeyDown={e => { if (e.key === "Enter") { addMaintenanceTask(); } }} />
                <button className="btn" onClick={addMaintenanceTask}>+</button>
              </div>
            )}
          </div>
        </div>

        {/* STUDIES & PROJECTS */}
        <div className="card">
          <div className="label">Opinnot & Projektit</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 12px", background: "rgba(110,231,183,0.06)", border: "1px solid rgba(110,231,183,0.12)", borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 4 }}>AKTIIVINEN KURSSI</div>
              <div style={{ fontSize: 13, color: "#e8e8e8" }}>Product Line Engineering</div>
              <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 2 }}>Kiinteistöseuranta-projekti — Evalance/FeatureIDE</div>
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(154,212,245,0.06)", border: "1px solid rgba(154,212,245,0.12)", borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 4 }}>ML/AI ROADMAP</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 13, color: "#9ad4f5" }}>Viikko 8 / 26</div>
                <div style={{ fontSize: 10, color: "#5a6a5a" }}>31%</div>
              </div>
              <div style={{ marginTop: 6, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                <div style={{ width: "31%", height: "100%", background: "#9ad4f5", borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 2 }}>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 4 }}>PROJEKTI</div>
              <div style={{ fontSize: 13, color: "#d4d4d4" }}>Metsädashboard MVP</div>
              <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 2 }}>WFS API + LiDAR — Python</div>
            </div>
          </div>
        </div>

      </div>

      {/* WEEK PLAN */}
      <div style={{ padding: "0 32px 32px" }}>
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="label" style={{ marginBottom: 0 }}>Viikkosuunnitelma</div>
            <button className="btn" onClick={() => setEditMode(!editMode)}>
              {editMode ? "✓ Valmis" : "✎ Muokkaa"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10, overflowX: "auto" }}>
            {DAYS.map((day, i) => {
              const isToday = i === dayIndex;
              const events = weekPlan[day] || [];
              return (
                <div className="day-col" key={day}>
                  <div className={`day-header${isToday ? " today" : ""}`}>
                    <span style={{ display: "block" }}>{DAYS_SHORT[i]}</span>
                  </div>
                  {events.map((e, ei) => (
                    <div key={ei} className="mini-event" style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span className="t">{e.time}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                      {editMode && (
                        <button className="btn-ghost" style={{ padding: "1px 5px", fontSize: 9, marginLeft: 2 }}
                          onClick={() => removeEvent(day, ei)}>×</button>
                      )}
                    </div>
                  ))}
                  {editMode && editDay === day && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ width: "100%" }} />
                      <input type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
                        placeholder="Tapahtuma" style={{ width: "100%" }}
                        onKeyDown={e => { if (e.key === "Enter") { addEvent(day); setEditDay(null); } }} />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn" style={{ flex: 1 }} onClick={() => { addEvent(day); setEditDay(null); }}>+</button>
                        <button className="btn-ghost" onClick={() => setEditDay(null)}>✕</button>
                      </div>
                    </div>
                  )}
                  {editMode && editDay !== day && (
                    <button className="btn-ghost" style={{ marginTop: 4, width: "100%", fontSize: 10 }}
                      onClick={() => setEditDay(day)}>+ lisää</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: "0 32px 20px", display: "flex", justifyContent: "space-between", fontSize: 10, color: "#2a3a2a", letterSpacing: "0.1em" }}>
        <span>MORNING DASHBOARD v0.1 — STAATTINEN PROTOTYYPPI</span>
        <span>VAIHE 2: API-INTEGRAATIOT</span>
      </div>
    </div>
  );
}