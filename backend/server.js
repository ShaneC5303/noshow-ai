const express = require("express");
const cors = require("cors");
const fs = require("fs");
const app = express();
app.use(cors());

app.get("/api/bookings", (req, res) => {
  const data = JSON.parse(fs.readFileSync("./bookings.json", "utf-8"));
  res.json(data);
});

app.listen(4000, () => console.log("API running on http://localhost:4000"));
