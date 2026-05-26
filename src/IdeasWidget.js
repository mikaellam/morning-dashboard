import { useState, useEffect } from "react";
import * as dataService from './services/dataService';

// ── Constants ─────────────────────────────────────────────────────────────────

export const IDEAS_KEY = "ideasCreativity";

export const IDEA_CATS = ["Projekti", "Oppiminen", "Levi", "Metsä", "Muu"];

export const IDEA_CAT_COLORS = {
  "Projekti":  "#fbbf24",
  "Oppiminen": "#6ee7b7",
  "Levi":      "#f97316",
  "Metsä":     "#4ade80",
  "Muu":       "#9ad4f5",
};

export const DAILY_QUESTIONS = [
  "Mitä voisit automatisoida tällä viikolla?",
  "Mikä projekti-idea on pyörinyt mielessä?",
  "Mitä opettelisit jos aikaa olisi loputtomasti?",
  "Miten metsädashboard-projekti voisi edetä seuraavaksi?",
  "Mikä Levi-prosessi voisi olla sujuvampi?",
  "Mitä uutta teknologiaa haluaisit kokeilla?",
  "Jos sinulla olisi yksi vapaa päivä vain projekteille, mitä tekisit?",
  "Mikä on tärkein asia jonka haluat oppia tänä vuonna?",
  "Miten voisit yhdistää metsä- ja geospatiaalisen osaamisesi tuotteeksi?",
  "Mikä pieni parannus tekisi arjestasi sujuvampaa?",
  "Mikä tehtävä tai prosessi tuntuu turhalta — voisiko sen poistaa tai automatisoida?",
  "Mikä idea on jäänyt toteutumatta liian pitkään?",
  "Mitä tekisit toisin jos aloittaisit nykyisen projektin alusta?",
  "Miten voisit ansaita lisätuloa osaamisellasi?",
  "Mikä on seuraava konkreettinen askel ML/AI-oppimispolullasi?",
  "Mitä kirjaa tai kurssia haluaisit aloittaa tällä hetkellä?",
  "Miten voisit parantaa dashboard-projektin käyttökokemusta?",
  "Mikä metsätalouden haaste olisi ratkaistavissa teknologialla?",
  "Mitä yhteistyötä tai verkostoitumista haluaisit tehdä?",
  "Mikä on yksi asia jonka voisit ulkoistaa tai delegoida?",
  "Miten voisit hyödyntää paikkatietoosaamistasi uudella tavalla?",
  "Mikä on unelmaprojektisi — mitä se tarvitsisi toteutuakseen?",
  "Mitä tietoja tai taitoja haluaisit kasvattaa ensi vuonna?",
  "Miten Levi-kohdetta voisi kehittää tai markkinoida paremmin?",
  "Mikä tekninen velka haittaa eniten nykyisissä projekteissasi?",
  "Mitä voisit opettaa tai jakaa muille osaamisestasi?",
  "Mikä on yksi asia jonka tekisit jos epäonnistuminen olisi mahdotonta?",
  "Miten voisit yhdistää luonnon ja teknologian luovalla tavalla?",
  "Mikä rutiini tai tapa haluaisit rakentaa seuraavalle kuukaudelle?",
  "Mitä haluaisit sanoa itsellesi vuoden päästä?",
  "Mikä oli viime viikon paras oivallus?",
  "Jos rahaa ei olisi este, mitä tekisit ensimmäisenä?",
];

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

const initIdeas = () => ({
  questionIndex: 0,
  questionDate:  "",
  answers:       [],
  ideas:         [],
  resurface:     { ideaId: null, date: "" },
});

const loadIdeas = () => {
  try {
    const raw = localStorage.getItem(IDEAS_KEY);
    return raw ? { ...initIdeas(), ...JSON.parse(raw) } : initIdeas();
  } catch { return initIdeas(); }
};

// ── IdeasWidget ───────────────────────────────────────────────────────────────

