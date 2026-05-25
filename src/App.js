import { useState, useEffect, useCallback } from "react";

const AUTH_KEY = "dashboard_auth";

function PasswordGate({ children }) {
  const [authed, setAuthed] = useState(() => localStorage.getItem(AUTH_KEY) === "1");
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);

  const attempt = useCallback(() => {
    if (input === process.env.REACT_APP_DASHBOARD_PASSWORD) {
      localStorage.setItem(AUTH_KEY, "1");
      setAuthed(true);
    } else {
      setShake(true);
      setInput("");
      setTimeout(() => setShake(false), 500);
    }
  }, [input]);

  if (authed) return children({ onLogout: () => { localStorage.removeItem(AUTH_KEY); setAuthed(false); } });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d1117",
      backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(16,42,32,0.7) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(10,28,48,0.6) 0%, transparent 60%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Mono', 'Fira Mono', 'Courier New', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Playfair+Display:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .pw-shake { animation: shake 0.4s ease; }
      `}</style>
      <div style={{ textAlign: "center", width: 280 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#f0f0f0", marginBottom: 6 }}>
          Hyvää huomenta
        </div>
        <div style={{ fontSize: 10, color: "#3a4a3a", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 32 }}>
          Morning Dashboard
        </div>
        <div className={shake ? "pw-shake" : ""} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="password"
            value={input}
            autoFocus
            placeholder="salasana"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") attempt(); }}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${shake ? "rgba(248,113,113,0.5)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: 2,
              color: "#e8e8e8",
              padding: "10px 14px",
              fontFamily: "inherit",
              fontSize: 14,
              outline: "none",
              textAlign: "center",
              letterSpacing: "0.2em",
              width: "100%",
              transition: "border-color 0.2s",
            }}
          />
          <button
            onClick={attempt}
            style={{
              background: "rgba(110,231,183,0.08)",
              border: "1px solid rgba(110,231,183,0.25)",
              color: "#6ee7b7",
              padding: "9px 0",
              borderRadius: 2,
              fontFamily: "inherit",
              fontSize: 11,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              transition: "background 0.2s",
            }}
            onMouseOver={e => e.currentTarget.style.background = "rgba(110,231,183,0.16)"}
            onMouseOut={e => e.currentTarget.style.background = "rgba(110,231,183,0.08)"}
          >
            Kirjaudu
          </button>
        </div>
      </div>
    </div>
  );
}

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

const WMO = {
  0:  { fi: "Selkeää",              emoji: "☀️"  },
  1:  { fi: "Pääosin selkeää",      emoji: "🌤️"  },
  2:  { fi: "Puolipilvistä",        emoji: "⛅"  },
  3:  { fi: "Pilvistä",             emoji: "☁️"  },
  45: { fi: "Sumua",                emoji: "🌫️"  },
  48: { fi: "Jäätävää sumua",       emoji: "🌫️"  },
  51: { fi: "Kevyttä tihkua",       emoji: "🌦️"  },
  53: { fi: "Tihkusadetta",         emoji: "🌦️"  },
  55: { fi: "Tiheää tihkua",        emoji: "🌦️"  },
  61: { fi: "Kevyttä sadetta",      emoji: "🌧️"  },
  63: { fi: "Sadetta",              emoji: "🌧️"  },
  65: { fi: "Rankkaa sadetta",      emoji: "🌧️"  },
  71: { fi: "Kevyttä lumisadetta",  emoji: "🌨️"  },
  73: { fi: "Lumisadetta",          emoji: "🌨️"  },
  75: { fi: "Tiheää lumisadetta",   emoji: "🌨️"  },
  77: { fi: "Lumirakeita",          emoji: "🌨️"  },
  80: { fi: "Kuuroja",              emoji: "🌦️"  },
  81: { fi: "Kuuroja",              emoji: "🌧️"  },
  82: { fi: "Rankkoja kuuroja",     emoji: "🌧️"  },
  85: { fi: "Lumikuuroja",          emoji: "🌨️"  },
  86: { fi: "Rankkoja lumikuuroja", emoji: "🌨️"  },
  95: { fi: "Ukkosta",              emoji: "⛈️"  },
  96: { fi: "Ukkosta ja rakeita",   emoji: "⛈️"  },
  99: { fi: "Ukkosta ja rakeita",   emoji: "⛈️"  },
};

function useWeather() {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast" +
          "?latitude=61.4991&longitude=23.7871" +
          "&current_weather=true&current=apparent_temperature" +
          "&hourly=precipitation" +
          "&daily=temperature_2m_max,temperature_2m_min" +
          "&timezone=Europe%2FHelsinki&forecast_days=2&wind_speed_unit=ms"
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setState({ loading: false, error: null, data: await res.json() });
      } catch (e) {
        setState({ loading: false, error: e.message, data: null });
      }
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return state;
}

function WeatherCard() {
  const { loading, error, data } = useWeather();

  if (loading) {
    return (
      <div className="card">
        <div className="label">Sää — Tampere</div>
        <div style={{ color: "#5a6a5a", fontSize: 12, padding: "24px 0", textAlign: "center" }}>
          Ladataan säätietoja…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="label">Sää — Tampere</div>
        <div style={{ color: "#f87171", fontSize: 11, padding: "8px 0" }}>Virhe: {error}</div>
      </div>
    );
  }

  const { current_weather, current, hourly, daily } = data;
  const { temperature, windspeed, weathercode } = current_weather;
  const feelsLike = current?.apparent_temperature ?? null;
  const maxT = daily.temperature_2m_max[0];
  const minT = daily.temperature_2m_min[0];
  const { fi: condition, emoji } = WMO[weathercode] || { fi: "Vaihtelevaa", emoji: "🌡️" };

  const curIdx = hourly.time.indexOf(current_weather.time);
  const startIdx = curIdx >= 0 ? curIdx : 0;
  const precip = hourly.precipitation.slice(startIdx, startIdx + 12);
  const times  = hourly.time.slice(startIdx, startIdx + 12);
  const precipMax = Math.max(...precip, 0.5);

  const sign = (v) => (v > 0 ? "+" : "");
  const tempColor = temperature < 0 ? "#9ad4f5" : temperature < 15 ? "#e8e8e8" : "#fbbf24";

  return (
    <div className="card">
      <div className="label">Sää — Tampere</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400, color: tempColor, letterSpacing: "-0.02em" }}>
              {sign(temperature)}{Math.round(temperature)}°
            </span>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</span>
          </div>
          <div style={{ fontSize: 12, color: "#9a9a9a", marginTop: 3 }}>{condition}</div>
        </div>

        <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 5 }}>
          <div>
            <span style={{ fontSize: 10, color: "#5a6a5a" }}>Tuntuu </span>
            <span style={{ fontSize: 13, color: "#c4c4c4" }}>
              {feelsLike != null ? `${sign(feelsLike)}${Math.round(feelsLike)}°` : "—"}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 10, color: "#5a6a5a" }}>Tuuli </span>
            <span style={{ fontSize: 13, color: "#c4c4c4" }}>{windspeed.toFixed(1)} m/s</span>
          </div>
          <div style={{ marginTop: 2 }}>
            <span style={{ fontSize: 11, color: "#4ade80" }}>↑{sign(maxT)}{Math.round(maxT)}°</span>
            <span style={{ fontSize: 10, color: "#3a4a3a" }}> / </span>
            <span style={{ fontSize: 11, color: "#9ad4f5" }}>↓{sign(minT)}{Math.round(minT)}°</span>
          </div>
        </div>
      </div>

      <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="label" style={{ marginBottom: 6 }}>Sademäärä — seuraavat 12 h</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 32 }}>
          {precip.map((mm, i) => {
            const barH = mm > 0 ? Math.max(3, (mm / precipMax) * 32) : 2;
            const color = mm >= 3 ? "#60a5fa" : "#9ad4f5";
            const label = times[i] ? times[i].slice(11, 13) + ":00" : "";
            return (
              <div key={i} style={{ flex: 1 }}>
                <div
                  title={`${label} — ${mm.toFixed(1)} mm`}
                  style={{
                    width: "100%", height: barH,
                    background: mm > 0 ? color : "rgba(255,255,255,0.06)",
                    borderRadius: 1,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 9, color: "#3a4a3a" }}>{times[0]  ? times[0].slice(11, 16)  : ""}</span>
          <span style={{ fontSize: 9, color: "#3a4a3a" }}>{times[11] ? times[11].slice(11, 16) : ""}</span>
        </div>
      </div>
    </div>
  );
}

function useElectricity() {
  const [state, setState] = useState({ loading: true, error: null, today: null, tomorrowAvg: null });
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("https://api.spot-hinta.fi/TodayAndDayForward");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();

        console.log("[electricity] sample entry:", raw[0]);

        const todayFi    = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
        const tomorrowFi = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" }); })();

        console.log("[electricity] today:", todayFi, "tomorrow:", tomorrowFi);

        // API returns 15-min intervals; bucket per hour then average.
        // PriceWithTax is in EUR/kWh — multiply by 100 to get snt/kWh.
        const buckets  = Array.from({ length: 24 }, () => []);
        const tmrItems = [];

        raw.forEach(item => {
          const date = item.DateTime.slice(0, 10);
          const hour = parseInt(item.DateTime.slice(11, 13), 10);
          const snt  = item.PriceWithTax * 100;
          if (date === todayFi)    buckets[hour].push(snt);
          if (date === tomorrowFi) tmrItems.push(snt);
        });

        const prices24 = buckets.map(b =>
          b.length > 0 ? b.reduce((a, c) => a + c, 0) / b.length : null
        );

        console.log("[electricity] prices24:", prices24);

        if (prices24.every(p => p === null)) {
          throw new Error(`Päivän hinnat puuttuvat (haettiin: ${todayFi})`);
        }

        const tomorrowAvg = tmrItems.length > 0
          ? tmrItems.reduce((a, b) => a + b, 0) / tmrItems.length
          : null;

        setState({ loading: false, error: null, today: prices24, tomorrowAvg });
      } catch (e) {
        setState({ loading: false, error: e.message, today: null, tomorrowAvg: null });
      }
    };
    load();
    const t = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);
  return state;
}

function ElectricityCard() {
  const { loading, error, today, tomorrowAvg } = useElectricity();
  const currentHour = new Date().getHours();

  if (loading) {
    return (
      <div className="card">
        <div className="label">Pörssisähkö</div>
        <div style={{ color: "#5a6a5a", fontSize: 12, padding: "24px 0", textAlign: "center" }}>
          Ladataan hintatietoja…
        </div>
      </div>
    );
  }

  if (error || !today) {
    return (
      <div className="card">
        <div className="label">Pörssisähkö</div>
        <div style={{ color: "#f87171", fontSize: 11, padding: "8px 0" }}>
          {error ? `Virhe: ${error}` : "Hintatietoja ei saatavilla"}
        </div>
      </div>
    );
  }

  const priceColor = (p) => p == null ? "#3a4a3a" : p < 5 ? "#4ade80" : p < 10 ? "#fbbf24" : "#f87171";
  const currentPrice = today[currentHour];
  const validPrices  = today.filter(p => p != null);
  const avgPrice     = validPrices.length > 0 ? validPrices.reduce((a, b) => a + b, 0) / validPrices.length : null;
  const maxPrice     = Math.max(...validPrices.map(p => Math.max(p, 0)), 1);

  return (
    <div className="card">
      <div className="label">Pörssisähkö</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <span style={{ fontSize: 32, fontWeight: 500, color: priceColor(currentPrice), fontFamily: "'Playfair Display', serif" }}>
            {currentPrice != null ? currentPrice.toFixed(1) : "—"}
          </span>
          <span style={{ fontSize: 12, color: "#5a6a5a", marginLeft: 4 }}>snt/kWh nyt</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#5a6a5a" }}>Tänään ka.</div>
          <div style={{ fontSize: 16, color: "#9a9a9a" }}>
            {avgPrice != null ? avgPrice.toFixed(1) : "—"} snt
          </div>
          {tomorrowAvg != null && (
            <div style={{ fontSize: 10, color: "#5a6a5a", marginTop: 4 }}>
              Huomenna ka.{" "}
              <span style={{ color: priceColor(tomorrowAvg) }}>{tomorrowAvg.toFixed(1)} snt</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
        {today.map((price, i) => {
          const h = price != null ? Math.max(4, (Math.max(price, 0) / maxPrice) * 40) : 4;
          const isCurrent = i === currentHour;
          const c = priceColor(price);
          return (
            <div
              key={i}
              className="bar"
              title={price != null ? `${i}:00 — ${price.toFixed(1)} snt/kWh` : `${i}:00 — ei tietoa`}
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
  );
}

// ── Time Tracker ─────────────────────────────────────────────────────────────

const CATEGORIES = ["Työ", "Opiskelu", "Omat projektit", "Henkilökohtainen"];
const CAT_COLORS = {
  "Työ":              "#9ad4f5",
  "Opiskelu":         "#6ee7b7",
  "Omat projektit":   "#fbbf24",
  "Henkilökohtainen": "#c4b5fd",
};
const TT_KEY = "timeTracker";

const fiStr = (d = new Date()) =>
  d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });

const fmtMs = (ms, withSec = false) => {
  const ts = Math.max(0, Math.floor(ms / 1000));
  const h  = Math.floor(ts / 3600);
  const m  = Math.floor((ts % 3600) / 60);
  const s  = ts % 60;
  if (withSec) {
    if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  if (m > 0) return `${m}m`;
  if (ts > 0) return `<1m`;
  return "—";
};

const emptyAccum = () => Object.fromEntries(CATEGORIES.map(c => [c, 0]));

const initTT = () => ({
  history: [],
  today: { date: fiStr(), accumulated: emptyAccum(), active: null },
});

const loadTT = () => {
  try {
    const raw = localStorage.getItem(TT_KEY);
    if (!raw) return initTT();
    const s = JSON.parse(raw);
    CATEGORIES.forEach(c => { if (s.today.accumulated[c] == null) s.today.accumulated[c] = 0; });
    const today = fiStr();
    if (s.today.date !== today) {
      if (s.today.active) {
        const e = Date.now() - s.today.active.startedAt;
        s.today.accumulated[s.today.active.category] = (s.today.accumulated[s.today.active.category] || 0) + e;
        s.today.active = null;
      }
      s.history = [{ date: s.today.date, totals: { ...s.today.accumulated } }, ...s.history].slice(0, 30);
      s.today = { date: today, accumulated: emptyAccum(), active: null };
    }
    return s;
  } catch { return initTT(); }
};

function TimeTrackerWidget() {
  const [store, setStore]           = useState(loadTT);
  const [view, setView]             = useState("today");
  const [, setTick]                 = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [summary, setSummary]       = useState(null);

  useEffect(() => { localStorage.setItem(TT_KEY, JSON.stringify(store)); }, [store]);

  const isRunning = !!store.today.active;
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  const liveMs = (cat) => {
    const acc = store.today.accumulated[cat] || 0;
    return store.today.active?.category === cat ? acc + Date.now() - store.today.active.startedAt : acc;
  };

  const start = (cat) => setStore(prev => {
    const s = JSON.parse(JSON.stringify(prev));
    if (s.today.active) {
      const e = Date.now() - s.today.active.startedAt;
      s.today.accumulated[s.today.active.category] = (s.today.accumulated[s.today.active.category] || 0) + e;
    }
    s.today.active = { category: cat, startedAt: Date.now() };
    return s;
  });

  const pause = () => setStore(prev => {
    if (!prev.today.active) return prev;
    const s = JSON.parse(JSON.stringify(prev));
    const e = Date.now() - s.today.active.startedAt;
    s.today.accumulated[s.today.active.category] = (s.today.accumulated[s.today.active.category] || 0) + e;
    s.today.active = null;
    return s;
  });

  const stopCat = (cat) => setStore(prev => {
    const s = JSON.parse(JSON.stringify(prev));
    if (s.today.active?.category === cat) {
      const e = Date.now() - s.today.active.startedAt;
      s.today.accumulated[cat] = (s.today.accumulated[cat] || 0) + e;
      s.today.active = null;
    }
    s.today.accumulated[cat] = 0;
    return s;
  });

  const endDay = () => {
    const s = JSON.parse(JSON.stringify(store));
    if (s.today.active) {
      const e = Date.now() - s.today.active.startedAt;
      s.today.accumulated[s.today.active.category] = (s.today.accumulated[s.today.active.category] || 0) + e;
      s.today.active = null;
    }
    const snap = { date: s.today.date, totals: { ...s.today.accumulated } };
    s.history = [snap, ...s.history].slice(0, 30);
    s.today   = { date: fiStr(), accumulated: emptyAccum(), active: null };
    setStore(s);
    setSummary(snap);
  };

  // ── Today ────────────────────────────────────────────────────────────────
  const renderToday = () => {
    if (summary) {
      const grand = Object.values(summary.totals).reduce((a, b) => a + b, 0);
      const maxV  = Math.max(...Object.values(summary.totals), 1);
      return (
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:12 }}>
            <span style={{ fontSize:11, color:"#9a9a9a" }}>Päivä päättyi · {summary.date}</span>
            <span style={{ fontSize:12, color:"#6ee7b7" }}>{fmtMs(grand)}</span>
          </div>
          {CATEGORIES.map(cat => {
            const ms = summary.totals[cat] || 0;
            return (
              <div key={cat} style={{ marginBottom:8 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <span style={{ fontSize:10, color:CAT_COLORS[cat] }}>{cat}</span>
                  <span style={{ fontSize:10, color:"#9a9a9a" }}>{fmtMs(ms)}</span>
                </div>
                <div style={{ height:4, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                  <div style={{ width:`${(ms/maxV)*100}%`, height:"100%", background:CAT_COLORS[cat], borderRadius:2 }} />
                </div>
              </div>
            );
          })}
          <button className="btn-ghost" style={{ marginTop:10, width:"100%", fontSize:10 }} onClick={() => setSummary(null)}>
            Jatka seurantaa
          </button>
        </div>
      );
    }

    const totalToday = CATEGORIES.reduce((s, c) => s + liveMs(c), 0);

    return (
      <div>
        {CATEGORIES.map(cat => {
          const ms     = liveMs(cat);
          const active = store.today.active?.category === cat;
          return (
            <div key={cat} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ width:3, height:28, background:CAT_COLORS[cat], borderRadius:2, flexShrink:0, opacity:active?1:0.3 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:10, color:active?CAT_COLORS[cat]:"#6a7a6a", letterSpacing:"0.03em" }}>{cat}</div>
                <div style={{ fontSize:13, color:active?"#f0f0f0":(ms>0?"#c4c4c4":"#3a4a3a"), fontVariantNumeric:"tabular-nums" }}>
                  {fmtMs(ms, active)}
                </div>
              </div>
              <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                {active ? (
                  <button className="btn-ghost" onClick={pause} style={{ fontSize:11, padding:"2px 8px" }}>⏸</button>
                ) : (
                  <button className="btn-ghost" onClick={() => start(cat)}
                    style={{ fontSize:11, padding:"2px 8px", color:CAT_COLORS[cat], borderColor:`${CAT_COLORS[cat]}40` }}>▶</button>
                )}
                {ms > 0 && !active && (
                  <button className="btn-ghost" onClick={() => stopCat(cat)} style={{ fontSize:9, padding:"2px 5px" }}>✕</button>
                )}
              </div>
            </div>
          );
        })}
        <div style={{ marginTop:10, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:10, color:"#5a6a5a" }}>
            {totalToday > 0 ? `Yhteensä ${fmtMs(totalToday)}` : "Ei kirjauksia tänään"}
          </span>
          {totalToday > 0 && (
            <button className="btn-ghost" onClick={endDay} style={{ fontSize:9, letterSpacing:"0.08em", padding:"3px 10px" }}>
              Lopeta päivä
            </button>
          )}
        </div>
      </div>
    );
  };

  // ── Week ─────────────────────────────────────────────────────────────────
  const renderWeek = () => {
    const today = fiStr();
    const days  = Array.from({ length:7 }, (_, i) => {
      const d       = new Date(); d.setDate(d.getDate() - (6 - i));
      const dateStr = fiStr(d);
      const label   = d.toLocaleDateString("fi-FI", { weekday:"short", timeZone:"Europe/Helsinki" }).slice(0,2).toUpperCase();
      const isToday = dateStr === today;
      const totals  = isToday
        ? Object.fromEntries(CATEGORIES.map(c => [c, liveMs(c)]))
        : (store.history.find(h => h.date === dateStr)?.totals ?? emptyAccum());
      const total   = Object.values(totals).reduce((a, b) => a + b, 0);
      return { dateStr, label, isToday, totals, total };
    });

    const maxTotal = Math.max(...days.map(d => d.total), 1);
    const BAR_H    = 56;

    return (
      <div>
        <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:BAR_H+18 }}>
          {days.map(({ dateStr, label, isToday, totals, total }) => {
            const filledH = (total / maxTotal) * BAR_H;
            return (
              <div key={dateStr} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center" }}>
                <div style={{ width:"100%", height:BAR_H, position:"relative" }} title={`${dateStr} — ${fmtMs(total)}`}>
                  <div style={{ position:"absolute", inset:0, background:"rgba(255,255,255,0.03)", borderRadius:1 }} />
                  <div style={{ position:"absolute", bottom:0, left:0, right:0, height:filledH, overflow:"hidden", borderRadius:1, display:"flex", flexDirection:"column-reverse" }}>
                    {CATEGORIES.map(cat => {
                      const ms = totals[cat] || 0;
                      if (!ms) return null;
                      return <div key={cat} style={{ height:(ms/total)*filledH, background:CAT_COLORS[cat], flexShrink:0, opacity:isToday?1:0.72 }} />;
                    })}
                  </div>
                </div>
                <div style={{ fontSize:8, color:isToday?"#6ee7b7":"#4a5a4a", marginTop:4 }}>{label}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:"3px 10px", marginTop:10, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.05)" }}>
          {CATEGORIES.map(cat => (
            <div key={cat} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <div style={{ width:7, height:7, borderRadius:1, background:CAT_COLORS[cat] }} />
              <span style={{ fontSize:9, color:"#5a6a5a" }}>{cat}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Month ────────────────────────────────────────────────────────────────
  const renderMonth = () => {
    const target = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
    const mStr   = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,"0")}`;
    const mLabel = target.toLocaleDateString("fi-FI", { year:"numeric", month:"long" });
    const today  = fiStr();

    const days = [
      ...store.history.filter(d => d.date.startsWith(mStr)),
      ...(today.startsWith(mStr) ? [{ date:today, totals:Object.fromEntries(CATEGORIES.map(c=>[c,liveMs(c)])) }] : []),
    ].filter((d,i,a) => a.findIndex(x => x.date===d.date)===i);

    const totals = Object.fromEntries(CATEGORIES.map(c => [c, days.reduce((s,d)=>s+(d.totals[c]||0),0)]));
    const grand  = Object.values(totals).reduce((a,b)=>a+b,0);
    const maxCat = Math.max(...Object.values(totals), 1);
    const avgDay = days.length > 0 ? grand / days.length : 0;
    let bestDay  = null, bestMs = 0;
    days.forEach(d => { const t=Object.values(d.totals).reduce((a,b)=>a+b,0); if(t>bestMs){bestMs=t;bestDay=d.date;} });

    return (
      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <button className="btn-ghost" onClick={() => setMonthOffset(o=>o-1)} disabled={monthOffset<=-11}
            style={{ fontSize:10, padding:"2px 7px" }}>←</button>
          <span style={{ fontSize:10, color:"#c4c4c4", textTransform:"capitalize" }}>{mLabel}</span>
          <button className="btn-ghost" onClick={() => setMonthOffset(o=>o+1)} disabled={monthOffset>=0}
            style={{ fontSize:10, padding:"2px 7px" }}>→</button>
        </div>

        {days.length===0 ? (
          <div style={{ fontSize:11, color:"#5a6a5a", textAlign:"center", padding:"16px 0" }}>Ei kirjauksia</div>
        ) : (
          <>
            {CATEGORIES.map(cat => {
              const ms  = totals[cat];
              const pct = grand>0 ? Math.round(ms/grand*100) : 0;
              return (
                <div key={cat} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                    <span style={{ fontSize:10, color:CAT_COLORS[cat] }}>{cat}</span>
                    <span style={{ fontSize:10, color:"#7a8a7a" }}>{fmtMs(ms)} · {pct}%</span>
                  </div>
                  <div style={{ height:5, background:"rgba(255,255,255,0.06)", borderRadius:2 }}>
                    <div style={{ width:`${(ms/maxCat)*100}%`, height:"100%", background:CAT_COLORS[cat], borderRadius:2, opacity:0.8 }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop:10, paddingTop:8, borderTop:"1px solid rgba(255,255,255,0.06)", display:"grid", gridTemplateColumns:"1fr 1fr", rowGap:5, fontSize:10 }}>
              <span style={{ color:"#5a6a5a" }}>Yhteensä</span>
              <span style={{ color:"#e8e8e8", textAlign:"right" }}>{fmtMs(grand)}</span>
              <span style={{ color:"#5a6a5a" }}>Kirjauspäiviä</span>
              <span style={{ color:"#e8e8e8", textAlign:"right" }}>{days.length} pv</span>
              <span style={{ color:"#5a6a5a" }}>Ka. / päivä</span>
              <span style={{ color:"#e8e8e8", textAlign:"right" }}>{fmtMs(avgDay)}</span>
              {bestDay && <>
                <span style={{ color:"#5a6a5a" }}>Tuottavin päivä</span>
                <span style={{ color:"#6ee7b7", textAlign:"right" }}>{bestDay.slice(5)} · {fmtMs(bestMs)}</span>
              </>}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="card">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
        <div className="label" style={{ marginBottom:0 }}>Ajanseuranta</div>
        <div style={{ display:"flex", gap:3 }}>
          {[["today","Tänään"],["week","7 pv"],["month","Kuukausi"]].map(([v,l]) => (
            <button key={v} className="btn-ghost" onClick={() => setView(v)} style={{
              fontSize:9, padding:"2px 7px",
              color: view===v?"#6ee7b7":"#5a6a5a",
              borderColor: view===v?"rgba(110,231,183,0.25)":"rgba(255,255,255,0.07)",
            }}>{l}</button>
          ))}
        </div>
      </div>
      {view==="today" && renderToday()}
      {view==="week"  && renderWeek()}
      {view==="month" && renderMonth()}
    </div>
  );
}

export default function App() {
  return (
    <PasswordGate>
      {({ onLogout }) => <MorningDashboard onLogout={onLogout} />}
    </PasswordGate>
  );
}

function MorningDashboard({ onLogout }) {
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
          <button className="btn-ghost" onClick={onLogout} style={{ marginTop: 6, fontSize: 9, letterSpacing: "0.1em" }}>
            kirjaudu ulos
          </button>
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
        <ElectricityCard />

        {/* WEATHER */}
        <WeatherCard />

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

        {/* TIME TRACKER */}
        <TimeTrackerWidget />

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
        <span>MORNING DASHBOARD v0.3</span>
        <span>SÄÄ: OPEN-METEO · SÄHKÖ: SPOT-HINTA.FI</span>
      </div>
    </div>
  );
}