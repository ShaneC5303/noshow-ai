import { useEffect, useRef, useState } from "react";

const DEMO_URL = "https://noshow-ai.onrender.com/api/bookings";
const API = "https://noshow-ai-api.onrender.com";

const card = { background: "#f7f7f8", borderRadius: 12, padding: "18px 12px", textAlign: "center", color: "#111" };
const panel = { background: "#f7f7f8", color: "#111", borderRadius: 12, padding: 18, marginBottom: 24 };
const btn = { background: "#fff", color: "#111", border: "1px solid #d0d0d5", borderRadius: 8, padding: "9px 14px", fontWeight: 600, cursor: "pointer", fontSize: 14 };
const input = { padding: "9px 10px", borderRadius: 8, border: "1px solid #d0d0d5", width: 110, fontSize: 14, color: "#111", background: "#fff" };
const lbl = { display: "flex", flexDirection: "column", fontSize: 12, color: "#555", gap: 4 };

function badge(r) {
  const level = r.level || (r.riskScore >= 0.7 ? "high" : r.riskScore >= 0.4 ? "medium" : "low");
  if (level === "high") return { bg: "#fdecea", fg: "#b3261e" };
  if (level === "medium") return { bg: "#fff4e0", fg: "#a35b00" };
  return { bg: "#e6f4ea", fg: "#1e7a34" };
}

function describe(r) {
  if (r.details) return r.details;
  if (r.age !== undefined) return `Age ${r.age} · booked ${r.leadDays} days ahead`;
  return "";
}

