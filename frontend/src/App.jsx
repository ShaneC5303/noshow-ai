import { useEffect, useState } from "react";

export default function App() {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    fetch("http://localhost:4000/api/bookings")
      .then((r) => r.json())
      .then(setBookings);
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>No-Show Risk Dashboard</h1>
      <table border="1" cellPadding="8">
        <thead>
          <tr><th>Age</th><th>Lead Days</th><th>Risk</th><th>Why</th><th>Reminder</th></tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b.id}>
              <td>{b.age}</td>
              <td>{b.leadDays}</td>
              <td>{(b.riskScore * 100).toFixed(0)}%</td>
              <td>{b.reasons.join(", ")}</td>
              <td>{b.reminderMessage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
