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

if (!mongoUri || !mongoUri.startsWith('mongodb+srv://')) {
  console.error("❌ Invalid or missing MONGO_URI environment variable.");
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

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
});

const User = mongoose.model("User", userSchema);

app.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password)
      return res.status(400).send("All fields are required");

    const existing = await User.findOne({ username });
    if (existing) return res.status(400).send("Username already taken");

    const hashed = await bcrypt.hash(password, 10);
    await User.create({ username, email, password: hashed });

    res.send("User registered successfully");
  } catch (err) {
    console.error("❌ Error in /register:", err);
    res.status(500).send("Server error");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.status(404).send("User not found");

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).send("Incorrect password");

    res.send({ username: user.username, email: user.email });
  } catch (err) {
    console.error("❌ Error in /login:", err);
    res.status(500).send("Server error");
  }
});

app.get("/", (req, res) => {
  res.send("🟢 Credit Score Game API is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