function downloadCsv(rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["rank", "booking", "riskScore", "keyFactors", "reminderMessage"];
  const lines = rows.map((r, i) =>
    [i + 1, describe(r), r.riskScore, (r.reasons || []).join("; "), r.reminderMessage].map(esc).join(",")
  );
  const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "noshow_risk_results.csv";
  a.click();
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState("demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);
  const [pending, setPending] = useState(null);
  const [picked, setPicked] = useState("");
  const [form, setForm] = useState({ age: "", leadDays: "", scholarship: false, hipertension: false, diabetes: false, sms: false });
  const [single, setSingle] = useState(null);
  const [scoring, setScoring] = useState(false);
  const fileRef = useRef(null);

  const loadDemo = () => {
    setMode("demo");
    setInfo(null);
    setPending(null);
    setError("");
    fetch(DEMO_URL).then((r) => r.json()).then(setRows).catch(() => setError("Could not load demo data."));
  };
  useEffect(loadDemo, []);

  const send = async (file, target) => {
    setLoading(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (target) fd.append("target", target);
      const res = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.needs_target) {
        const first = (data.candidates && data.candidates[0]) || data.columns[0];
        setPending({ file, candidates: data.candidates || [], columns: data.columns });
        setPicked(first);
      } else {
        setPending(null);
        setRows(data.results);
        setInfo(data.mode === "trained" ? data : null);
        setMode("upload");
      }
    } catch (err) {
      setError(err.message || "Upload failed");
    }
    setLoading(false);
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) send(file, null);
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

  const s = info && info.summary;
  const scored = s ? s.scored : rows.length;
  const high = s ? s.highRisk : rows.filter((r) => r.riskScore >= 0.7).length;
  const avg = s ? Math.round(s.avgRisk * 100) : rows.length ? Math.round((rows.reduce((a, r) => a + r.riskScore, 0) / rows.length) * 100) : 0;
  const ready = rows.filter((r) => r.reminderMessage).length;

  const Actions = ({ text, i }) =>
    text ? (
      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
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
          <input ref={fileRef} type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
          <button style={btn} disabled={loading} onClick={() => fileRef.current.click()}>
            {loading ? "Analyzing... (can take ~50s on first use)" : "Upload a CSV"}
          </button>
          {rows.length > 0 && <button style={btn} onClick={() => downloadCsv(rows)}>Download results</button>}
          {mode === "upload" && <button style={btn} onClick={loadDemo}>Back to demo data</button>}
        </div>
      </div>

      <p style={{ color: "#8a8a93", fontSize: 13, margin: "14px 0 0" }}>
        Upload any CSV that has a no-show column (for example Yes/No or 1/0). The app trains a model on your file, then scores and explains it.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, margin: "20px 0" }}>
        <div style={card}><div style={{ color: "#555" }}>Bookings scored</div><div style={{ fontSize: 32, fontWeight: 600 }}>{scored.toLocaleString()}</div></div>
        <div style={card}><div style={{ color: "#555" }}>{info ? "High risk (top 10%)" : "High risk (70%+)"}</div><div style={{ fontSize: 32, fontWeight: 600, color: "#b3261e" }}>{high.toLocaleString()}</div></div>
        <div style={card}><div style={{ color: "#555" }}>Avg. risk score</div><div style={{ fontSize: 32, fontWeight: 600 }}>{avg}%</div></div>
        <div style={card}><div style={{ color: "#555" }}>Reminders ready</div><div style={{ fontSize: 32, fontWeight: 600, color: "#1e7a34" }}>{ready}</div></div>
      </div>

      {error && <p style={{ color: "#ff8a80", textAlign: "center" }}>{error}</p>}
      {loading && <p style={{ textAlign: "center", color: "#8a8a93" }}>Training on your file and scoring it. This can take up to a minute on the first request...</p>}

      {pending && (
        <div style={panel}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Which column says whether the client was a no-show?</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select value={picked} onChange={(e) => setPicked(e.target.value)} style={{ ...input, width: 240 }}>
              {pending.candidates.length > 0 && (
                <optgroup label="Likely">
                  {pending.candidates.map((c) => <option key={"c" + c} value={c}>{c}</option>)}
                </optgroup>
              )}
              <optgroup label="All columns">
                {pending.columns.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
            </select>
            <button style={btn} disabled={loading} onClick={() => send(pending.file, picked)}>Train &amp; score</button>
            <button style={btn} onClick={() => setPending(null)}>Cancel</button>
          </div>
          <div style={{ fontSize: 12, color: "#666", marginTop: 8 }}>The column must have exactly two values, such as Yes/No or 0/1.</div>
        </div>
      )}

      {info && (
        <div style={panel}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Model trained on your file</div>
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            Label column <b>{info.target}</b> ({info.mapping}) · {info.rowsUsed.toLocaleString()} rows · {(info.noShowRate * 100).toFixed(1)}% no-show rate
            <br />
            Cross-validated ROC-AUC <b>{info.cv.aucMean} ± {info.cv.aucStd}</b> ({info.cv.folds}-fold) · the riskiest 10% contain {info.cv.liftTop10}× the average no-show rate
          </div>
          {info.warnings.map((w, i) => (
            <div key={i} style={{ marginTop: 8, padding: "6px 10px", background: "#fff4e0", color: "#7a4500", borderRadius: 8, fontSize: 13 }}>{w}</div>
          ))}
          {info.dropped.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>Left out automatically: {info.dropped.join("; ")}</div>
          )}
          <div style={{ marginTop: 12, fontSize: 13, color: "#555" }}>What drives no-shows in this file</div>
          {info.topFeatures.map((f) => {
            const max = info.topFeatures[0].importance || 1;
            return (
              <div key={f.feature} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 4 }}>
                <div style={{ width: 190, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.feature}</div>
                <div style={{ height: 10, borderRadius: 5, background: "#4c6ef5", width: `${Math.max(4, (f.importance / max) * 55)}%` }} />
              </div>
            );
          })}
        </div>
      )}

      {mode === "demo" && (
        <form onSubmit={scoreOne} style={panel}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Score a single booking (clinic model)</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={lbl}>Age
              <input style={input} type="number" min="0" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </label>
            <label style={lbl}>Lead days
              <input style={input} type="number" min="0" required value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })} />
            </label>
            {[["scholarship", "Scholarship"], ["hipertension", "Hypertension"], ["diabetes", "Diabetes"], ["sms", "SMS received"]].map(([k, label]) => (
              <label key={k} style={{ fontSize: 14, paddingBottom: 9 }}>
                <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {label}
              </label>
            ))}
            <button style={btn} disabled={scoring} type="submit">{scoring ? "Scoring..." : "Predict risk"}</button>
          </div>
          {single && (
            <div style={{ marginTop: 14, borderTop: "1px solid #e2e2e6", paddingTop: 12 }}>
              <span style={{ background: badge(single).bg, color: badge(single).fg, padding: "4px 12px", borderRadius: 999, fontWeight: 700 }}>
                {Math.round(single.riskScore * 100)}% no-show risk
              </span>
              <span style={{ marginLeft: 12, color: "#555" }}>{(single.reasons || []).join(", ")}</span>
              <p style={{ margin: "10px 0 0" }}>{single.reminderMessage}</p>
              <Actions text={single.reminderMessage} i="single" />
            </div>
          )}
        </form>
      )}

      <div style={{ background: "#fff", color: "#111", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr style={{ background: "#f7f7f8", color: "#777", fontSize: 13 }}>
              {["Booking", "Risk", "Key factors", "Reminder message"].map((h) => (
                <th key={h} style={{ padding: 14, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const b = badge(r);
              return (
                <tr key={i} style={{ borderTop: "1px solid #eee", textAlign: "center", fontSize: 14 }}>
                  <td style={{ padding: 12, maxWidth: 240, fontSize: 13, color: "#444" }}>{describe(r)}</td>
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
