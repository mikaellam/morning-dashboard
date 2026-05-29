/**
 * googleCalendarService.js
 *
 * Handles Google Identity Services (GSI) OAuth token flow and
 * Google Calendar REST API calls for a single-user SPA dashboard.
 *
 * Uses the Token Client (implicit grant) — no server-side exchange needed.
 * Refresh tokens are not available in this flow; we store the access token
 * and its expiry, and silently re-request when it expires.
 */

import * as dataService from './dataService';

// ── Storage keys ──────────────────────────────────────────────────────────────

export const GC_AUTH_KEY     = 'googleCalendarAuth';
export const GC_SETTINGS_KEY = 'googleCalendarSettings';

// ── Constants ─────────────────────────────────────────────────────────────────

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const SCOPE     = 'https://www.googleapis.com/auth/calendar.readonly';
const CAL_API   = 'https://www.googleapis.com/calendar/v3';

// ── GSI script loading ────────────────────────────────────────────────────────

let _gsiPromise = null;

export function loadGSI() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (_gsiPromise) return _gsiPromise;

  _gsiPromise = new Promise((resolve, reject) => {
    // Script may already be in the DOM from a previous call
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      const t = setInterval(() => {
        if (window.google?.accounts?.oauth2) { clearInterval(t); resolve(); }
      }, 50);
      setTimeout(() => { clearInterval(t); reject(new Error('GSI timeout')); }, 15000);
      return;
    }
    const s = document.createElement('script');
    s.src   = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('GSI script failed to load'));
    document.head.appendChild(s);
  });

  return _gsiPromise;
}

// ── Token client ──────────────────────────────────────────────────────────────

let _tokenClient = null;
let _pendingResolve = null;
let _pendingReject  = null;

async function ensureTokenClient() {
  if (!CLIENT_ID) throw new Error('REACT_APP_GOOGLE_CLIENT_ID not set');
  await loadGSI();

  if (!_tokenClient) {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope:     SCOPE,
      callback: (response) => {
        if (!_pendingResolve) return; // no pending request
        const res = _pendingResolve;
        const rej = _pendingReject;
        _pendingResolve = null;
        _pendingReject  = null;
        if (response.error) {
          rej(new Error(response.error_description || response.error));
        } else {
          res({
            accessToken: response.access_token,
            expiresAt:   Date.now() + Math.max(0, (parseInt(response.expires_in, 10) - 60)) * 1000,
          });
        }
      },
      error_callback: (err) => {
        if (_pendingReject) {
          const rej = _pendingReject;
          _pendingResolve = null;
          _pendingReject  = null;
          rej(new Error(err?.message || 'Token request cancelled'));
        }
      },
    });
  }
  return _tokenClient;
}

/**
 * Request an access token.
 * @param {object} opts  Options forwarded to requestAccessToken().
 *   Use { prompt: 'consent' } for first-time connect.
 *   Use { prompt: '' }       for silent refresh (may fail if no session).
 */
export async function requestAccessToken(opts = {}) {
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingResolve = null;
      _pendingReject  = null;
      reject(new Error('Token request timed out'));
    }, 180_000); // 3 min max for user interaction

    _pendingResolve = (val) => { clearTimeout(timer); resolve(val); };
    _pendingReject  = (err) => { clearTimeout(timer); reject(err);  };
    client.requestAccessToken({ ...opts });
  });
}

// ── Auth storage ──────────────────────────────────────────────────────────────

