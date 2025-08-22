const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect('YOUR_MONGO_URI_HERE');

const User = mongoose.model('User', new mongoose.Schema({
  username: String,
  email: String,
  password: String
}));

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  const existing = await User.findOne({ username });
  if (existing) return res.status(400).send("Username taken.");

  const hashed = await bcrypt.hash(password, 10);
  await User.create({ username, email, password: hashed });
  res.send("Registered successfully");
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).send("Invalid credentials");
  }
  res.send({ username: user.username, email: user.email });
});

app.listen(3000, () => console.log("API running on http://localhost:3000"));
