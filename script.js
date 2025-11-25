/* SCRIPT.JS – FULL DROP-IN (merges with your current logic) */

const apiBase = "https://credit-api-uhou.onrender.com";
const COINS_PER_CORRECT = 1;
const DAILY_BONUS = 3;           // coins for maintaining streak
const STREAK_MAX_BONUS = 7;      // cap displayed streak, still counts internally
const XP_PER_CORRECT = 5;
const XP_BASE_TO_LEVEL = 20;     // XP needed for level 1->2 (ramps up)
const SHOP_ITEMS = [
  { id: "frame-gold", name: "Gold Frame", cost: 15, color: "gold" },
  { id: "frame-cyan", name: "Cyan Frame", cost: 10, color: "#00c4cc" },
  { id: "frame-pink", name: "Pink Frame", cost: 10, color: "hotpink" },
  { id: "frame-lime", name: "Lime Frame", cost: 8,  color: "limegreen" }
];

let container;
let currentCoins = 0;
let correctAnswers = 0;
let currentLevelKey = "easy";

let unlockedLevels =
  JSON.parse(localStorage.getItem("unlockedLevels") || "null") ??
  { easy: true, medium: false, hard: false };
let levelTrophies =
  JSON.parse(localStorage.getItem("levelTrophies") || "null") ??
  { easy: false, medium: false, hard: false };

/* New persistent gamification state */
let streak = Number(localStorage.getItem("streak") || 0);
let lastPlay = localStorage.getItem("lastPlay") || ""; // YYYY-MM-DD
let xp = Number(localStorage.getItem("xp") || 0);
let level = Number(localStorage.getItem("level") || 1);
let chosenFrame = localStorage.getItem("avatarFrame") || ""; // from SHOP_ITEMS ids

document.addEventListener("DOMContentLoaded", () => {
  const name = (localStorage.getItem("playerName") || "").trim();
  const avatar = localStorage.getItem("playerAvatar");
  if (!name || !avatar) {
    window.location.href = "login.html";
    return;
  }

  // Base coins
  currentCoins = Number(localStorage.getItem("playerCoins") || 0);
  if (!Number.isFinite(currentCoins)) currentCoins = 0;

  // UI: Name & avatar
  setText("displayName", `Welcome, ${name}!`);
  const avatarEl = document.getElementById("avatarDisplay");
  if (avatarEl) {
    avatarEl.src = `assets/avatars/${avatar}`;
    // apply cosmetic frame if any
    applyAvatarFrame(avatarEl, chosenFrame);
  }

  // Show quiz container
  document.getElementById("loginContainer")?.remove();
  const qc = document.getElementById("quizContainer");
  if (qc) qc.style.display = "block";
  container = document.getElementById("quizContent") || document.body;

  // First-run persistence
  if (!localStorage.getItem("unlockedLevels"))
    localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
  if (!localStorage.getItem("levelTrophies"))
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));

  // Daily streak check (+ optional daily bonus)
  handleDailyStreak();

  // Init UI
  updateCoinsUI();
  updateXPUI();
  showIntroModule();
  wireShopModal();
});

/* ======= QUIZ BANK (keep your “better” questions) ======= */
const quizLevels = {
  easy: [
    { question: "What does a credit score tell people?",
      options: ["How fast you can run","How good you are with money","What school you go to"], correct: 1,
      learnId: "what-is-credit-score" },
    { question: "Which is a good money habit?",
      options: ["Always paying bills on time","Spending all your money","Losing your wallet"], correct: 0,
      learnId: "good-money-habit" }
  ],
  medium: [
    { question: "What happens if you forget to pay your phone bill?",
      options: ["Nothing changes","Your credit score might go down","You get a prize"], correct: 1,
      learnId: "missed-bills" },
    { question: "Who checks your credit score?",
      options: ["Your friends","Banks and lenders","Your teacher"], correct: 1,
      learnId: "who-checks-score" }
  ],
  hard: [
    { question: "How can you build a good credit score?",
      options: ["Never pay it back","Pay bills on time","Buy games"], correct: 1,
      learnId: "build-good-score" },
    { question: "What number is a high credit score in the UK?",
      options: ["100","999","5000"], correct: 1,
      learnId: "high-score-number" },
    { question: "Which one is a bad money habit?",
      options: ["Paying late","Saving monthly","Checking statements"], correct: 0,
      learnId: "bad-habits" }
  ]
};

