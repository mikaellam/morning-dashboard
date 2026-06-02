import { createClient } from '@supabase/supabase-js';

// ── Supabase client ───────────────────────────────────────────────────────────

const supabase =
  process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY
    ? createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
      )
    : null;

// ── Shared user identity (single-user dashboard) ──────────────────────────────

const USER_ID = 'c2bf189d-7047-499d-9db8-2947e4afc0bc';

// Keys that must never sync to Supabase (device-specific state)
const NO_SYNC = new Set(['dashboard_auth']);

// ── Debug info (read by SyncDot) ──────────────────────────────────────────────

export const debugInfo = {
  userId:           USER_ID,
  supabaseUrl:      process.env.REACT_APP_SUPABASE_URL || '(not set)',
  lastReadAt:       null,
  keysLoaded:       null,
  keysMigrated:     null,
  lastError:        null,
  realtimeStatus:   'off',    // 'off' | 'connecting' | 'connected' | 'error'
  lastRemoteUpdate: null,
};

// ── Sync status ───────────────────────────────────────────────────────────────

let _status = 'synced';
const _listeners = new Set();

export function getSyncStatus() { return _status; }

export function onSyncStatusChange(cb) {
  _listeners.add(cb);
  cb(_status);
  return () => _listeners.delete(cb);
}

function setStatus(s) {
  if (_status === s) return;
  _status = s;
  _listeners.forEach(cb => cb(s));
}

// ── Echo suppression ──────────────────────────────────────────────────────────
// After we flush a key to Supabase, record the timestamp so the real-time
// echo of our own write can be ignored (5 s grace window).

const _ownSaveTs = new Map(); // key → ms timestamp

// ── Debounced write queue ─────────────────────────────────────────────────────

const _timers = {};
let _inFlight = 0;

async function flushOne(key, value) {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_data')
    .upsert(
      { user_id: USER_ID, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );
  if (error) throw error;
  _ownSaveTs.set(key, Date.now()); // mark as our own so realtime echo is filtered
}

function scheduleSave(key, value) {
  if (_timers[key]) { clearTimeout(_timers[key]); _inFlight--; }
  _inFlight++;
  setStatus('syncing');
  _timers[key] = setTimeout(async () => {
    delete _timers[key];
    try {
      await flushOne(key, value);
    } catch (err) {
      const msg = err.message || String(err);
      console.warn('[dataService] save failed:', key, msg);
      debugInfo.lastError = 'Save ' + key + ': ' + msg;
      setStatus('error');
      _inFlight--;
      return;
    }
    _inFlight--;
    if (_inFlight === 0 && _status !== 'error') setStatus('synced');
  }, 800);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Synchronous read from localStorage. */
export function load(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/** Write to localStorage immediately; async-sync to Supabase with 800 ms debounce. */
export function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  if (supabase && !NO_SYNC.has(key)) scheduleSave(key, value);
}

/**
 * Write immediately to localStorage and Supabase with no debounce.
 * Cancels any pending debounced save for this key.
 * Re-throws on Supabase error so callers can react to a failed write.
 */
export async function flush(key, value) {
  if (_timers[key]) { clearTimeout(_timers[key]); delete _timers[key]; _inFlight--; }
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  if (!supabase || NO_SYNC.has(key)) return;
  setStatus('syncing');
  _inFlight++;
  try {
    await flushOne(key, value);
  } catch (err) {
    const msg = err.message || String(err);
    console.warn('[dataService] flush failed:', key, msg);
    debugInfo.lastError = 'Flush ' + key + ': ' + msg;
    setStatus('error');
    _inFlight--;
    throw err;
  }
  _inFlight--;
  if (_inFlight === 0 && _status !== 'error') setStatus('synced');
}

/** Remove from localStorage and Supabase. */
export async function remove(key) {
  localStorage.removeItem(key);
  if (!supabase) return;
  await supabase.from('user_data').delete().eq('user_id', USER_ID).eq('key', key);
}

/**
 * Fetch all rows for this user from Supabase and write them into localStorage,
 * then migrate any local-only keys up to Supabase.
 * Always resolves — never throws — so the app loads even when offline.
 */
export async function init() {
  if (!supabase) {
    const msg = 'Supabase not configured (env vars missing)';
    console.warn('[dataService]', msg);
    debugInfo.lastError = msg;
    setStatus('error');
    return;
  }

  setStatus('syncing');
  debugInfo.lastError = null;

  try {
    const { data, error } = await supabase
      .from('user_data')
      .select('key, value')
      .eq('user_id', USER_ID);

    if (error) throw error;

    const remoteKeys = new Set();
    for (const row of data ?? []) {
      remoteKeys.add(row.key);
      try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch {}
    }

    debugInfo.keysLoaded = remoteKeys.size;
    debugInfo.lastReadAt = new Date().toISOString();

    // Notify all useDataSync listeners so React state updates from the
    // freshly-loaded Supabase values.  Without this, components keep
    // whatever was in localStorage at mount time (potentially stale or
    // empty) until the next realtime push.
    for (const key of remoteKeys) {
      window.dispatchEvent(new CustomEvent('dashboard:sync', { detail: { key } }));
    }

    // Migrate local-only keys
    const toMigrate = [];
    for (const lsKey of Object.keys(localStorage)) {
      if (NO_SYNC.has(lsKey) || remoteKeys.has(lsKey)) continue;
      const raw = localStorage.getItem(lsKey);
      if (!raw) continue;
      try {
        toMigrate.push({
          user_id: USER_ID,
          key: lsKey,
          value: JSON.parse(raw),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    debugInfo.keysMigrated = toMigrate.length;

    if (toMigrate.length > 0) {
      const { error: migErr } = await supabase
        .from('user_data')
        .upsert(toMigrate, { onConflict: 'user_id,key' });
      if (migErr) {
        console.warn('[dataService] migration partial failure:', migErr.message);
        debugInfo.lastError = 'Migration: ' + migErr.message;
      }
    }

    setStatus('synced');
  } catch (err) {
    const msg = err.message || String(err);
    console.warn('[dataService] init failed — using localStorage:', msg);
    debugInfo.lastError = 'Init: ' + msg;
    setStatus('error');
  }
}

/**
 * Open a Supabase Realtime subscription for this user's rows.
 * When a remote device upserts a key, localStorage is updated and a
 * 'dashboard:sync' CustomEvent is dispatched so components can re-read.
 * Returns an unsubscribe cleanup function.
 *
 * Requires the table to be in the realtime publication — see supabase/schema.sql.
 */
export function subscribeRealtime() {
  if (!supabase) return () => {};

  debugInfo.realtimeStatus = 'connecting';

  const channel = supabase
    .channel(`ud:${USER_ID}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_data', filter: `user_id=eq.${USER_ID}` },
      (payload) => {
        if (payload.eventType === 'DELETE') return;
        const { key, value } = payload.new ?? {};
        if (!key) return;

        // Ignore echoes of our own writes (saved within the last 5 s)
        const ts = _ownSaveTs.get(key);
        if (ts && Date.now() - ts < 5000) return;

        // Propagate remote value into localStorage and notify React components
        try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
        debugInfo.lastRemoteUpdate = new Date().toISOString();
        window.dispatchEvent(new CustomEvent('dashboard:sync', { detail: { key } }));
        console.log('[dataService] realtime update:', key);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        debugInfo.realtimeStatus = 'connected';
        console.log('[dataService] realtime connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        debugInfo.realtimeStatus = 'error';
        console.warn('[dataService] realtime status:', status);
      }
    });

  return () => {
    debugInfo.realtimeStatus = 'off';
    supabase.removeChannel(channel);
  };
}
