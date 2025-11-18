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

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("✅ Connected to MongoDB Atlas");
}).catch(err => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

// ======================
// SCHEMA
// ======================
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  avatar: String,
  coins: { type: Number, default: 0 },
  scores: [
    {
      level: String,
      score: Number,
      date: { type: Date, default: Date.now }
    }
  ]
});

const User = mongoose.model("User", userSchema);

// ======================
// REGISTER
// ======================
app.post("/register", async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;

    if (!username || !email || !password)
      return res.status(400).send("All fields required");

    const exists = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (exists) return res.status(400).send("Username already exists");

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      username,
      email,
      password: hash,
      avatar: avatar || "avatar1.png",
      coins: 0
    });

    res.send("User registered successfully");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Registration failed");
  }
});

// ======================
// LOGIN
// ======================
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Incorrect password");

    res.send({
      username: user.username,
      email: user.email,
      avatar: user.avatar || "avatar1.png"
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

// ======================
// GET USER DATA
// ======================
app.get("/user-data", async (req, res) => {
  try {
    const { username } = req.query;
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });

    if (!user) return res.status(404).send("User not found");

    res.send({
      username: user.username,
      avatar: user.avatar,
      coins: user.coins || 0
    });
  } catch (err) {
    console.error("User data fetch error:", err);
    res.status(500).send("Failed to fetch user data");
  }
});

// ======================
// ADD COINS
// ======================
app.post("/add-coins", async (req, res) => {
  try {
    const { username, coins } = req.body;
    if (!username || typeof coins !== 'number')
      return res.status(400).send("Username and coin amount required");

    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    user.coins = (user.coins || 0) + coins;
    await user.save();

    res.send({ message: "Coins added", totalCoins: user.coins });
  } catch (err) {
    console.error("Add coins error:", err);
    res.status(500).send("Failed to add coins");
  }
});

// ======================
// SCORE & ADMIN ROUTES
// ======================
// ... keep your existing /submit-score, /results, /admin/* routes

// ======================
// ROOT CHECK
// ======================
app.get("/", (req, res) => {
  res.send("🟢 Credit Score Game API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
