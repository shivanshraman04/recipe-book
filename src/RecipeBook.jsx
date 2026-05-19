import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabase.js";

// --- Storage helpers (Supabase) ---
async function loadRecipes() {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Load error:", error);
    return [];
  }
  return data.map(rowToRecipe);
}

async function saveRecipe(recipe) {
  const row = recipeToRow(recipe);
  const { error } = await supabase
    .from("recipes")
    .upsert(row, { onConflict: "id" });
  if (error) console.error("Save error:", error);
}

async function deleteRecipeFromDB(id) {
  const { error } = await supabase.from("recipes").delete().eq("id", id);
  if (error) console.error("Delete error:", error);
}

// Map between DB row (flat JSON columns) and app recipe object
function rowToRecipe(row) {
  return {
    id: row.id,
    name: row.name || "",
    createdAt: row.created_at || "",
    momMessages: row.mom_messages || [],
    callNotes: row.call_notes || [],
    ingredients: row.ingredients || [],
    method: row.method || "",
    experiments: row.experiments || [],
  };
}

function recipeToRow(recipe) {
  return {
    id: recipe.id,
    name: recipe.name,
    created_at: recipe.createdAt,
    mom_messages: recipe.momMessages,
    call_notes: recipe.callNotes,
    ingredients: recipe.ingredients,
    method: recipe.method,
    experiments: recipe.experiments,
  };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// --- Auth helpers ---
const EDIT_PASSWORD_KEY = "recipe-book-edit-auth";

function isEditAuthed() {
  return sessionStorage.getItem(EDIT_PASSWORD_KEY) === "true";
}

function setEditAuthed() {
  sessionStorage.setItem(EDIT_PASSWORD_KEY, "true");
}

// --- Fonts & Colors ---
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600&display=swap";

const COLORS = {
  bg: "#FDF6EE",
  card: "#FFFAF5",
  cardHover: "#FFF5EB",
  accent: "#C4704B",
  accentLight: "#E8A87C",
  accentFaint: "#F5DFD0",
  text: "#3D2C23",
  textMuted: "#8B7464",
  textLight: "#B09A8A",
  border: "#E8D9CB",
  borderLight: "#F0E4D8",
  white: "#FFFFFF",
  warmGray: "#F7EFE7",
  success: "#7BA05B",
  danger: "#C4574B",
};

function emptyRecipe() {
  return {
    id: genId(),
    name: "",
    createdAt: todayISO(),
    momMessages: [],
    callNotes: [],
    ingredients: [],
    method: "",
    experiments: [],
  };
}

function emptyIngredient() {
  return { id: genId(), amount: "", unit: "", item: "" };
}

// === MAIN APP ===
export default function RecipeBook() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("home");
  const [activeRecipeId, setActiveRecipeId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [authed, setAuthed] = useState(isEditAuthed());
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authInput, setAuthInput] = useState("");
  const [authError, setAuthError] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  useEffect(() => {
    loadRecipes().then((r) => {
      setRecipes(r);
      setLoading(false);
    });
  }, []);

  const activeRecipe = recipes.find((r) => r.id === activeRecipeId) || null;

  // Auth gate: check password against env var stored in Supabase RPC or just a simple check
  const EDIT_PASSWORD = import.meta.env.VITE_EDIT_PASSWORD || "letmecook";

  const tryAuth = () => {
    if (authInput === EDIT_PASSWORD) {
      setEditAuthed();
      setAuthed(true);
      setShowAuthPrompt(false);
      setAuthInput("");
      setAuthError(false);
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
    } else {
      setAuthError(true);
    }
  };

  const requireAuth = (action) => {
    if (authed) {
      action();
    } else {
      setPendingAction(() => action);
      setShowAuthPrompt(true);
    }
  };

  // Navigation
  const goHome = () => { setView("home"); setActiveRecipeId(null); setEditMode(false); setDraft(null); };
  const openRecipe = (id) => { setActiveRecipeId(id); setView("detail"); setEditMode(false); };
  const startNew = () => requireAuth(() => {
    const r = emptyRecipe();
    setDraft(r);
    setActiveRecipeId(r.id);
    setView("detail");
    setEditMode(true);
  });
  const startEdit = () => requireAuth(() => {
    setDraft(JSON.parse(JSON.stringify(activeRecipe)));
    setEditMode(true);
  });
  const cancelEdit = () => {
    if (!recipes.find((r) => r.id === draft?.id)) {
      goHome();
    } else {
      setEditMode(false);
      setDraft(null);
    }
  };
  const saveDraft = async () => {
    if (!draft || !draft.name.trim()) return;
    const exists = recipes.find((r) => r.id === draft.id);
    const updated = exists ? recipes.map((r) => (r.id === draft.id ? draft : r)) : [...recipes, draft];
    setRecipes(updated);
    await saveRecipe(draft);
    setEditMode(false);
    setDraft(null);
  };
  const doDelete = async (id) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
    await deleteRecipeFromDB(id);
    setDeleteConfirm(null);
    goHome();
  };

  // Search
  const filtered = recipes.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const hay = [
      r.name,
      ...r.momMessages.map((m) => m.text),
      ...r.callNotes.map((n) => n.text),
      ...r.ingredients.map((i) => i.item),
      r.method,
      ...r.experiments.map((e) => e.text),
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (loading) {
    return (
      <div style={styles.loadingWrap}>
        <link href={FONT_LINK} rel="stylesheet" />
        <p style={styles.loadingText}>Loading your recipes...</p>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <link href={FONT_LINK} rel="stylesheet" />

      {view === "home" && (
        <HomeView
          recipes={filtered}
          search={search}
          setSearch={setSearch}
          openRecipe={openRecipe}
          startNew={startNew}
          authed={authed}
        />
      )}

      {view === "detail" && editMode && draft && (
        <EditView draft={draft} setDraft={setDraft} onSave={saveDraft} onCancel={cancelEdit} />
      )}

      {view === "detail" && !editMode && activeRecipe && (
        <DetailView
          recipe={activeRecipe}
          onBack={goHome}
          onEdit={startEdit}
          onDelete={() => requireAuth(() => setDeleteConfirm(activeRecipe.id))}
          authed={authed}
        />
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <p style={{ fontFamily: "'Source Sans 3'", fontSize: 16, color: COLORS.text, margin: "0 0 20px" }}>
            Delete this recipe permanently?
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={styles.btnSecondary} onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button style={{ ...styles.btnPrimary, background: COLORS.danger }} onClick={() => doDelete(deleteConfirm)}>Delete</button>
          </div>
        </Modal>
      )}

      {showAuthPrompt && (
        <Modal onClose={() => { setShowAuthPrompt(false); setPendingAction(null); setAuthInput(""); setAuthError(false); }}>
          <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: COLORS.text, margin: "0 0 6px" }}>
            Edit mode
          </p>
          <p style={{ fontFamily: "'Source Sans 3'", fontSize: 14, color: COLORS.textMuted, margin: "0 0 16px" }}>
            Enter the password to add or edit recipes.
          </p>
          <input
            type="password"
            style={{ ...styles.searchInput, marginBottom: authError ? 6 : 16, borderColor: authError ? COLORS.danger : COLORS.border }}
            placeholder="Password"
            value={authInput}
            onChange={(e) => { setAuthInput(e.target.value); setAuthError(false); }}
            onKeyDown={(e) => e.key === "Enter" && tryAuth()}
            autoFocus
          />
          {authError && <p style={{ fontSize: 13, color: COLORS.danger, margin: "0 0 12px", fontFamily: "'Source Sans 3'" }}>Wrong password</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={styles.btnSecondary} onClick={() => { setShowAuthPrompt(false); setPendingAction(null); }}>Cancel</button>
            <button style={styles.btnPrimary} onClick={tryAuth}>Unlock</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// HOME VIEW
// ═══════════════════════════════════════
function HomeView({ recipes, search, setSearch, openRecipe, startNew, authed }) {
  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Mom's Recipes</h1>
      </header>

      <div style={styles.searchRow}>
        <div style={styles.searchWrap}>
          <svg style={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke={COLORS.textLight} strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            style={styles.searchInput}
            placeholder="Search recipes, ingredients, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button style={styles.searchClear} onClick={() => setSearch("")}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textLight} strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button style={styles.btnPrimary} onClick={startNew}>+ New</button>
      </div>

      {recipes.length === 0 && !search && (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📖</div>
          <p style={styles.emptyTitle}>Your cookbook is empty</p>
          <p style={styles.emptyText}>Add your first recipe to get started. Paste a WhatsApp message from mom, add your own measurements, and build your collection.</p>
          <button style={styles.btnPrimary} onClick={startNew}>Add first recipe</button>
        </div>
      )}

      {recipes.length === 0 && search && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>No recipes match "{search}"</p>
        </div>
      )}

      <div style={styles.grid}>
        {recipes.map((r) => (
          <RecipeCard key={r.id} recipe={r} onClick={() => openRecipe(r.id)} />
        ))}
      </div>
    </div>
  );
}

function RecipeCard({ recipe, onClick }) {
  const ingCount = recipe.ingredients.filter((i) => i.item.trim()).length;
  const expCount = recipe.experiments.length;
  const hasMom = recipe.momMessages.length > 0 || recipe.callNotes.length > 0;
  const hasMethod = recipe.method.trim().length > 0;

  return (
    <button style={styles.card} onClick={onClick} onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.cardHover; e.currentTarget.style.transform = "translateY(-2px)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = COLORS.card; e.currentTarget.style.transform = "translateY(0)"; }}>
      <h3 style={styles.cardTitle}>{recipe.name || "Untitled"}</h3>
      <div style={styles.cardMeta}>
        {hasMom && <span style={styles.cardTag}>Mom's notes</span>}
        {ingCount > 0 && <span style={styles.cardTag}>{ingCount} ingredients</span>}
        {hasMethod && <span style={styles.cardTag}>Method</span>}
        {expCount > 0 && <span style={styles.cardTag}>{expCount} experiment{expCount !== 1 ? "s" : ""}</span>}
      </div>
      <p style={styles.cardDate}>{formatDate(recipe.createdAt)}</p>
    </button>
  );
}

// ═══════════════════════════════════════
// DETAIL VIEW
// ═══════════════════════════════════════
function DetailView({ recipe, onBack, onEdit, onDelete, authed }) {
  return (
    <div style={styles.container}>
      <div style={styles.detailNav}>
        <button style={styles.backBtn} onClick={onBack}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          All recipes
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={styles.btnSecondary} onClick={onEdit}>Edit</button>
          <button style={{ ...styles.btnGhost, color: COLORS.danger }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      <h1 style={styles.detailTitle}>{recipe.name}</h1>
      <p style={styles.detailDate}>Added {formatDate(recipe.createdAt)}</p>

      {(recipe.momMessages.length > 0 || recipe.callNotes.length > 0) && (
        <Section title="Mom's Notes" emoji="💬">
          {recipe.momMessages.map((m, i) => (
            <div key={i} style={styles.momMsg}>
              <div style={styles.momMsgDate}>{formatDate(m.date) || "No date"} &middot; WhatsApp</div>
              <div style={styles.momMsgText}>{m.text}</div>
            </div>
          ))}
          {recipe.callNotes.map((n, i) => (
            <div key={i} style={styles.callNote}>
              <div style={styles.momMsgDate}>{formatDate(n.date) || "No date"} &middot; Call</div>
              <div style={styles.momMsgText}>{n.text}</div>
            </div>
          ))}
        </Section>
      )}

      {(recipe.ingredients.some((i) => i.item.trim()) || recipe.method.trim()) && (
        <Section title="Measured Version" emoji="⚖️">
          {recipe.ingredients.some((i) => i.item.trim()) && (
            <div style={styles.ingTable}>
              {recipe.ingredients.filter((i) => i.item.trim()).map((ing, i) => (
                <div key={i} style={styles.ingRow}>
                  <span style={styles.ingAmount}>{ing.amount}{ing.unit ? ` ${ing.unit}` : ""}</span>
                  <span style={styles.ingItem}>{ing.item}</span>
                </div>
              ))}
            </div>
          )}
          {recipe.method.trim() && (
            <>
              <h4 style={styles.subheading}>Method</h4>
              <div style={styles.methodText}>{recipe.method}</div>
            </>
          )}
        </Section>
      )}

      {recipe.experiments.length > 0 && (
        <Section title="Experiment Log" emoji="🧪">
          {recipe.experiments.map((exp, i) => (
            <div key={i} style={styles.expEntry}>
              <div style={styles.expDate}>{formatDate(exp.date)}</div>
              <div style={styles.expText}>{exp.text}</div>
            </div>
          ))}
        </Section>
      )}

      {recipe.momMessages.length === 0 && recipe.callNotes.length === 0 &&
       !recipe.ingredients.some((i) => i.item.trim()) && !recipe.method.trim() &&
       recipe.experiments.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptyText}>This recipe is empty. Tap Edit to start adding content.</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, emoji, children }) {
  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>{emoji} {title}</h2>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════
// EDIT VIEW
// ═══════════════════════════════════════
function EditView({ draft, setDraft, onSave, onCancel }) {
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const addMomMsg = () => update({ momMessages: [...draft.momMessages, { date: todayISO(), text: "" }] });
  const updateMomMsg = (i, patch) => {
    const msgs = [...draft.momMessages];
    msgs[i] = { ...msgs[i], ...patch };
    update({ momMessages: msgs });
  };
  const removeMomMsg = (i) => update({ momMessages: draft.momMessages.filter((_, j) => j !== i) });

  const addCallNote = () => update({ callNotes: [...draft.callNotes, { date: todayISO(), text: "" }] });
  const updateCallNote = (i, patch) => {
    const notes = [...draft.callNotes];
    notes[i] = { ...notes[i], ...patch };
    update({ callNotes: notes });
  };
  const removeCallNote = (i) => update({ callNotes: draft.callNotes.filter((_, j) => j !== i) });

  const addIngredient = () => update({ ingredients: [...draft.ingredients, emptyIngredient()] });
  const updateIngredient = (i, patch) => {
    const ings = [...draft.ingredients];
    ings[i] = { ...ings[i], ...patch };
    update({ ingredients: ings });
  };
  const removeIngredient = (i) => update({ ingredients: draft.ingredients.filter((_, j) => j !== i) });

  const addExperiment = () => update({ experiments: [{ date: todayISO(), text: "" }, ...draft.experiments] });
  const updateExperiment = (i, patch) => {
    const exps = [...draft.experiments];
    exps[i] = { ...exps[i], ...patch };
    update({ experiments: exps });
  };
  const removeExperiment = (i) => update({ experiments: draft.experiments.filter((_, j) => j !== i) });

  return (
    <div style={styles.container}>
      <div style={styles.detailNav}>
        <button style={styles.backBtn} onClick={onCancel}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
          Cancel
        </button>
        <button style={{ ...styles.btnPrimary, opacity: draft.name.trim() ? 1 : 0.5 }} onClick={onSave} disabled={!draft.name.trim()}>
          Save
        </button>
      </div>

      <input
        style={styles.nameInput}
        placeholder="Recipe name"
        value={draft.name}
        onChange={(e) => update({ name: e.target.value })}
        autoFocus
      />

      <EditSection title="Mom's WhatsApp Messages" emoji="📱" onAdd={addMomMsg} addLabel="+ Paste message">
        {draft.momMessages.map((m, i) => (
          <div key={i} style={styles.editCard}>
            <div style={styles.editCardHeader}>
              <input type="date" style={styles.dateInput} value={m.date} onChange={(e) => updateMomMsg(i, { date: e.target.value })} />
              <button style={styles.removeBtn} onClick={() => removeMomMsg(i)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textLight} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea
              style={styles.textarea}
              placeholder="Paste mom's WhatsApp message here..."
              value={m.text}
              onChange={(e) => updateMomMsg(i, { text: e.target.value })}
              rows={4}
            />
          </div>
        ))}
      </EditSection>

      <EditSection title="Call Notes" emoji="📞" onAdd={addCallNote} addLabel="+ Add call note">
        {draft.callNotes.map((n, i) => (
          <div key={i} style={styles.editCard}>
            <div style={styles.editCardHeader}>
              <input type="date" style={styles.dateInput} value={n.date} onChange={(e) => updateCallNote(i, { date: e.target.value })} />
              <button style={styles.removeBtn} onClick={() => removeCallNote(i)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textLight} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea
              style={styles.textarea}
              placeholder='What she said on the call...'
              value={n.text}
              onChange={(e) => updateCallNote(i, { text: e.target.value })}
              rows={3}
            />
          </div>
        ))}
      </EditSection>

      <EditSection title="Ingredients" emoji="⚖️" onAdd={addIngredient} addLabel="+ Add ingredient">
        {draft.ingredients.map((ing, i) => (
          <div key={ing.id} style={styles.ingEditRow}>
            <input style={{ ...styles.ingEditInput, width: 60 }} placeholder="Amt" value={ing.amount} onChange={(e) => updateIngredient(i, { amount: e.target.value })} />
            <select style={{ ...styles.ingEditInput, width: 80, appearance: "auto" }} value={ing.unit} onChange={(e) => updateIngredient(i, { unit: e.target.value })}>
              <option value="">--</option>
              <option value="tsp">tsp</option>
              <option value="tbsp">tbsp</option>
              <option value="cup">cup</option>
              <option value="ml">ml</option>
              <option value="l">l</option>
              <option value="g">g</option>
              <option value="kg">kg</option>
              <option value="oz">oz</option>
              <option value="lb">lb</option>
              <option value="pinch">pinch</option>
              <option value="whole">whole</option>
              <option value="handful">handful</option>
              <option value="to taste">to taste</option>
            </select>
            <input style={{ ...styles.ingEditInput, flex: 1 }} placeholder="Ingredient" value={ing.item} onChange={(e) => updateIngredient(i, { item: e.target.value })} />
            <button style={styles.removeBtn} onClick={() => removeIngredient(i)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textLight} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
      </EditSection>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📝 Method</h2>
        <textarea
          style={{ ...styles.textarea, minHeight: 120 }}
          placeholder="Write your method here... step by step, in your own words"
          value={draft.method}
          onChange={(e) => update({ method: e.target.value })}
        />
      </div>

      <EditSection title="Experiment Log" emoji="🧪" onAdd={addExperiment} addLabel="+ Log experiment">
        {draft.experiments.map((exp, i) => (
          <div key={i} style={styles.editCard}>
            <div style={styles.editCardHeader}>
              <input type="date" style={styles.dateInput} value={exp.date} onChange={(e) => updateExperiment(i, { date: e.target.value })} />
              <button style={styles.removeBtn} onClick={() => removeExperiment(i)}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={COLORS.textLight} strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea
              style={styles.textarea}
              placeholder="What you tried, what happened..."
              value={exp.text}
              onChange={(e) => updateExperiment(i, { text: e.target.value })}
              rows={2}
            />
          </div>
        ))}
      </EditSection>

      <div style={{ padding: "20px 0 40px", display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button style={styles.btnSecondary} onClick={onCancel}>Cancel</button>
        <button style={{ ...styles.btnPrimary, opacity: draft.name.trim() ? 1 : 0.5 }} onClick={onSave} disabled={!draft.name.trim()}>Save recipe</button>
      </div>
    </div>
  );
}

function EditSection({ title, emoji, children, onAdd, addLabel }) {
  return (
    <div style={styles.section}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={styles.sectionTitle}>{emoji} {title}</h2>
        <button style={styles.addBtn} onClick={onAdd}>{addLabel}</button>
      </div>
      {children}
    </div>
  );
}

function Modal({ onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const styles = {
  app: {
    background: COLORS.bg,
    minHeight: "100vh",
    fontFamily: "'Source Sans 3', sans-serif",
    color: COLORS.text,
  },
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "24px 20px",
  },
  loadingWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: COLORS.bg,
  },
  loadingText: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    color: COLORS.textMuted,
  },
  header: {
    textAlign: "center",
    marginBottom: 32,
    paddingTop: 16,
  },
  title: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 36,
    fontWeight: 700,
    color: COLORS.text,
    margin: 0,
    letterSpacing: "-0.5px",
  },
  subtitle: {
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: 15,
    color: COLORS.textMuted,
    margin: "6px 0 0",
    fontWeight: 300,
    letterSpacing: "0.5px",
  },
  searchRow: {
    display: "flex",
    gap: 10,
    marginBottom: 28,
    alignItems: "center",
  },
  searchWrap: {
    flex: 1,
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: "50%",
    transform: "translateY(-50%)",
    width: 18,
    height: 18,
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 36px 10px 38px",
    border: `1px solid ${COLORS.border}`,
    borderRadius: 10,
    fontSize: 15,
    fontFamily: "'Source Sans 3', sans-serif",
    background: COLORS.white,
    color: COLORS.text,
    outline: "none",
  },
  searchClear: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 2,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 14,
  },
  card: {
    background: COLORS.card,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: "18px 16px",
    textAlign: "left",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: "'Source Sans 3', sans-serif",
    width: "100%",
    boxSizing: "border-box",
  },
  cardTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 18,
    fontWeight: 600,
    margin: 0,
    color: COLORS.text,
    lineHeight: 1.3,
  },
  cardMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: 5,
  },
  cardTag: {
    fontSize: 11,
    fontWeight: 500,
    background: COLORS.accentFaint,
    color: COLORS.accent,
    padding: "2px 8px",
    borderRadius: 20,
    letterSpacing: "0.2px",
  },
  cardDate: {
    fontSize: 12,
    color: COLORS.textLight,
    margin: 0,
    marginTop: "auto",
  },
  emptyState: {
    textAlign: "center",
    padding: "48px 20px",
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 22,
    color: COLORS.text,
    margin: "0 0 8px",
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textMuted,
    margin: "0 0 20px",
    lineHeight: 1.5,
    maxWidth: 400,
    marginLeft: "auto",
    marginRight: "auto",
  },
  detailNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "none",
    border: "none",
    fontSize: 14,
    fontFamily: "'Source Sans 3', sans-serif",
    fontWeight: 500,
    color: COLORS.accent,
    cursor: "pointer",
    padding: 0,
  },
  detailTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 32,
    fontWeight: 700,
    margin: "0 0 4px",
    color: COLORS.text,
    lineHeight: 1.2,
  },
  detailDate: {
    fontSize: 13,
    color: COLORS.textLight,
    margin: "0 0 28px",
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontFamily: "'Playfair Display', serif",
    fontSize: 20,
    fontWeight: 600,
    color: COLORS.text,
    margin: "0 0 14px",
  },
  subheading: {
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: "1px",
    margin: "18px 0 8px",
  },
  momMsg: {
    background: COLORS.warmGray,
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 10,
    borderLeft: `3px solid ${COLORS.accentLight}`,
  },
  callNote: {
    background: COLORS.warmGray,
    borderRadius: 10,
    padding: "12px 16px",
    marginBottom: 10,
    borderLeft: `3px solid ${COLORS.success}`,
  },
  momMsgDate: {
    fontSize: 12,
    color: COLORS.textLight,
    marginBottom: 6,
    fontWeight: 500,
  },
  momMsgText: {
    fontSize: 15,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: COLORS.text,
  },
  ingTable: { display: "flex", flexDirection: "column", gap: 0 },
  ingRow: {
    display: "flex",
    gap: 12,
    padding: "8px 0",
    borderBottom: `1px solid ${COLORS.borderLight}`,
    alignItems: "baseline",
  },
  ingAmount: {
    fontWeight: 600,
    fontSize: 15,
    color: COLORS.accent,
    minWidth: 80,
    flexShrink: 0,
  },
  ingItem: { fontSize: 15, color: COLORS.text },
  methodText: {
    fontSize: 15,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    color: COLORS.text,
  },
  expEntry: {
    padding: "10px 0",
    borderBottom: `1px solid ${COLORS.borderLight}`,
  },
  expDate: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: 500,
    marginBottom: 4,
  },
  expText: {
    fontSize: 15,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: COLORS.text,
  },
  btnPrimary: {
    background: COLORS.accent,
    color: COLORS.white,
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnSecondary: {
    background: "none",
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
  },
  btnGhost: {
    background: "none",
    border: "none",
    fontSize: 14,
    fontWeight: 500,
    fontFamily: "'Source Sans 3', sans-serif",
    cursor: "pointer",
    padding: "8px 12px",
  },
  addBtn: {
    background: "none",
    border: `1px dashed ${COLORS.border}`,
    borderRadius: 8,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "'Source Sans 3', sans-serif",
    color: COLORS.accent,
    cursor: "pointer",
  },
  removeBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    flexShrink: 0,
    borderRadius: 4,
  },
  nameInput: {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'Playfair Display', serif",
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.text,
    border: "none",
    borderBottom: `2px solid ${COLORS.border}`,
    background: "transparent",
    padding: "8px 0",
    marginBottom: 28,
    outline: "none",
  },
  editCard: {
    background: COLORS.white,
    border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  editCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  dateInput: {
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: 13,
    color: COLORS.textMuted,
    border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 6,
    padding: "4px 8px",
    background: COLORS.bg,
  },
  textarea: {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: 15,
    color: COLORS.text,
    border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 8,
    padding: "10px 12px",
    resize: "vertical",
    outline: "none",
    lineHeight: 1.6,
    background: COLORS.white,
  },
  ingEditRow: {
    display: "flex",
    gap: 8,
    marginBottom: 8,
    alignItems: "center",
  },
  ingEditInput: {
    fontFamily: "'Source Sans 3', sans-serif",
    fontSize: 14,
    color: COLORS.text,
    border: `1px solid ${COLORS.borderLight}`,
    borderRadius: 6,
    padding: "8px 10px",
    outline: "none",
    background: COLORS.white,
    boxSizing: "border-box",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(61,44,35,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },
  modalBox: {
    background: COLORS.white,
    borderRadius: 14,
    padding: 24,
    maxWidth: 360,
    width: "100%",
    boxShadow: "0 12px 40px rgba(61,44,35,0.15)",
  },
};
