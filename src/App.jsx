import { useState, useEffect, useMemo, useCallback } from "react";
import { auth, googleProvider, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  ref,
  set,
  push,
  remove,
  update,
  onValue,
  get,
  off,
} from "firebase/database";

// ─── Constants ───
const DEFAULT_CATEGORIES = [
  { id: "venue", name: "Venue", icon: "🏛", budget: 0 },
  { id: "catering", name: "Catering", icon: "🍽", budget: 0 },
  { id: "decoration", name: "Decoration", icon: "💐", budget: 0 },
  { id: "photography", name: "Photography", icon: "📸", budget: 0 },
  { id: "outfit", name: "Outfit & Attire", icon: "👗", budget: 0 },
  { id: "invitations", name: "Invitations", icon: "💌", budget: 0 },
  { id: "music", name: "Music / DJ", icon: "🎵", budget: 0 },
  { id: "transport", name: "Transportation", icon: "🚗", budget: 0 },
  { id: "misc", name: "Miscellaneous", icon: "✨", budget: 0 },
];

const COLORS = [
  "#D4A574","#8B7355","#C9B8A4","#A0522D","#DEB887",
  "#BC8F8F","#D2B48C","#C4A882","#B8860B","#CD853F",
  "#E8D5B7","#9C8B70",
];

const formatCurrency = (n) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

