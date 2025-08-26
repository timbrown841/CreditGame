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

// ✅ MongoDB connection
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

// ✅ Schema
const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  scores: [
    {
      level: String,
      score: Number,
      date: { type: Date, default: Date.now }
    }
  ]
});

const User = mongoose.model("User", userSchema);

// ✅ Registration
app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).send("All fields required");

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).send("Username taken");

    const hash = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hash });

    res.send("Registered successfully");
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).send("Registration failed");
  }
});

// ✅ Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).send("Incorrect password");

    res.send({ username: user.username, email: user.email });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Login failed");
  }
});

// ✅ Submit Score
app.post("/submit-score", async (req, res) => {
  const { username, score, level } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");

    user.scores.push({ score, level });
    await user.save();

    res.send("Score saved");
  } catch (err) {
    console.error("Score save error:", err);
    res.status(500).send("Failed to save score");
  }
});

// ✅ Get scores for one user
app.get("/results", async (req, res) => {
  const { username } = req.query;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");

    res.json(user.scores || []);
  } catch (err) {
    console.error("Error loading results:", err);
    res.status(500).send("Failed to load results");
  }
});

// ✅ Admin: Get all scores
app.get("/admin/all-results", async (req, res) => {
  try {
    const users = await User.find({}, 'username scores');
    res.json(users);
  } catch (err) {
    console.error("Admin load error:", err);
    res.status(500).send("Failed to load admin results");
  }
});

// ✅ Root health check
app.get("/", (req, res) => {
  res.send("🟢 API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
