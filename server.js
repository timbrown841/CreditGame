// File: server.js
// Node 18+ with "type":"module" in package.json

import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || undefined;

// ---------- Middleware ----------
app.set("trust proxy", 1); // behind Render/proxies

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: "1mb" }));

// CORS allowlist via env: CORS_ALLOW_ORIGINS="https://creditquest.co.uk,https://www.creditquest.co.uk"
const allow = (process.env.CORS_ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: allow.length ? allow : true, credentials: false }));

// Basic rate limits
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50 });
const coinsLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });
const dailyLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });

app.use("/login", authLimiter);
app.use("/register", authLimiter);
app.use("/reward-coins", coinsLimiter);
app.use("/daily", dailyLimiter);

// Helpers
const normName = (s) => String(s || "").toLowerCase().trim();
const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));

// ---------- Mongo ----------
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is not set");
  process.exit(1);
}

await mongoose
  .connect(MONGO_URI, { dbName: MONGO_DB })
  .then(() => console.log("✅ Mongo connected"))
  .catch((err) => {
    console.error("❌ Mongo connection error:", err);
    process.exit(1);
  });

// ---------- Schemas & Models ----------
const UserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    password: { type: String, required: true }, // bcrypt hash
    avatar: { type: String, default: "" },
    coins: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
  },
  { versionKey: false }
);
UserSchema.index({ username: 1 }, { unique: true });

const User = mongoose.model("User", UserSchema);

// Daily completion: one record per user per day
const DailyCompletionSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, index: true, lowercase: true, trim: true },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    correct: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    reward: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
DailyCompletionSchema.index({ username: 1, date: 1 }, { unique: true });

const DailyCompletion = mongoose.model("DailyCompletion", DailyCompletionSchema);

// Ensure indexes are in sync
await Promise.all([User.syncIndexes(), DailyCompletion.syncIndexes()])
  .then(() => console.log("✅ Indexes in sync"))
  .catch((e) => console.error("Index sync error:", e));

// ---------- Routes ----------

// Health / readiness probes
app.get("/", (_req, res) => res.send("🟢 Credit Quest API is running"));
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body || {};
    const uname = normName(username);
    if (!uname || !email || !password || !avatar) return res.status(400).send("Missing fields");

    const exists = await User.findOne({ username: uname }).lean();
    if (exists) return res.status(409).send("Username already exists");

    const hash = await bcrypt.hash(String(password), 12);
    await User.create({
      username: uname,
      email: String(email).toLowerCase().trim(),
      password: hash,
      avatar,
      coins: 0,
    });
    res.status(201).send("Registered");
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).send("Failed to register");
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const uname = normName(username);
    if (!uname || !password) return res.status(400).send("Missing credentials");

    const user = await User.findOne({ username: uname });
    if (!user) return res.status(401).send("Invalid username or password");

    const ok = await bcrypt.compare(String(password), user.password);
    if (!ok) return res.status(401).send("Invalid username or password");

    user.lastLogin = new Date();
    await user.save();

    res.json({ username: user.username, avatar: user.avatar, coins: user.coins ?? 0 });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

// Get user data
app.get("/user-data", async (req, res) => {
  try {
    const uname = normName(req.query.username);
    if (!uname) return res.status(400).send("username required");
    const user = await User.findOne({ username: uname }).lean();
    if (!user) return res.status(404).send("User not found");
    res.json({ username: user.username, avatar: user.avatar, coins: user.coins ?? 0, lastLogin: user.lastLogin });
  } catch (err) {
    console.error("user-data error:", err);
    res.status(500).send("Failed to fetch user data");
  }
});

// Reward coins (+/- allowed; e.g., cosmetics spend)
app.post("/reward-coins", async (req, res) => {
  try {
    const { username, amount } = req.body || {};
    const uname = normName(username);
    const inc = Number(amount);
    if (!uname || !Number.isFinite(inc)) return res.status(400).send("username and numeric amount required");

    const user = await User.findOneAndUpdate({ username: uname }, { $inc: { coins: inc } }, { new: true });
    if (!user) return res.status(404).send("User not found");

    res.json({ coins: user.coins ?? 0 });
  } catch (err) {
    console.error("reward-coins error:", err);
    res.status(500).send("Failed to update coins");
  }
});