/* ======= CORE FLOW ======= */
function showIntroModule() {
  const name = localStorage.getItem("playerName") || "Player";
  const daily = getTodayDaily();

  container.innerHTML = `
    <h2>Hi ${name} 👋</h2>
    <p>Select a level:</p>
    <button onclick="startQuiz('easy')">🟢 Easy ${levelTrophies.easy ? "🏆" : ""}</button>
    <button onclick="startQuiz('medium')" ${unlockedLevels.medium ? "" : "disabled"}>🟡 Medium ${levelTrophies.medium ? "🏆" : ""}</button>
    <button onclick="startQuiz('hard')" ${unlockedLevels.hard ? "" : "disabled"}>🔴 Hard ${levelTrophies.hard ? "🏆" : ""}</button>

    <p id="coinCount" style="margin-top:.5rem;">🪙 Coins: ${currentCoins}</p>
    <div style="margin:.25rem 0 .5rem 0;">⭐ Level ${level}</div>

    <div class="quiz-summary" style="margin-top:.5rem;">
      <strong>🎯 Daily Challenge:</strong> ${daily.label} — Reward: +${daily.reward} coins
      <div style="margin-top:.5rem;"><button onclick="startDaily()">Start Daily</button> <button onclick="openShop()">🛍️ Shop</button></div>
    </div>

    <hr>
    <a href="learning.html"><button type="button">📘 Learn About Credit Scores</button></a>
    <a href="tips.html"><button type="button">💡 Credit Score Tips</button></a>
    <button onclick="toggleMusic()">🎵 Toggle Music</button>
    <button onclick="logoutUser()">🚪 Logout</button>
  `;

  // Show streak pill if active
  renderStreakPill();
  // Ensure XP bar visible
  const xpBar = document.getElementById("xpBar");
  if (xpBar) xpBar.style.display = "block";
}

function startQuiz(levelKey) {
  correctAnswers = 0;
  currentLevelKey = levelKey;
  showQuestion(0);
}

function showQuestion(index) {
  const qList = quizLevels[currentLevelKey];
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
      const selected = parseInt(e.target.dataset.index, 10);
      const isCorrect = selected === q.correct;

      if (isCorrect) {
        correctAnswers++;
        earnCorrectRewards(); // coins + XP + animation
        alert("✅ Correct!");
      } else {
        alert(`❌ Correct: ${q.options[q.correct]}\nClick OK to learn why.`);
        if (q.learnId) window.open(`learning.html#${q.learnId}`, "_blank");
      }
      const next = index + 1;
      next < qList.length ? showQuestion(next) : showQuizSummary();
    });
  });
}

