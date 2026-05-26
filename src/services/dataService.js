import { createClient } from '@supabase/supabase-js';

// ── Supabase client (null when env vars are absent) ───────────────────────────

const supabase =
  process.env.REACT_APP_SUPABASE_URL && process.env.REACT_APP_SUPABASE_ANON_KEY
    ? createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_ANON_KEY
      )
    : null;

// ── Device identity ───────────────────────────────────────────────────────────

const DEVICE_KEY = '_dashboard_uid';

function getUserId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Keys that must never sync to Supabase (device-specific state)
const NO_SYNC = new Set(['dashboard_auth', '_dashboard_uid']);

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

// ── Debounced write queue ─────────────────────────────────────────────────────

const _timers = {};
let _inFlight = 0;

async function flushOne(key, value) {
  if (!supabase) return;
  const uid = getUserId();
  const { error } = await supabase
    .from('user_data')
    .upsert(
      { user_id: uid, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    );
  if (error) throw error;
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
      console.warn('[dataService] save failed:', key, err.message);
      setStatus('error');
      _inFlight--;
      return;
    }
    _inFlight--;
    if (_inFlight === 0 && _status !== 'error') setStatus('synced');
  }, 800);
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Synchronous read from localStorage (after init() this reflects Supabase data). */
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

/** Remove from localStorage and Supabase. */
export async function remove(key) {
  localStorage.removeItem(key);
  if (!supabase) return;
  const uid = getUserId();
  await supabase.from('user_data').delete().eq('user_id', uid).eq('key', key);
}

/**
 * Initialize: fetch all rows for this device from Supabase and write them into
 * localStorage so that component useState initialisers pick up synced data.
 * Also migrates any existing localStorage keys that aren't yet in Supabase.
 * Always resolves (never throws) so the app loads even when offline.
 */
export async function init() {
  if (!supabase) {
    console.warn('[dataService] Supabase not configured — localStorage only');
    setStatus('error');
    return;
  }

  const uid = getUserId();
  setStatus('syncing');

  try {
    // 1. Fetch all rows for this user
    const { data, error } = await supabase
      .from('user_data')
      .select('key, value')
      .eq('user_id', uid);

    if (error) throw error;

    // 2. Write Supabase data into localStorage (remote wins on conflict)
    const remoteKeys = new Set();
    for (const row of data ?? []) {
      remoteKeys.add(row.key);
      try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch {}
    }

    // 3. Migrate local-only keys to Supabase (first-run migration)
    const toMigrate = [];
    for (const lsKey of Object.keys(localStorage)) {
      if (NO_SYNC.has(lsKey) || remoteKeys.has(lsKey)) continue;
      const raw = localStorage.getItem(lsKey);
      if (!raw) continue;
      try {
        toMigrate.push({
          user_id: uid,
          key: lsKey,
          value: JSON.parse(raw),
          updated_at: new Date().toISOString(),
        });
      } catch {}
    }

    if (toMigrate.length > 0) {
      const { error: migErr } = await supabase
        .from('user_data')
        .upsert(toMigrate, { onConflict: 'user_id,key' });
      if (migErr) console.warn('[dataService] migration partial failure:', migErr.message);
    }

    setStatus('synced');
  } catch (err) {
    console.warn('[dataService] init failed — using localStorage:', err.message);
    setStatus('error');
  }
}
