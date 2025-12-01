import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const mongoUri = process.env.MONGO_URI;
if (!mongoUri || !mongoUri.startsWith("mongodb+srv://")) {
  console.error("❌ Invalid or missing MONGO_URI");
  process.exit(1);
}

mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => { console.error("❌ MongoDB connection error:", err); process.exit(1); });

// ---------- Schema ----------
const userSchema = new mongoose.Schema({
  username: { type: String, index: true },
  email: String,
  password: String,
  avatar: String,
  coins: { type: Number, default: 0 },
  // quiz results (existing)
  scores: [{
    level: String,
    score: Number,
    date: { type: Date, default: Date.now }
  }],

  // SHOP persistence (NEW)
  ownedItems: { type: [String], default: [] },     // e.g. ["frame-gold","bg-space","av-owl",...]
  avatarFrame: { type: String, default: "" },       // current frame id
  trailId:     { type: String, default: "" },       // current trail id
  themeId:     { type: String, default: "" },       // current background theme id
  boosterUntil:{ type: Number, default: 0 }         // epoch ms
});
userSchema.index({ username: 1 }, { unique: true });

const User = mongoose.model("User", userSchema);

// ---------- Helpers ----------
const findUserCI = (username) =>
  User.findOne({ username: new RegExp(`^${String(username)}$`, 'i') });

const itemTypeFromId = (itemId) => {
  if (itemId.startsWith("frame-")) return "frame";
  if (itemId.startsWith("trail-")) return "trail";
  if (itemId.startsWith("bg-"))    return "bg";
  if (itemId.startsWith("av-"))    return "avatar";
  if (itemId.startsWith("boost-")) return "powerup";
  return "unknown";
};

// ---------- Routes ----------

// Health
app.get("/", (_req, res) => res.send("🟢 Credit Score Game API is running"));

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;
    if (!username || !email || !password) return res.status(400).send("All fields required");

    const exists = await findUserCI(username);
    if (exists) return res.status(400).send("Username already exists");

    const hash = await bcrypt.hash(password, 10);

    const allowedAvatars = ["blackboy.png","blackgirl.png","latinboy.png","whiteboy.png","whitegirl.png"];
    const finalAvatar = allowedAvatars.includes(avatar) ? avatar : "blackboy.png";

    await User.create({
      username, email, password: hash, avatar: finalAvatar, coins: 0
    });

    res.send("User registered successfully");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Registration failed");
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(String(password), user.password);
    if (!match) return res.status(401).send("Incorrect password");

    res.json({
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      coins: user.coins || 0,
      // convenience: include equipped here too
      avatarFrame: user.avatarFrame || "",
      trailId: user.trailId || "",
      themeId: user.themeId || "",
      boosterUntil: user.boosterUntil || 0
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

// Submit score
app.post("/submit-score", async (req, res) => {
  const { username, score, level } = req.body;
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    user.scores.push({ score, level });
    await user.save();
    res.send("Score saved");
  } catch (err) {
    console.error("Score submission error:", err);
    res.status(500).send("Could not save score");
  }
});

// Get user/avatar/coins (legacy)
app.get("/user-data", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    res.json({
      coins: user.coins || 0,
      avatar: user.avatar || "blackboy.png"
    });
  } catch (err) {
    console.error("User data fetch error:", err);
    res.status(500).send("Failed to fetch user data");
  }
});

// Reward coins (+/-)
app.post("/reward-coins", async (req, res) => {
  const { username, amount } = req.body;
  if (!username || typeof amount !== "number") {
    return res.status(400).send("Username and valid amount are required");
  }
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    user.coins = (user.coins || 0) + amount;
    await user.save();
    res.json({ message: "Coins updated", newBalance: user.coins });
  } catch (err) {
    console.error("Reward error:", err);
    res.status(500).send("Failed to update coins");
  }
});

// Results (legacy)
app.get("/results", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    res.json(user.scores || []);
  } catch (err) {
    console.error("Results error:", err);
    res.status(500).send("Failed to load results");
  }
});