function showQuizSummary() {
  const total = quizLevels[currentLevelKey].length;
  const stars = "⭐".repeat(correctAnswers) + "☆".repeat(total - correctAnswers);

  let msg = "";
  if (correctAnswers === total) {
    msg = "🎉 Perfect!";
    unlockNextLevel(currentLevelKey);
    playWin();
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
      <button onclick="startQuiz('${currentLevelKey}')">🔁 Try Again</button>
      <button onclick="showIntroModule()">🔙 Back to Menu</button>
    </div>
  `;
}

/* ======= REWARDS / XP / STREAKS ======= */
function earnCorrectRewards() {
  // Coins
  awardCoins(COINS_PER_CORRECT);
  floatCoin("+1");

  // XP
  addXP(XP_PER_CORRECT);
}

function awardCoins(amount) {
  currentCoins += amount;
  localStorage.setItem("playerCoins", String(currentCoins));
  updateCoinsUI();
  // POST (non-blocking)
  fetch(`${apiBase}/reward-coins`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: localStorage.getItem("playerName"), amount })
  }).catch(() => {});
}

function updateCoinsUI() {
  setText("coinCount", `🪙 Coins: ${currentCoins}`);
  const pill = document.getElementById("coinDisplay");
  if (pill) pill.textContent = `Coins: ${currentCoins}`;
}

function addXP(amount) {
  xp += amount;
  const need = xpToNext(level);
  while (xp >= need) {
    xp -= need;
    level++;
    triggerConfetti();
    awardCoins(3); // level-up bonus
  }
  localStorage.setItem("xp", String(xp));
  localStorage.setItem("level", String(level));
  updateXPUI();
}

function xpToNext(lv) {
  // Simple ramp: base + 5 per level
  return XP_BASE_TO_LEVEL + (lv - 1) * 5;
}

function updateXPUI() {
  const need = xpToNext(level);
  const pct = Math.max(0, Math.min(100, Math.round((xp / need) * 100)));
  const fill = document.getElementById("xpFill");
  const text = document.getElementById("xpText");
  if (fill) fill.style.width = pct + "%";
  if (text) text.textContent = `Lv ${level} · ${xp}/${need} XP`;
  const bar = document.getElementById("xpBar");
  if (bar) bar.style.display = "block";
}

/* ======= DAILY STREAK ======= */
function handleDailyStreak() {
  const today = new Date();
  const todayKey = today.toISOString().slice(0,10); // YYYY-MM-DD

  if (!lastPlay) {
    streak = 1;
    lastPlay = todayKey;
  } else {
    const prev = new Date(lastPlay + "T00:00:00Z");
    const diffDays = Math.floor((today - prev) / (1000*60*60*24));
    if (diffDays === 0) {
      // already counted today
    } else if (diffDays === 1) {
      streak++;
      // daily login bonus (optional)
      awardCoins(DAILY_BONUS);
    } else {
      streak = 1; // broken streak
    }
    lastPlay = todayKey;
  }

  localStorage.setItem("streak", String(streak));
  localStorage.setItem("lastPlay", lastPlay);
}

function renderStreakPill() {
  const pill = document.getElementById("streakPill");
  if (!pill) return;
  const shown = Math.min(streak, STREAK_MAX_BONUS);
  if (streak > 0) {
    pill.classList.add("streak");
    pill.style.display = "inline-block";
    pill.textContent = `🔥 Streak: ${shown} day${shown === 1 ? "" : "s"}`;
  } else {
    pill.style.display = "none";
  }
}

/* ======= DAILY CHALLENGE ======= */
function getTodayDaily() {
  // Simple rotating label; you can expand to real tasks
  const labels = [
    "Score 2 correct answers",
    "Finish any quiz",
    "Get a perfect score on Easy",
    "Answer 3 questions"
  ];
  const today = new Date().toISOString().slice(0,10);
  const idx = (today.split("-").join("").split("").reduce((a,b)=>a+Number(b),0)) % labels.length;
  return { key: "daily-"+today, label: labels[idx], reward: 5 };
}

function startDaily() {
  // For demo: jump into Easy quiz
  startQuiz("easy");
  localStorage.setItem("dailyActive", "1");
}

function checkDailyProgress() {
  const active = localStorage.getItem("dailyActive") === "1";
  if (!active) return;
  const daily = getTodayDaily();
  // Example completion rule: at least 2 correct in any run
  if (correctAnswers >= 2) {
    localStorage.removeItem("dailyActive");
    if (localStorage.getItem(daily.key) !== "done") {
      awardCoins(daily.reward);
      localStorage.setItem(daily.key, "done");
      alert(`🎯 Daily complete! +${daily.reward} coins`);
    }
  }
}

/* Call after quiz end */
const _origShowQuizSummary = showQuizSummary;
showQuizSummary = function () {
  _origShowQuizSummary.apply(this, arguments);
  checkDailyProgress();
}

/* ======= SHOP (COSMETICS) ======= */
function openShop() {
  const modal = document.getElementById("shopModal");
  if (!modal) return;
  modal.style.display = "flex";
  renderShopItems();
}
function wireShopModal() {
  document.getElementById("closeShopBtn")?.addEventListener("click", () => {
    const modal = document.getElementById("shopModal");
    if (modal) modal.style.display = "none";
  });
}
function renderShopItems() {
  const grid = document.getElementById("shopItems");
  if (!grid) return;
  grid.innerHTML = SHOP_ITEMS.map(it => {
    const owned = localStorage.getItem("own_"+it.id) === "1";
    const using = chosenFrame === it.id;
    return `
      <div class="shop-item">
        <div class="frame-preview" style="border-color:${it.color}"></div>
        <div><strong>${it.name}</strong></div>
        <div>${owned ? "Owned" : `Cost: ${it.cost} 🪙`}</div>
        <div style="margin-top:.25rem;">
          ${owned
            ? `<button onclick="equipFrame('${it.id}')" ${using ? "disabled" : ""}>${using ? "Equipped" : "Equip"}</button>`
            : `<button onclick="buyFrame('${it.id}')">Buy</button>`
          }
        </div>
      </div>`;
  }).join("");
}
function buyFrame(id) {
  const it = SHOP_ITEMS.find(x=>x.id===id);
  if (!it) return;
  if (currentCoins < it.cost) { alert("Not enough coins"); return; }
  awardCoins(-it.cost); // spend
  localStorage.setItem("own_"+id, "1");
  renderShopItems();
}
function equipFrame(id) {
  chosenFrame = id;
  localStorage.setItem("avatarFrame", id);
  const avatarEl = document.getElementById("avatarDisplay");
  if (avatarEl) applyAvatarFrame(avatarEl, id);
  renderShopItems();
}
function applyAvatarFrame(imgEl, id) {
  const item = SHOP_ITEMS.find(x=>x.id===id);
  if (!item) { imgEl.style.boxShadow = ""; imgEl.style.borderColor=""; imgEl.style.borderWidth="2px"; return; }
  // why: this is purely visual; keep it tasteful
  imgEl.style.borderColor = item.color;
  imgEl.style.borderWidth = "4px";
}

/* ======= UTIL / EFFECTS ======= */
function setText(id, val){ const el = document.getElementById(id); if (el) el.textContent = val; }

function triggerConfetti() {
  for (let i = 0; i < 20; i++) {
    const s = document.createElement("div");
    s.className = "sparkle";
    s.style.left = `${Math.random() * 100}vw`;
    s.style.top = `${Math.random() * 40 + 20}vh`;
    s.style.background = "gold";
    s.style.position = "fixed";
    s.style.width = s.style.height = "6px";
    s.style.borderRadius = "50%";
    s.style.zIndex = "9999";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 1000);
  }
}

function playWin(){ triggerConfetti(); }

/* Floating +coin near the coin pill */
function floatCoin(text) {
  const anchor = document.getElementById("coinDisplay");
  const div = document.createElement("div");
  div.className = "coin-float";
  div.textContent = text;
  document.body.appendChild(div);

  const rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth/2, top: 20 };
  div.style.left = rect.left + "px";
  div.style.top = (rect.top - 8) + "px";
  div.style.color = "#ffcd3c";
  div.style.transform = "translateY(0)";
  div.style.opacity = "1";

  requestAnimationFrame(() => {
    div.style.transform = "translateY(-30px)";
    div.style.opacity = "0";
  });
  setTimeout(() => div.remove(), 800);
}

/* ======= LEVEL UNLOCKS (your original logic) ======= */
function unlockNextLevel(levelKey) {
  if (!levelTrophies[levelKey]) {
    levelTrophies[levelKey] = true;
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));
    // optional: show trophy modal if present
    const modal = document.getElementById("trophyModal");
    if (modal) { modal.style.display = "block"; setTimeout(()=>modal.style.display="none", 3000); }
  }
  if (levelKey === "easy") unlockedLevels.medium = true;
  if (levelKey === "medium") unlockedLevels.hard = true;
  localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
}