export function loadAuth() {
  try {
    const raw = localStorage.getItem(GC_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveAuth(auth) {
  dataService.save(GC_AUTH_KEY, auth);
}

export function clearAuth() {
  localStorage.removeItem(GC_AUTH_KEY);
  dataService.save(GC_AUTH_KEY, null);
}

/** Returns true when the stored access token is still usable (> 30 s remaining). */
export function isTokenValid(auth) {
  return !!(auth?.accessToken && auth.expiresAt > Date.now() + 30_000);
}

// ── Calendar settings storage ─────────────────────────────────────────────────

export function loadSettings() {
  try {
    const raw = localStorage.getItem(GC_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { calendars: [] };
  } catch { return { calendars: [] }; }
}

export function saveSettings(settings) {
  dataService.save(GC_SETTINGS_KEY, settings);
}

// ── Google Calendar REST helpers ──────────────────────────────────────────────

async function gcFetch(path, accessToken) {
  const resp = await fetch(`${CAL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 401) {
    const e = new Error('Unauthorized — token expired or revoked');
    e.status = 401;
    throw e;
  }
  if (!resp.ok) {
    const e = new Error(`Google Calendar API error ${resp.status}`);
    e.status = resp.status;
    throw e;
  }
  return resp.json();
}

/**
 * Fetch all calendars for the authenticated user.
 * Returns an array of { id, name, color, primary }.
 */
export async function fetchCalendars(accessToken) {
  const data = await gcFetch('/users/me/calendarList?maxResults=50', accessToken);
  return (data.items || []).map(cal => ({
    id:      cal.id,
    name:    cal.summary || cal.id,
    color:   cal.backgroundColor || '#4285f4',
    primary: !!cal.primary,
  }));
}

// ── Event parsing ─────────────────────────────────────────────────────────────

function toHelsinkiTime(isoStr) {
  try {
    return new Date(isoStr).toLocaleTimeString('fi-FI', {
      timeZone: 'Europe/Helsinki',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return null; }
}

function toHelsinkiDate(isoStr) {
  try {
    return new Date(isoStr).toLocaleDateString('sv-SE', { timeZone: 'Europe/Helsinki' });
  } catch { return null; }
}

function parseRawEvent(raw, calendar) {
  const allDay = !!raw.start?.date;
  let dateStr = null, time = null, endTime = null;

  if (allDay) {
    dateStr = raw.start.date; // already "YYYY-MM-DD"
  } else {
    const sd = raw.start?.dateTime;
    const ed = raw.end?.dateTime;
    if (sd) { dateStr = toHelsinkiDate(sd); time = toHelsinkiTime(sd); }
    if (ed)   endTime = toHelsinkiTime(ed);
  }

  return {
    id:            raw.id,
    title:         raw.summary || '(Ei otsikkoa)',
    time,          // "HH:MM" or null for all-day
    endTime,       // "HH:MM" or null
    dateStr,       // "YYYY-MM-DD"
    allDay,
    calendarId:    calendar.id,
    calendarName:  calendar.name,
    calendarColor: calendar.color,
    source:        'google',
  };
}

/**
 * Fetch events for one calendar within [timeMin, timeMax].
 */
export async function fetchEventsForCalendar(accessToken, calendarId, timeMin, timeMax) {
  const p = new URLSearchParams({
    timeMin:      timeMin.toISOString(),
    timeMax:      timeMax.toISOString(),
    singleEvents: 'true',
    orderBy:      'startTime',
    maxResults:   '100',
  });
  const data = await gcFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events?${p}`,
    accessToken
  );
  return data.items || [];
}

/**
 * Fetch events for all enabled calendars for the next `daysAhead` days
 * (starting from today in Helsinki time).
 *
 * Returns a map: { "YYYY-MM-DD": [event, ...], ... }
 */
export async function fetchAllEvents(accessToken, calendars, daysAhead = 8) {
  const now          = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const timeMin      = startOfToday;
  const timeMax      = new Date(startOfToday.getTime() + daysAhead * 86_400_000);

  const byDate = {};

  await Promise.allSettled(
    calendars.map(async (cal) => {
      try {
        const raws = await fetchEventsForCalendar(accessToken, cal.id, timeMin, timeMax);
        for (const raw of raws) {
          const ev = parseRawEvent(raw, cal);
          if (!ev.dateStr) continue;
          (byDate[ev.dateStr] ??= []).push(ev);
        }
      } catch (err) {
        // 404 = calendar deleted, 410 = gone — skip silently
        if (err.status !== 404 && err.status !== 410) {
          console.warn('[GCal] calendar fetch error', cal.id, err.message);
        }
        if (err.status === 401) throw err; // propagate auth errors
      }
    })
  );

  // Sort within each day: timed first (by time), all-day last
  for (const events of Object.values(byDate)) {
    events.sort((a, b) => {
      if (!a.time && !b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time.localeCompare(b.time);
    });
  }

  return byDate;
}

/** Revoke the token so Google no longer trusts this session. */
export function revokeToken(accessToken) {
  try {
    window.google?.accounts?.oauth2?.revoke(accessToken, () => {});
  } catch {}
}
