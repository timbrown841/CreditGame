// File: script.js
const apiBase = "https://credit-api-uhou.onrender.com";
let container;
let currentCoins = 0;

document.addEventListener("DOMContentLoaded", initApp);

// why: ensure quickstart shows quiz immediately, no name prompt
async function initApp() {
  const name = (localStorage.getItem("playerName") || "").trim();
  const avatar = localStorage.getItem("playerAvatar");
  const coinsLS = Number(localStorage.getItem("playerCoins") || 0);

  // auth gate
  if (!name || !avatar) {
    window.location.href = "login.html";
    return;
  }

  // wire basic UI if present
  currentCoins = Number.isFinite(coinsLS) ? coinsLS : 0;
  setText("displayName", `Welcome, ${name}!`);
  setSrc("avatarDisplay", `assets/avatars/${avatar}`);
  setText("coinDisplay", `Coins: ${currentCoins}`);

  // show quiz container regardless of previous name step
  const qc = document.getElementById("quizContainer");
  if (qc) qc.style.display = "block";
  const lc = document.getElementById("loginContainer");
  if (lc) lc.style.display = "none";

  // non-blocking sync
  syncUserData(name).catch(() => { /* ignore */ });

  container = document.getElementById("quizContent") || document.body;
  showIntroModule();
}

function setText(id, val){ const el = document.getElementById(id); if (el) el.textContent = val; }
function setSrc(id, val){ const el = document.getElementById(id); if (el) el.src = val; }

async function syncUserData(username) {
  const res = await fetch(`${apiBase}/user-data?username=${encodeURIComponent(username)}`);
  if (!res.ok) return;
  const data = await res.json();

  if (typeof data.coins === "number") {
    currentCoins = data.coins;
    localStorage.setItem("playerCoins", String(currentCoins));
    setText("coinDisplay", `Coins: ${currentCoins}`);
  }
  if (data.avatar) {
    localStorage.setItem("playerAvatar", data.avatar);
    setSrc("avatarDisplay", `assets/avatars/${data.avatar}`);
  }
}

function logoutUser() {
  localStorage.removeItem("playerName");
  localStorage.removeItem("playerAvatar");
  localStorage.removeItem("playerCoins");
  localStorage.removeItem("unlockedLevels");
  localStorage.removeItem("levelTrophies");
  window.location.href = "login.html";
}

/* Sounds (play only after user action due to autoplay policies) */
const soundCorrect = new Audio("assets/sounds/correct.mp3");
const soundWrong = new Audio("assets/sounds/wrong.mp3");
const soundWin = new Audio("assets/sounds/win.mp3");
const bgMusic = new Audio("assets/sounds/background.mp3");
bgMusic.loop = true; bgMusic.volume = 0.4;
let musicOn = false;
function toggleMusic() {
  musicOn = !musicOn;
  if (musicOn) bgMusic.play(); else bgMusic.pause();
  alert(`Music ${musicOn ? 'On 🎵' : 'Off 🔇'}`);
}

/* Minimal working quiz bank (adjust as you like) */
const quizLevels = {
  easy: [
    { question: "Which habit helps your credit score most?", options: ["Pay on time", "Max out cards", "Ignore bills"], correct: 0, learnId: "on-time-payments" },
    { question: "Recommended utilisation range?", options: ["10–30%", "60–80%", "100%"], correct: 0, learnId: "utilisation" }
  ],
  medium: [
    { question: "Multiple hard checks in a short time can…", options: ["Lower your score a bit", "Raise it", "No effect"], correct: 0 }
  ],
  hard: [
    { question: "Closing your oldest card often…", options: ["Can reduce average age", "Always boosts score", "Never matters"], correct: 0 }
  ]
};

let unlockedLevels = JSON.parse(localStorage.getItem("unlockedLevels") || '{"easy":true,"medium":false,"hard":false}');
let levelTrophies = JSON.parse(localStorage.getItem("levelTrophies") || '{"easy":false,"medium":false,"hard":false}');
let correctAnswers = 0;
let currentLevel = "easy";

