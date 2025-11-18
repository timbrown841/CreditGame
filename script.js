let container;
let currentCoins = 0;
const apiBase = "https://credit-api-uhou.onrender.com";

// 🔐 Check login
document.addEventListener("DOMContentLoaded", () => {
  const username = localStorage.getItem("playerName");
  const avatar = localStorage.getItem("playerAvatar");
  const coins = localStorage.getItem("playerCoins");

  if (!username || !avatar) {
    window.location.href = "login.html";
  } else {
    fetch(`${apiBase}/user-data?username=${username}`)
      .then(res => res.json())
      .then(data => {
        currentCoins = data.coins || 0;
        document.getElementById("avatarDisplay").src = `assets/avatars/${avatar}`;
        document.getElementById("displayName").textContent = username;
        document.getElementById("coinCount").textContent = `🪙 Coins: ${currentCoins}`;
        initQuizApp(username);
      })
      .catch(() => {
        alert("Error loading user data.");
        window.location.href = "login.html";
      });
  }
});

function initQuizApp(name) {
  document.getElementById("loginContainer")?.remove();
  document.getElementById("quizContainer").style.display = "block";
  container = document.getElementById("quizContent");
  showIntroModule();
}

function logoutUser() {
  localStorage.removeItem("playerName");
  localStorage.removeItem("playerAvatar");
  window.location.href = "login.html";
}

const soundCorrect = new Audio("assets/sounds/correct.mp3");
const soundWrong = new Audio("assets/sounds/wrong.mp3");
const soundWin = new Audio("assets/sounds/win.mp3");
const bgMusic = new Audio("assets/sounds/background.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.4;

let musicOn = true;
function toggleMusic() {
  musicOn = !musicOn;
  musicOn ? bgMusic.play() : bgMusic.pause();
  alert(`Music ${musicOn ? 'On 🎵' : 'Off 🔇'}`);
}

const quizLevels = {
  easy: [/* questions */],
  medium: [/* questions */],
  hard: [/* questions */]
};

let unlockedLevels = JSON.parse(localStorage.getItem("unlockedLevels")) || {
  easy: true, medium: false, hard: false
};

let levelTrophies = JSON.parse(localStorage.getItem("levelTrophies")) || {
  easy: false, medium: false, hard: false
};

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
    <hr>
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
      <div class="charlie">
        <img src="assets/charlie.png" alt="Charlie the Coin"/>
        <div class="speech">Let's go! Answer this question 🪙</div>
      </div>
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
      const selected = parseInt(e.target.dataset.index);
      const isCorrect = selected === q.correct;

      if (isCorrect) {
        correctAnswers++;
        if (musicOn) soundCorrect.play();
        alert("✅ Correct!");
      } else {
        if (musicOn) soundWrong.play();
        alert(`❌ Correct: ${q.options[q.correct]}\nClick OK to learn why.`);
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
    msg = "🎉 You're a credit score champ!";
    triggerConfetti();
    unlockNextLevel(currentLevel);
    awardCoins(10); // reward for perfect score
  } else if (correctAnswers >= Math.floor(total * 0.7)) {
    msg = "👏 Great job!";
    awardCoins(5); // partial reward
  } else {
    msg = "🧐 Keep practicing!";
  }

  container.innerHTML = `
    <div class="quiz-summary">
      <h2>Quiz Complete!</h2>
      <p class="animated-stars">Your Score: ${stars}</p>
      <p>${msg}</p>
      <button onclick="restartQuiz()">🔁 Play Again</button>
      <button onclick="showIntroModule()">🔙 Back to Menu</button>
    </div>
  `;
}

function awardCoins(amount) {
  currentCoins += amount;
  document.getElementById("coinCount").textContent = `🪙 Coins: ${currentCoins}`;

  fetch(`${apiBase}/add-coins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: localStorage.getItem("playerName"),
      coins: amount
    })
  }).catch(err => console.error("Coin update failed", err));
}

function unlockNextLevel(level) {
  if (!levelTrophies[level]) {
    levelTrophies[level] = true;
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));
    showTrophyModal();
  }
  if (level === "easy") unlockedLevels.medium = true;
  if (level === "medium") unlockedLevels.hard = true;
  localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
}

function restartQuiz() {
  showIntroModule();
}

function showTrophyModal() {
  document.getElementById("trophyModal").style.display = "block";
  if (musicOn) soundWin.play();
  setTimeout(closeTrophyModal, 4000);
}

function closeTrophyModal() {
  document.getElementById("trophyModal").style.display = "none";
}

function triggerConfetti() {
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";
    s.style.left = `${Math.random() * 100}vw`;
    s.style.top = `${Math.random() * 40 + 20}vh`;
    s.style.background = "gold";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}
