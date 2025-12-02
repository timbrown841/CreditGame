import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ---------- Mongo ---------- */
const mongoUri = process.env.MONGO_URI;
if (!mongoUri || !mongoUri.startsWith("mongodb+srv://")) {
  console.error("❌ Invalid or missing MONGO_URI");
  process.exit(1);
}
await mongoose
  .connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

/* ---------- Schemas ---------- */
const UserSchema = new mongoose.Schema(
  {
    username: { type: String, index: true, unique: true },
    email: String,
    password: String,
    avatar: String,
    coins: { type: Number, default: 0 },
    scores: [{ level: String, score: Number, date: { type: Date, default: Date.now } }],

    ownedItems: { type: [String], default: [] },
    avatarFrame: { type: String, default: "" },
    trailId: { type: String, default: "" },
    themeId: { type: String, default: "" },
    boosterUntil: { type: Number, default: 0 },

    quizMastered: {
      easy:   { type: [String], default: [] },
      medium: { type: [String], default: [] },
      hard:   { type: [String], default: [] },
    },
  },
  { versionKey: false }
);
const User = mongoose.model("User", UserSchema);

const QuestionSchema = new mongoose.Schema(
  {
    qid: { type: String, unique: true, index: true },
    level: { type: String, enum: ["easy", "medium", "hard"], index: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    correct: { type: Number, required: true, min: 0 },
    learnId: { type: String, default: "" },
    tags: { type: [String], index: true, default: [] }, // NEW
    active: { type: Boolean, default: true, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);
const Question = mongoose.model("Question", QuestionSchema);

/* ---------- Utils ---------- */
const norm = (s) => String(s || "").trim();
const ciFind = (model, username) =>
  model.findOne({ username: new RegExp(`^${norm(username)}$`, "i") });

function todayStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function rndInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[rndInt(0, arr.length - 1)]; }
function uniqId(level, idx) { return `${level}-${todayStamp()}-${idx}-${Math.random().toString(16).slice(2, 8)}`; }
function parseTagsParam(param) {
  const arr = String(param || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(arr));
}

/* ---------- Tag vocabulary (for bias) ---------- */
const TAGS = {
  utilisation: "utilisation",
  minpay: "min-payment",
  hardcheck: "hard-check",
  missed: "missed-payment",
  apr: "apr",
  interest: "interest",
  electoral: "electoral-roll",
  overdraft: "overdrafts",
  newaccounts: "new-accounts",
  budgeting: "budget",
  duedate: "due-date",
};

/* ---------- Question generators (tagged) ---------- */
function genUtilisation(level) {
  const limit = level === "easy" ? pick([300, 500, 800, 1000])
              : level === "medium" ? pick([1200, 1500, 1800, 2000])
              : pick([2500, 3000, 3500, 4000]);
  const pct = pick([10, 15, 20, 25, 30, 35, 40]);
  const balance = Math.round((limit * pct) / 100);
  const util = Math.round((balance / limit) * 100);

  const correct = `${util}%`;
  const distractors = Array.from(
    new Set([
      `${Math.max(util - pick([5, 10]), 1)}%`,
      `${Math.min(util + pick([5, 10]), 95)}%`,
      `${pick([5, 50, 60, 75, 90])}%`,
    ])
  );
  const options = [correct, ...distractors].slice(0, 3).sort(() => Math.random() - 0.5);
  return {
    question: `Your card limit is £${limit} and you owe £${balance}. What is your utilisation?`,
    options,
    correct: options.indexOf(correct),
    learnId: "utilisation",
    tags: [TAGS.utilisation],
  };
}

function genMinPayment() {
  const variants = [
    {
      q: "What is a minimum payment on a credit card?",
      opts: ["The smallest amount you must pay each month", "A fee for opening the card", "A bonus for spending"],
      idx: 0,
    },
    {
      q: "If you only pay the minimum each month, what can happen?",
      opts: ["You pay no interest", "You may pay interest on the rest", "Your limit doubles"],
      idx: 1,
    },
  ];
  const v = pick(variants);
  return { question: v.q, options: v.opts, correct: v.idx, learnId: "min-payment", tags: [TAGS.minpay] };
}
function genHardSearch() {
  return {
    question: "A ‘hard search’ is usually recorded when…",
    options: ["You check your own credit report", "A lender checks your report for a new application", "You pay a bill on time"],
    correct: 1, learnId: "hard-check", tags: [TAGS.hardcheck],
  };
}
function genMissedDuration() {
  return {
    question: "How long can a missed payment appear on your UK credit report?",
    options: ["1 month", "6 months", "6 years"],
    correct: 2, learnId: "missed-bills", tags: [TAGS.missed],
  };
}
function genAPR() {
  return {
    question: "APR mainly describes…",
    options: ["The yearly cost of borrowing including interest/fees", "Your monthly salary", "A type of bank account"],
    correct: 0, learnId: "apr", tags: [TAGS.apr],
  };
}
function genPayInFull() {
  return {
    question: "If you pay your credit card balance in full by the due date, you usually pay…",
    options: ["No interest", "Double interest", "Only a late fee"],
    correct: 0, learnId: "interest", tags: [TAGS.interest],
  };
}
function genElectoral() {
  return {
    question: "Why can being on the electoral roll help?",
    options: ["It can help lenders verify your address history", "It raises your salary", "It deletes old debts automatically"],
    correct: 0, learnId: "electoral-roll", tags: [TAGS.electoral],
  };
}
function genOverdraft() {
  return {
    question: "Which is true about overdrafts?",
    options: ["They’re not credit", "They can charge interest or fees", "They always improve your score"],
    correct: 1, learnId: "overdrafts", tags: [TAGS.overdraft],
  };
}
function genNewAccounts() {
  return {
    question: "Opening many credit accounts quickly can…",
    options: ["Look risky to lenders", "Guarantee low interest", "Delete old accounts"],
    correct: 0, learnId: "new-accounts", tags: [TAGS.newaccounts],
  };
}
function genBudgeting() {
  const save = pick([10, 15, 20, 25, 30]);
  return {
    question: `In a simple budget, saving ${save}% each month mainly helps you…`,
    options: ["Build an emergency fund", "Increase your credit limit immediately", "Avoid taxes"],
    correct: 0, learnId: "budget", tags: [TAGS.budgeting],
  };
}
function genDueDate() {
  return {
    question: "What’s a good way to avoid missing payments?",
    options: ["Set up a Direct Debit", "Ignore due dates", "Only pay when contacted"],
    correct: 0, learnId: "due-date", tags: [TAGS.duedate],
  };
}

/* Pool map → choose generator by tag */
const GENERATORS_BY_TAG = {
  [TAGS.utilisation]: genUtilisation,
  [TAGS.minpay]:      genMinPayment,
  [TAGS.hardcheck]:   genHardSearch,
  [TAGS.missed]:      genMissedDuration,
  [TAGS.apr]:         genAPR,
  [TAGS.interest]:    genPayInFull,
  [TAGS.electoral]:   genElectoral,
  [TAGS.overdraft]:   genOverdraft,
  [TAGS.newaccounts]: genNewAccounts,
  [TAGS.budgeting]:   genBudgeting,
  [TAGS.duedate]:     genDueDate,
};

/* Tag-aware generator: biases toward requested tags, else mixes all */
function genLevelQuestion(level, preferredTags = []) {
  const tagPick = preferredTags.length ? pick(preferredTags) : pick(Object.values(TAGS));
  const fn = GENERATORS_BY_TAG[tagPick] || genUtilisation;
  const q = fn(level); // some gens ignore level
  // ensure level-specific for utilisation
  if (fn === genUtilisation) {
    return genUtilisation(level);
  }
  return q;
}

async function generateQuestionsBatch(level, n = 100, preferredTags = []) {
  const docs = [];
  for (let i = 0; i < n; i++) {
    const base = genLevelQuestion(level, preferredTags);
    const qid = uniqId(level, i);
    docs.push({
      qid,
      level,
      question: base.question,
      options: base.options,
      correct: base.correct,
      learnId: base.learnId || "",
      tags: Array.isArray(base.tags) ? base.tags : [],
      active: true,
      createdAt: new Date(),
    });
  }
  try { if (docs.length) await Question.insertMany(docs, { ordered: false }); } catch {}
  return docs.length;
}

/* ---------- Admin auth helper ---------- */
function basicAuthOk(req) {
  const [scheme, token] = String(req.headers.authorization || "").split(" ");
  if (scheme !== "Basic" || !token) return false;
  const [user, pass] = Buffer.from(token, "base64").toString("utf8").split(":");
  return user === (process.env.ADMIN_USERNAME || "admin")
      && pass === (process.env.ADMIN_PASSWORD || "admin123");
}

/* ---------- Core endpoints (register/login/etc.) ---------- */
app.get("/", (_req, res) => res.send("🟢 Credit Quest API is running"));

app.post("/register", async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body || {};
    if (!username || !email || !password) return res.status(400).send("All fields required");
    const exists = await ciFind(User, username);
    if (exists) return res.status(400).send("Username already exists");
    const allowedAvatars = ["blackboy.png","blackgirl.png","latinboy.png","whiteboy.png","whitegirl.png"];
    const finalAvatar = allowedAvatars.includes(avatar) ? avatar : "blackboy.png";
    const hash = await bcrypt.hash(String(password), 10);
    await User.create({ username, email, password: hash, avatar: finalAvatar, coins: 0 });
    res.send("User registered successfully");
  } catch (err) { console.error("Registration error:", err); res.status(500).send("Registration failed"); }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    const match = await bcrypt.compare(String(password), user.password);
    if (!match) return res.status(401).send("Incorrect password");
    res.json({
      username: user.username, email: user.email, avatar: user.avatar,
      coins: user.coins || 0, avatarFrame: user.avatarFrame || "",
      trailId: user.trailId || "", themeId: user.themeId || "",
      boosterUntil: user.boosterUntil || 0,
    });
  } catch (err) { console.error("Login error:", err); res.status(500).send("Login failed"); }
});