function showIntroModule() {
  const name = localStorage.getItem("playerName") || "Player";
  container.innerHTML = `
    <h2>Hi ${name} 👋</h2>
    <p>Choose your level:</p>
    <button onclick="startQuiz('easy')">🟢 Easy ${levelTrophies.easy ? "🏆" : ""}</button>
    <button onclick="startQuiz('medium')" ${unlockedLevels.medium ? "" : "disabled"}>🟡 Medium ${levelTrophies.medium ? "🏆" : ""}</button>
    <button onclick="startQuiz('hard')" ${unlockedLevels.hard ? "" : "disabled"}>🔴 Hard ${levelTrophies.hard ? "🏆" : ""}</button>
    <p id="coinCount">🪙 Coins: ${currentCoins}</p>
    <hr/>
    <a href="learning.html"><button type="button">📘 Learn About Credit Scores</button></a>
    <a href="tips.html"><button type="button">💡 Credit Score Tips</button></a>
    <button onclick="toggleMusic()">🎵 Toggle Music</button>
    <button onclick="logoutUser()">🚪 Logout</button>
  `;
}

function startQuiz(level) {
  correctAnswers = 0;
  currentLevel = level;
  showQuestion(0);
}

function showQuestion(index) {
  const qList = quizLevels[currentLevel];
  const q = qList[index];

  container.innerHTML = `
    <div class="score-tracker">Score: ${"⭐".repeat(correctAnswers)}${"☆".repeat(qList.length - correctAnswers)}</div>
    <div class="quiz-layout">
      <div class="quiz-question">
        <h2>Quiz Time!</h2>
        <p>${q.question}</p>
        ${q.options.map((opt, i) => `<button type="button" class="optionBtn" data-index="${i}">${opt}</button>`).join("")}
      </div>
    </div>
  `;

  document.querySelectorAll(".optionBtn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".optionBtn").forEach(b => b.disabled = true);
      const selected = parseInt(e.target.dataset.index, 10);
      const isCorrect = selected === q.correct;

      if (isCorrect) {
        correctAnswers++;
        if (musicOn) soundCorrect.play();
        alert("✅ Correct!");
      } else {
        if (musicOn) soundWrong.play();
        alert(`❌ Correct: ${q.options[q.correct]}${q.learnId ? "\nOpen learning page for more." : ""}`);
        if (q.learnId) window.open(`learning.html#${q.learnId}`, "_blank");
      }

      const next = index + 1;
      next < qList.length ? showQuestion(next) : showQuizSummary();
    });
  });
}

function showQuizSummary() {
  const total = quizLevels[currentLevel].length;
  const stars = "⭐".repeat(correctAnswers) + "☆".repeat(total - correctAnswers);

  let msg = "";
  if (correctAnswers === total) {
    msg = "🎉 Perfect score!";
    showTrophyModal();
    unlockNextLevel(currentLevel);
    awardCoins(10);
    if (musicOn) soundWin.play();
  } else if (correctAnswers >= Math.floor(total * 0.7)) {
    msg = "👏 Great job!";
    awardCoins(5);
  } else {
    msg = "🧐 Keep practicing!";
  }

  container.innerHTML = `
    <div class="quiz-summary">
      <h2>Quiz Complete!</h2>
      <p class="animated-stars">Your Score: ${stars}</p>
      <p>${msg}</p>
      <button onclick="startQuiz('${currentLevel}')">🔁 Try Again</button>
      <button onclick="showIntroModule()">🔙 Back to Menu</button>
    </div>
  `;
}

async function awardCoins(amount) {
  currentCoins += amount;
  setText("coinCount", `🪙 Coins: ${currentCoins}`);
  setText("coinDisplay", `Coins: ${currentCoins}`);
  localStorage.setItem("playerCoins", String(currentCoins));

  try {
    await fetch(`${apiBase}/reward-coins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: localStorage.getItem("playerName"), amount })
    });
  } catch {
    // why: network failure should not block UI
  }
}

function unlockNextLevel(level) {
  if (!levelTrophies[level]) {
    levelTrophies[level] = true;
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));
  }
  if (level === "easy") unlockedLevels.medium = true;
  if (level === "medium") unlockedLevels.hard = true;
  localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
}

function showTrophyModal() {
  const el = document.getElementById("trophyModal");
  if (!el) return;
  el.style.display = "block";
  setTimeout(closeTrophyModal, 4000);
}
function closeTrophyModal() {
  const el = document.getElementById("trophyModal");
  if (el) el.style.display = "none";
}
