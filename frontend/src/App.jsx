import { useEffect, useRef, useState } from "react";

const DEMO_URL = "https://noshow-ai.onrender.com/api/bookings";
const API = "https://noshow-ai-api.onrender.com";
const STEPS = ["Reading your file", "Training a model on it", "Working out why bookings are risky", "Writing the reminders"];
const SLOTS = [
  { t: "9:00", n: "Asha", s: "Check-up" },
  { t: "9:30", n: "Dev", s: "Follow-up" },
  { t: "10:00", n: "Ravi", s: "Consultation", risk: 86, why: [["Long wait before the visit", "+0.97"], ["Patient age", "+0.50"]],
    msg: "Hi Ravi! It has been almost two months since you booked. Reply C to confirm, or text us if you need a new time." },
  { t: "10:30", n: "Meera", s: "Check-up" },
  { t: "11:00", n: "Kabir", s: "Follow-up" },
  { t: "11:30", n: "Sana", s: "Consultation", risk: 74, why: [["Past no-shows", "+0.88"], ["No SMS reminder sent", "+0.41"]],
    msg: "Hi Sana, a reminder that your visit is tomorrow at 11:30. Reply YES to keep it, or tell us and we will offer the slot to someone else." },
  { t: "12:00", n: "Tara", s: "Check-up" },
];

const NAMES = {
  LeadDays: "Long wait before the visit", lead_days: "Long wait before the visit", Age: "Patient age",
  Scholarship: "Scholarship", Hipertension: "Hypertension", Diabetes: "Diabetes", SMS_received: "SMS reminder sent",
  recency: "Time since last visit", last_cumnoshow: "Past no-shows", last_cumrev: "Past spend",
  last_receipt_tot: "Size of last bill", last_cumbook: "Past bookings", last_cumcancel: "Past cancellations",
};
const pretty = (f) => {
  if (NAMES[f]) return NAMES[f];
  let m = f.match(/^(book|last)_(category|staff|dow|tod)_(.+)$/i);
  if (m) {
    const kind = { category: "service", staff: "staff", dow: "day", tod: "time of day" }[m[2].toLowerCase()];
    const val = m[3].toLowerCase().replace(/^./, (c) => c.toUpperCase());
    return (m[1] === "last" ? "Previous " : "Booked ") + kind + ": " + val;
  }
  m = f.match(/^(.+)_(weekday|month|hour)$/i);
  if (m) return { weekday: "Day of the week", month: "Month of the year", hour: "Time of day" }[m[2].toLowerCase()];
  m = f.match(/^last_cum(.+)$/i);
  if (m) return "Past " + m[1].toLowerCase() + " (total)";
  return f.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
};

const levelOf = (r) => r.level || (r.riskScore >= 0.7 ? "high" : r.riskScore >= 0.4 ? "medium" : "low");

function describe(r) {
  if (r.details) return r.details;
  if (r.age !== undefined) return `Age ${r.age} · booked ${r.leadDays} days ahead`;
  return "";
}
function parts(r) {
  return describe(r).split(" · ").map((p) => { const i = p.indexOf(": "); return i > 0 ? [p.slice(0, i).replace(/_/g, " "), p.slice(i + 2)] : ["", p]; });
}
function bookingText(r) {
  return describe(r).split(" · ").map((p) => { const i = p.indexOf(": "); return i > 0 ? p.slice(i + 2) : p; }).join(" · ");
}
function parseReason(t) {
  const m = t.match(/^(.*?) \(([+-][\d.]+)\)$/);
  return m ? { name: pretty(m[1]), val: m[2] } : { name: t, val: "" };
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

function Pips({ pct, lv }) {
  const n = Math.round(pct / 10);
  return <div className={`pips ${lv}`} aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? "f" : ""} />)}</div>;
}

function Actions({ text, id, copied, onCopy }) {
  if (!text) return null;
  return (
    <div className="acts">
      <button className="btn sm" onClick={() => onCopy(id, text)}>{copied === id ? "Copied" : "Copy"}</button>
      <a className="btn sm" href={`mailto:?subject=${encodeURIComponent("Your appointment reminder")}&body=${encodeURIComponent(text)}`}>Email</a>
    </div>
  );
}