// ─── CSV Export ───
const exportCSV = (expenses, categories) => {
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const headers = ["Category","Description","Vendor","Amount","Status","Date"];
  const rows = expenses.map((e) => [
    catMap[e.category] || e.category, e.description, e.vendor,
    e.amount.toFixed(2), e.status, e.date || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "wedding-budget.csv"; a.click();
  URL.revokeObjectURL(url);
};

// ─── Shared Styles ───
const inputStyle = {
  width: "100%", padding: "10px 12px", border: "1.5px solid #E0D5C8", borderRadius: 8,
  fontSize: 14, fontFamily: "'DM Sans', sans-serif", color: "#4A3F35", background: "#FFF",
  outline: "none", transition: "border-color .2s", boxSizing: "border-box",
};
const btnPrimary = {
  background: "linear-gradient(135deg, #8B7355, #A0522D)", color: "#fff", border: "none",
  padding: "11px 24px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif", boxShadow: "0 2px 8px rgba(139,115,85,0.3)",
};
const btnSecondary = {
  background: "#F5EDE3", color: "#7A6F63", border: "1.5px solid #E0D5C8",
  padding: "11px 24px", borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
};

// ─── Small Components ───
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#8B7355", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(60,50,40,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, animation: "fadeIn .25s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFCF7", borderRadius: 16, padding: "28px 24px", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(60,50,40,0.25)", animation: "slideUp .3s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#4A3F35", fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#A09080", padding: 4 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Charts ───
function PieChart({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ textAlign: "center", padding: 40, color: "#999", fontFamily: "'Cormorant Garamond', serif" }}>No expenses yet</div>;
  let cumulative = 0;
  const slices = data.filter((d) => d.value > 0).map((d) => {
    const start = cumulative;
    cumulative += d.value;
    const startAngle = (start / total) * 360 - 90;
    const endAngle = (cumulative / total) * 360 - 90;
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const r = 80, cx = 100, cy = 100;
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    return { ...d, path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z` };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <svg viewBox="0 0 200 200" style={{ width: 200, height: 200 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="1.5"><title>{s.label}: {formatCurrency(s.value)} ({((s.value / total) * 100).toFixed(1)}%)</title></path>)}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", justifyContent: "center" }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <span style={{ color: "#7A6F63" }}>{s.label}: {((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }) {
  const maxVal = Math.max(...data.flatMap((d) => [d.planned, d.actual]), 1);
  const gap = 48, chartH = 180;
  const chartW = data.length * gap + 40;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${Math.max(chartW, 300)} ${chartH + 60}`} style={{ width: "100%", minWidth: 280, height: chartH + 60 }}>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={30} x2={chartW - 10} y1={chartH - f * chartH + 10} y2={chartH - f * chartH + 10} stroke="#E8E0D8" strokeDasharray="3" />
            <text x={26} y={chartH - f * chartH + 14} textAnchor="end" fontSize={9} fill="#B0A090">{formatCurrency(maxVal * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = 40 + i * gap, barW = 24;
          const hP = (d.planned / maxVal) * chartH;
          const hA = (d.actual / maxVal) * chartH;
          const over = d.actual > d.planned && d.planned > 0;
          return (
            <g key={i}>
              <rect x={x} y={chartH - hP + 10} width={barW / 2} height={hP} fill="#D4C5B0" rx={3}><title>Planned: {formatCurrency(d.planned)}</title></rect>
              <rect x={x + barW / 2 + 2} y={chartH - hA + 10} width={barW / 2} height={hA} fill={over ? "#C0392B" : "#8B7355"} rx={3}><title>Actual: {formatCurrency(d.actual)}</title></rect>
              <text x={x + barW / 2} y={chartH + 26} textAnchor="middle" fontSize={8} fill="#7A6F63">{d.label.length > 7 ? d.label.slice(0, 6) + "…" : d.label}</text>
            </g>
          );
        })}
        <g transform={`translate(${chartW - 100}, ${chartH + 40})`}>
          <rect width={8} height={8} fill="#D4C5B0" rx={2} /><text x={12} y={8} fontSize={9} fill="#7A6F63">Planned</text>
          <rect x={60} width={8} height={8} fill="#8B7355" rx={2} /><text x={72} y={8} fontSize={9} fill="#7A6F63">Actual</text>
        </g>
      </svg>
    </div>
  );
}

// ─── Guest List ───
function GuestList({ guests, onAdd, onRemove, onUpdate, costPerGuest, onCostChange }) {
  const [name, setName] = useState("");
  const [rsvp, setRsvp] = useState("pending");
  const handleAdd = () => { if (name.trim()) { onAdd({ name: name.trim(), rsvp }); setName(""); setRsvp("pending"); } };
  const confirmed = guests.filter((g) => g.rsvp === "confirmed").length;
  return (
    <div>
      <Field label="Cost Per Guest ($)">
        <input type="number" value={costPerGuest || ""} onChange={(e) => onCostChange(+e.target.value)} placeholder="0" style={inputStyle} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guest name" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        <select value={rsvp} onChange={(e) => setRsvp(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option>
        </select>
        <button onClick={handleAdd} style={{ ...btnPrimary, padding: "10px 16px", whiteSpace: "nowrap" }}>+ Add</button>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[["Total", guests.length, "#8B7355"], ["Confirmed", confirmed, "#27ae60"], ["Est. Cost", formatCurrency(confirmed * (costPerGuest || 0)), "#A0522D"]].map(([l, v, c]) => (
          <div key={l} style={{ background: "#F5EDE3", borderRadius: 8, padding: "8px 14px", flex: "1 1 80px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#A09080", textTransform: "uppercase", letterSpacing: 1 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c, fontFamily: "'Cormorant Garamond', serif" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {guests.map((g) => (
          <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #F0E8DE" }}>
            <span style={{ flex: 1, fontSize: 14, color: "#4A3F35" }}>{g.name}</span>
            <select value={g.rsvp} onChange={(e) => onUpdate(g.id, { rsvp: e.target.value })} style={{ ...inputStyle, width: "auto", padding: "4px 8px", fontSize: 12 }}>
              <option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="declined">Declined</option>
            </select>
            <button onClick={() => onRemove(g.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", fontSize: 14 }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Vendor Contacts ───
function VendorContacts({ vendors, onAdd, onRemove }) {
  const [form, setForm] = useState({ name: "", category: "", phone: "", email: "", notes: "" });
  const handleAdd = () => { if (form.name.trim()) { onAdd(form); setForm({ name: "", category: "", phone: "", email: "", notes: "" }); } };
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Vendor name" style={inputStyle} />
        <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Category" style={inputStyle} />
        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" style={inputStyle} />
        <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" style={inputStyle} />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" style={{ ...inputStyle, flex: 1 }} />
        <button onClick={handleAdd} style={{ ...btnPrimary, padding: "10px 16px" }}>+ Add</button>
      </div>
      {vendors.map((v) => (
        <div key={v.id} style={{ background: "#F5EDE3", borderRadius: 10, padding: 14, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#4A3F35", fontSize: 15 }}>{v.name}</div>
              <div style={{ fontSize: 11, color: "#A09080" }}>{v.category}</div>
            </div>
            <button onClick={() => onRemove(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B" }}>✕</button>
          </div>
          {(v.phone || v.email) && <div style={{ fontSize: 12, color: "#7A6F63", marginTop: 4 }}>{v.phone}{v.phone && v.email ? " · " : ""}{v.email}</div>}
          {v.notes && <div style={{ fontSize: 12, color: "#A09080", marginTop: 2, fontStyle: "italic" }}>{v.notes}</div>}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AUTH SCREEN
// ════════════════════════════════════════════════════════════════
function AuthScreen({ onAuth }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "").trim());
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError(""); setLoading(true);
    try { await signInWithPopup(auth, googleProvider); }
    catch (err) { setError(err.message.replace("Firebase: ", "").replace(/\(auth\/.*\)/, "").trim()); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #F5EDE3 0%, #E8DFD3 50%, #D4C5B0 100%)", padding: 16 }}>
      <div style={{ background: "#FFFCF7", borderRadius: 20, padding: "40px 32px", width: "100%", maxWidth: 420, boxShadow: "0 24px 80px rgba(60,50,40,0.15)", animation: "slideUp .4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>💒</div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, color: "#4A3F35", margin: 0 }}>Wedding Budget</h1>
          <p style={{ color: "#A09080", fontSize: 13, marginTop: 4, letterSpacing: 2, textTransform: "uppercase" }}>Plan together</p>
        </div>

        <button onClick={handleGoogle} disabled={loading} style={{
          width: "100%", padding: "12px 16px", borderRadius: 10, border: "1.5px solid #E0D5C8",
          background: "#fff", cursor: "pointer", fontSize: 14, fontFamily: "'DM Sans', sans-serif",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "#4A3F35",
          fontWeight: 500, marginBottom: 20, transition: "background .2s"
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: "#E0D5C8" }} />
          <span style={{ fontSize: 12, color: "#A09080" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#E0D5C8" }} />
        </div>

        <form onSubmit={handleEmail}>
          {isSignUp && (
            <Field label="Your Name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required style={inputStyle} />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} style={inputStyle} />
          </Field>
          {error && <div style={{ color: "#C0392B", fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#FDEDEE", borderRadius: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...btnPrimary, width: "100%", padding: "13px", fontSize: 15, borderRadius: 10, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#A09080" }}>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button onClick={() => { setIsSignUp(!isSignUp); setError(""); }} style={{ background: "none", border: "none", color: "#8B7355", fontWeight: 600, cursor: "pointer", fontSize: 13, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [weddingId, setWeddingId] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [totalBudget, setTotalBudget] = useState(30000);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [expenses, setExpenses] = useState([]);
  const [guests, setGuests] = useState([]);
  const [costPerGuest, setCostPerGuest] = useState(75);
  const [vendors, setVendors] = useState([]);
  const [members, setMembers] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [modalOpen, setModalOpen] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ category: "", description: "", vendor: "", amount: "", status: "unpaid", date: "" });
  const [newCatName, setNewCatName] = useState("");
  const [newCatIcon, setNewCatIcon] = useState("📌");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);

  // ─── Auth listener ───
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // ─── Resolve wedding ID ───
  useEffect(() => {
    if (!user) { setWeddingId(null); return; }
    const userRef = ref(db, `users/${user.uid}`);
    get(userRef).then((snap) => {
      if (snap.exists() && snap.val().weddingId) {
        setWeddingId(snap.val().weddingId);
      } else {
        // Create new wedding
        const newWedRef = push(ref(db, "weddings"));
        const wid = newWedRef.key;
        set(newWedRef, {
          owner: user.uid,
          createdAt: Date.now(),
          totalBudget: 30000,
          costPerGuest: 75,
          darkMode: false,
          categories: DEFAULT_CATEGORIES.reduce((acc, c) => { acc[c.id] = c; return acc; }, {}),
        });
        set(ref(db, `weddings/${wid}/members/${user.uid}`), {
          email: user.email,
          name: user.displayName || user.email,
          role: "owner",
          joinedAt: Date.now(),
        });
        set(userRef, { weddingId: wid, email: user.email });
        setWeddingId(wid);
      }
    });
  }, [user]);

  // ─── Subscribe to wedding data ───
  useEffect(() => {
    if (!weddingId) return;
    const wRef = ref(db, `weddings/${weddingId}`);
    const unsub = onValue(wRef, (snap) => {
      if (!snap.exists()) return;
      const d = snap.val();
      setTotalBudget(d.totalBudget ?? 30000);
      setCostPerGuest(d.costPerGuest ?? 75);
      setDarkMode(d.darkMode ?? false);
      if (d.categories) {
        setCategories(Object.values(d.categories));
      }
      if (d.expenses) {
        setExpenses(Object.entries(d.expenses).map(([id, e]) => ({ id, ...e })));
      } else {
        setExpenses([]);
      }
      if (d.guests) {
        setGuests(Object.entries(d.guests).map(([id, g]) => ({ id, ...g })));
      } else {
        setGuests([]);
      }
      if (d.vendors) {
        setVendors(Object.entries(d.vendors).map(([id, v]) => ({ id, ...v })));
      } else {
        setVendors([]);
      }
      if (d.members) {
        setMembers(Object.entries(d.members).map(([id, m]) => ({ uid: id, ...m })));
      } else {
        setMembers([]);
      }
      setDataLoaded(true);
    });
    return () => off(wRef);
  }, [weddingId]);

  // ─── Firebase write helpers ───
  const dbSet = useCallback((path, val) => { if (weddingId) set(ref(db, `weddings/${weddingId}/${path}`), val); }, [weddingId]);
  const dbPush = useCallback((path, val) => { if (weddingId) push(ref(db, `weddings/${weddingId}/${path}`), val); }, [weddingId]);
  const dbRemove = useCallback((path) => { if (weddingId) remove(ref(db, `weddings/${weddingId}/${path}`)); }, [weddingId]);
  const dbUpdate = useCallback((path, val) => { if (weddingId) update(ref(db, `weddings/${weddingId}/${path}`), val); }, [weddingId]);

  // ─── Actions ───
  const updateBudget = (val) => { setTotalBudget(val); dbSet("totalBudget", val); };
  const updateCostPerGuest = (val) => { setCostPerGuest(val); dbSet("costPerGuest", val); };
  const toggleDarkMode = () => { setDarkMode((d) => { dbSet("darkMode", !d); return !d; }); };

  const saveExpense = () => {
    if (!expenseForm.description || !expenseForm.amount) return;
    const entry = { ...expenseForm, amount: +expenseForm.amount, addedBy: user.email, addedAt: Date.now() };
    if (editingExpense) {
      dbSet(`expenses/${editingExpense}`, entry);
    } else {
      dbPush("expenses", entry);
    }
    setModalOpen(null);
  };
  const deleteExpense = (id) => dbRemove(`expenses/${id}`);
  const openAddExpense = () => {
    setEditingExpense(null);
    setExpenseForm({ category: categories[0]?.id || "", description: "", vendor: "", amount: "", status: "unpaid", date: new Date().toISOString().slice(0, 10) });
    setModalOpen("expense");
  };
  const openEditExpense = (exp) => {
    setEditingExpense(exp.id);
    setExpenseForm({ category: exp.category, description: exp.description, vendor: exp.vendor, amount: exp.amount, status: exp.status, date: exp.date || "" });
    setModalOpen("expense");
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    const id = newCatName.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36).slice(-4);
    dbSet(`categories/${id}`, { id, name: newCatName.trim(), icon: newCatIcon, budget: 0 });
    setNewCatName(""); setNewCatIcon("📌"); setModalOpen(null);
  };
  const setCatBudget = (id, val) => dbUpdate(`categories/${id}`, { budget: +val });
  const deleteCat = (id) => {
    dbRemove(`categories/${id}`);
    expenses.filter((e) => e.category === id).forEach((e) => dbRemove(`expenses/${e.id}`));
  };

  const addGuest = (g) => dbPush("guests", g);
  const removeGuest = (id) => dbRemove(`guests/${id}`);
  const updateGuest = (id, data) => dbUpdate(`guests/${id}`, data);

  const addVendor = (v) => dbPush("vendors", v);
  const removeVendor = (id) => dbRemove(`vendors/${id}`);

  // ─── Invite partner ───
  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviteMsg("");
    // Store invite in DB so when partner signs up/in, they get linked
    const inviteRef = ref(db, `invites/${inviteEmail.trim().replace(/\./g, ",")}`);
    await set(inviteRef, { weddingId, invitedBy: user.email, invitedAt: Date.now() });
    setInviteMsg(`Invite saved! When ${inviteEmail.trim()} signs in, they'll automatically join your wedding budget.`);
    setInviteEmail("");
  };

  // ─── Check for invite on login ───
  useEffect(() => {
    if (!user || !user.email) return;
    const emailKey = user.email.replace(/\./g, ",");
    const invRef = ref(db, `invites/${emailKey}`);
    get(invRef).then((snap) => {
      if (snap.exists()) {
        const { weddingId: invWid } = snap.val();
        // Link user to the wedding
        set(ref(db, `users/${user.uid}`), { weddingId: invWid, email: user.email });
        set(ref(db, `weddings/${invWid}/members/${user.uid}`), {
          email: user.email,
          name: user.displayName || user.email,
          role: "partner",
          joinedAt: Date.now(),
        });
        remove(invRef);
        setWeddingId(invWid);
      }
    });
  }, [user]);

  // ─── Derived data ───
  const totalSpent = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalPaid = useMemo(() => expenses.filter((e) => e.status === "paid").reduce((s, e) => s + e.amount, 0), [expenses]);
  const remaining = totalBudget - totalSpent;
  const pct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  const catSpending = useMemo(() => {
    const map = {};
    categories.forEach((c) => { map[c.id] = { ...c, spent: 0 }; });
    expenses.forEach((e) => { if (map[e.category]) map[e.category].spent += e.amount; });
    return Object.values(map);
  }, [categories, expenses]);

  const pieData = useMemo(() => catSpending.filter((c) => c.spent > 0).map((c, i) => ({ label: c.name, value: c.spent, color: COLORS[i % COLORS.length] })), [catSpending]);
  const barData = useMemo(() => catSpending.filter((c) => c.budget > 0 || c.spent > 0).map((c) => ({ label: c.name, planned: c.budget, actual: c.spent })), [catSpending]);

  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (filterCat !== "all") list = list.filter((e) => e.category === filterCat);
    if (filterStatus !== "all") list = list.filter((e) => e.status === filterStatus);
    if (searchTerm) { const q = searchTerm.toLowerCase(); list = list.filter((e) => e.description.toLowerCase().includes(q) || e.vendor.toLowerCase().includes(q)); }
    return list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [expenses, filterCat, filterStatus, searchTerm]);

  // ─── Theme ───
  const bg = darkMode ? "#1E1B17" : "#FFFCF7";
  const cardBg = darkMode ? "#2A2520" : "#fff";
  const textPrimary = darkMode ? "#E8DFD3" : "#4A3F35";
  const textSecondary = darkMode ? "#A09080" : "#7A6F63";
  const borderColor = darkMode ? "#3A342D" : "#E8E0D8";
  const surfaceBg = darkMode ? "#332E28" : "#F5EDE3";
  const card = { background: cardBg, borderRadius: 16, padding: 24, border: `1px solid ${borderColor}`, boxShadow: darkMode ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(139,115,85,0.06)" };

  // ─── Loading / Auth ───
  if (authLoading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5EDE3" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💒</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#8B7355" }}>Loading…</div>
      </div>
    </div>
  );
  if (!user) return <AuthScreen />;
  if (!dataLoaded) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5EDE3" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💒</div>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#8B7355" }}>Loading your wedding data…</div>
      </div>
    </div>
  );

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "expenses", label: "Expenses", icon: "💰" },
    { id: "categories", label: "Categories", icon: "📂" },
    { id: "reports", label: "Reports", icon: "📈" },
    { id: "guests", label: "Guests", icon: "👥" },
    { id: "vendors", label: "Vendors", icon: "📇" },
    { id: "team", label: "Team", icon: "💑" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: bg, fontFamily: "'DM Sans', sans-serif", color: textPrimary, transition: "background .3s, color .3s" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes growWidth { from { width: 0 } }
        input:focus, select:focus { border-color: #8B7355 !important; box-shadow: 0 0 0 3px rgba(139,115,85,0.12) !important; }
        button:hover { filter: brightness(1.06); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #C9B8A4; border-radius: 3px; }
      `}</style>

      {/* HEADER */}
      <header style={{ background: darkMode ? "linear-gradient(135deg, #2A2520, #1E1B17)" : "linear-gradient(135deg, #F5EDE3, #E8DFD3)", borderBottom: `1px solid ${borderColor}`, padding: "16px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, letterSpacing: 1, color: textPrimary }}>✦ Wedding Budget</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: textSecondary, letterSpacing: 2, textTransform: "uppercase" }}>Plan · Track · Celebrate</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: textSecondary }}>{user.displayName || user.email}</span>
            <button onClick={() => exportCSV(expenses, categories)} style={{ ...btnSecondary, padding: "8px 14px", fontSize: 12, background: surfaceBg, borderColor, color: textSecondary }}>📤 CSV</button>
            <button onClick={toggleDarkMode} style={{ width: 36, height: 36, borderRadius: "50%", border: `1.5px solid ${borderColor}`, background: surfaceBg, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <button onClick={() => signOut(auth)} style={{ ...btnSecondary, padding: "8px 14px", fontSize: 12, background: surfaceBg, borderColor, color: textSecondary }}>Sign Out</button>
          </div>
        </div>
      </header>

      {/* NAV */}
      <nav style={{ background: cardBg, borderBottom: `1px solid ${borderColor}`, overflowX: "auto" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", padding: "0 16px" }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              padding: "14px 16px", background: "none", border: "none", borderBottom: activeTab === t.id ? "2.5px solid #8B7355" : "2.5px solid transparent",
              cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? (darkMode ? "#D4A574" : "#8B7355") : textSecondary,
              fontFamily: "'DM Sans', sans-serif", whiteSpace: "nowrap"
            }}>
              <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </nav>

      {/* MAIN */}
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", animation: "fadeIn .4s ease" }}>

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Budget Overview</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: textSecondary }}>Total Budget:</span>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: textSecondary }}>£</span>
                    <input type="number" value={totalBudget || ""} onChange={(e) => updateBudget(+e.target.value)} style={{ ...inputStyle, width: 140, paddingLeft: 24, background: surfaceBg, borderColor }} />
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Total Budget", val: formatCurrency(totalBudget), color: "#8B7355" },
                  { label: "Total Spent", val: formatCurrency(totalSpent), color: "#A0522D" },
                  { label: "Paid", val: formatCurrency(totalPaid), color: "#27ae60" },
                  { label: "Remaining", val: formatCurrency(remaining), color: remaining < 0 ? "#C0392B" : "#2E86AB" },
                ].map((s) => (
                  <div key={s.label} style={{ background: surfaceBg, borderRadius: 12, padding: "16px 14px", textAlign: "center" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, color: textSecondary, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Cormorant Garamond', serif", color: s.color }}>{s.val}</div>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: textSecondary, marginBottom: 6 }}>
                  <span>Budget Used</span><span>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 5, background: surfaceBg, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 5, width: `${pct}%`, background: pct > 100 ? "linear-gradient(90deg, #C0392B, #E74C3C)" : pct > 80 ? "linear-gradient(90deg, #D4A574, #CD853F)" : "linear-gradient(90deg, #8B7355, #A0522D)", animation: "growWidth .8s ease", transition: "width .5s ease" }} />
                </div>
                {pct > 90 && <div style={{ fontSize: 11, color: "#C0392B", marginTop: 6 }}>⚠ {pct > 100 ? "Over budget!" : "Approaching budget limit"}</div>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {catSpending.map((c, i) => {
                const catPct = c.budget > 0 ? Math.min((c.spent / c.budget) * 100, 100) : 0;
                const over = c.spent > c.budget && c.budget > 0;
                return (
                  <div key={c.id} style={{ ...card, padding: 18, animation: `slideUp .4s ease ${i * 0.04}s both` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 20 }}>{c.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: textPrimary }}>{c.name}</span>
                      </div>
                      {over && <span style={{ fontSize: 10, background: "#FDEDEE", color: "#C0392B", padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>OVER</span>}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: textSecondary, marginBottom: 4 }}>
                      <span>Spent: {formatCurrency(c.spent)}</span><span>Budget: {c.budget > 0 ? formatCurrency(c.budget) : "—"}</span>
                    </div>
                    {c.budget > 0 && <div style={{ height: 5, borderRadius: 3, background: surfaceBg, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, width: `${catPct}%`, background: over ? "#C0392B" : COLORS[i % COLORS.length], transition: "width .5s" }} /></div>}
                  </div>
                );
              })}
            </div>
            <div style={{ textAlign: "center" }}>
              <button onClick={openAddExpense} style={{ ...btnPrimary, padding: "14px 36px", fontSize: 15, borderRadius: 12 }}>+ Add Expense</button>
            </div>
          </div>
        )}

        {/* ── EXPENSES ── */}
        {activeTab === "expenses" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Expenses</h2>
              <button onClick={openAddExpense} style={btnPrimary}>+ Add Expense</button>
            </div>
            <div style={{ ...card, padding: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="🔍 Search…" style={{ ...inputStyle, flex: "1 1 160px", background: surfaceBg, borderColor }} />
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 1 160px", background: surfaceBg, borderColor, color: textPrimary }}>
                <option value="all">All Categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ ...inputStyle, width: "auto", flex: "0 1 120px", background: surfaceBg, borderColor, color: textPrimary }}>
                <option value="all">All Status</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option>
              </select>
            </div>
            <div style={card}>
              {filteredExpenses.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: textSecondary }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>💰</div><p>No expenses yet. Start tracking!</p>
                </div>
              ) : (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 60px", gap: 8, padding: "8px 0", borderBottom: `2px solid ${borderColor}`, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: textSecondary, fontWeight: 700 }}>
                    <span>Description</span><span>Vendor</span><span>Category</span><span style={{ textAlign: "right" }}>Amount</span><span>Status</span><span></span>
                  </div>
                  {filteredExpenses.map((exp, i) => {
                    const cat = categories.find((c) => c.id === exp.category);
                    return (
                      <div key={exp.id} style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.2fr 1fr 1fr 60px", gap: 8, padding: "12px 0", borderBottom: `1px solid ${borderColor}`, alignItems: "center", fontSize: 13 }}>
                        <div>
                          <div style={{ fontWeight: 600, color: textPrimary }}>{exp.description}</div>
                          {exp.date && <div style={{ fontSize: 11, color: textSecondary }}>{formatDate(exp.date)}</div>}
                          {exp.addedBy && <div style={{ fontSize: 10, color: "#B0A090" }}>by {exp.addedBy.split("@")[0]}</div>}
                        </div>
                        <span style={{ color: textSecondary }}>{exp.vendor || "—"}</span>
                        <span style={{ color: textSecondary }}>{cat ? `${cat.icon} ${cat.name}` : exp.category}</span>
                        <span style={{ textAlign: "right", fontWeight: 700, color: textPrimary, fontFamily: "'Cormorant Garamond', serif", fontSize: 15 }}>{formatCurrency(exp.amount)}</span>
                        <span>
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: exp.status === "paid" ? (darkMode ? "#1a3a1a" : "#E8F5E9") : (darkMode ? "#3a2a1a" : "#FFF3E0"), color: exp.status === "paid" ? "#27ae60" : "#E67E22" }}>
                            {exp.status === "paid" ? "✓ Paid" : "Unpaid"}
                          </span>
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEditExpense(exp)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: textSecondary }}>✏️</button>
                          <button onClick={() => deleteExpense(exp.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#C0392B" }}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, fontSize: 15, fontWeight: 700, color: textPrimary, fontFamily: "'Cormorant Garamond', serif" }}>
                    Total: {formatCurrency(filteredExpenses.reduce((s, e) => s + e.amount, 0))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CATEGORIES ── */}
        {activeTab === "categories" && (
          <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Categories & Budgets</h2>
              <button onClick={() => setModalOpen("category")} style={btnPrimary}>+ Add Category</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {catSpending.map((c, i) => {
                const over = c.spent > c.budget && c.budget > 0;
                const catPct = c.budget > 0 ? (c.spent / c.budget) * 100 : 0;
                return (
                  <div key={c.id} style={{ ...card, animation: `slideUp .3s ease ${i * 0.04}s both` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 28 }}>{c.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 16, color: textPrimary }}>{c.name}</div>
                          <div style={{ fontSize: 12, color: textSecondary }}>{expenses.filter((e) => e.category === c.id).length} expenses</div>
                        </div>
                      </div>
                      {!DEFAULT_CATEGORIES.find((dc) => dc.id === c.id) && (
                        <button onClick={() => deleteCat(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C0392B", fontSize: 13 }}>✕</button>
                      )}
                    </div>
                    <Field label="Category Budget ($)">
                      <input type="number" value={c.budget || ""} onChange={(e) => setCatBudget(c.id, e.target.value)} placeholder="0" style={{ ...inputStyle, background: surfaceBg, borderColor }} />
                    </Field>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: textSecondary, marginBottom: 4 }}>
                      <span>Spent: <strong style={{ color: over ? "#C0392B" : textPrimary }}>{formatCurrency(c.spent)}</strong></span>
                      <span>{c.budget > 0 ? `${catPct.toFixed(0)}%` : ""}</span>
                    </div>
                    {c.budget > 0 && <div style={{ height: 6, borderRadius: 3, background: surfaceBg, overflow: "hidden" }}><div style={{ height: "100%", borderRadius: 3, width: `${Math.min(catPct, 100)}%`, background: over ? "#C0392B" : COLORS[i % COLORS.length], transition: "width .5s" }} /></div>}
                    {over && <div style={{ fontSize: 11, color: "#C0392B", marginTop: 6, fontWeight: 600 }}>⚠ Over budget by {formatCurrency(c.spent - c.budget)}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── REPORTS ── */}
        {activeTab === "reports" && (
          <div style={{ display: "grid", gap: 20 }}>
            <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Visual Reports</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
              <div style={card}><h3 style={{ margin: "0 0 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: textPrimary }}>Spending Distribution</h3><PieChart data={pieData} /></div>
              <div style={card}><h3 style={{ margin: "0 0 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: textPrimary }}>Planned vs Actual</h3><BarChart data={barData} /></div>
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: textPrimary }}>Summary</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${borderColor}` }}>
                      {["Category","Budget","Spent","Remaining","% Used"].map((h) => (
                        <th key={h} style={{ textAlign: h === "Category" ? "left" : "right", padding: "8px 10px", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: textSecondary, fontWeight: 700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {catSpending.filter((c) => c.budget > 0 || c.spent > 0).map((c) => {
                      const rem = c.budget - c.spent;
                      const p = c.budget > 0 ? (c.spent / c.budget) * 100 : 0;
                      return (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${borderColor}` }}>
                          <td style={{ padding: "10px", color: textPrimary }}>{c.icon} {c.name}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: textSecondary }}>{c.budget > 0 ? formatCurrency(c.budget) : "—"}</td>
                          <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: textPrimary }}>{formatCurrency(c.spent)}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: rem < 0 ? "#C0392B" : "#27ae60" }}>{c.budget > 0 ? formatCurrency(rem) : "—"}</td>
                          <td style={{ padding: "10px", textAlign: "right", color: p > 100 ? "#C0392B" : textSecondary }}>{c.budget > 0 ? `${p.toFixed(0)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── GUESTS ── */}
        {activeTab === "guests" && (
          <div style={{ display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Guest List</h2>
            <div style={card}><GuestList guests={guests} onAdd={addGuest} onRemove={removeGuest} onUpdate={updateGuest} costPerGuest={costPerGuest} onCostChange={updateCostPerGuest} /></div>
          </div>
        )}

        {/* ── VENDORS ── */}
        {activeTab === "vendors" && (
          <div style={{ display: "grid", gap: 16 }}>
            <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Vendor Contacts</h2>
            <div style={card}><VendorContacts vendors={vendors} onAdd={addVendor} onRemove={removeVendor} /></div>
          </div>
        )}

        {/* ── TEAM ── */}
        {activeTab === "team" && (
          <div style={{ display: "grid", gap: 20 }}>
            <h2 style={{ margin: 0, fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 500, color: textPrimary }}>Team</h2>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: textPrimary }}>💑 Invite Your Partner</h3>
              <p style={{ fontSize: 13, color: textSecondary, marginBottom: 16 }}>
                Enter your partner's email below. When they sign up or sign in with that email, they'll automatically join this wedding budget and see everything in real time.
              </p>
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="partner@email.com" style={{ ...inputStyle, flex: 1 }} onKeyDown={(e) => e.key === "Enter" && handleInvite()} />
                <button onClick={handleInvite} style={btnPrimary}>Send Invite</button>
              </div>
              {inviteMsg && <div style={{ padding: "10px 14px", background: "#E8F5E9", borderRadius: 8, color: "#27ae60", fontSize: 13, marginBottom: 16 }}>{inviteMsg}</div>}
            </div>
            <div style={card}>
              <h3 style={{ margin: "0 0 16px", fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500, color: textPrimary }}>Members</h3>
              {members.map((m) => (
                <div key={m.uid} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${borderColor}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #D4A574, #8B7355)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                    {(m.name || m.email || "?")[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: textPrimary, fontSize: 14 }}>{m.name || m.email}</div>
                    <div style={{ fontSize: 12, color: textSecondary }}>{m.email}</div>
                  </div>
                  <span style={{ padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: m.role === "owner" ? "#FFF3E0" : "#E8F5E9", color: m.role === "owner" ? "#E67E22" : "#27ae60", textTransform: "capitalize" }}>{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ── EXPENSE MODAL ── */}
      <Modal open={modalOpen === "expense"} onClose={() => setModalOpen(null)} title={editingExpense ? "Edit Expense" : "Add Expense"}>
        <Field label="Category"><select value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} style={inputStyle}>{categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></Field>
        <Field label="Description"><input value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Floral centerpieces" style={inputStyle} /></Field>
        <Field label="Vendor Name"><input value={expenseForm.vendor} onChange={(e) => setExpenseForm((f) => ({ ...f, vendor: e.target.value }))} placeholder="e.g. Rose Garden Studio" style={inputStyle} /></Field>
        <Field label="Amount ($)"><input type="number" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0" style={inputStyle} /></Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Payment Status"><select value={expenseForm.status} onChange={(e) => setExpenseForm((f) => ({ ...f, status: e.target.value }))} style={inputStyle}><option value="unpaid">Unpaid</option><option value="paid">Paid</option></select></Field>
          <Field label="Payment Date"><input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((f) => ({ ...f, date: e.target.value }))} style={inputStyle} /></Field>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModalOpen(null)} style={btnSecondary}>Cancel</button>
          <button onClick={saveExpense} style={btnPrimary}>{editingExpense ? "Update" : "Add Expense"}</button>
        </div>
      </Modal>

      {/* ── CATEGORY MODAL ── */}
      <Modal open={modalOpen === "category"} onClose={() => setModalOpen(null)} title="Add Custom Category">
        <Field label="Category Name"><input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="e.g. Honeymoon" style={inputStyle} /></Field>
        <Field label="Icon (emoji)"><input value={newCatIcon} onChange={(e) => setNewCatIcon(e.target.value)} style={{ ...inputStyle, width: 80, fontSize: 22, textAlign: "center" }} maxLength={2} /></Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setModalOpen(null)} style={btnSecondary}>Cancel</button>
          <button onClick={addCategory} style={btnPrimary}>Add Category</button>
        </div>
      </Modal>

      <footer style={{ textAlign: "center", padding: "32px 16px", color: textSecondary, fontSize: 11, letterSpacing: 1, fontFamily: "'Cormorant Garamond', serif" }}>
        ✦ Made with love for your special day ✦
      </footer>
    </div>
  );
}