// ----- SHOP PERSISTENCE (NEW) -----

// Get inventory + equipped
app.get("/inventory", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    res.json({
      ownedItems: user.ownedItems || [],
      avatarFrame: user.avatarFrame || "",
      trailId: user.trailId || "",
      themeId: user.themeId || "",
      boosterUntil: user.boosterUntil || 0,
      coins: user.coins || 0,
      avatar: user.avatar || ""
    });
  } catch (err) {
    console.error("Inventory error:", err);
    res.status(500).send("Failed to load inventory");
  }
});

// Buy: atomically check coins, deduct, add item
app.post("/inventory/buy", async (req, res) => {
  try {
    const { username, itemId, cost } = req.body || {};
    if (!username || !itemId || !Number.isFinite(cost)) {
      return res.status(400).send("username, itemId and numeric cost are required");
    }

    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");

    if (user.ownedItems.includes(itemId)) {
      return res.json({ ok: true, alreadyOwned: true, coins: user.coins, ownedItems: user.ownedItems });
    }

    if ((user.coins || 0) < cost) {
      return res.status(400).send("Not enough coins");
    }

    user.coins = (user.coins || 0) - cost;
    user.ownedItems.push(itemId);
    await user.save();

    res.json({ ok: true, coins: user.coins, ownedItems: user.ownedItems });
  } catch (err) {
    console.error("Buy error:", err);
    res.status(500).send("Failed to buy item");
  }
});

// Equip: set current selection (and avatar when type=avatar)
app.post("/inventory/equip", async (req, res) => {
  try {
    const { username, itemId, type, value } = req.body || {};
    if (!username || !itemId || !type) return res.status(400).send("username, itemId, type required");

    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");

    const inferred = itemTypeFromId(itemId);
    const t = type || inferred;

    if (t === "frame")      user.avatarFrame = itemId;
    else if (t === "trail") user.trailId = itemId;
    else if (t === "bg")    user.themeId = itemId;
    else if (t === "avatar") {
      // 'value' should be the avatar filename, e.g. "robot.png"
      if (!value) return res.status(400).send("avatar 'value' (filename) required");
      user.avatar = value;
    } else if (t === "powerup") {
      // Not equippable here; activation would set boosterUntil
      return res.status(400).send("powerup cannot be equipped");
    }

    await user.save();
    res.json({
      ok: true,
      avatar: user.avatar,
      avatarFrame: user.avatarFrame, trailId: user.trailId, themeId: user.themeId
    });
  } catch (err) {
    console.error("Equip error:", err);
    res.status(500).send("Failed to equip item");
  }
});

// Optionally activate a powerup on the server (keeps time across devices)
app.post("/inventory/activate-powerup", async (req, res) => {
  try {
    const { username, minutes, multiplier } = req.body || {};
    if (!username || !Number.isFinite(minutes)) return res.status(400).send("username and minutes required");
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");

    const now = Date.now();
    const ext = Math.max(user.boosterUntil || 0, now) + minutes * 60 * 1000;
    user.boosterUntil = ext; // extend or set
    await user.save();
    res.json({ ok: true, boosterUntil: user.boosterUntil });
  } catch (err) {
    console.error("Activate powerup error:", err);
    res.status(500).send("Failed to activate powerup");
  }
});

// ----- Admin (unchanged minimal) -----
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) res.send("Admin login successful");
  else res.status(401).send("Invalid admin credentials");
});

app.get("/admin/all-results", async (_req, res) => {
  try {
    const users = await User.find({}, 'username scores');
    res.json(users);
  } catch (err) {
    console.error("Admin results error:", err);
    res.status(500).send("Failed to load all results");
  }
});

app.post("/admin/reset-scores", async (req, res) => {
  const { username } = req.body;
  try {
    const user = await findUserCI(username);
    if (!user) return res.status(404).send("User not found");
    user.scores = [];
    await user.save();
    res.send(`✅ Scores for ${user.username} have been reset.`);
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).send("Failed to reset scores");
  }
});

// Start
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
