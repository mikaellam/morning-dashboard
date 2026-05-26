import { useState, useEffect } from "react";
import * as dataService from './services/dataService';

// ── Constants ─────────────────────────────────────────────────────────────────

export const TODO_KEY = "todoList";

export const TODO_CATS = ["Työ", "Opiskelu", "Omat projektit", "Henkilökohtainen", "Levi"];

export const TODO_CAT_COLORS = {
  "Työ":              "#9ad4f5",
  "Opiskelu":         "#6ee7b7",
  "Omat projektit":   "#fbbf24",
  "Henkilökohtainen": "#c4b5fd",
  "Levi":             "#f97316",
};

const fiStr = (d = new Date()) =>
  d.toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });

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

const initTodos = () => ({ tasks: [] });

const loadTodos = () => {
  try {
    const raw = localStorage.getItem(TODO_KEY);
    return raw ? { ...initTodos(), ...JSON.parse(raw) } : initTodos();
  } catch { return initTodos(); }
};

// ── TodoWidget ────────────────────────────────────────────────────────────────

export default function TodoWidget({ onAddedTask }) {
  const [store, setStore]     = useState(loadTodos);
  const [newTitle, setNewTitle] = useState("");
  const [newTime, setNewTime]   = useState("");
  const [newCat, setNewCat]     = useState("");
  const [showDone, setShowDone] = useState(false);

  useDataSync(TODO_KEY, setStore);
  useEffect(() => { dataService.save(TODO_KEY, store); }, [store]);

  const today   = fiStr();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const tasks   = store.tasks || [];

  // ── Computed task groups ───────────────────────────────────────────────────
  const todayTasks   = tasks.filter(t => !t.dueDate || t.dueDate === today);
  const futureTasks  = tasks.filter(t => t.dueDate  && t.dueDate  > today);
  const activeTasks  = todayTasks.filter(t => !t.done);
  const doneTasks    = todayTasks.filter(t =>  t.done);

  const allCount  = todayTasks.length;
  const doneCount = doneTasks.length;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const isOverdue = (task) => {
    if (!task.dueTime || task.done) return false;
    const [h, m] = task.dueTime.split(":").map(Number);
    return (h * 60 + m) < nowMins && (!task.dueDate || task.dueDate === today);
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const addTask = () => {
    if (!newTitle.trim()) return;
    const task = {
      id: Date.now(),
      title:    newTitle.trim(),
      dueTime:  newTime  || null,
      dueDate:  today,
      category: newCat,
      done:     false,
      order:    tasks.length,
    };
    setStore(s => ({ ...s, tasks: [...(s.tasks || []), task] }));
    setNewTitle(""); setNewTime(""); setNewCat("");
    onAddedTask?.();
  };

  const toggleDone = (id) =>
    setStore(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t) }));

  const deleteTask = (id) =>
    setStore(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== id) }));

  const clearDone = () =>
    setStore(s => ({ ...s, tasks: s.tasks.filter(t => !t.done || !(!t.dueDate || t.dueDate === today)) }));

  const moveUp = (id) => setStore(s => {
    // Move within active-today tasks only; locate in the full array
    const activeToday = s.tasks.filter(t => !t.done && (!t.dueDate || t.dueDate === today));
    const posInActive = activeToday.findIndex(t => t.id === id);
    if (posInActive <= 0) return s;
    const swapWith = activeToday[posInActive - 1];
    const arr = [...s.tasks];
    const idxA = arr.findIndex(t => t.id === id);
    const idxB = arr.findIndex(t => t.id === swapWith.id);
    [arr[idxA], arr[idxB]] = [arr[idxB], arr[idxA]];
    return { ...s, tasks: arr };
  });

  const moveDown = (id) => setStore(s => {
    const activeToday = s.tasks.filter(t => !t.done && (!t.dueDate || t.dueDate === today));
    const posInActive = activeToday.findIndex(t => t.id === id);
    if (posInActive >= activeToday.length - 1) return s;
    const swapWith = activeToday[posInActive + 1];
    const arr = [...s.tasks];
    const idxA = arr.findIndex(t => t.id === id);
    const idxB = arr.findIndex(t => t.id === swapWith.id);
    [arr[idxA], arr[idxB]] = [arr[idxB], arr[idxA]];
    return { ...s, tasks: arr };
  });

  // ── Row renderer ──────────────────────────────────────────────────────────
  const renderTask = (task, showMoveButtons) => {
    const overdue   = isOverdue(task);
    const catColor  = TODO_CAT_COLORS[task.category] || "#5a6a5a";
    const titleColor = task.done   ? "#4a5a4a"
                     : overdue ? "#f87171"
                     :           "#c4c4c4";

    return (
      <div
        key={task.id}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 0",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          opacity: task.done ? 0.55 : 1,
        }}
      >
        {/* Checkbox */}
        <div
          onClick={() => toggleDone(task.id)}
          style={{
            width: 14, height: 14, borderRadius: 2, flexShrink: 0, cursor: "pointer",
            border: `1px solid ${task.done ? "#6ee7b7" : overdue ? "#f87171" : "#3a4a3a"}`,
            background: task.done ? "rgba(110,231,183,0.2)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {task.done && <span style={{ fontSize: 8, color: "#6ee7b7" }}>✓</span>}
        </div>

        {/* Due time */}
        {task.dueTime && (
          <span style={{
            fontSize: 9, minWidth: 32, flexShrink: 0,
            color: overdue ? "#f87171" : "#6ee7b7",
            fontVariantNumeric: "tabular-nums",
          }}>
            {task.dueTime}
          </span>
        )}

        {/* Title */}
        <span
          onClick={() => toggleDone(task.id)}
          style={{
            flex: 1, fontSize: 12, cursor: "pointer",
            color: titleColor,
            textDecoration: task.done ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {task.title}
        </span>

        {/* Category badge */}
        {task.category && (
          <span style={{
            fontSize: 8, color: catColor, flexShrink: 0,
            border: `1px solid ${catColor}40`, padding: "1px 4px", borderRadius: 1,
          }}>
            {task.category.split(" ")[0]}
          </span>
        )}

        {/* Reorder buttons (active tasks only) */}
        {showMoveButtons && !task.done && (
          <div style={{ display: "flex", gap: 1, flexShrink: 0 }}>
            <button
              className="btn-ghost"
              onClick={() => moveUp(task.id)}
              style={{ fontSize: 9, padding: "0 4px", lineHeight: "14px" }}
              title="Siirrä ylöspäin"
            >↑</button>
            <button
              className="btn-ghost"
              onClick={() => moveDown(task.id)}
              style={{ fontSize: 9, padding: "0 4px", lineHeight: "14px" }}
              title="Siirrä alaspäin"
            >↓</button>
          </div>
        )}

        {/* Delete */}
        <button
          className="btn-ghost"
          onClick={() => deleteTask(task.id)}
          style={{ fontSize: 9, padding: "1px 5px", flexShrink: 0 }}
        >✕</button>
      </div>
    );
  };

  // ── Progress bar color ─────────────────────────────────────────────────────
  const pct   = allCount > 0 ? Math.round((doneCount / allCount) * 100) : 0;
  const pctColor = pct >= 80 ? "#6ee7b7" : pct >= 40 ? "#fbbf24" : "#9a9a9a";

  const selectStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 2, color: "#e8e8e8", padding: "5px 6px",
    fontFamily: "inherit", fontSize: 11, outline: "none",
  };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="label" style={{ marginBottom: 0 }}>Tehtävälista</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {allCount > 0 && (
            <span style={{ fontSize: 10, color: pctColor, fontVariantNumeric: "tabular-nums" }}>
              {doneCount}/{allCount} tehty
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {allCount > 0 && (
        <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 12 }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pctColor, borderRadius: 2, transition: "width 0.4s" }} />
        </div>
      )}

      {/* Quick add */}
      <div style={{ display: "flex", gap: 5, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Uusi tehtävä... (Enter)"
          style={{ flex: "2 1 140px", minWidth: 0 }}
          onKeyDown={e => e.key === "Enter" && addTask()}
        />
        <input
          type="time"
          value={newTime}
          onChange={e => setNewTime(e.target.value)}
          style={{ flex: "0 0 84px" }}
        />
        <select
          value={newCat}
          onChange={e => setNewCat(e.target.value)}
          style={{ ...selectStyle, flex: "1 1 80px" }}
        >
          <option value="">Kategoria</option>
          {TODO_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn" onClick={addTask} style={{ padding: "6px 12px", flexShrink: 0 }}>+</button>
      </div>

      {/* Active tasks */}
      {activeTasks.length === 0 && doneTasks.length === 0 && futureTasks.length === 0 && (
        <div style={{ fontSize: 11, color: "#5a6a5a", textAlign: "center", padding: "14px 0" }}>
          Ei tehtäviä tänään — lisää yllä
        </div>
      )}
      {activeTasks.map(t => renderTask(t, true))}

      {/* Future tasks */}
      {futureTasks.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="label" style={{ marginBottom: 4 }}>Tulossa</div>
          {futureTasks.map(t => (
            <div key={t.id} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
              opacity: 0.4,
            }}>
              <div style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0, border: "1px solid #3a4a3a" }} />
              {t.dueDate && (
                <span style={{ fontSize: 9, color: "#5a6a5a", minWidth: 42, flexShrink: 0 }}>
                  {t.dueDate.slice(5)}
                </span>
              )}
              <span style={{ flex: 1, fontSize: 12, color: "#6a7a6a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              <button className="btn-ghost" onClick={() => deleteTask(t.id)} style={{ fontSize: 9, padding: "1px 5px" }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Done tasks */}
      {doneTasks.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <button
              className="btn-ghost"
              onClick={() => setShowDone(d => !d)}
              style={{ fontSize: 9, padding: "1px 7px" }}
            >
              {showDone ? "↑ Piilota tehdyt" : `↓ Tehdyt (${doneTasks.length})`}
            </button>
            {showDone && (
              <button
                className="btn-ghost"
                onClick={clearDone}
                style={{ fontSize: 9, padding: "1px 7px", color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
              >
                Tyhjennä tehdyt
              </button>
            )}
          </div>
          {showDone && doneTasks.map(t => renderTask(t, false))}
        </div>
      )}
    </div>
  );
}