app.post("/submit-score", async (req, res) => {
  const { username, score, level } = req.body || {};
  try {
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    user.scores.push({ score, level });
    await user.save();
    res.send("Score saved");
  } catch (err) { console.error("Score submission error:", err); res.status(500).send("Could not save score"); }
});

app.get("/user-data", async (req, res) => {
  const { username } = req.query || {};
  try {
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    res.json({ coins: user.coins || 0, avatar: user.avatar || "blackboy.png" });
  } catch (err) { console.error("User data fetch error:", err); res.status(500).send("Failed to fetch user data"); }
});

app.post("/reward-coins", async (req, res) => {
  const { username, amount } = req.body || {};
  if (!username || typeof amount !== "number") return res.status(400).send("Username and valid amount are required");
  try {
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    user.coins = (user.coins || 0) + amount;
    await user.save();
    res.json({ message: "Coins updated", newBalance: user.coins });
  } catch (err) { console.error("Reward error:", err); res.status(500).send("Failed to update coins"); }
});

app.get("/results", async (req, res) => {
  const { username } = req.query || {};
  try {
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    res.json(user.scores || []);
  } catch (err) { console.error("Results error:", err); res.status(500).send("Failed to load results"); }
});

/* ---------- Inventory (shop) ---------- */
app.get("/inventory", async (req, res) => {
  try {
    const { username } = req.query;
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    res.json({
      ownedItems: user.ownedItems || [],
      avatarFrame: user.avatarFrame || "",
      trailId: user.trailId || "",
      themeId: user.themeId || "",
      boosterUntil: user.boosterUntil || 0,
      coins: user.coins || 0,
      avatar: user.avatar || "",
    });
  } catch (err) { console.error("Inventory error:", err); res.status(500).send("Failed to load inventory"); }
});