function Entry({ r, rank, id, copied, onCopy }) {
  const lv = levelOf(r);
  const pct = Math.round(r.riskScore * 100);
  return (
    <div className="entry">
      <div className="c c-book" data-label="Booking" title={describe(r)}>
        {rank != null && <span className="rk">{rank}</span>}
        <span className="bk">{parts(r).map(([k, v], i) => <span key={i} className="bp">{k && <small>{k}</small>} {v}</span>)}</span>
      </div>
      <div className="c" data-label="Predict">
        <span className={`pct ${lv}`}>{pct}%</span>
        <Pips pct={pct} lv={lv} />
      </div>
      <div className="c" data-label="Explain">
        <ul className="why">
          {(r.reasons || []).map((t, k) => { const p = parseReason(t); return <li key={k}>{p.name} {p.val && <em>{p.val}</em>}</li>; })}
        </ul>
      </div>
      <div className="c" data-label="Prevent">
        <div className={`bubble ${r.reminderMessage ? "" : "empty"}`}>{r.reminderMessage || "No reminder was generated for this booking."}</div>
        <Actions text={r.reminderMessage} id={id} copied={copied} onCopy={onCopy} />
      </div>
    </div>
  );
}

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="25" height="25" rx="7" fill="#8fe0c0" />
      <rect x="7" y="8" width="14" height="3.2" rx="1.6" fill="#0c2b2a" />
      <rect x="7" y="13" width="14" height="3.2" rx="1.6" fill="#0c2b2a" opacity=".55" />
      <rect x="7" y="18" width="14" height="3.2" rx="1.6" stroke="#0c2b2a" strokeWidth="1.3" strokeDasharray="2.4 2" />
    </svg>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [info, setInfo] = useState(null);
  const [mode, setMode] = useState("demo");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);
  const [pending, setPending] = useState(null);
  const [picked, setPicked] = useState("");
  const [form, setForm] = useState({ age: "", leadDays: "", scholarship: false, hipertension: false, diabetes: false, sms: false });
  const [single, setSingle] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [pick, setPick] = useState(2);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!loading) { setStep(0); return; }
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 5000);
    return () => clearInterval(t);
  }, [loading]);

  const loadDemo = () => {
    setMode("demo");
    setInfo(null);
    setPending(null);
    setError("");
    fetch(DEMO_URL).then((r) => r.json()).then(setRows).catch(() => setError("Could not load the demo bookings. The server may be waking up. Try again in a minute."));
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
        setPending({ file, candidates: data.candidates || [], columns: data.columns });
        setPicked((data.candidates && data.candidates[0]) || data.columns[0]);
      } else {
        setPending(null);
        setRows(data.results);
        setInfo(data.mode === "trained" ? data : null);
        setMode("upload");
        setTimeout(() => { const el = document.getElementById("results"); if (el) el.scrollIntoView({ behavior: "smooth" }); }, 100);
      }
    } catch (err) {
      setError(err.message || "Upload failed. Check the file and try again.");
    }
    setLoading(false);
  };

  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) send(file, null);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
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
          age: Number(form.age), leadDays: Number(form.leadDays),
          scholarship: +form.scholarship, hipertension: +form.hipertension,
          diabetes: +form.diabetes, sms: +form.sms,
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

  const onCopy = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const s = info && info.summary;
  const scored = s ? s.scored : rows.length;
  const high = s ? s.highRisk : rows.filter((r) => r.riskScore >= 0.7).length;
  const avg = s ? Math.round(s.avgRisk * 100) : rows.length ? Math.round((rows.reduce((a, r) => a + r.riskScore, 0) / rows.length) * 100) : 0;
  const ready = rows.filter((r) => r.reminderMessage).length;
  const maxImp = info ? info.topFeatures[0].importance || 1 : 1;
  const totImp = info ? info.topFeatures.reduce((a, f) => a + f.importance, 0) || 1 : 1;
  const sel = SLOTS[pick];

  return (
    <>
      <header className="top">
        <div className="wrap">
          <nav className="nav">
            <div className="mark"><Mark />No-Show AI</div>
            <div className="status"><i />{mode === "demo" ? "Showing demo bookings" : "Showing your file"}</div>
          </nav>

          <section className={`hero ${drag ? "drag" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}>
            <div>
              <h1 className="display">Spot the <span style={{ whiteSpace: "nowrap" }}>no-shows</span> before they happen.</h1>
              <p className="lede">Upload your bookings. We learn who tends to miss, show why each booking is at risk, and write the reminder that gets them to confirm.</p>
              {!loading && (
                <div className="cta">
                  <input ref={fileRef} type="file" accept=".csv" onChange={onFile} style={{ display: "none" }} />
                  <button className="btn solid" onClick={() => fileRef.current.click()}>Upload a CSV</button>
                  {mode === "upload"
                    ? <button className="btn" onClick={loadDemo}>Back to demo bookings</button>
                    : <button className="btn" onClick={() => document.getElementById("results").scrollIntoView({ behavior: "smooth" })}>See the demo</button>}
                </div>
              )}
              {loading && (
                <ul className="prog">
                  {STEPS.map((t, i) => (
                    <li key={t} className={i < step ? "done" : i === step ? "on" : ""}>
                      <span className="ic">{i < step ? "✓" : ""}</span>{t}
                    </li>
                  ))}
                </ul>
              )}
              {!loading && <p className="hint">Drop a file anywhere on this section. Any CSV with a no-show column works (Yes/No or 1/0).</p>}
              {loading && <p className="hint">The first request can take up to a minute while the server wakes up.</p>}
              {error && <div className="err" role="alert">{error}</div>}
            </div>

            <div className="sheet" aria-label="Example schedule with two likely no-shows">
              <div className="sheet-h"><b>Tomorrow's schedule</b><span>2 of 7 likely to be missed</span></div>
              <ul className="slots">
                {SLOTS.map((x, i) => {
                  const d = `${(0.5 + (1.5 * (i + 0.5)) / SLOTS.length).toFixed(2)}s`;
                  return x.risk ? (
                    <li key={x.t}>
                      <button className={`slot ghost ${pick === i ? "sel" : ""}`} style={{ "--i": i, "--d": d }} onClick={() => setPick(i)} aria-pressed={pick === i}>
                        <span className="t">{x.t}</span>
                        <span className="who">{x.n} <small>{x.s}</small></span>
                        <span className="flag">{x.risk}% likely no-show</span>
                      </button>
                    </li>
                  ) : (
                    <li key={x.t} className="slot" style={{ "--i": i }}>
                      <span className="t">{x.t}</span>
                      <span className="who">{x.n} <small>{x.s}</small></span>
                      <span />
                    </li>
                  );
                })}
              </ul>
              {sel && sel.risk && (
                <div className="peek" key={pick}>
                  <ul className="why">{sel.why.map(([n, v]) => <li key={n}>{n} <em>{v}</em></li>)}</ul>
                  <div className="bubble">{sel.msg}</div>
                </div>
              )}
              <p className="sheet-f">Example data. Tap a flagged slot to see why, and the reminder that saves it.</p>
            </div>
          </section>

          <div className="ledger">
            <div className="fig"><div className="n">{scored.toLocaleString()}</div><div className="l">Bookings scored</div></div>
            <div className="fig"><div className="n flag">{high.toLocaleString()}</div><div className="l">{info ? "Flagged as high risk (top 10%)" : "Flagged as high risk (70%+)"}</div></div>
            <div className="fig"><div className="n">{avg}%</div><div className="l">Average no-show risk</div></div>
            <div className="fig"><div className="n">{ready}</div><div className="l">Reminders written</div></div>
          </div>
        </div>
      </header>

      <main className="wrap">
        <section className="how">
          <h2 className="sec">From a booking list to a saved appointment</h2>
          <p className="sec-sub">One upload gives you three things for every risky booking.</p>
          <div className="flow">
            <div className="fl">
              <div className="fl-h"><span className="fl-n">1</span><b>Predict</b></div>
              <p>Learns from your past bookings who tends to miss, and gives every booking a no-show chance.</p>
              <div className="viz"><span className="pct high">86%</span><Pips pct={86} lv="high" /><div className="cap">chance this booking is missed</div></div>
            </div>
            <div className="fl">
              <div className="fl-h"><span className="fl-n">2</span><b>Explain</b></div>
              <p>Shows the reasons behind each score, so your staff can see why and trust it.</p>
              <div className="viz"><ul className="why"><li>Long wait before the visit <em>+0.97</em></li><li>Patient age <em>+0.50</em></li></ul><div className="cap">what pushed the score up</div></div>
            </div>
            <div className="fl">
              <div className="fl-h"><span className="fl-n">3</span><b>Prevent</b></div>
              <p>Writes a short, polite reminder for each risky booking. Copy it or send it by email.</p>
              <div className="viz"><div className="bubble">Hi Ravi! Reply C to confirm your visit, or text us for a new time.</div></div>
            </div>
          </div>
          <div className="proof">
            <div><b>0.72</b><span>ROC-AUC on clinic visits, cross-validated</span></div>
            <div><b>0.67</b><span>ROC-AUC on a hair-salon dataset, same method</span></div>
            <div><b>3.3×</b><span>more no-shows in the riskiest 10% of the salon file than average</span></div>
          </div>
          <p className="out">Scores are estimates that rank who is most at risk. Use them to decide who to remind first, not to turn anyone away.</p>
        </section>

        {pending && (
          <div className="picker">
            <h2 className="sec" style={{ fontSize: 24 }}>Which column says who didn't show up?</h2>
            <p className="sec-sub" style={{ marginBottom: 0 }}>Pick a column with exactly two values, such as Yes/No or 0/1.</p>
            <div className="row">
              <select value={picked} onChange={(e) => setPicked(e.target.value)} style={{ minWidth: 240 }}>
                {pending.candidates.length > 0 && (
                  <optgroup label="Likely">{pending.candidates.map((c) => <option key={"c" + c} value={c}>{c}</option>)}</optgroup>
                )}
                <optgroup label="All columns">{pending.columns.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
              </select>
              <button className="btn solid" disabled={loading} onClick={() => send(pending.file, picked)}>Train and score</button>
              <button className="btn" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </div>
        )}

        {info && (
          <section className="block two">
            <div>
              <h2 className="sec">How well it works on your file</h2>
              <p className="sec-sub">Trained on {info.rowsUsed.toLocaleString()} bookings, where the label column is <b>{info.target}</b> ({info.mapping}).</p>
              <ul className="facts">
                <li>The model ranked a real no-show above a real show <b>{Math.round(info.cv.aucMean * 100)}%</b> of the time (ROC-AUC {info.cv.aucMean} ± {info.cv.aucStd}, {info.cv.folds}-fold cross-validation).</li>
                <li>The riskiest 10% of bookings hold <b>{info.cv.liftTop10}×</b> the average no-show rate of {(info.noShowRate * 100).toFixed(1)}%.</li>
              </ul>
              {info.warnings.map((w, i) => <div className="note" key={i}>{w}</div>)}
              {info.dropped.length > 0 && <p className="out"><b>Left out automatically:</b> {info.dropped.join("; ")}.</p>}
            </div>
            <div>
              <h2 className="sec" style={{ fontSize: 24 }}>What drives no-shows here</h2>
              <p className="sec-sub">Longer bars matter more to the model. Each number is that factor's share of the influence among these top factors.</p>
              {info.topFeatures.map((f) => (
                <div className="drv" key={f.feature}>
                  <span>{pretty(f.feature)}</span>
                  <div className="trk"><i style={{ width: `${Math.max(4, (f.importance / maxImp) * 100)}%` }} /></div>
                  <b className="val">{Math.round((f.importance / totImp) * 100)}%</b>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === "demo" && (
          <form className="try" onSubmit={scoreOne}>
            <h2 className="sec" style={{ fontSize: 24 }}>Try one booking</h2>
            <p className="sec-sub" style={{ marginBottom: 0 }}>Uses the pre-trained clinic model. Try age 12 and 60 days of lead time.</p>
            <div className="row">
              <label className="f">Age
                <input type="number" min="0" required value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </label>
              <label className="f">Days booked ahead
                <input type="number" min="0" required value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })} />
              </label>
              {[["scholarship", "Scholarship"], ["hipertension", "Hypertension"], ["diabetes", "Diabetes"], ["sms", "SMS reminder sent"]].map(([k, label]) => (
                <label className="ck" key={k}>
                  <input type="checkbox" checked={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {label}
                </label>
              ))}
              <button className="btn solid" disabled={scoring} type="submit">{scoring ? "Scoring..." : "Predict risk"}</button>
            </div>
            {single && (
              <div className="out-r">
                <Entry r={{ ...single, details: `Age ${single.age} · booked ${single.leadDays} days ahead` }} rank={null} id="single" copied={copied} onCopy={onCopy} />
              </div>
            )}
          </form>
        )}

        <section id="results" className="block">
          <div className="rhead">
            <div>
              <h2 className="sec">{mode === "demo" ? "Demo bookings" : "Riskiest bookings in your file"}</h2>
              <p className="sec-sub">Ordered from most to least likely to be missed. The percentage is the chance of a no-show.</p>
            </div>
            {rows.length > 0 && <button className="link" onClick={() => downloadCsv(rows)}>Download results as CSV</button>}
          </div>
          <div className="cols" aria-hidden="true">
            <div><b>Booking</b><span>The appointment</span></div>
            <div><b>Predict</b><span>Chance of a no-show</span></div>
            <div><b>Explain</b><span>What drives it</span></div>
            <div><b>Prevent</b><span>Reminder to send</span></div>
          </div>
          {rows.map((r, i) => <Entry key={i} r={r} rank={i + 1} id={i} copied={copied} onCopy={onCopy} />)}
          {rows.length === 0 && !error && <p className="sec-sub" style={{ marginTop: 20 }}>Loading demo bookings...</p>}
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <span>Predicting and preventing appointment no-shows with AI</span>
          <span>Capstone project · Team 33 · KLH University</span>
        </div>
      </footer>
    </>
  );
}
