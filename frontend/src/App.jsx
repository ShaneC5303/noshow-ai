import { useEffect, useRef, useState } from "react";

const DEMO_URL = "https://noshow-ai.onrender.com/api/bookings";
const API = "https://noshow-ai-api.onrender.com";

const card = { background: "#f7f7f8", borderRadius: 12, padding: "18px 12px", textAlign: "center", color: "#111" };
const btn = { background: "#fff", color: "#111", border: "1px solid #d0d0d5", borderRadius: 8, padding: "9px 14px", fontWeight: 600, cursor: "pointer", fontSize: 14 };
const input = { padding: "9px 10px", borderRadius: 8, border: "1px solid #d0d0d5", width: 110, fontSize: 14, color: "#111", background: "#fff" };

function badge(r) {
  if (r >= 0.7) return { bg: "#fdecea", fg: "#b3261e" };
  if (r >= 0.4) return { bg: "#fff4e0", fg: "#a35b00" };
  return { bg: "#e6f4ea", fg: "#1e7a34" };
}

function downloadCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["rank", "age", "leadDays", "riskScore", "keyFactors", "reminderMessage"];
  const lines = rows.map((r, i) =>
    [i + 1, r.age, r.leadDays, r.riskScore, (r.reasons || []).join("; "), r.reminderMessage].map(esc).join(",")
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "noshow_risk_results.csv";
  a.click();
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState("demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);
  const [form, setForm] = useState({ age: "", leadDays: "", scholarship: false, hipertension: false, diabetes: false, sms: false });
  const [single, setSingle] = useState(null);
  const [scoring, setScoring] = useState(false);
  const fileRef = useRef(null);

  const loadDemo = () => {
    setMode("demo");
    setError("");
    fetch(DEMO_URL).then((r) => r.json()).then(setRows).catch(() => setError("Could not load demo data."));
  };
  useEffect(loadDemo, []);

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/predict`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setRows(data);
      setMode("upload");
    } catch (err) {
      setError(err.message || "Upload failed");
    }
    setLoading(false);
    e.target.value = "";
  };

  const scoreOne = async (e) => {
    e.preventDefault();
    setScoring(true);
    setError("");
    setSingle(null);
    try {
      const res = await fetch(`${API}/predict_one`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          age: Number(form.age),
          leadDays: Number(form.leadDays),
          scholarship: +form.scholarship,
          hipertension: +form.hipertension,
          diabetes: +form.diabetes,
          sms: +form.sms,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scoring failed");
      setSingle(data);
    } catch (err) {
      setError(err.message || "Scoring failed");
    }
    setScoring(false);
  };

  const copy = (i, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    });
  };
  const wa = (text) => window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");

  const high = rows.filter((r) => r.riskScore >= 0.7).length;
  const avg = rows.length ? Math.round((rows.reduce((s, r) => s + r.riskScore, 0) / rows.length) * 100) : 0;
  const ready = rows.filter((r) => r.reminderMessage).length;

  const Actions = ({ text, i }) =>
    text ? (
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8 }}>
        <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => copy(i, text)}>
          {copied === i ? "Copied" : "Copy"}
        </button>
        <button style={{ ...btn, padding: "5px 10px", fontSize: 12 }} onClick={() => wa(text)}>
          WhatsApp
        </button>
      </div>
    ) : null;

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "28px 16px 60px", color: "#ddd", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, color: "#fff", fontSize: 30 }}>No-show risk dashboard</h1>
          <p style={{ margin: "6px 0 0", color: "#8a8a93" }}>Predicting and preventing appointment no-shows with AI</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={upload} style={{ display: "none" }} />
          <button style={btn} disabled={loading} onClick={() => fileRef.current.click()}>
            {loading ? "Analyzing... (cold start can take ~50s)" : "Upload a CSV"}
          </button>
          {rows.length > 0 && (
            <button style={btn} onClick={() => downloadCsv(rows)}>Download results</button>
          )}
          {mode === "upload" && (
            <button style={btn} onClick={loadDemo}>Back to demo data</button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, margin: "24px 0" }}>
        <div style={card}><div style={{ color: "#555" }}>Bookings tracked</div><div style={{ fontSize: 32, fontWeight: 600 }}>{rows.length}</div></div>
        <div style={card}><div style={{ color: "#555" }}>High risk (70%+)</div><div style={{ fontSize: 32, fontWeight: 600, color: "#b3261e" }}>{high}</div></div>
        <div style={card}><div style={{ color: "#555" }}>Avg. risk score</div><div style={{ fontSize: 32, fontWeight: 600 }}>{avg}%</div></div>
        <div style={card}><div style={{ color: "#555" }}>Reminders ready</div><div style={{ fontSize: 32, fontWeight: 600, color: "#1e7a34" }}>{ready}</div></div>
      </div>

      {error && <p style={{ color: "#ff8a80", textAlign: "center" }}>{error}</p>}
      {loading && <p style={{ textAlign: "center", color: "#8a8a93" }}>Scoring your CSV, this can take a minute on first request...</p>}

      <form onSubmit={scoreOne} style={{ background: "#f7f7f8", color: "#111", borderRadius: 12, padding: 18, marginBottom: 24 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Score a single booking</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input style={input} type="number" min="0" placeholder="Age" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          <input style={input} type="number" min="0" placeholder="Lead days" required value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })} />
          {[["scholarship", "Scholarship"], ["hipertension", "Hypertension"], ["diabetes", "Diabetes"], ["sms", "SMS received"]].map(([k, label]) => (
            <label key={k} style={{ fontSize: 14 }}>
              <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {label}
            </label>
          ))}
          <button style={btn} disabled={scoring} type="submit">{scoring ? "Scoring..." : "Predict risk"}</button>
        </div>
        {single && (
          <div style={{ marginTop: 14, borderTop: "1px solid #e2e2e6", paddingTop: 12 }}>
            <span style={{ background: badge(single.riskScore).bg, color: badge(single.riskScore).fg, padding: "4px 12px", borderRadius: 999, fontWeight: 700 }}>
              {Math.round(single.riskScore * 100)}% no-show risk
            </span>
            <span style={{ marginLeft: 12, color: "#555" }}>{(single.reasons || []).join(", ")}</span>
            <p style={{ margin: "10px 0 0" }}>{single.reminderMessage}</p>
            <Actions text={single.reminderMessage} i="single" />
          </div>
        )}
      </form>

      <div style={{ background: "#fff", color: "#111", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f7f7f8", color: "#777", fontSize: 13 }}>
              {["Age", "Lead days", "Risk", "Key factors", "Reminder message"].map((h) => (
                <th key={h} style={{ padding: 14, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const b = badge(r.riskScore);
              return (
                <tr key={i} style={{ borderTop: "1px solid #eee", textAlign: "center", fontSize: 14 }}>
                  <td style={{ padding: 12 }}>{r.age}</td>
                  <td style={{ padding: 12 }}>{r.leadDays}</td>
                  <td style={{ padding: 12 }}>
                    <span style={{ background: b.bg, color: b.fg, padding: "4px 10px", borderRadius: 999, fontWeight: 700 }}>
                      {Math.round(r.riskScore * 100)}%
                    </span>
                  </td>
                  <td style={{ padding: 12 }}>{(r.reasons || []).join(", ")}</td>
                  <td style={{ padding: 12, lineHeight: 1.6 }}>
                    {r.reminderMessage}
                    <Actions text={r.reminderMessage} i={i} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