// ---- Daily Challenge ----

// Daily status
app.get("/daily/status", async (req, res) => {
  try {
    const username = normName(req.query.username);
    const date = String(req.query.date || "").trim();
    if (!username || !date || !isYMD(date)) {
      return res.status(400).json({ error: "username and date (YYYY-MM-DD) are required" });
    }
    const exists = await DailyCompletion.exists({ username, date });
    res.json({ done: !!exists });
  } catch (err) {
    console.error("daily/status error:", err);
    res.status(500).json({ error: "status_failed" });
  }
});

// Daily complete (award once per user/day)
app.post("/daily/complete", async (req, res) => {
  const { username, date, correct, total, reward } = req.body || {};
  const uname = normName(username);
  const ymd = String(date || "").trim();
  const corr = Number(correct || 0);
  const tot = Number(total || 0);
  const rew = Math.max(0, Number(reward || 0));

  if (!uname || !ymd || !isYMD(ymd)) {
    return res.status(400).json({ error: "username and valid date are required" });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const result = await DailyCompletion.findOneAndUpdate(
        { username: uname, date: ymd },
        { $setOnInsert: { username: uname, date: ymd, correct: corr, total: tot, reward: rew } },
        { new: true, upsert: true, session, rawResult: true }
      );

      const alreadyExisted = result?.lastErrorObject?.updatedExisting === true;
      if (alreadyExisted) {
        const user = await User.findOne({ username: uname }).session(session).lean();
        return res.json({ done: true, awarded: false, coins: user?.coins ?? 0 });
      }

      const user = await User.findOneAndUpdate(
        { username: uname },
        { $inc: { coins: rew } },
        { new: true, session }
      );

      return res.json({ done: true, awarded: true, coins: user?.coins ?? 0 });
    });
  } catch (err) {
    // Fallback path where transactions are unavailable
    if (String(err?.message || "").includes("Transaction numbers are only allowed")) {
      try {
        const result = await DailyCompletion.findOneAndUpdate(
          { username: uname, date: ymd },
          { $setOnInsert: { username: uname, date: ymd, correct: corr, total: tot, reward: rew } },
          { new: true, upsert: true, rawResult: true }
        );
        const alreadyExisted = result?.lastErrorObject?.updatedExisting === true;
        if (alreadyExisted) {
          const user = await User.findOne({ username: uname }).lean();
          return res.json({ done: true, awarded: false, coins: user?.coins ?? 0 });
        }
        const user = await User.findOneAndUpdate(
          { username: uname },
          { $inc: { coins: rew } },
          { new: true }
        );
        return res.json({ done: true, awarded: true, coins: user?.coins ?? 0 });
      } catch (e2) {
        if (e2 && e2.code === 11000) {
          const user = await User.findOne({ username: uname }).lean();
          return res.json({ done: true, awarded: false, coins: user?.coins ?? 0 });
        }
        console.error("daily/complete fallback error:", e2);
        return res.status(500).json({ error: "complete_failed" });
      }
    }

    if (err && err.code === 11000) {
      try {
        const user = await User.findOne({ username: uname }).lean();
        return res.json({ done: true, awarded: false, coins: user?.coins ?? 0 });
      } catch {}
    }
    console.error("daily/complete error:", err);
    res.status(500).json({ error: "complete_failed" });
  } finally {
    session.endSession();
  }
});

// ---------- Optional: Admin reset (coins & daily records) ----------
app.post("/admin/reset", async (req, res) => {
  try {
    const auth = String(req.headers.authorization || "");
    const [scheme, token] = auth.split(" ");
    if (scheme !== "Basic" || !token) return res.status(401).send("Auth required");
    const [user, pass] = Buffer.from(token, "base64").toString("utf8").split(":");
    if (user !== (process.env.ADMIN_USERNAME || "") || pass !== (process.env.ADMIN_PASSWORD || "")) {
      return res.status(403).send("Forbidden");
    }

    const what = String(req.query.what || "coins"); // coins|daily|all
    if (what === "coins" || what === "all") {
      await User.updateMany({}, { $set: { coins: 0 } });
    }
    if (what === "daily" || what === "all") {
      await DailyCompletion.deleteMany({});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Admin reset error:", err);
    res.status(500).send("Failed to reset");
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