app.post("/inventory/buy", async (req, res) => {
  try {
    const { username, itemId, cost } = req.body || {};
    if (!username || !itemId || !Number.isFinite(cost)) return res.status(400).send("username, itemId and numeric cost are required");
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");

    if (user.ownedItems.includes(itemId)) {
      return res.json({ ok: true, alreadyOwned: true, coins: user.coins, ownedItems: user.ownedItems });
    }
    if ((user.coins || 0) < cost) return res.status(400).send("Not enough coins");

    user.coins = (user.coins || 0) - cost;
    user.ownedItems.push(itemId);
    await user.save();
    res.json({ ok: true, coins: user.coins, ownedItems: user.ownedItems });
  } catch (err) { console.error("Buy error:", err); res.status(500).send("Failed to buy item"); }
});

app.post("/inventory/equip", async (req, res) => {
  try {
    const { username, itemId, type, value } = req.body || {};
    if (!username || !itemId || !type) return res.status(400).send("username, itemId, type required");
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");

    if (type === "frame") user.avatarFrame = itemId;
    else if (type === "trail") user.trailId = itemId;
    else if (type === "bg") user.themeId = itemId;
    else if (type === "avatar") {
      if (!value) return res.status(400).send("avatar 'value' required");
      user.avatar = value;
    } else if (type === "powerup") {
      return res.status(400).send("powerup cannot be equipped");
    }
    await user.save();
    res.json({ ok: true, avatar: user.avatar, avatarFrame: user.avatarFrame, trailId: user.trailId, themeId: user.themeId });
  } catch (err) { console.error("Equip error:", err); res.status(500).send("Failed to equip item"); }
});

app.post("/inventory/activate-powerup", async (req, res) => {
  try {
    const { username, minutes } = req.body || {};
    if (!username || !Number.isFinite(minutes)) return res.status(400).send("username and minutes required");
    const user = await ciFind(User, username);
    if (!user) return res.status(404).send("User not found");
    const now = Date.now();
    user.boosterUntil = Math.max(now, user.boosterUntil || 0) + minutes * 60 * 1000;
    await user.save();
    res.json({ ok: true, boosterUntil: user.boosterUntil });
  } catch (err) { console.error("Activate powerup error:", err); res.status(500).send("Failed to activate powerup"); }
});