export default function IdeasWidget() {
  const [store, setStore]       = useState(loadIdeas);
  const [answerDraft, setAnswerDraft] = useState(() => loadIdeas().answerDraft || "");
  const [newIdea, setNewIdea]   = useState("");
  const [newIdeaCat, setNewIdeaCat] = useState("Muu");
  const [showAllIdeas, setShowAllIdeas] = useState(false);
  const [showHistory, setShowHistory]   = useState(false);

  useDataSync(IDEAS_KEY, setStore);
  useEffect(() => { dataService.save(IDEAS_KEY, store); }, [store]);

  const today = fiStr();

  // ── Advance question on a new day ─────────────────────────────────────────
  useEffect(() => {
    if (store.questionDate !== today) {
      setStore(s => {
        const ideas     = (s.ideas || []).filter(i => !i.archived);
        let resurface   = { ideaId: null, date: today };
        const oldIdeas  = ideas.filter(i => {
          const ageMs = new Date(today) - new Date(i.date);
          return ageMs > 14 * 86400000; // older than 14 days
        });
        if (oldIdeas.length > 0) {
          const picked = oldIdeas[Math.floor(Math.random() * oldIdeas.length)];
          resurface    = { ideaId: picked.id, date: today };
        }
        return {
          ...s,
          questionIndex: ((s.questionIndex || 0) + 1) % DAILY_QUESTIONS.length,
          questionDate:  today,
          resurface,
        };
      });
      setAnswerDraft("");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ─────────────────────────────────────────────────────────
  const questionIdx     = store.questionDate === today
    ? (store.questionIndex || 0)
    : ((store.questionIndex || 0) + 1) % DAILY_QUESTIONS.length;
  const currentQuestion = DAILY_QUESTIONS[questionIdx % DAILY_QUESTIONS.length];
  const todayAnswered   = (store.answers || []).some(a => a.date === today && a.questionIdx === questionIdx);
  const resurfaceIdea   = store.resurface?.ideaId
    ? (store.ideas || []).find(i => i.id === store.resurface.ideaId)
    : null;
  const activeIdeas  = (store.ideas || []).filter(i => !i.archived);
  const visibleIdeas = showAllIdeas ? activeIdeas : activeIdeas.slice(0, 5);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const skipQuestion = () => {
    setStore(s => ({
      ...s,
      questionIndex: (questionIdx + 1) % DAILY_QUESTIONS.length,
      questionDate:  today,
    }));
    setAnswerDraft("");
  };

  const saveAnswer = () => {
    if (!answerDraft.trim()) return;
    setStore(s => ({
      ...s,
      answers: [
        { questionIdx, question: currentQuestion, answer: answerDraft.trim(), date: today },
        ...(s.answers || []),
      ].slice(0, 60),
    }));
    setAnswerDraft("");
  };

  const addIdea = () => {
    if (!newIdea.trim()) return;
    setStore(s => ({
      ...s,
      ideas: [
        { id: Date.now(), text: newIdea.trim(), category: newIdeaCat, date: today, archived: false },
        ...(s.ideas || []),
      ],
    }));
    setNewIdea("");
  };

  const archiveIdea = (id) =>
    setStore(s => ({
      ...s,
      ideas: s.ideas.map(i => i.id === id ? { ...i, archived: true } : i),
      resurface: s.resurface?.ideaId === id ? { ...s.resurface, ideaId: null } : s.resurface,
    }));

  const revisitIdea = (id) =>
    setStore(s => ({
      ...s,
      ideas: s.ideas.map(i => i.id === id ? { ...i, revisited: true, revisitDate: today } : i),
    }));

  const dismissResurface = () =>
    setStore(s => ({ ...s, resurface: { ...s.resurface, ideaId: null } }));

  // ── Style helpers ─────────────────────────────────────────────────────────
  const selectStyle = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 2, color: "#e8e8e8", padding: "5px 6px",
    fontFamily: "inherit", fontSize: 11, outline: "none",
  };

  // ── Age helper ────────────────────────────────────────────────────────────
  const ageStr = (dateStr) => {
    const days = Math.round((new Date(today) - new Date(dateStr)) / 86400000);
    if (days === 0) return "tänään";
    if (days === 1) return "eilen";
    if (days < 7)  return `${days} pv sitten`;
    if (days < 30) return `${Math.round(days / 7)} vk sitten`;
    return `${Math.round(days / 30)} kk sitten`;
  };

  return (
    <div className="card">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="label" style={{ marginBottom: 0 }}>Ideat &amp; Luovuus</div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            className="btn-ghost"
            onClick={() => setShowHistory(h => !h)}
            style={{ fontSize: 9 }}
          >
            {showHistory ? "← Takaisin" : "Historia"}
          </button>
        </div>
      </div>

      {showHistory ? (
        /* ── Answer history ────────────────────────────────────────────────── */
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Aiemmat vastaukset</div>
          {(store.answers || []).length === 0 && (
            <div style={{ fontSize: 11, color: "#5a6a5a", padding: "8px 0" }}>Ei vastauksia vielä</div>
          )}
          {(store.answers || []).slice(0, 15).map((a, i) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ fontSize: 9, color: "#5a6a5a", marginBottom: 3 }}>{a.date}</div>
              <div style={{ fontSize: 10, color: "#9a9a9a", fontStyle: "italic", marginBottom: 4 }}>{a.question}</div>
              <div style={{ fontSize: 12, color: "#c4c4c4" }}>{a.answer}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ── Daily question ──────────────────────────────────────────────── */}
          <div style={{
            padding: "12px 14px",
            background: "rgba(251,191,36,0.04)",
            border: "1px solid rgba(251,191,36,0.14)",
            borderRadius: 2,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fbbf24", marginBottom: 7 }}>
              💡 Päivän kysymys
            </div>
            <div style={{ fontSize: 12, color: "#e8e8e8", lineHeight: 1.55, marginBottom: 10 }}>
              {currentQuestion}
            </div>

            {todayAnswered ? (
              <div style={{ fontSize: 10, color: "#5a6a5a", fontStyle: "italic" }}>✓ Vastattu tänään</div>
            ) : (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={answerDraft}
                  onChange={e => setAnswerDraft(e.target.value)}
                  placeholder="Kirjoita vastauksesi..."
                  style={{ flex: "1 1 120px" }}
                  onKeyDown={e => e.key === "Enter" && saveAnswer()}
                />
                <button className="btn" onClick={saveAnswer} style={{ padding: "6px 10px", fontSize: 10, flexShrink: 0 }}>
                  Tallenna
                </button>
                <button className="btn-ghost" onClick={skipQuestion} style={{ fontSize: 10, flexShrink: 0 }}>
                  Ohita
                </button>
              </div>
            )}
          </div>

          {/* ── Resurfaced old idea ─────────────────────────────────────────── */}
          {resurfaceIdea && (
            <div style={{
              padding: "9px 12px",
              background: "rgba(154,212,245,0.04)",
              border: "1px solid rgba(154,212,245,0.15)",
              borderRadius: 2,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 9, color: "#9ad4f5", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 5 }}>
                💫 Vanha idea — {ageStr(resurfaceIdea.date)}
              </div>
              <div style={{ fontSize: 12, color: "#c4c4c4", fontStyle: "italic", marginBottom: 6 }}>
                "{resurfaceIdea.text}"
              </div>
              <div style={{ fontSize: 10, color: "#5a6a5a", marginBottom: 7 }}>— mitä ajattelet nyt?</div>
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  className="btn-ghost"
                  onClick={() => revisitIdea(resurfaceIdea.id)}
                  style={{ fontSize: 9, color: "#9ad4f5", borderColor: "rgba(154,212,245,0.3)" }}
                >
                  🔄 Merkitse revisited
                </button>
                <button className="btn-ghost" onClick={dismissResurface} style={{ fontSize: 9 }}>Ohita</button>
              </div>
            </div>
          )}

          {/* ── Idea capture ────────────────────────────────────────────────── */}
          <div style={{ marginBottom: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Tallenna idea</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <input
                type="text"
                value={newIdea}
                onChange={e => setNewIdea(e.target.value)}
                placeholder="Kirjoita idea... (Enter)"
                style={{ flex: "2 1 130px" }}
                onKeyDown={e => e.key === "Enter" && addIdea()}
              />
              <select
                value={newIdeaCat}
                onChange={e => setNewIdeaCat(e.target.value)}
                style={{ ...selectStyle, flex: "1 1 80px" }}
              >
                {IDEA_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button className="btn" onClick={addIdea} style={{ padding: "6px 10px", flexShrink: 0 }}>+</button>
            </div>
          </div>

          {/* ── Ideas list ──────────────────────────────────────────────────── */}
          {activeIdeas.length === 0 && (
            <div style={{ fontSize: 11, color: "#5a6a5a", padding: "6px 0" }}>
              Ei ideoita vielä — kirjoita ensimmäinen!
            </div>
          )}
          {visibleIdeas.map(idea => {
            const catColor = IDEA_CAT_COLORS[idea.category] || "#5a6a5a";
            return (
              <div key={idea.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#c4c4c4", lineHeight: 1.4 }}>{idea.text}</div>
                  <div style={{ marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{
                      fontSize: 8, color: catColor,
                      border: `1px solid ${catColor}40`, padding: "1px 4px", borderRadius: 1,
                    }}>
                      {idea.category}
                    </span>
                    <span style={{ fontSize: 8, color: "#3a4a3a" }}>{ageStr(idea.date)}</span>
                    {idea.revisited && (
                      <span style={{ fontSize: 8, color: "#9ad4f5" }}>🔄 revisited</span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  <button
                    className="btn-ghost"
                    onClick={() => revisitIdea(idea.id)}
                    title="Merkitse revisited"
                    style={{ fontSize: 9, padding: "2px 6px", color: "#9ad4f5", borderColor: "rgba(154,212,245,0.2)" }}
                  >🔄</button>
                  <button
                    className="btn-ghost"
                    onClick={() => archiveIdea(idea.id)}
                    title="Arkistoi"
                    style={{ fontSize: 9, padding: "2px 6px" }}
                  >✓</button>
                </div>
              </div>
            );
          })}

          {activeIdeas.length > 5 && (
            <button
              className="btn-ghost"
              onClick={() => setShowAllIdeas(a => !a)}
              style={{ fontSize: 9, width: "100%", marginTop: 8 }}
            >
              {showAllIdeas ? "↑ Näytä vähemmän" : `↓ Kaikki ideat (${activeIdeas.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
