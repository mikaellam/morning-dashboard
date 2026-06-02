import { useState, useEffect, useCallback, useRef } from "react";
import { getEventsForToday } from './services/calendarService';
import WeeklyReviewOverlay from './WeeklyReviewOverlay';
import TodoWidget, { TODO_KEY } from './TodoWidget';
import IdeasWidget from './IdeasWidget';
import * as dataService from './services/dataService';
import * as gcService from './services/googleCalendarService';

// Hook: re-reads key from localStorage when a 'dashboard:sync' event arrives for it.
// setState from useState is guaranteed stable, so the empty dep array is intentional.
function useDataSync(key, setState) {
  useEffect(() => {
    const h = (e) => {
      if (e.detail?.key !== key) return;
      const raw = localStorage.getItem(key);
      if (raw) try { setState(JSON.parse(raw)); } catch {}
    };
    window.addEventListener('dashboard:sync', h);
    return () => window.removeEventListener('dashboard:sync', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

// ── Google Calendar hook ───────────────────────────────────────────────────────
function useGoogleCalendar() {
  const [auth, setAuth]         = useState(() => gcService.loadAuth());
  const [settings, setSettings] = useState(() => gcService.loadSettings());
  const [gcEvents, setGcEvents] = useState({});
  const [status, setStatus]     = useState('idle'); // idle|connecting|fetching|ready|error|auth_needed
  const [error, setError]       = useState(null);

  // Fetch events using the given accessToken + settings object
  const fetchEventsNow = useCallback(async (accessToken, settingsObj) => {
    const enabledCals = (settingsObj.calendars || []).filter(c => c.enabled);
    if (enabledCals.length === 0) { setStatus('ready'); return; }
    setStatus('fetching');
    try {
      const events = await gcService.fetchAllEvents(accessToken, enabledCals);
      setGcEvents(events);
      setStatus('ready');
    } catch (err) {
      if (err.status === 401) {
        setStatus('auth_needed');
        gcService.clearAuth();
        setAuth(null);
      } else {
        setStatus('error');
        setError(err.message || 'Tapahtumahaku epäonnistui');
      }
    }
  }, []);

  // On mount: if we have a stored token, start fetching; otherwise try silent refresh
  useEffect(() => {
    const stored = gcService.loadAuth();
    if (!stored) { setStatus('idle'); return; }
    if (gcService.isTokenValid(stored)) {
      setAuth(stored);
      fetchEventsNow(stored.accessToken, gcService.loadSettings());
    } else {
      setStatus('connecting');
      gcService.requestAccessToken({ prompt: '' })
        .then(newAuth => {
          gcService.saveAuth(newAuth);
          setAuth(newAuth);
          return fetchEventsNow(newAuth.accessToken, gcService.loadSettings());
        })
        .catch(() => { setStatus('auth_needed'); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cross-device sync: react when another device saves auth or settings
  useEffect(() => {
    const h = (e) => {
      const key = e.detail?.key;
      if (key === gcService.GC_AUTH_KEY) setAuth(gcService.loadAuth());
      if (key === gcService.GC_SETTINGS_KEY) setSettings(gcService.loadSettings());
    };
    window.addEventListener('dashboard:sync', h);
    return () => window.removeEventListener('dashboard:sync', h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const gcConnect = useCallback(async () => {
    setStatus('connecting');
    setError(null);
    try {
      const newAuth = await gcService.requestAccessToken({ prompt: 'consent' });
      gcService.saveAuth(newAuth);
      setAuth(newAuth);

      setStatus('fetching');
      const calendars = await gcService.fetchCalendars(newAuth.accessToken);
      const newSettings = { calendars: calendars.map(c => ({ ...c, enabled: true })) };
      gcService.saveSettings(newSettings);
      setSettings(newSettings);

      await fetchEventsNow(newAuth.accessToken, newSettings);
    } catch (err) {
      if (err.message !== 'Token request cancelled') {
        setStatus('error');
        setError(err.message || 'Yhdistäminen epäonnistui');
      } else {
        setStatus('idle');
      }
    }
  }, [fetchEventsNow]);

  const gcDisconnect = useCallback(() => {
    if (auth?.accessToken) gcService.revokeToken(auth.accessToken);
    gcService.clearAuth();
    setAuth(null);
    setGcEvents({});
    setSettings({ calendars: [] });
    setStatus('idle');
    setError(null);
  }, [auth]);

  const gcToggleCalendar = useCallback((id) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        calendars: (prev.calendars || []).map(c => c.id === id ? { ...c, enabled: !c.enabled } : c),
      };
      gcService.saveSettings(newSettings);
      const currentAuth = gcService.loadAuth();
      if (currentAuth && gcService.isTokenValid(currentAuth)) {
        fetchEventsNow(currentAuth.accessToken, newSettings);
      }
      return newSettings;
    });
  }, [fetchEventsNow]);

  const gcRefresh = useCallback(async () => {
    const currentAuth = gcService.loadAuth();
    if (!currentAuth) return;
    if (gcService.isTokenValid(currentAuth)) {
      await fetchEventsNow(currentAuth.accessToken, gcService.loadSettings());
    } else {
      setStatus('connecting');
      try {
        const newAuth = await gcService.requestAccessToken({ prompt: '' });
        gcService.saveAuth(newAuth);
        setAuth(newAuth);
        await fetchEventsNow(newAuth.accessToken, gcService.loadSettings());
      } catch {
        setStatus('auth_needed');
      }
    }
  }, [fetchEventsNow]);

  return { auth, settings, gcEvents, status, error, gcConnect, gcDisconnect, gcToggleCalendar, gcRefresh };
}

function SyncDot({ onRefresh }) {
  const [status, setStatus] = useState(dataService.getSyncStatus());
  const [, tick] = useState(0);

  useEffect(() => {
    const unsub = dataService.onSyncStatusChange(s => { setStatus(s); tick(n => n + 1); });
    const onSync = () => tick(n => n + 1);
    window.addEventListener('dashboard:sync', onSync);
    return () => { unsub(); window.removeEventListener('dashboard:sync', onSync); };
  }, []);

  const color = status === 'synced' ? '#6ee7b7' : status === 'syncing' ? '#fbbf24' : '#f87171';
  const di    = dataService.debugInfo;
  const fmt   = (iso) => iso
    ? new Date(iso).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  const rtColor = di.realtimeStatus === 'connected' ? '#6ee7b7'
                : di.realtimeStatus === 'connecting' ? '#fbbf24'
                : di.realtimeStatus === 'error'      ? '#f87171'
                :                                      '#3a4a3a';

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, lineHeight: 1.7, color: '#5a6a5a', textAlign: 'right' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginBottom: 2 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0, animation: status === 'syncing' ? 'pulse 1s ease-in-out infinite' : 'none' }} />
        <span style={{ color }}>{status === 'synced' ? 'Synkronoitu' : status === 'syncing' ? 'Tallennetaan...' : 'Sync-virhe'}</span>
        <button
          onClick={onRefresh}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: '#5a6a5a', padding: '1px 7px', borderRadius: 2, fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.06em' }}
          onMouseOver={e => { e.currentTarget.style.borderColor = '#6ee7b7'; e.currentTarget.style.color = '#6ee7b7'; }}
          onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#5a6a5a'; }}
        >Päivitä</button>
      </div>
      <div>user_id: <span style={{ color: '#7a8a7a' }}>{di.userId}</span></div>
      <div>url: <span style={{ color: '#7a8a7a' }}>{(di.supabaseUrl || '').replace('https://', '').slice(0, 36)}</span></div>
      <div>init luku: <span style={{ color: '#7a8a7a' }}>{fmt(di.lastReadAt)}</span> · avaimia: <span style={{ color: '#7a8a7a' }}>{di.keysLoaded ?? '—'}</span>{di.keysMigrated > 0 ? <span style={{ color: '#fbbf24' }}> +{di.keysMigrated}↑</span> : null}</div>
      <div>realtime: <span style={{ color: rtColor }}>{di.realtimeStatus}</span>{di.lastRemoteUpdate ? <span> · päiv. {fmt(di.lastRemoteUpdate)}</span> : null}</div>
      {di.lastError && <div style={{ color: '#f87171', maxWidth: 320, wordBreak: 'break-all' }}>⚠ {di.lastError}</div>}
    </div>
  );
}

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

function WeatherCard({ loading, error, data }) {

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

function ElectricityCard({ loading, error, today, tomorrowAvg }) {
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
      const existingIdx = s.history.findIndex(h => h.date === s.today.date);
      if (existingIdx >= 0) {
        // Merge with existing entry (take max per category) to avoid ghost zero-entries
        const existing = s.history[existingIdx];
        const merged = {
          date: s.today.date,
          totals: Object.fromEntries(
            CATEGORIES.map(c => [c, Math.max(existing.totals[c] || 0, s.today.accumulated[c] || 0)])
          ),
        };
        s.history = [merged, ...s.history.filter((_, i) => i !== existingIdx)].slice(0, 30);
      } else {
        s.history = [{ date: s.today.date, totals: { ...s.today.accumulated } }, ...s.history].slice(0, 30);
      }
      s.today = { date: today, accumulated: emptyAccum(), active: null };
    }
    return s;
  } catch { return initTT(); }
};

function TimeTrackerWidget() {
  const [store, setStore]           = useState(loadTT);
  useDataSync(TT_KEY, setStore);
  const [view, setView]             = useState("today");
  const [, setTick]                 = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [summary, setSummary]       = useState(null);
  const initDoneRef = useRef(false);
  useEffect(() => { dataService.ensureInit().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => { if (!initDoneRef.current) return; dataService.save(TT_KEY, store); }, [store]);

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

  const endDay = async () => {
    const s = JSON.parse(JSON.stringify(store));
    if (s.today.active) {
      const e = Date.now() - s.today.active.startedAt;
      s.today.accumulated[s.today.active.category] = (s.today.accumulated[s.today.active.category] || 0) + e;
      s.today.active = null;
    }
    const snap = { date: s.today.date, totals: { ...s.today.accumulated } };
    // Persist the history entry while today.accumulated is still intact.
    // Only reset today after the write is confirmed (localStorage + Supabase).
    const withHistory = { ...s, history: [snap, ...s.history].slice(0, 30) };
    console.log('[endDay] withHistory before flush — history[0]:', withHistory.history[0], '| today.accumulated:', withHistory.today.accumulated);
    try { await dataService.flush(TT_KEY, withHistory); } catch {}
    setStore({ ...withHistory, today: { date: fiStr(), accumulated: emptyAccum(), active: null } });
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
          <button className="btn-ghost" style={{ marginTop:10, width:"100%", fontSize:10 }} onClick={() => {
            console.log('[Jatka seurantaa] store.history[0]:', store.history[0], '| store.today:', store.today);
            // Restore today.accumulated from the end-of-day snapshot and remove that
            // history entry so tracking can continue without a duplicate when the
            // day rolls over.
            if (store.history[0]?.date === store.today.date) {
              setStore(prev => {
                const s = JSON.parse(JSON.stringify(prev));
                const [first, ...rest] = s.history;
                s.today.accumulated = { ...first.totals };
                s.history = rest;
                return s;
              });
            }
            setSummary(null);
          }}>
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

// ── Today Widget ─────────────────────────────────────────────────────────────

const EL_KEY = "energyLevel";
const ENERGY_OPTS = [
  { value: "low",    fi: "Matala", color: "#f87171" },
  { value: "medium", fi: "Keski",  color: "#fbbf24" },
  { value: "high",   fi: "Korkea", color: "#4ade80" },
];
const SOURCE_BADGE = {
  manual:  { bg: "rgba(255,255,255,0.04)",   color: "#4a5a4a",  label: "oma" },
  outlook: { bg: "rgba(96,165,250,0.08)",    color: "#60a5fa",  label: "outlook" },
  apple:   { bg: "rgba(209,213,219,0.06)",   color: "#9ca3af",  label: "apple" },
  todo:    { bg: "rgba(110,231,183,0.06)",   color: "#6ee7b7",  label: "tehtävä" },
  google:  { bg: "rgba(66,133,244,0.08)",    color: "#4285f4",  label: "google" },
};

function TodayWidget({ weatherState, electricityState, weekPlan, setWeekPlan, recurringEvents, setRecurringEvents, todayName, now, gcEvents }) {
  const [energyMap, setEnergyMap]   = useState(() => {
    try { return JSON.parse(localStorage.getItem(EL_KEY)) || {}; } catch { return {}; }
  });
  useDataSync(EL_KEY, setEnergyMap);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newTime, setNewTime]               = useState("");
  const [newTitle, setNewTitle]             = useState("");
  const [newRecurring, setNewRecurring]     = useState(false);
  const [, setTick]                         = useState(0);

  useEffect(() => { dataService.save(EL_KEY, energyMap); }, [energyMap]);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Re-render immediately when the todo list is saved (so timed tasks
  // appear in the timeline without waiting for the 30 s clock tick).
  useEffect(() => {
    const h = (e) => { if (e.detail?.key === TODO_KEY) setTick(n => n + 1); };
    window.addEventListener('dashboard:sync', h);
    return () => window.removeEventListener('dashboard:sync', h);
  }, []);

  const todayStr    = fiStr();
  const month       = now.getMonth() + 1;
  const energyLevel = energyMap[todayStr] || null;
  const setEnergy   = (v) => setEnergyMap(m => ({ ...m, [todayStr]: m[todayStr] === v ? null : v }));
  const forestReminder = FOREST_REMINDERS[month];

  // Merge timed todo tasks into the timeline
  const todoTimelineEvents = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(TODO_KEY));
      if (!s || !s.tasks) return [];
      return s.tasks
        .filter(t => !t.done && t.dueTime && (!t.dueDate || t.dueDate === todayStr))
        .map(t => ({
          id:        `todo-${t.id}`,
          time:      t.dueTime,
          title:     t.title,
          source:    'todo',
          duration:  null,
          category:  t.category || null,
          recurring: false,
        }));
    } catch { return []; }
  })();
  const events  = [
    ...getEventsForToday(weekPlan, recurringEvents, todayName, gcEvents || {}, todayStr),
    ...todoTimelineEvents,
  ].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const evMins  = (e) => { const [h, m] = (e.time || "0:0").split(":").map(Number); return h * 60 + m; };
  const nextEv  = events.find(e => evMins(e) > nowMins) || null;

  const addEvent = () => {
    if (!newTime || !newTitle.trim()) return;
    const ev = { time: newTime, title: newTitle.trim() };
    if (newRecurring) {
      setRecurringEvents(p => ({ ...p, [todayName]: [...(p[todayName] || []), ev].sort((a, b) => a.time.localeCompare(b.time)) }));
    } else {
      setWeekPlan(p => ({ ...p, [todayName]: [...(p[todayName] || []), ev].sort((a, b) => a.time.localeCompare(b.time)) }));
    }
    setNewTime(""); setNewTitle(""); setNewRecurring(false); setAddingEvent(false);
  };

  // Context reads ── all reads are best-effort from localStorage
  const ttToday = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(TT_KEY));
      if (!s || s.today?.date !== todayStr) return emptyAccum();
      const acc = { ...s.today.accumulated };
      if (s.today.active) acc[s.today.active.category] = (acc[s.today.active.category] || 0) + Date.now() - s.today.active.startedAt;
      return acc;
    } catch { return emptyAccum(); }
  })();
  const ttTotal = Object.values(ttToday).reduce((a, b) => a + b, 0);

  const weeklyGoals = (() => {
    try { return JSON.parse(localStorage.getItem(WG_KEY))?.current?.goals || []; } catch { return []; }
  })();

  const upcomingDeadlines = (() => {
    try {
      const sp = JSON.parse(localStorage.getItem(SP_KEY));
      if (!sp) return [];
      const base = new Date(); base.setHours(0, 0, 0, 0);
      return (sp.courses || [])
        .filter(c => c.deadline)
        .map(c => {
          const dl = new Date(c.deadline); dl.setHours(0, 0, 0, 0);
          return { id: c.id, name: c.name, daysLeft: Math.round((dl - base) / 86400000) };
        })
        .filter(c => c.daysLeft >= 0 && c.daysLeft <= 7)
        .sort((a, b) => a.daysLeft - b.daysLeft);
    } catch { return []; }
  })();

  const { data: wData } = weatherState || {};
  const wSummary = wData ? {
    temp:  Math.round(wData.current_weather.temperature),
    emoji: (WMO[wData.current_weather.weathercode] || { emoji: "🌡️" }).emoji,
  } : null;
  const ePrices  = electricityState?.today || null;
  const eCurrent = ePrices ? ePrices[now.getHours()] : null;
  const eColor   = eCurrent == null ? "#5a6a5a" : eCurrent < 5 ? "#4ade80" : eCurrent < 10 ? "#fbbf24" : "#f87171";

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>

      {/* ── Day summary bar ─────────────────────────────────── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ flex: "1 1 180px" }}>
          <div className="label" style={{ marginBottom: 2 }}>Tänään — {todayName}</div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#f0f0f0", textTransform: "capitalize" }}>
            {now.toLocaleDateString("fi-FI", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {wSummary && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <span style={{ fontSize: 22 }}>{wSummary.emoji}</span>
              <span style={{ fontSize: 20, color: "#e8e8e8" }}>{wSummary.temp > 0 ? "+" : ""}{wSummary.temp}°</span>
            </div>
          )}
          {eCurrent != null && (
            <span style={{ fontSize: 13, color: eColor }}>⚡ {eCurrent.toFixed(1)} snt</span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 10, color: "#5a6a5a" }}>Energia:</span>
            {ENERGY_OPTS.map(opt => (
              <button key={opt.value} onClick={() => setEnergy(opt.value)} className="btn-ghost"
                style={{ fontSize: 9, padding: "3px 8px", color: energyLevel === opt.value ? opt.color : "#5a6a5a", borderColor: energyLevel === opt.value ? opt.color + "55" : "rgba(255,255,255,0.08)", transition: "all 0.2s" }}>
                {opt.fi}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Timeline + Context ──────────────────────────────── */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>

        {/* Timeline */}
        <div style={{ flex: "3 1 300px", minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="label" style={{ marginBottom: 0 }}>Aikajana</div>
            <button className="btn-ghost" onClick={() => setAddingEvent(a => !a)} style={{ fontSize: 9 }}>
              {addingEvent ? "✕ Peruuta" : "+ Tapahtuma"}
            </button>
          </div>

          {addingEvent && (
            <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center", padding: "8px 10px", background: "rgba(110,231,183,0.04)", borderRadius: 2, border: "1px solid rgba(110,231,183,0.1)" }}>
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} style={{ width: 88 }} />
              <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Tapahtuma"
                style={{ flex: 1, minWidth: 120 }} onKeyDown={e => e.key === "Enter" && addEvent()} />
              <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#7a8a7a", cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={newRecurring} onChange={e => setNewRecurring(e.target.checked)} style={{ accentColor: "#6ee7b7" }} />
                🔁 Toistuva
              </label>
              <button className="btn" onClick={addEvent}>Lisää</button>
            </div>
          )}

          {events.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5a6a5a", padding: "20px 0", textAlign: "center" }}>
              Ei merkintöjä — lisää viikkosuunnitelmaan tai + Tapahtuma
            </div>
          ) : (
            <div>
              {events.map((ev, idx) => {
                const evMin  = evMins(ev);
                const isPast = evMin < nowMins;
                const isNext = ev === nextEv;
                const showNowLine =
                  (idx === 0 && evMin > nowMins) ||
                  (idx > 0 && evMin > nowMins && evMins(events[idx - 1]) <= nowMins);
                const badge = SOURCE_BADGE[ev.source] || SOURCE_BADGE.manual;
                return (
                  <div key={ev.id}>
                    {showNowLine && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6ee7b7", flexShrink: 0 }} />
                        <div style={{ flex: 1, height: 1, background: "rgba(110,231,183,0.25)" }} />
                        <span style={{ fontSize: 9, color: "#6ee7b7", flexShrink: 0 }}>
                          {now.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    )}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      background: isNext ? "rgba(110,231,183,0.03)" : "transparent",
                    }}>
                      <div style={{ width: 3, height: 28, borderRadius: 2, flexShrink: 0, background: isPast ? "rgba(255,255,255,0.08)" : isNext ? (ev.color || "#6ee7b7") : `${(ev.color || "#6ee7b7")}99` }} />
                      <span style={{ fontSize: 11, color: isPast ? "#3a4a3a" : "#6ee7b7", minWidth: 36, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{ev.time}</span>
                      <span style={{ fontSize: 13, color: isPast ? "#4a5a4a" : isNext ? "#f0f0f0" : "#c4c4c4", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", textDecoration: isPast ? "line-through" : "none" }}>
                        {ev.title}
                        {ev.recurring && <span style={{ fontSize: 9, color: "#4a5a4a", marginLeft: 5 }}>🔁</span>}
                      </span>
                      {ev.duration && <span style={{ fontSize: 10, color: "#5a6a5a", flexShrink: 0 }}>{ev.duration}</span>}
                      <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 1, background: badge.bg, color: badge.color, flexShrink: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>{badge.label}</span>
                      {isNext && <span style={{ fontSize: 9, color: "#6ee7b7", flexShrink: 0 }}>← seuraava</span>}
                    </div>
                  </div>
                );
              })}
              {events.every(e => evMins(e) <= nowMins) && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#6ee7b7", flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 1, background: "rgba(110,231,183,0.25)" }} />
                  <span style={{ fontSize: 9, color: "#6ee7b7" }}>{now.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Context panel */}
        <div style={{ flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 16, borderLeft: "1px solid rgba(255,255,255,0.06)", paddingLeft: 20 }}>

          {/* Ajanseuranta */}
          <div>
            <div className="label" style={{ marginBottom: ttTotal > 0 ? 8 : 4 }}>Ajanseuranta</div>
            {ttTotal === 0 ? (
              <div style={{ fontSize: 11, color: "#4a5a4a" }}>Ei kirjauksia tänään</div>
            ) : (
              <>
                {CATEGORIES.map(cat => {
                  const ms = ttToday[cat] || 0;
                  if (!ms) return null;
                  return (
                    <div key={cat} style={{ marginBottom: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 9, color: CAT_COLORS[cat] }}>{cat}</span>
                        <span style={{ fontSize: 9, color: "#7a8a7a" }}>{fmtMs(ms)}</span>
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
                        <div style={{ width: `${Math.min((ms / Math.max(ttTotal, 1)) * 100, 100)}%`, height: "100%", background: CAT_COLORS[cat], borderRadius: 2, opacity: 0.85 }} />
                      </div>
                    </div>
                  );
                })}
                <div style={{ fontSize: 9, color: "#5a6a5a", marginTop: 2 }}>Yhteensä {fmtMs(ttTotal)}</div>
              </>
            )}
          </div>

          {/* Weekly goals */}
          {weeklyGoals.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Viikon tavoitteet</div>
              {weeklyGoals.slice(0, 5).map(g => (
                <div key={g.id} style={{ display: "flex", gap: 6, alignItems: "flex-start", padding: "3px 0" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, border: `1px solid ${g.done ? "#6ee7b7" : "#3a4a3a"}`, background: g.done ? "rgba(110,231,183,0.2)" : "transparent", flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 11, color: g.done ? "#3a4a3a" : "#9a9a9a", textDecoration: g.done ? "line-through" : "none" }}>{g.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Deadlines */}
          {upcomingDeadlines.length > 0 && (
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Deadlinet</div>
              {upcomingDeadlines.map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: 11, color: "#c4c4c4", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 8, flexShrink: 0, color: c.daysLeft <= 2 ? "#f87171" : "#fbbf24", animation: c.daysLeft === 0 ? "pulse 1.5s ease-in-out infinite" : "none" }}>
                    {c.daysLeft === 0 ? "tänään!" : `${c.daysLeft} pv`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Forest reminder */}
          <div>
            <div className="label" style={{ marginBottom: 4 }}>🌲 Metsä</div>
            <div style={{ fontSize: 11, color: "#a8c4a8", lineHeight: 1.5 }}>{forestReminder}</div>
          </div>

        </div>
      </div>
    </div>
  );
}


// ── Studies & Projects card ───────────────────────────────────────────────────

function deadlineDays(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dl    = new Date(dateStr); dl.setHours(0, 0, 0, 0);
  return Math.round((dl - today) / 86400000);
}

const SP_KEY = "studiesProjects";
const SP_DEFAULTS = {
  courses: [
    { id: 1, name: "Product Line Engineering", description: "Kiinteistöseuranta-projekti — Evalance/FeatureIDE", deadline: "", moodleUrl: "" },
  ],
  projects: [
    { id: 2, name: "Metsädashboard MVP", description: "WFS API + LiDAR — Python", status: "active", url: "" },
    { id: 3, name: "ML/AI Roadmap", description: "Viikko 8 / 26", status: "active", url: "" },
  ],
};

function StudiesProjectsCard() {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(SP_KEY);
      return raw ? JSON.parse(raw) : SP_DEFAULTS;
    } catch { return SP_DEFAULTS; }
  });
  useDataSync(SP_KEY, setData);
  const [editMode, setEditMode]       = useState(false);
  const [addingCourse, setAddingCourse] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [newCourse, setNewCourse]     = useState({ name: "", description: "", deadline: "", moodleUrl: "" });
  const [newProject, setNewProject]   = useState({ name: "", description: "", status: "active", url: "" });
  const initDoneRef = useRef(false);
  useEffect(() => { dataService.ensureInit().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => { if (!initDoneRef.current) return; dataService.save(SP_KEY, data); }, [data]);

  const STATUS_COLORS = { active: "#6ee7b7", paused: "#fbbf24", done: "#5a6a5a" };
  const STATUS_FI     = { active: "Aktiivinen", paused: "Tauolla", done: "Valmis" };

  const removeCourse  = (id) => setData(d => ({ ...d, courses:  d.courses.filter(c => c.id !== id) }));
  const removeProject = (id) => setData(d => ({ ...d, projects: d.projects.filter(p => p.id !== id) }));
  const cycleStatus   = (id) => setData(d => ({
    ...d,
    projects: d.projects.map(p => {
      if (p.id !== id) return p;
      return { ...p, status: ({ active: "paused", paused: "done", done: "active" })[p.status] || "active" };
    }),
  }));

  const addCourse = () => {
    if (!newCourse.name.trim()) return;
    setData(d => ({ ...d, courses: [...d.courses, { ...newCourse, id: Date.now() }] }));
    setNewCourse({ name: "", description: "", deadline: "", moodleUrl: "" });
    setAddingCourse(false);
  };
  const addProject = () => {
    if (!newProject.name.trim()) return;
    setData(d => ({ ...d, projects: [...d.projects, { ...newProject, id: Date.now() }] }));
    setNewProject({ name: "", description: "", status: "active", url: "" });
    setAddingProject(false);
  };

  const inputStyle = { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, color: "#e8e8e8", padding: "6px 10px", fontFamily: "inherit", fontSize: 12, outline: "none" };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Opinnot & Projektit</div>
        <button className="btn-ghost" onClick={() => { setEditMode(e => !e); setAddingCourse(false); setAddingProject(false); }} style={{ fontSize: 9 }}>
          {editMode ? "✓ Valmis" : "✎ Muokkaa"}
        </button>
      </div>

      <div className="label" style={{ color: "#6ee7b7", marginBottom: 6 }}>Kurssit</div>
      {data.courses.length === 0 && <div style={{ fontSize: 11, color: "#5a6a5a", marginBottom: 8 }}>Ei kursseja</div>}
      {data.courses.map(c => (
        <div key={c.id} style={{ padding: "8px 10px", background: "rgba(110,231,183,0.06)", border: "1px solid rgba(110,231,183,0.12)", borderRadius: 2, marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "#e8e8e8" }}>{c.name}</span>
              {(() => {
                const d = deadlineDays(c.deadline);
                if (d == null || d < 0) return null;
                if (d === 0) return <span style={{ fontSize: 9, color: "#f87171", letterSpacing: "0.05em", animation: "pulse 1.5s ease-in-out infinite" }}>TÄNÄÄN</span>;
                if (d <= 2)  return <span style={{ fontSize: 9, color: "#f87171" }}>{d} pv</span>;
                if (d <= 7)  return <span style={{ fontSize: 9, color: "#fbbf24" }}>{d} pv</span>;
                return null;
              })()}
            </div>
            {editMode && <button className="btn-ghost" onClick={() => removeCourse(c.id)} style={{ fontSize: 9, padding: "1px 5px", marginLeft: 6 }}>✕</button>}
          </div>
          {c.description && <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 2 }}>{c.description}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 10 }}>
            {c.deadline && <span style={{ color: "#5a6a5a" }}>DL: <span style={{ color: "#c4c4c4" }}>{c.deadline}</span></span>}
            {c.moodleUrl && <a href={c.moodleUrl} target="_blank" rel="noreferrer" style={{ color: "#9ad4f5", textDecoration: "none" }}>Moodle →</a>}
          </div>
        </div>
      ))}
      {editMode && !addingCourse && (
        <button className="btn-ghost" onClick={() => setAddingCourse(true)} style={{ fontSize: 9, width: "100%", marginBottom: 10 }}>+ Lisää kurssi</button>
      )}
      {editMode && addingCourse && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
          <input type="text" placeholder="Kurssin nimi *" value={newCourse.name} onChange={e => setNewCourse(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <input type="text" placeholder="Kuvaus" value={newCourse.description} onChange={e => setNewCourse(p => ({ ...p, description: e.target.value }))} style={inputStyle} />
          <input type="date" value={newCourse.deadline} onChange={e => setNewCourse(p => ({ ...p, deadline: e.target.value }))} style={{ ...inputStyle, colorScheme: "dark" }} />
          <input type="url" placeholder="Moodle URL" value={newCourse.moodleUrl} onChange={e => setNewCourse(p => ({ ...p, moodleUrl: e.target.value }))} style={inputStyle} />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn" style={{ flex: 1 }} onClick={addCourse}>+ Lisää</button>
            <button className="btn-ghost" onClick={() => setAddingCourse(false)}>✕</button>
          </div>
        </div>
      )}

      <div className="label" style={{ color: "#9ad4f5", marginBottom: 6, marginTop: 8 }}>Projektit</div>
      {data.projects.length === 0 && <div style={{ fontSize: 11, color: "#5a6a5a", marginBottom: 8 }}>Ei projekteja</div>}
      {data.projects.map(p => (
        <div key={p.id} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: "#d4d4d4" }}>{p.name}</div>
              {p.description && <div style={{ fontSize: 11, color: "#7a8a7a", marginTop: 2 }}>{p.description}</div>}
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: "#9ad4f5", textDecoration: "none", display: "block", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.url.replace(/^https?:\/\//, "").slice(0, 40)} →</a>}
            </div>
            <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
              <button className="btn-ghost" onClick={() => cycleStatus(p.id)} style={{ fontSize: 9, padding: "2px 6px", color: STATUS_COLORS[p.status], borderColor: STATUS_COLORS[p.status] + "40" }}>
                {STATUS_FI[p.status]}
              </button>
              {editMode && <button className="btn-ghost" onClick={() => removeProject(p.id)} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>}
            </div>
          </div>
        </div>
      ))}
      {editMode && !addingProject && (
        <button className="btn-ghost" onClick={() => setAddingProject(true)} style={{ fontSize: 9, width: "100%" }}>+ Lisää projekti</button>
      )}
      {editMode && addingProject && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6 }}>
          <input type="text" placeholder="Projektin nimi *" value={newProject.name} onChange={e => setNewProject(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
          <input type="text" placeholder="Kuvaus" value={newProject.description} onChange={e => setNewProject(p => ({ ...p, description: e.target.value }))} style={inputStyle} />
          <select value={newProject.status} onChange={e => setNewProject(p => ({ ...p, status: e.target.value }))} style={{ ...inputStyle }}>
            <option value="active">Aktiivinen</option>
            <option value="paused">Tauolla</option>
            <option value="done">Valmis</option>
          </select>
          <input type="url" placeholder="URL (valinnainen)" value={newProject.url} onChange={e => setNewProject(p => ({ ...p, url: e.target.value }))} style={inputStyle} />
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn" style={{ flex: 1 }} onClick={addProject}>+ Lisää</button>
            <button className="btn-ghost" onClick={() => setAddingProject(false)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Daily Routines ────────────────────────────────────────────────────────────

const RT_KEY = "routines";
const RT_DEFAULTS = {
  config: { waterGoal: 8, supplements: ["D-vitamiini", "Omega-3", "Magnesium"], habits: ["Liikunta", "Lukeminen", "Ulkoilu"] },
  days: {},
};

function DailyRoutinesWidget() {
  const [store, setStore] = useState(() => {
    try {
      const raw = localStorage.getItem(RT_KEY);
      const s = raw ? JSON.parse(raw) : { ...RT_DEFAULTS };
      if (!s.config) s.config = { ...RT_DEFAULTS.config };
      if (!s.days)   s.days   = {};
      return s;
    } catch { return { config: { ...RT_DEFAULTS.config }, days: {} }; }
  });
  useDataSync(RT_KEY, setStore);
  const [editMode, setEditMode] = useState(false);
  const [newSupp, setNewSupp]   = useState("");
  const [newHabit, setNewHabit] = useState("");
  const initDoneRef = useRef(false);
  useEffect(() => { dataService.ensureInit().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => { if (!initDoneRef.current) return; dataService.save(RT_KEY, store); }, [store]);

  const today    = fiStr();
  const todayRaw = store.days[today] || {};
  const water    = todayRaw.water || 0;
  const supps    = todayRaw.supplements || {};
  const habits   = todayRaw.habits || {};

  const patchToday = (fn) => setStore(s => {
    const d = s.days[today] || { water: 0, supplements: {}, habits: {} };
    return { ...s, days: { ...s.days, [today]: fn(d) } };
  });

  const addWater    = () => patchToday(d => ({ ...d, water: Math.min((d.water || 0) + 1, store.config.waterGoal) }));
  const removeWater = () => patchToday(d => ({ ...d, water: Math.max((d.water || 0) - 1, 0) }));
  const toggleSupp  = (n) => patchToday(d => ({ ...d, supplements: { ...(d.supplements || {}), [n]: !(d.supplements || {})[n] } }));
  const toggleHabit = (n) => patchToday(d => ({ ...d, habits: { ...(d.habits || {}), [n]: !(d.habits || {})[n] } }));

  const addSupp     = () => { if (!newSupp.trim()) return; setStore(s => ({ ...s, config: { ...s.config, supplements: [...s.config.supplements, newSupp.trim()] } })); setNewSupp(""); };
  const removeSupp  = (n) => setStore(s => ({ ...s, config: { ...s.config, supplements: s.config.supplements.filter(x => x !== n) } }));
  const addHabit    = () => { if (!newHabit.trim()) return; setStore(s => ({ ...s, config: { ...s.config, habits: [...s.config.habits, newHabit.trim()] } })); setNewHabit(""); };
  const removeHabit = (n) => setStore(s => ({ ...s, config: { ...s.config, habits: s.config.habits.filter(x => x !== n) } }));

  const streakDays = (habitName) => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return !!(store.days[fiStr(d)]?.habits?.[habitName]);
  });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Päivän rutiinit</div>
        <button className="btn-ghost" onClick={() => setEditMode(e => !e)} style={{ fontSize: 9 }}>
          {editMode ? "✓ Valmis" : "✎ Muokkaa"}
        </button>
      </div>

      {/* Water */}
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="label" style={{ color: "#9ad4f5", marginBottom: 8 }}>Vesi</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 3, flex: 1, flexWrap: "wrap" }}>
            {Array.from({ length: store.config.waterGoal }, (_, i) => (
              <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: i < water ? "#9ad4f5" : "rgba(154,212,245,0.1)", border: `1px solid ${i < water ? "#9ad4f5" : "rgba(154,212,245,0.2)"}`, transition: "background 0.15s" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button className="btn-ghost" onClick={removeWater} style={{ fontSize: 11, padding: "2px 7px" }}>−</button>
            <button className="btn-ghost" onClick={addWater} style={{ fontSize: 11, padding: "2px 8px", color: "#9ad4f5", borderColor: "rgba(154,212,245,0.3)" }}>+ lasi</button>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "#5a6a5a", marginTop: 5 }}>{water} / {store.config.waterGoal} lasia</div>
      </div>

      {/* Supplements */}
      <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="label" style={{ color: "#fbbf24", marginBottom: 6 }}>Lisäravinteet</div>
        {store.config.supplements.map(s => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <div onClick={() => toggleSupp(s)} style={{ width: 15, height: 15, borderRadius: 2, border: `1px solid ${supps[s] ? "#fbbf24" : "#3a4a3a"}`, background: supps[s] ? "rgba(251,191,36,0.2)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {supps[s] && <span style={{ fontSize: 9, color: "#fbbf24" }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: supps[s] ? "#c4c4c4" : "#6a7a6a", flex: 1, cursor: "pointer" }} onClick={() => toggleSupp(s)}>{s}</span>
            {editMode && <button className="btn-ghost" onClick={() => removeSupp(s)} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>}
          </div>
        ))}
        {editMode && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input type="text" value={newSupp} onChange={e => setNewSupp(e.target.value)} placeholder="Uusi lisäravinne" style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && addSupp()} />
            <button className="btn" onClick={addSupp}>+</button>
          </div>
        )}
      </div>

      {/* Habits */}
      <div>
        <div className="label" style={{ color: "#c4b5fd", marginBottom: 6 }}>Tavat</div>
        {store.config.habits.map(h => {
          const streak = streakDays(h);
          return (
            <div key={h} style={{ padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div onClick={() => toggleHabit(h)} style={{ width: 15, height: 15, borderRadius: 2, border: `1px solid ${habits[h] ? "#c4b5fd" : "#3a4a3a"}`, background: habits[h] ? "rgba(196,181,253,0.2)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {habits[h] && <span style={{ fontSize: 9, color: "#c4b5fd" }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: habits[h] ? "#c4c4c4" : "#6a7a6a", flex: 1, cursor: "pointer" }} onClick={() => toggleHabit(h)}>{h}</span>
                <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                  {streak.map((done, i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: done ? "#c4b5fd" : "rgba(196,181,253,0.12)" }} />
                  ))}
                </div>
                {editMode && <button className="btn-ghost" onClick={() => removeHabit(h)} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>}
              </div>
            </div>
          );
        })}
        {editMode && (
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            <input type="text" value={newHabit} onChange={e => setNewHabit(e.target.value)} placeholder="Uusi tapa" style={{ flex: 1 }} onKeyDown={e => e.key === "Enter" && addHabit()} />
            <button className="btn" onClick={addHabit}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Weekly Goals ──────────────────────────────────────────────────────────────

const WG_KEY = "weeklyGoals";

function getMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day));
  return fiStr(dt);
}

function WeeklyGoalsWidget() {
  const [store, setStore] = useState(() => {
    try {
      const raw    = localStorage.getItem(WG_KEY);
      const monday = getMonday();
      if (!raw) return { current: { weekStart: monday, goals: [] }, history: [] };
      const s = JSON.parse(raw);
      if (s.current.weekStart !== monday) {
        return {
          current: { weekStart: monday, goals: [] },
          history: [s.current, ...(s.history || [])].slice(0, 3),
        };
      }
      return s;
    } catch { return { current: { weekStart: getMonday(), goals: [] }, history: [] }; }
  });
  useDataSync(WG_KEY, setStore);
  const [editMode, setEditMode]       = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [newTitle, setNewTitle]       = useState("");
  const [newCat, setNewCat]           = useState("");
  const initDoneRef = useRef(false);
  useEffect(() => { dataService.ensureInit().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => { if (!initDoneRef.current) return; dataService.save(WG_KEY, store); }, [store]);

  const goals = store.current.goals;
  const done  = goals.filter(g => g.done).length;
  const pct   = goals.length > 0 ? Math.round((done / goals.length) * 100) : 0;

  const toggleGoal = (id) => setStore(s => ({ ...s, current: { ...s.current, goals: s.current.goals.map(g => g.id === id ? { ...g, done: !g.done } : g) } }));
  const removeGoal = (id) => setStore(s => ({ ...s, current: { ...s.current, goals: s.current.goals.filter(g => g.id !== id) } }));
  const addGoal    = () => {
    if (!newTitle.trim() || goals.length >= 5) return;
    setStore(s => ({ ...s, current: { ...s.current, goals: [...s.current.goals, { id: Date.now(), title: newTitle.trim(), category: newCat.trim(), done: false }] } }));
    setNewTitle(""); setNewCat("");
  };

  // Add a weekly goal as a task in the TodoWidget
  const [recentlyAdded, setRecentlyAdded] = useState({});
  const addGoalAsTask = (goal) => {
    try {
      const raw = localStorage.getItem(TODO_KEY);
      const s   = raw ? JSON.parse(raw) : { tasks: [] };
      const newTask = {
        id:       Date.now(),
        title:    goal.title,
        dueTime:  null,
        dueDate:  fiStr(),
        category: goal.category || "",
        done:     false,
        order:    (s.tasks || []).length,
      };
      const updated = { ...s, tasks: [...(s.tasks || []), newTask] };
      dataService.save(TODO_KEY, updated);
      window.dispatchEvent(new CustomEvent('dashboard:sync', { detail: { key: TODO_KEY } }));
      setRecentlyAdded(m => ({ ...m, [goal.id]: true }));
      setTimeout(() => setRecentlyAdded(m => { const n = { ...m }; delete n[goal.id]; return n; }), 2500);
    } catch {}
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Viikon tavoitteet</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn-ghost" onClick={() => { setShowHistory(h => !h); setEditMode(false); }} style={{ fontSize: 9 }}>
            {showHistory ? "← Viikko" : "Historia"}
          </button>
          {!showHistory && (
            <button className="btn-ghost" onClick={() => setEditMode(e => !e)} style={{ fontSize: 9 }}>
              {editMode ? "✓ Valmis" : "✎ Muokkaa"}
            </button>
          )}
        </div>
      </div>

      {showHistory ? (
        <div>
          {store.history.length === 0 && (
            <div style={{ fontSize: 11, color: "#5a6a5a", textAlign: "center", padding: "12px 0" }}>Ei historiatietoja</div>
          )}
          {store.history.map((week, wi) => {
            const wDone = week.goals.filter(g => g.done).length;
            const wPct  = week.goals.length > 0 ? Math.round(wDone / week.goals.length * 100) : 0;
            return (
              <div key={wi} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 10, color: "#7a8a7a" }}>Viikko {week.weekStart}</span>
                  <span style={{ fontSize: 10, color: "#6ee7b7" }}>{wDone}/{week.goals.length} · {wPct}%</span>
                </div>
                {week.goals.map(g => (
                  <div key={g.id} style={{ fontSize: 11, color: g.done ? "#5a6a5a" : "#9a9a9a", textDecoration: g.done ? "line-through" : "none", padding: "2px 0" }}>
                    {g.done ? "✓ " : "· "}{g.title}
                    {g.category && <span style={{ fontSize: 9, color: "#4a5a4a", marginLeft: 6 }}>[{g.category}]</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div>
          {goals.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 10, color: "#5a6a5a" }}>{done}/{goals.length} tavoitetta</span>
                <span style={{ fontSize: 10, color: pct >= 80 ? "#6ee7b7" : "#9a9a9a" }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                <div style={{ width: `${pct}%`, height: "100%", background: "#6ee7b7", borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>
          )}
          {goals.length === 0 && !editMode && (
            <div style={{ fontSize: 11, color: "#5a6a5a", textAlign: "center", padding: "12px 0" }}>Ei tavoitteita tällä viikolla</div>
          )}
          {goals.map(g => (
            <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div onClick={() => toggleGoal(g.id)} style={{ width: 15, height: 15, borderRadius: 2, border: `1px solid ${g.done ? "#6ee7b7" : "#3a4a3a"}`, background: g.done ? "rgba(110,231,183,0.2)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {g.done && <span style={{ fontSize: 9, color: "#6ee7b7" }}>✓</span>}
              </div>
              <span style={{ fontSize: 12, color: g.done ? "#5a6a5a" : "#d4d4d4", textDecoration: g.done ? "line-through" : "none", flex: 1, cursor: "pointer" }} onClick={() => toggleGoal(g.id)}>
                {g.title}
              </span>
              {g.category && <span style={{ fontSize: 9, color: "#4a5a4a", flexShrink: 0 }}>[{g.category}]</span>}
              {!editMode && !g.done && (
                <button
                  className="btn-ghost"
                  onClick={() => addGoalAsTask(g)}
                  style={{
                    fontSize: 8, padding: "1px 6px", flexShrink: 0,
                    color:       recentlyAdded[g.id] ? "#6ee7b7" : "#5a6a5a",
                    borderColor: recentlyAdded[g.id] ? "rgba(110,231,183,0.35)" : "rgba(255,255,255,0.08)",
                    transition: "all 0.3s",
                  }}
                  title="Lisää tehtävälistaan"
                >
                  {recentlyAdded[g.id] ? "✓ Lisätty" : "→ Tehtäväksi"}
                </button>
              )}
              {editMode && <button className="btn-ghost" onClick={() => removeGoal(g.id)} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>}
            </div>
          ))}
          {editMode && goals.length < 5 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
              <input type="text" placeholder="Tavoite (max 5)" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ width: "100%" }} onKeyDown={e => e.key === "Enter" && addGoal()} />
              <input type="text" placeholder="Kategoria (valinnainen)" value={newCat} onChange={e => setNewCat(e.target.value)} style={{ width: "100%" }} />
              <button className="btn" style={{ width: "100%" }} onClick={addGoal}>+ Lisää tavoite</button>
            </div>
          )}
          {editMode && goals.length >= 5 && (
            <div style={{ fontSize: 10, color: "#5a6a5a", marginTop: 6, textAlign: "center" }}>Max 5 tavoitetta / viikko</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Levi Billing Widget ───────────────────────────────────────────────────────

const LEVI_KEY      = "leviData";
const BILLING_MONTHS = [11, 12, 1, 2, 3, 4];
const LEVI_DEFAULTS  = { tenants: [], billingLog: {}, seasonOverride: false };

function LeviWidget({ now }) {
  const [data, setData] = useState(() => {
    try { return { ...LEVI_DEFAULTS, ...JSON.parse(localStorage.getItem(LEVI_KEY)) }; } catch { return { ...LEVI_DEFAULTS }; }
  });
  const [maintenance, setMaintenance] = useState(() => {
    try { return JSON.parse(localStorage.getItem("maintenance")) || MOCK_MAINTENANCE; } catch { return MOCK_MAINTENANCE; }
  });
  useDataSync(LEVI_KEY, setData);
  useDataSync("maintenance", setMaintenance);
  const [editMode, setEditMode]         = useState(false);
  const [showHistory, setShowHistory]   = useState(false);
  const [addingTenant, setAddingTenant] = useState(false);
  const [newTenant, setNewTenant]       = useState({ name: "", rent: "", billingDay: "1", notes: "" });
  const [newTask, setNewTask]           = useState("");

  const initDoneRef = useRef(false);
  useEffect(() => { dataService.ensureInit().finally(() => { initDoneRef.current = true; }); }, []);

  useEffect(() => { if (!initDoneRef.current) return; dataService.save(LEVI_KEY, data); }, [data]);
  useEffect(() => { if (!initDoneRef.current) return; dataService.save("maintenance", maintenance); }, [maintenance]);

  const month    = now.getMonth() + 1;
  const year     = now.getFullYear();
  const mKey     = `${year}-${String(month).padStart(2, "0")}`;
  const todayDay = now.getDate();

  const isSeasonMonth  = BILLING_MONTHS.includes(month);
  const isActiveSeason = isSeasonMonth || data.seasonOverride;

  const nextSeasonStr = (() => {
    if (isSeasonMonth) return null;
    const ny = month < 11 ? year : year + 1;
    return `${ny}/11`;
  })();

  const getBillingStatus = (t) => {
    if (data.billingLog[t.id]?.[mKey]) return { label: "Laskutettu",   color: "#6ee7b7" };
    const diff = t.billingDay - todayDay;
    if (diff < 0)  return { label: "Myöhässä",     color: "#f87171" };
    if (diff <= 3) return { label: "Laskuta pian", color: "#fbbf24" };
    return             { label: "Tulossa",      color: "#4a5a4a" };
  };

  const markBilled = (id) => {
    const d = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
    setData(prev => ({
      ...prev,
      billingLog: { ...prev.billingLog, [id]: { ...(prev.billingLog[id] || {}), [mKey]: d } },
    }));
  };

  const addTenant = () => {
    if (!newTenant.name.trim() || !newTenant.rent) return;
    const t = {
      id: Date.now(),
      name:       newTenant.name.trim(),
      rent:       parseFloat(newTenant.rent),
      billingDay: parseInt(newTenant.billingDay, 10) || 1,
      notes:      newTenant.notes.trim(),
    };
    setData(d => ({ ...d, tenants: [...d.tenants, t] }));
    setNewTenant({ name: "", rent: "", billingDay: "1", notes: "" });
    setAddingTenant(false);
  };
  const removeTenant = (id) => setData(d => ({ ...d, tenants: d.tenants.filter(t => t.id !== id) }));

  const toggleMaintenance     = (id) => setMaintenance(m => m.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const addMaintenanceTask    = ()   => {
    if (!newTask.trim()) return;
    setMaintenance(m => [...m, { id: Date.now(), task: newTask.trim(), done: false }]);
    setNewTask("");
  };
  const removeMaintenance = (id) => setMaintenance(m => m.filter(i => i.id !== id));

  const seasonTotal = data.tenants.reduce((sum, t) =>
    sum + Object.values(data.billingLog[t.id] || {}).filter(Boolean).length * t.rent, 0);

  const last6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(year, month - 1 - (5 - i), 1);
    return {
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: String(d.getMonth() + 1).padStart(2, "0"),
    };
  });

  const inStyle = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 2, color: "#e8e8e8", padding: "5px 8px", fontFamily: "inherit", fontSize: 11, outline: "none" };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Levi — Vuokraus</div>
        <div style={{ display: "flex", gap: 4 }}>
          {!isSeasonMonth && (
            <button className="btn-ghost" onClick={() => setData(d => ({ ...d, seasonOverride: !d.seasonOverride }))}
              style={{ fontSize: 9, color: isActiveSeason ? "#9a9a9a" : "#fbbf24", borderColor: isActiveSeason ? "rgba(255,255,255,0.1)" : "rgba(251,191,36,0.3)" }}>
              {isActiveSeason ? "Kesätauko" : "Aktivoi kausi"}
            </button>
          )}
          <button className="btn-ghost" onClick={() => { setShowHistory(h => !h); }} style={{ fontSize: 9 }}>
            {showHistory ? "← Takaisin" : "Historia"}
          </button>
          <button className="btn-ghost" onClick={() => { setEditMode(e => !e); setAddingTenant(false); }} style={{ fontSize: 9 }}>
            {editMode ? "✓ Valmis" : "✎ Muokkaa"}
          </button>
        </div>
      </div>

      {/* Off-season state */}
      {!isActiveSeason ? (
        <div style={{ opacity: 0.65 }}>
          <div style={{ fontSize: 12, color: "#6a7a6a" }}>Kesätauko — ei laskutusta</div>
          <div style={{ fontSize: 11, color: "#4a5a4a", marginTop: 4 }}>Kausi alkaa {nextSeasonStr}</div>
          {data.tenants.length > 0 && (
            <div style={{ fontSize: 10, color: "#3a4a3a", marginTop: 6 }}>{data.tenants.length} vuokralaista rekisterissä</div>
          )}
        </div>

      ) : showHistory ? (
        /* Billing history */
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Laskutushistoria (6 kk)</div>
          {data.tenants.length === 0 && <div style={{ fontSize: 11, color: "#5a6a5a" }}>Ei vuokralaisia</div>}
          {data.tenants.map(t => (
            <div key={t.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 11, color: "#c4c4c4", marginBottom: 4 }}>{t.name}</div>
              <div style={{ display: "flex", gap: 4 }}>
                {last6.map(({ key, label }) => {
                  const billed = data.billingLog[t.id]?.[key];
                  return (
                    <div key={key} style={{ textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: 8, color: "#4a5a4a" }}>{label}</div>
                      <div style={{ fontSize: 9, marginTop: 2, color: billed ? "#6ee7b7" : "#3a4a3a" }}>
                        {billed ? billed.slice(8) : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

      ) : (
        /* Active season — tenant billing */
        <div>
          {data.tenants.length === 0 && !editMode && (
            <div style={{ fontSize: 11, color: "#5a6a5a", marginBottom: 8 }}>Lisää vuokralaisia muokkaustilassa</div>
          )}
          {data.tenants.map(t => {
            const bs     = getBillingStatus(t);
            const billed = !!data.billingLog[t.id]?.[mKey];
            return (
              <div key={t.id} style={{ padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, color: "#d4d4d4" }}>{t.name}</span>
                      <span style={{ fontSize: 9, color: bs.color, border: `1px solid ${bs.color}40`, padding: "1px 5px", borderRadius: 1 }}>{bs.label}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#5a6a5a", marginTop: 2 }}>
                      {t.rent.toLocaleString("fi-FI")} €/kk · pv {t.billingDay}
                      {t.notes && <span style={{ marginLeft: 5, color: "#4a5a4a", fontStyle: "italic" }}>{t.notes}</span>}
                    </div>
                  </div>
                  {editMode ? (
                    <button className="btn-ghost" onClick={() => removeTenant(t.id)} style={{ fontSize: 9, padding: "1px 5px", flexShrink: 0 }}>✕</button>
                  ) : !billed ? (
                    <button className="btn-ghost" onClick={() => markBilled(t.id)}
                      style={{ fontSize: 9, padding: "2px 7px", color: "#6ee7b7", borderColor: "rgba(110,231,183,0.3)", flexShrink: 0, whiteSpace: "nowrap" }}>
                      ✓ Laskutettu
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}

          {editMode && !addingTenant && (
            <button className="btn-ghost" onClick={() => setAddingTenant(true)} style={{ fontSize: 9, width: "100%", marginTop: 6 }}>
              + Lisää vuokralainen
            </button>
          )}
          {editMode && addingTenant && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 6, padding: "8px", background: "rgba(110,231,183,0.04)", borderRadius: 2, border: "1px solid rgba(110,231,183,0.1)" }}>
              <input type="text" placeholder="Nimi *" value={newTenant.name} onChange={e => setNewTenant(p => ({ ...p, name: e.target.value }))} style={{ ...inStyle, width: "100%" }} />
              <div style={{ display: "flex", gap: 5 }}>
                <input type="number" placeholder="€/kk" value={newTenant.rent} onChange={e => setNewTenant(p => ({ ...p, rent: e.target.value }))} style={{ ...inStyle, flex: 1 }} min="0" />
                <input type="number" placeholder="Pv" value={newTenant.billingDay} onChange={e => setNewTenant(p => ({ ...p, billingDay: e.target.value }))} style={{ ...inStyle, width: 56 }} min="1" max="28" />
              </div>
              <input type="text" placeholder="Muistiinpanot (valinnainen)" value={newTenant.notes} onChange={e => setNewTenant(p => ({ ...p, notes: e.target.value }))} style={{ ...inStyle, width: "100%" }} />
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn" style={{ flex: 1, fontSize: 10 }} onClick={addTenant}>+ Lisää</button>
                <button className="btn-ghost" onClick={() => setAddingTenant(false)}>✕</button>
              </div>
            </div>
          )}

          {data.tenants.length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", fontSize: 10 }}>
              <span style={{ color: "#5a6a5a" }}>Kausi laskutettu yhteensä</span>
              <span style={{ color: "#6ee7b7" }}>{seasonTotal.toLocaleString("fi-FI")} €</span>
            </div>
          )}
        </div>
      )}

      {/* ── Huoltolista ─────────────────────────────── */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="label">Huoltolista</div>
        {maintenance.map(m => (
          <div key={m.id} className="check-row" onClick={() => !editMode && toggleMaintenance(m.id)}
            style={{ color: m.done ? "#3a4a3a" : "#c4c4c4", textDecoration: m.done ? "line-through" : "none" }}>
            <div className="check-box" style={{ borderColor: m.done ? "#2a3a2a" : "#4a6a4a", background: m.done ? "#2a3a2a" : "transparent" }}>
              {m.done && <span style={{ fontSize: 9, color: "#6ee7b7" }}>✓</span>}
            </div>
            <span style={{ flex: 1 }}>{m.task}</span>
            {editMode && (
              <button className="btn-ghost" onClick={e => { e.stopPropagation(); removeMaintenance(m.id); }} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>
            )}
          </div>
        ))}
        {editMode && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input type="text" value={newTask} onChange={e => setNewTask(e.target.value)}
              placeholder="Uusi tehtävä..." style={{ flex: 1 }}
              onKeyDown={e => { if (e.key === "Enter") addMaintenanceTask(); }} />
            <button className="btn" onClick={addMaintenanceTask}>+</button>
          </div>
        )}
      </div>
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

// ── Google Calendar Settings Card ────────────────────────────────────────────
function GoogleCalendarSettingsCard({ auth, settings, status, error, gcConnect, gcDisconnect, gcToggleCalendar, gcRefresh }) {
  const isConnected = !!(auth && gcService.isTokenValid(auth));
  const calendars   = settings.calendars || [];
  const busy        = status === 'connecting' || status === 'fetching';

  const dotColor = status === 'ready'      ? '#6ee7b7'
                 : busy                    ? '#fbbf24'
                 : status === 'error' || status === 'auth_needed' ? '#f87171'
                 :                           '#3a4a3a';

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Google Kalenteri</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, animation: busy ? "pulse 1s ease-in-out infinite" : "none" }} />
          {isConnected && !busy && (
            <button className="btn-ghost" onClick={gcRefresh} style={{ fontSize: 9, padding: "1px 7px" }}>↻ Päivitä</button>
          )}
        </div>
      </div>

      {!isConnected ? (
        <div>
          <div style={{ fontSize: 11, color: "#5a6a5a", marginBottom: 10, lineHeight: 1.6 }}>
            {status === 'auth_needed' ? 'Kirjautuminen vanhentunut — yhdistä uudelleen.'
           : status === 'error'       ? `Virhe: ${error}`
           : status === 'connecting'  ? 'Yhdistetään...'
           : 'Yhdistä Google-kalenteri nähdäksesi tapahtumat aikajanalla ja viikkosuunnitelmassa.'}
          </div>
          <button
            className="btn"
            onClick={gcConnect}
            disabled={busy}
            style={{ width: "100%", opacity: busy ? 0.6 : 1, cursor: busy ? "default" : "pointer" }}
          >
            {busy ? '…' : '+ Yhdistä Google'}
          </button>
        </div>
      ) : (
        <div>
          {status === 'fetching' && (
            <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 8 }}>Haetaan tapahtumia...</div>
          )}
          {calendars.length === 0 ? (
            <div style={{ fontSize: 11, color: "#4a5a4a", marginBottom: 8 }}>Ei kalentereita löydetty.</div>
          ) : (
            <div style={{ marginBottom: 10 }}>
              {calendars.map(cal => (
                <div
                  key={cal.id}
                  onClick={() => gcToggleCalendar(cal.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}
                >
                  <div style={{
                    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                    background: cal.enabled ? (cal.color || '#4285f4') : "rgba(255,255,255,0.1)",
                    border: `1px solid ${cal.enabled ? (cal.color || '#4285f4') + '66' : 'rgba(255,255,255,0.08)'}`,
                    transition: "background 0.2s",
                  }} />
                  <span style={{ flex: 1, fontSize: 12, color: cal.enabled ? "#c4c4c4" : "#4a5a4a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.2s" }}>
                    {cal.name}
                    {cal.primary && <span style={{ fontSize: 8, color: "#4a5a4a", marginLeft: 5 }}>(pää)</span>}
                  </span>
                  <div style={{
                    width: 26, height: 14, borderRadius: 7, flexShrink: 0, position: "relative",
                    background: cal.enabled ? `${(cal.color || '#4285f4')}44` : "rgba(255,255,255,0.06)",
                    border: `1px solid ${cal.enabled ? (cal.color || '#4285f4') + '55' : 'rgba(255,255,255,0.1)'}`,
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      position: "absolute", top: 2, left: cal.enabled ? 14 : 2,
                      width: 8, height: 8, borderRadius: "50%",
                      background: cal.enabled ? (cal.color || '#4285f4') : "#3a4a3a",
                      transition: "left 0.2s, background 0.2s",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            className="btn-ghost"
            onClick={gcDisconnect}
            style={{ width: "100%", fontSize: 9, color: "#f87171", borderColor: "rgba(248,113,113,0.2)" }}
            onMouseOver={e => { e.currentTarget.style.background = "rgba(248,113,113,0.06)"; }}
            onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
          >
            Kirjaudu ulos Google
          </button>
        </div>
      )}
    </div>
  );
}

function MorningDashboard({ onLogout }) {
  const [now, setNow]           = useState(new Date());
  const weatherState            = useWeather();
  const electricityState        = useElectricity();
  const [weekPlan, setWeekPlan] = useState(() => {
    try { return JSON.parse(localStorage.getItem("weekPlan")) || INITIAL_WEEK; } catch { return INITIAL_WEEK; }
  });
  const [recurringEvents, setRecurringEvents] = useState(() => {
    try { return JSON.parse(localStorage.getItem("recurringEvents")) || INITIAL_WEEK; } catch { return INITIAL_WEEK; }
  });
  useDataSync("weekPlan", setWeekPlan);
  useDataSync("recurringEvents", setRecurringEvents);
  const { auth: gcAuth, settings: gcSettings, gcEvents, status: gcStatus, error: gcError,
          gcConnect, gcDisconnect, gcToggleCalendar, gcRefresh } = useGoogleCalendar();

  const [dataReady, setDataReady]             = useState(false);
  const [showReview, setShowReview]           = useState(false);
  const [editMode, setEditMode]               = useState(false);
  const [editDay, setEditDay]                 = useState(null);
  const [newEventTime, setNewEventTime]       = useState("");
  const [newEventTitle, setNewEventTitle]     = useState("");
  const [newEventRecurring, setNewEventRecurring] = useState(false);

  // Skip the very first save so that a fresh session (empty localStorage)
  // cannot overwrite real Supabase data with INITIAL_WEEK during the ~800 ms
  // window before dataService.init() finishes loading.
  const initDoneRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    dataService.ensureInit().finally(() => {
      initDoneRef.current = true;
      setDataReady(true);
    });
  }, []);

  useEffect(() => {
    return dataService.subscribeRealtime();
  }, []);

  useEffect(() => {
    if (!initDoneRef.current) return;
    dataService.save("weekPlan", weekPlan);
  }, [weekPlan]);

  useEffect(() => {
    if (!initDoneRef.current) return;
    dataService.save("recurringEvents", recurringEvents);
  }, [recurringEvents]);

  const dayIndex  = (now.getDay() + 6) % 7;
  const todayName = DAYS[dayIndex];

  // Monday-anchored date strings for the current week, used to look up GCal events in the weekly planner
  const weekDateStrs = (() => {
    const mon = new Date(now);
    const dow = mon.getDay() || 7;
    mon.setDate(mon.getDate() - (dow - 1));
    mon.setHours(0, 0, 0, 0);
    return DAYS.map((_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
    });
  })();

  const addEvent = (day) => {
    if (!newEventTime || !newEventTitle) return;
    const ev = { time: newEventTime, title: newEventTitle };
    if (newEventRecurring) {
      setRecurringEvents(prev => ({
        ...prev,
        [day]: [...(prev[day] || []), ev].sort((a, b) => a.time.localeCompare(b.time)),
      }));
    } else {
      setWeekPlan(prev => ({
        ...prev,
        [day]: [...(prev[day] || []), ev].sort((a, b) => a.time.localeCompare(b.time)),
      }));
    }
    setNewEventTime(""); setNewEventTitle(""); setNewEventRecurring(false);
  };

  const removeEvent = (day, idx, isRecurring = false) => {
    if (isRecurring) {
      setRecurringEvents(prev => ({ ...prev, [day]: (prev[day] || []).filter((_, i) => i !== idx) }));
    } else {
      setWeekPlan(prev => ({ ...prev, [day]: (prev[day] || []).filter((_, i) => i !== idx) }));
    }
  };

  const dateStr = now.toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });
  const isReviewDay = now.getDay() === 0 || now.getDay() === 1;

  if (!dataReady) return (
    <div style={{ minHeight: "100vh", background: "#0d1117", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
      <div style={{ fontSize: 10, color: "#3a4a3a", letterSpacing: "0.18em", textTransform: "uppercase" }}>Ladataan...</div>
    </div>
  );

  return (
    <>
    {showReview && <WeeklyReviewOverlay onClose={() => setShowReview(false)} now={now} gcEvents={gcEvents} />}
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
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* Header */}
      <div style={{ padding: "28px 32px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: "#f0f0f0" }}>
            Hyvää huomenta
          </div>
          <div style={{ fontSize: 12, color: "#5a6a5a", marginTop: 4, textTransform: "capitalize" }}>{dateStr}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, fontWeight: 400, color: "#6ee7b7", letterSpacing: "-0.03em" }}>{timeStr}</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => setShowReview(true)}
              style={{
                background: isReviewDay ? "rgba(110,231,183,0.08)" : "transparent",
                border: `1px solid ${isReviewDay ? "rgba(110,231,183,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: isReviewDay ? "#6ee7b7" : "#6a7a6a",
                padding: "5px 12px", borderRadius: 2, fontFamily: "inherit",
                fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                animation: isReviewDay ? "pulse 2s ease-in-out infinite" : "none",
              }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#6ee7b7"; e.currentTarget.style.color = "#6ee7b7"; e.currentTarget.style.animation = "none"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = isReviewDay ? "rgba(110,231,183,0.4)" : "rgba(255,255,255,0.1)"; e.currentTarget.style.color = isReviewDay ? "#6ee7b7" : "#6a7a6a"; e.currentTarget.style.animation = isReviewDay ? "pulse 2s ease-in-out infinite" : "none"; }}
            >
              Viikkokatsaus
            </button>
            <button className="btn-ghost" onClick={onLogout} style={{ fontSize: 9, letterSpacing: "0.1em" }}>
              kirjaudu ulos
            </button>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ padding: "12px 32px 0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#3a4a3a", marginRight: 4 }}>Pikakuvakkeet</span>
        <a href="https://mail.google.com" target="_blank" rel="noopener noreferrer"
          title="Gmail"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(234,67,53,0.08)", border: "1px solid rgba(234,67,53,0.2)", borderRadius: 2, textDecoration: "none", color: "#ea4335", fontSize: 11, letterSpacing: "0.05em", transition: "background 0.2s" }}
          onMouseOver={e => e.currentTarget.style.background = "rgba(234,67,53,0.16)"}
          onMouseOut={e => e.currentTarget.style.background = "rgba(234,67,53,0.08)"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6z" fill="rgba(234,67,53,0.15)" stroke="#ea4335" strokeWidth="1.5"/>
            <path d="M2 6l10 7 10-7" stroke="#ea4335" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Gmail
        </a>
        <a href="https://outlook.cloud.microsoft/mail/" target="_blank" rel="noopener noreferrer"
          title="Outlook"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(0,120,212,0.08)", border: "1px solid rgba(0,120,212,0.2)", borderRadius: 2, textDecoration: "none", color: "#60a5fa", fontSize: 11, letterSpacing: "0.05em", transition: "background 0.2s" }}
          onMouseOver={e => e.currentTarget.style.background = "rgba(0,120,212,0.16)"}
          onMouseOut={e => e.currentTarget.style.background = "rgba(0,120,212,0.08)"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="1.5" fill="rgba(0,120,212,0.12)" stroke="#60a5fa" strokeWidth="1.5"/>
            <path d="M8 4v16" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.4"/>
            <path d="M2 9h6M2 14h6M10 9h12M10 14h12" stroke="#60a5fa" strokeWidth="1" strokeOpacity="0.3"/>
          </svg>
          Outlook
        </a>
        <a href="https://dashboard.hostaway.com" target="_blank" rel="noopener noreferrer"
          title="Hostaway"
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "rgba(0,178,169,0.08)", border: "1px solid rgba(0,178,169,0.2)", borderRadius: 2, textDecoration: "none", color: "#2dd4bf", fontSize: 11, letterSpacing: "0.05em", transition: "background 0.2s" }}
          onMouseOver={e => e.currentTarget.style.background = "rgba(0,178,169,0.16)"}
          onMouseOut={e => e.currentTarget.style.background = "rgba(0,178,169,0.08)"}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" fill="rgba(0,178,169,0.15)" stroke="#2dd4bf" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 22V13h6v9" stroke="#2dd4bf" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          Hostaway
        </a>
      </div>

      {/* Main grid */}
      <div style={{ padding: "24px 32px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>

        {/* TODAY */}
        <TodayWidget
          weatherState={weatherState}
          electricityState={electricityState}
          weekPlan={weekPlan}
          setWeekPlan={setWeekPlan}
          recurringEvents={recurringEvents}
          setRecurringEvents={setRecurringEvents}
          todayName={todayName}
          now={now}
          gcEvents={gcEvents}
        />

        {/* ELECTRICITY */}
        <ElectricityCard {...electricityState} />

        {/* WEATHER */}
        <WeatherCard {...weatherState} />

        {/* LEVI BILLING */}
        <LeviWidget now={now} />

        {/* STUDIES & PROJECTS */}
        <StudiesProjectsCard />

        {/* TIME TRACKER */}
        <TimeTrackerWidget />

        {/* DAILY ROUTINES */}
        <DailyRoutinesWidget />

        {/* WEEKLY GOALS */}
        <WeeklyGoalsWidget />

        {/* TO-DO LIST */}
        <TodoWidget />

        {/* IDEAS & CREATIVITY */}
        <IdeasWidget />

        {/* GOOGLE CALENDAR SETTINGS */}
        <GoogleCalendarSettingsCard
          auth={gcAuth}
          settings={gcSettings}
          status={gcStatus}
          error={gcError}
          gcConnect={gcConnect}
          gcDisconnect={gcDisconnect}
          gcToggleCalendar={gcToggleCalendar}
          gcRefresh={gcRefresh}
        />

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
              const isToday   = i === dayIndex;
              const allEvents = [
                ...(weekPlan[day]        || []).map((e, idx) => ({ ...e, _idx: idx, _recurring: false })),
                ...(recurringEvents[day] || []).map((e, idx) => ({ ...e, _idx: idx, _recurring: true  })),
              ].sort((a, b) => a.time.localeCompare(b.time));
              const gcDayEvents = (gcEvents[weekDateStrs[i]] || []).filter(e => e.time);
              return (
                <div className="day-col" key={day}>
                  <div className={`day-header${isToday ? " today" : ""}`}>
                    <span style={{ display: "block" }}>{DAYS_SHORT[i]}</span>
                  </div>
                  {allEvents.map((e, ei) => (
                    <div key={ei} className="mini-event" style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span className="t">{e.time}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
                      {e._recurring && <span style={{ fontSize: 8, color: "#4a5a4a" }}>🔁</span>}
                      {editMode && (
                        <button className="btn-ghost" style={{ padding: "1px 5px", fontSize: 9, marginLeft: 2 }}
                          onClick={() => removeEvent(day, e._idx, e._recurring)}>×</button>
                      )}
                    </div>
                  ))}
                  {gcDayEvents.map((ev, ei) => (
                    <div key={`gc-${ei}`} className="mini-event" title={ev.calendarName || ''} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: ev.calendarColor || '#4285f4', flexShrink: 0, marginRight: 2 }} />
                      <span style={{ fontSize: 11, color: ev.calendarColor || '#4285f4', minWidth: 28, flexShrink: 0 }}>{ev.time}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", color: "#6a7a8a" }}>{ev.title}</span>
                    </div>
                  ))}
                  {editMode && editDay === day && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                      <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)} style={{ width: "100%" }} />
                      <input type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
                        placeholder="Tapahtuma" style={{ width: "100%" }}
                        onKeyDown={e => { if (e.key === "Enter") { addEvent(day); setEditDay(null); } }} />
                      <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, color: "#7a8a7a", cursor: "pointer" }}>
                        <input type="checkbox" checked={newEventRecurring} onChange={e => setNewEventRecurring(e.target.checked)} style={{ accentColor: "#6ee7b7" }} />
                        🔁 Toistuva
                      </label>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="btn" style={{ flex: 1 }} onClick={() => { addEvent(day); setEditDay(null); }}>+</button>
                        <button className="btn-ghost" onClick={() => { setEditDay(null); setNewEventRecurring(false); }}>✕</button>
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
      <div style={{ padding: "0 32px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 10, color: "#2a3a2a", letterSpacing: "0.1em" }}>
        <span>MORNING DASHBOARD v0.4</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SyncDot onRefresh={() => window.location.reload()} />
          <span>SÄÄ: OPEN-METEO · SÄHKÖ: SPOT-HINTA.FI</span>
        </div>
      </div>
    </div>
    </>
  );
}