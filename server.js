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
})
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// Schema
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

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, email, password, avatar } = req.body;

    if (!username || !email || !password)
      return res.status(400).send("All fields required");

    const exists = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (exists) return res.status(400).send("Username already exists");

    const hash = await bcrypt.hash(password, 10);

    const allowedAvatars = [
      "blackboy.png",
      "blackgirl.png",
      "latinboy.png",
      "whiteboy.png",
      "whitegirl.png"
    ];

    const finalAvatar = allowedAvatars.includes(avatar) ? avatar : "blackboy.png";

    await User.create({
      username,
      email,
      password: hash,
      avatar: finalAvatar
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
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Incorrect password");

    res.send({ username: user.username, email: user.email, avatar: user.avatar });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

// Submit score
app.post("/submit-score", async (req, res) => {
  const { username, score, level } = req.body;

  try {
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    user.scores.push({ score, level });
    await user.save();

    res.send("Score saved");
  } catch (err) {
    console.error("Score submission error:", err);
    res.status(500).send("Could not save score");
  }
});


// Get User data coins
app.get("/user-data", async (req, res) => {
  const { username } = req.query;
  try {
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    res.send({ coins: user.coins || 0, avatar: user.avatar || "avatar1.png" });
  } catch (err) {
    console.error("User data fetch error:", err);
    res.status(500).send("Failed to fetch user data");
  }
});

// Coin Rewards
app.post("/reward-coins", async (req, res) => {
  const { username, amount } = req.body;

  if (!username || typeof amount !== "number") {
    return res.status(400).send("Username and valid amount are required");
  }

  try {
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    user.coins = (user.coins || 0) + amount;
    await user.save();

    res.send({ message: "Coins rewarded", newBalance: user.coins });
  } catch (err) {
    console.error("Reward error:", err);
    res.status(500).send("Failed to reward coins");
  }
});


// User results
app.get("/results", async (req, res) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    res.json(user.scores || []);
  } catch (err) {
    console.error("Results error:", err);
    res.status(500).send("Failed to load results");
  }
});

// Admin login
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    res.send("Admin login successful");
  } else {
    res.status(401).send("Invalid admin credentials");
  }
});

// Admin: all user results
app.get("/admin/all-results", async (req, res) => {
  try {
    const users = await User.find({}, 'username scores');
    res.json(users);
  } catch (err) {
    console.error("Admin results error:", err);
    res.status(500).send("Failed to load all results");
  }
});

// Admin: reset a user's scores
app.post("/admin/reset-scores", async (req, res) => {
  const { username } = req.body;

  try {
    const user = await User.findOne({ username: new RegExp(`^${username}$`, 'i') });
    if (!user) return res.status(404).send("User not found");

    user.scores = [];
    await user.save();

    res.send(`✅ Scores for ${user.username} have been reset.`);
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).send("Failed to reset scores");
  }
});

// Root check
app.get("/", (req, res) => {
  res.send("🟢 Credit Score Game API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