/* ---------- QUIZ with TAG FILTER + AUTO-GEN ---------- */
async function ensureFreshQuestions(level, n = 100, preferredTags = []) {
  await generateQuestionsBatch(level, n, preferredTags);
}

app.get("/quiz/next", async (req, res) => {
  try {
    const username = norm(req.query.username);
    const level = String(req.query.level || "").toLowerCase();
    const count = Math.min(10, Math.max(1, Number(req.query.count || 2)));
    const tags = parseTagsParam(req.query.tags); // e.g., "utilisation,apr"
    if (!username || !["easy", "medium", "hard"].includes(level)) {
      return res.status(400).json({ error: "bad_params" });
    }
    const user = await ciFind(User, username);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const mastered = user.quizMastered?.[level] || [];
    const tagFilter = tags.length ? { tags: { $in: tags } } : {};

    let qs = await Question.find({
      level, active: true, qid: { $nin: mastered }, ...tagFilter
    }).sort({ createdAt: 1, _id: 1 }).limit(count).lean();

    if (!qs.length) {
      await ensureFreshQuestions(level, 100, tags);
      qs = await Question.find({
        level, active: true, qid: { $nin: mastered }, ...tagFilter
      }).sort({ createdAt: 1, _id: 1 }).limit(count).lean();
    }

    const out = qs.map((q) => ({
      id: q.qid, question: q.question, options: q.options, correct: q.correct, learnId: q.learnId || "", tags: q.tags || []
    }));

    res.json({ level, count: out.length, exhausted: out.length === 0, questions: out });
  } catch (e) {
    console.error("quiz/next error", e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/quiz/complete", async (req, res) => {
  try {
    const { username, level, questionIds, perfect } = req.body || {};
    if (!username || !["easy", "medium", "hard"].includes(String(level))) {
      return res.status(400).json({ error: "bad_params" });
    }
    const user = await ciFind(User, username);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    if (perfect && Array.isArray(questionIds) && questionIds.length) {
      const ids = [...new Set(questionIds.map(String))];
      await User.updateOne({ _id: user._id }, { $addToSet: { [`quizMastered.${level}`]: { $each: ids } } });
    }
    const updated = await ciFind(User, username);
    const masteredCount = (updated.quizMastered?.[level] || []).length;
    res.json({ ok: true, masteredCount });
  } catch (e) {
    console.error("quiz/complete error", e);
    res.status(500).json({ error: "server_error" });
  }
});

/* ---------- QUIZ STATS (NEW) ---------- */
app.get("/quiz/stats", async (req, res) => {
  try {
    const username = norm(req.query.username);
    if (!username) return res.status(400).json({ error: "username required" });
    const user = await ciFind(User, username);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const levels = ["easy", "medium", "hard"];
    const results = {};
    for (const lv of levels) {
      const mastered = user.quizMastered?.[lv] || [];
      const totalActive = await Question.countDocuments({ level: lv, active: true });
      const unseen = Math.max(0, totalActive - mastered.length);

      // per-tag counts among active questions
      const tagAgg = await Question.aggregate([
        { $match: { level: lv, active: true } },
        { $unwind: "$tags" },
        { $group: { _id: "$tags", count: { $sum: 1 } } },
        { $project: { _id: 0, tag: "$_id", count: 1 } },
        { $sort: { count: -1 } },
      ]);

      results[lv] = {
        mastered: mastered.length,
        totalActive,
        unseen,
        tags: tagAgg, // [{ tag, count }]
      };
    }

    res.json({ username: user.username, stats: results });
  } catch (e) {
    console.error("quiz/stats error", e);
    res.status(500).json({ error: "server_error" });
  }
});

/* ---------- Admin helpers ---------- */
app.get("/admin/questions", async (req, res) => {
  if (!basicAuthOk(req)) return res.status(401).send("Auth required");
  const where = {};
  const level = String(req.query.level || "").toLowerCase();
  if (["easy","medium","hard"].includes(level)) where.level = level;
  const tag = norm(req.query.tag || "").toLowerCase();
  if (tag) where.tags = tag;
  const rows = await Question.find(where).sort({ createdAt: 1 }).lean();
  res.json(rows);
});

app.post("/admin/questions/generate", async (req, res) => {
  if (!basicAuthOk(req)) return res.status(401).send("Auth required");
  const { level, n, tags } = req.body || {};
  if (!["easy", "medium", "hard"].includes(level)) return res.status(400).send("level required: easy|medium|hard");
  const count = Math.min(500, Math.max(1, Number(n || 100)));
  const pref = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];
  const made = await generateQuestionsBatch(level, count, pref);
  res.json({ ok: true, made });
});

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
