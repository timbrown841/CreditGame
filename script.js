// =============================
//  CONFIG & GLOBALS
// =============================
const apiBase = "https://credit-api-uhou.onrender.com";
let container;

// =============================
//  FETCH USER DATA FROM BACKEND
// =============================
document.addEventListener("DOMContentLoaded", () => {
  const username = localStorage.getItem("playerName");

  if (!username) {
    window.location.href = "login.html";
    return;
  }

  // Fetch user data from MongoDB (avatar + coins)
  fetch(`${apiBase}/user-data?username=${username}`)
    .then(res => {
      if (!res.ok) throw new Error("Failed to load user data");
      return res.json();
    })
    .then(data => {
      // Store for later use
      localStorage.setItem("playerAvatar", data.avatar);
      localStorage.setItem("playerCoins", data.coins);

      // Update UI on quickstart.html
      const avatarImg = document.getElementById("avatarDisplay");
      const displayName = document.getElementById("displayName");
      const coinDisplay = document.getElementById("coinDisplay");

      if (avatarImg) avatarImg.src = `assets/avatars/${data.avatar}`;
      if (displayName) displayName.textContent = username;
      if (coinDisplay) coinDisplay.textContent = `💰 Coins: ${data.coins}`;

      initQuizApp(username);
    })
    .catch(err => {
      console.error("User data error:", err);
      alert("❌ Failed to load user data. Redirecting to login.");
      window.location.href = "login.html";
    });
});

// =============================
//  QUIZ INITIALISATION
// =============================
function initQuizApp(name) {
  const loginContainer = document.getElementById("loginContainer");
  if (loginContainer) loginContainer.remove();

  const quizContainer = document.getElementById("quizContainer");
  if (quizContainer) quizContainer.style.display = "block";

  container = document.getElementById("quizContent");
  showIntroModule();
}

// =============================
//  USER CONTROLS
// =============================
function logoutUser() {
  localStorage.removeItem("playerName");
  localStorage.removeItem("playerAvatar");
  localStorage.removeItem("playerCoins");
  window.location.href = "login.html";
}

function forgotPassword() {
  alert("Password reset is not available yet.");
}

// =============================
//  SOUND & MUSIC
// =============================
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

// =============================
//  QUIZ QUESTIONS
// =============================
const quizLevels = {
  easy: [
    {
      question: "What does a credit score tell people?",
      options: ["How fast you can run", "How good you are with money", "What school you go to"],
      correct: 1,
      learnId: "what-is-credit-score"
    },
    {
      question: "Which is a good money habit?",
      options: ["Always paying bills on time", "Spending all your money", "Losing your wallet"],
      correct: 0,
      learnId: "good-money-habit"
    }
  ],
  medium: [
    {
      question: "What happens if you forget to pay your phone bill?",
      options: ["Nothing changes", "Your credit score might go down", "You get a prize"],
      correct: 1,
      learnId: "missed-bills"
    },
    {
      question: "Who checks your credit score?",
      options: ["Your friends", "Banks and lenders", "Your teacher"],
      correct: 1,
      learnId: "who-checks-score"
    }
  ],
  hard: [
    {
      question: "How can you build a good credit score?",
      options: ["Never pay it back", "Pay bills on time", "Buy games"],
      correct: 1,
      learnId: "build-good-score"
    },
    {
      question: "What number is a high credit score in the UK?",
      options: ["100", "999", "5000"],
      correct: 1,
      learnId: "high-score-number"
    },
    {
      question: "Which one is a bad money habit?",
      options: ["Paying late", "Saving monthly", "Checking statements"],
      correct: 0,
      learnId: "bad-habits"
    }
  ]
};

// =============================
//  QUIZ STATE
// =============================
let unlockedLevels = JSON.parse(localStorage.getItem("unlockedLevels")) || {
  easy: true,
  medium: false,
  hard: false
};

let levelTrophies = JSON.parse(localStorage.getItem("levelTrophies")) || {
  easy: false,
  medium: false,
  hard: false
};

let correctAnswers = 0;
let currentLevel = "easy";

// =============================
//  INTRO MODULE
// =============================
function showIntroModule() {
  const name = localStorage.getItem("playerName") || "Player";

  container.innerHTML = `
    <h2>Hi ${name} 👋</h2>
    <p>Choose your level:</p>
    <button onclick="startQuiz('easy')">🟢 Easy ${levelTrophies.easy ? "🏆" : ""}</button>
    <button onclick="startQuiz('medium')" ${unlockedLevels.medium ? "" : "disabled"}>🟡 Medium ${levelTrophies.medium ? "🏆" : ""}</button>
    <button onclick="startQuiz('hard')" ${unlockedLevels.hard ? "" : "disabled"}>🔴 Hard ${levelTrophies.hard ? "🏆" : ""}</button>
    <hr>
    <a href="learning.html"><button>📘 Learn About Credit Scores</button></a>
    <a href="tips.html"><button>💡 Credit Score Tips</button></a>
    <button onclick="toggleMusic()">🎵 Toggle Music</button>
    <button onclick="logoutUser()">🚪 Logout</button>
  `;
}

// =============================
//  QUIZ ENGINE
// =============================
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
        ${q.options.map((opt, i) => `<button class="optionBtn" data-index="${i}">${opt}</button>`).join("")}
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

// =============================
//  QUIZ SUMMARY
// =============================
function showQuizSummary() {
  const total = quizLevels[currentLevel].length;
  const stars = "⭐".repeat(correctAnswers) + "☆".repeat(total - correctAnswers);

  let msg = "";
  if (correctAnswers === total) {
    msg = "🎉 You're a credit score champ!";
    triggerConfetti();
    unlockNextLevel(currentLevel);
  } else if (correctAnswers >= Math.floor(total * 0.7)) {
    msg = "👏 Great job!";
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

// =============================
//  LEVEL UNLOCK + TROPHIES
// =============================
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

// =============================
//  TROPHY MODAL + CONFETTI
// =============================
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
