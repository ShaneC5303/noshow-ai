import { useEffect, useState } from "react";

const riskStyle = (score) => {
  if (score >= 0.7) return { bg: "#fdecea", text: "#b3261e" };
  if (score >= 0.4) return { bg: "#fef3e0", text: "#a15c00" };
  return { bg: "#e8f5e9", text: "#1b7a2c" };
};

function StatCard({ label, value, accent }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statLabel}>{label}</p>
      <p style={{ ...styles.statValue, color: accent || "#1a1a1a" }}>{value}</p>
    </div>
  );
}

export default function App() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [source, setSource] = useState("demo");

  const loadDemo = () => {
    setSource("demo");
    setLoading(true);
    setError(null);
    fetch("https://noshow-ai.onrender.com/api/bookings")
      .then((r) => r.json())
      .then((data) => { setBookings(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  };

  useEffect(loadDemo, []);

  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);

    fetch("https://noshow-ai-api.onrender.com/predict", { method: "POST", body: formData })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setBookings(data);
          setSource("upload");
        }
        setUploading(false);
      })
      .catch((err) => { setError(err.message); setUploading(false); });
  };

  const highRisk = bookings.filter((b) => b.riskScore >= 0.7).length;
  const avgRisk = bookings.length
    ? Math.round((bookings.reduce((s, b) => s + b.riskScore, 0) / bookings.length) * 100)
    : 0;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>No-show risk dashboard</h1>
          <p style={styles.subtitle}>Predicting and preventing appointment no-shows with AI</p>
        </div>
        <div style={styles.uploadBox}>
          <label style={styles.uploadLabel}>
            {uploading ? "Analyzing... (cold start can take ~50s)" : "Upload a CSV"}
            <input type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} disabled={uploading} />
          </label>
          {source === "upload" && (
            <button onClick={loadDemo} style={styles.resetButton}>Back to demo data</button>
          )}
        </div>
      </div>

      <div style={styles.statsRow}>
        <StatCard label="Bookings tracked" value={bookings.length} />
        <StatCard label="High risk" value={highRisk} accent="#b3261e" />
        <StatCard label="Avg. risk score" value={`${avgRisk}%`} />
        <StatCard label="Reminders sent" value={bookings.length} accent="#1b7a2c" />
      </div>

      {loading && <p style={styles.status}>Loading bookings...</p>}
      {uploading && <p style={styles.status}>Scoring your CSV, this can take a minute on first request...</p>}
      {error && <p style={{ ...styles.status, color: "#b3261e" }}>{error}</p>}

      {!loading && !error && (
        <div style={styles.card}>
          <div style={{ ...styles.row, ...styles.headRow }}>
            <div style={styles.colSm}>Age</div>
            <div style={styles.colSm}>Lead days</div>
            <div style={styles.colSm}>Risk</div>
            <div style={styles.colMd}>Key factors</div>
            <div style={styles.colLg}>Reminder message</div>
          </div>

          {bookings.map((b, i) => {
            const rs = riskStyle(b.riskScore);
            return (
              <div key={b.id} style={{ ...styles.row, borderBottom: i === bookings.length - 1 ? "none" : "1px solid #eee" }}>
                <div style={styles.colSm}>{b.age}</div>
                <div style={styles.colSm}>{b.leadDays}</div>
                <div style={styles.colSm}>
                  <span style={{ ...styles.badge, background: rs.bg, color: rs.text }}>
                    {Math.round(b.riskScore * 100)}%
                  </span>
                </div>
                <div style={{ ...styles.colMd, color: "#555" }}>{b.reasons.join(", ")}</div>
                <div style={{ ...styles.colLg, color: "#555" }}>{b.reminderMessage}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif", maxWidth: 1100, margin: "0 auto", padding: "32px 24px", color: "#1a1a1a" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
  title: { fontSize: 24, fontWeight: 600, margin: "0 0 4px" },
  subtitle: { fontSize: 14, color: "#666", margin: 0 },
  uploadBox: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 },
  uploadLabel: { cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "8px 14px", border: "1px solid #ccc", borderRadius: 8, background: "#f7f7f8" },
  resetButton: { fontSize: 12, color: "#666", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 },
  statCard: { background: "#f7f7f8", borderRadius: 10, padding: "16px" },
  statLabel: { fontSize: 13, color: "#666", margin: "0 0 4px" },
  statValue: { fontSize: 24, fontWeight: 600, margin: 0 },
  status: { fontSize: 14, color: "#666" },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: 12, overflow: "hidden" },
  row: { display: "grid", gridTemplateColumns: "0.6fr 0.8fr 0.6fr 1.4fr 2.4fr", padding: "12px 16px", fontSize: 13, alignItems: "center", gap: 8 },
  headRow: { fontSize: 12, color: "#999", borderBottom: "1px solid #eee", background: "#fafafa" },
  colSm: {}, colMd: {}, colLg: {},
  badge: { fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, display: "inline-block" },
};
