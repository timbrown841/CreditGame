/* File: script.js — full, fixed */

const apiBase = "https://credit-api-uhou.onrender.com";

const COINS_PER_CORRECT = 1;
const DAILY_REWARD = 5;
const DAILY_COUNT = 3;
const DAILY_XP_PER_CORRECT = 5;

const DAILY_BONUS = 3;
const STREAK_MAX_BONUS = 7;
const XP_PER_CORRECT = 5;
const XP_BASE_TO_LEVEL = 20;

const SHOP_ITEMS = [
  { id: "frame-gold", name: "Gold Frame", cost: 15, color: "gold" },
  { id: "frame-cyan", name: "Cyan Frame", cost: 10, color: "#00c4cc" },
  { id: "frame-pink", name: "Pink Frame", cost: 10, color: "hotpink" },
  { id: "frame-lime", name: "Lime Frame", cost: 8,  color: "limegreen" }
];

/* ======= STATE ======= */
let container;
let currentCoins = 0;
let correctAnswers = 0;

let currentMode = "normal";           // "normal" | "daily"
let currentLevelKey = "easy";
let currentBank = [];                 // active questions
let currentIndex = 0;

let unlockedLevels =
  JSON.parse(localStorage.getItem("unlockedLevels") || "null") ??
  { easy: true, medium: false, hard: false };

let levelTrophies =
  JSON.parse(localStorage.getItem("levelTrophies") || "null") ??
  { easy: false, medium: false, hard: false };

let streak = Number(localStorage.getItem("streak") || 0);
let lastPlay = localStorage.getItem("lastPlay") || "";
let xp = Number(localStorage.getItem("xp") || 0);
let level = Number(localStorage.getItem("level") || 1);
let chosenFrame = localStorage.getItem("avatarFrame") || "";

/* ======= BOOT ======= */
document.addEventListener("DOMContentLoaded", () => {
  const name = (localStorage.getItem("playerName") || "").trim();
  const avatar = localStorage.getItem("playerAvatar");
  if (!name || !avatar) {
    window.location.href = "login.html"; return;
  }

  currentCoins = Number(localStorage.getItem("playerCoins") || 0) || 0;

  setText("displayName", `Welcome, ${name}!`);
  const avatarEl = document.getElementById("avatarDisplay");
  if (avatarEl) { avatarEl.src = `assets/avatars/${avatar}`; applyAvatarFrame(avatarEl, chosenFrame); }

  document.getElementById("loginContainer")?.remove();
  const qc = document.getElementById("quizContainer"); if (qc) qc.style.display = "block";
  container = document.getElementById("quizContent") || document.body;

  if (!localStorage.getItem("unlockedLevels"))
    localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
  if (!localStorage.getItem("levelTrophies"))
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));

  handleDailyStreak();
  updateCoinsUI();
  updateXPUI();
  showIntroModule();
  wireShopModal();
  preloadCoinImage();      // avoids first-tap lag in the mini-game
});

/* ======= QUIZ BANKS ======= */
const quizLevels = {
  easy: [
    { question: "What does a credit score tell people?",
      options: ["How fast you can run", "How good you are with money", "What school you go to"], correct: 1,
      learnId: "what-is-credit-score" },
    { question: "Which is a good money habit?",
      options: ["Always paying bills on time", "Spending all your money", "Losing your wallet"], correct: 0,
      learnId: "good-money-habit" }
  ],
  medium: [
    { question: "What happens if you forget to pay your phone bill?",
      options: ["Nothing changes", "Your credit score might go down", "You get a prize"], correct: 1,
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

const dailyQuestions = [
  { question: "What is a ‘minimum payment’ on a credit card?",
    options: ["The smallest amount you must pay each month","A fee for opening the card","A bonus you get for spending"], correct: 0, learnId: "min-payment" },
  { question: "If your card limit is £1000 and you owe £250, your utilisation is…",
    options: ["25%","50%","75%"], correct: 0, learnId: "utilisation" },
  { question: "A ‘hard check’ usually happens when…",
    options: ["You check your own score","A lender checks your report for a new credit application","You pay your bill"], correct: 1, learnId: "hard-check" },
  { question: "Missing a payment can stay on your credit report for up to…",
    options: ["1 month","6 months","6 years"], correct: 2, learnId: "missed-bills" },
  { question: "A good first step to build credit is…",
    options: ["Maxing your first card","Registering on the electoral roll","Opening many loans at once"], correct: 1, learnId: "build-good-score" },
  { question: "Which is true about overdrafts?",
    options: ["They’re not credit","They can charge interest/fees","They always improve your score"], correct: 1, learnId: "overdrafts" },
  { question: "If you pay your balance in full each month, you usually pay…",
    options: ["No interest","Double interest","A late fee only"], correct: 0, learnId: "interest" },
  { question: "Why check your credit report yearly?",
    options: ["To dispute errors","To lower your grade","To add more debt"], correct: 0, learnId: "check-report" }
];

function getTodayDailySet() {
  const today = new Date().toISOString().slice(0,10);
  const seed = Number(today.replace(/-/g, ""));
  const pool = [...dailyQuestions];
  let r = seed; function rand() { r = (r * 9301 + 49297) % 233280; return r / 233280; }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DAILY_COUNT);
}

/* ======= UI ======= */
async function showIntroModule() {
  const name = localStorage.getItem("playerName") || "Player";
  const daily = getTodayDailyMeta();

  container.innerHTML = `
    <h2>Hi ${name} 👋</h2>
    <p>Select a level:</p>
    <button onclick="startQuiz('easy')">🟢 Easy ${levelTrophies.easy ? "🏆" : ""}</button>
    <button onclick="startQuiz('medium')" ${unlockedLevels.medium ? "" : "disabled"}>🟡 Medium ${levelTrophies.medium ? "🏆" : ""}</button>
    <button onclick="startQuiz('hard')" ${unlockedLevels.hard ? "" : "disabled"}>🔴 Hard ${levelTrophies.hard ? "🏆" : ""}</button>

    <p id="coinCount" style="margin-top:.5rem;">🪙 Coins: ${currentCoins}</p>
    <div style="margin:.25rem 0 .5rem 0;">⭐ Level ${level}</div>

    <div class="quiz-summary" style="margin-top:.5rem;">
      <strong>🎯 Daily Challenge:</strong> ${daily.label} — Reward: +${DAILY_REWARD} coins
      <div style="margin-top:.5rem;">
        <button onclick="startDaily()" ${daily.done ? "disabled" : ""}>${daily.done ? "Completed" : "Start Daily"}</button>
        <button onclick="openCoinRain()">🪙 Coin Rain</button>   <!-- add this line -->
        <button onclick="openShop()">🛍️ Shop</button>
      </div>
    </div>

    <hr>
    <a href="learning.html"><button type="button">📘 Learn About Credit Scores</button></a>
    <a href="tips.html"><button type="button">💡 Credit Score Tips</button></a>
    <button onclick="toggleMusic()">🎵 Toggle Music</button>
    <button onclick="logoutUser()">🚪 Logout</button>
  `;

  renderStreakPill();
  const xpBar = document.getElementById("xpBar"); if (xpBar) xpBar.style.display = "block";
}

/* START normal quiz */
function startQuiz(levelKey) {
  currentMode = "normal";
  currentLevelKey = levelKey;
  currentBank = quizLevels[levelKey] || [];
  correctAnswers = 0;
  currentIndex = 0;
  renderQuestion();
}

/* START daily challenge */
function startDaily() {
  currentMode = "daily";
  currentBank = getTodayDailySet();
  correctAnswers = 0;
  currentIndex = 0;
  localStorage.setItem("dailyActive", "1");
  renderQuestion();
}

/* RENDER current question (fixed handler) */
function renderQuestion() {
  const q = currentBank[currentIndex];
  if (!q) { showQuizSummary(); return; }

  container.innerHTML = `
    <div class="score-tracker">
      ${currentMode === "daily"
        ? `Daily: ${currentIndex + 1}/${currentBank.length}`
        : `Score: ${"⭐".repeat(correctAnswers)}${"☆".repeat(currentBank.length - correctAnswers)}`
      }
    </div>
    <div class="quiz-layout">
      <div class="charlie">
        <img src="assets/charlie.png" alt="Charlie the Coin"/>
        <div class="speech">${currentMode === "daily" ? "Daily Challenge!" : "Let's go! 🪙"}</div>
      </div>
      <div class="quiz-question">
        <h2>${currentMode === "daily" ? "Daily Question" : "Quiz Time!"}</h2>
        <p>${q.question}</p>
        ${q.options.map((opt, i) => `<button type="button" class="optionBtn" data-index="${i}">${opt}</button>`).join("")}
      </div>
    </div>
  `;

  document.querySelectorAll(".optionBtn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document.querySelectorAll(".optionBtn").forEach(b => b.disabled = true);

      const idx = parseInt(e.currentTarget.dataset.index, 10); // crucial fix
      const isCorrect = Number.isInteger(idx) && idx === q.correct;

      if (isCorrect) {
        correctAnswers++;
        try { awardCoins(COINS_PER_CORRECT); } catch {}
        try { addXP(currentMode === "daily" ? DAILY_XP_PER_CORRECT : XP_PER_CORRECT); } catch {}
        try { floatCoin("+1"); } catch {}
        alert("✅ Correct!");
      } else {
        alert(`❌ Correct: ${q.options[q.correct]}\nClick OK to learn why.`);
        if (q.learnId) window.open(`learning.html#${q.learnId}`, "_blank");
      }

      currentIndex++;
      if (currentIndex < currentBank.length) {
        renderQuestion();            // advance reliably
      } else {
        showQuizSummary();
      }
    }, { once: true });               // bind once per render
  });
}

/* SUMMARY */
function showQuizSummary() {
  const total = currentBank.length;
  const stars = "⭐".repeat(correctAnswers) + "☆".repeat(total - correctAnswers);

  let msg = "";
  if (currentMode === "daily") {
    msg = correctAnswers === total ? "🎉 Daily complete!" : "Daily finished!";
    completeDailyIfEligible();
    container.innerHTML = `
      <div class="quiz-summary">
        <h2>Daily Summary</h2>
        <p>${correctAnswers}/${total} correct</p>
        <p>${msg}</p>
        <button onclick="startDaily()">🔁 Try Again</button>
        <button onclick="showIntroModule()">🔙 Back to Menu</button>
      </div>
    `;
    return;
  }

  if (correctAnswers === total) { msg = "🎉 Perfect!"; unlockNextLevel(currentLevelKey); playWin(); }
  else if (correctAnswers >= Math.floor(total * 0.7)) { msg = "👏 Great job!"; }
  else { msg = "🧐 Keep practicing!"; }

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

/* ======= UNLOCK / TROPHIES ======= */
function unlockNextLevel(levelKey) {
  let changed = false;

  if (!levelTrophies[levelKey]) {
    levelTrophies[levelKey] = true;
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));
    changed = true;
  }

  if (levelKey === "easy" && !unlockedLevels.medium) {
    unlockedLevels.medium = true;
    changed = true;
  } else if (levelKey === "medium" && !unlockedLevels.hard) {
    unlockedLevels.hard = true;
    changed = true;
  }

  if (changed) {
    localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
    alert("🏆 Level complete! Next level unlocked.");
  }
}

/* ======= DAILY META / COMPLETION (local) ======= */
function getTodayDailyMeta() {
  const todayKey = new Date().toISOString().slice(0,10);
  const key = `daily-${todayKey}`;
  const done = localStorage.getItem(key) === "done";
  return { key, done, label: "Answer today's 3 new questions" };
}

function completeDailyIfEligible() {
  const { key, done } = getTodayDailyMeta();
  const active = localStorage.getItem("dailyActive") === "1";
  if (done || !active) return;
  localStorage.removeItem("dailyActive");

  if (correctAnswers >= Math.ceil(currentBank.length * 0.67)) {
    awardCoins(DAILY_REWARD);
    localStorage.setItem(key, "done");
    alert(`🎯 Daily complete! +${DAILY_REWARD} coins`);
  } else {
    alert("Daily not complete. Try again!");
  }
}

/* ======= COINS / XP / STREAKS ======= */
function awardCoins(amount) {
  currentCoins += amount;
  localStorage.setItem("playerCoins", String(currentCoins));
  updateCoinsUI();
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
  let need = xpToNext(level);
  while (xp >= need) {
    xp -= need; level++;
    triggerConfetti(); awardCoins(3);
    need = xpToNext(level);
  }
  localStorage.setItem("xp", String(xp));
  localStorage.setItem("level", String(level));
  updateXPUI();
}

function xpToNext(lv) { return XP_BASE_TO_LEVEL + (lv - 1) * 5; }

function updateXPUI() {
  const need = xpToNext(level);
  const pct = Math.max(0, Math.min(100, Math.round((xp / need) * 100)));
  const fill = document.getElementById("xpFill");
  const text = document.getElementById("xpText");
  if (fill) fill.style.width = pct + "%";
  if (text) text.textContent = `Lv ${level} · ${xp}/${need} XP`;
  const bar = document.getElementById("xpBar"); if (bar) bar.style.display = "block";
}

function handleDailyStreak() {
  const todayKey = new Date().toISOString().slice(0,10);
  if (!lastPlay) { streak = 1; lastPlay = todayKey; }
  else {
    const diff = daysBetween(lastPlay, todayKey);
    if (diff === 1) { streak++; awardCoins(DAILY_BONUS); }
    else if (diff > 1) { streak = 1; }
    lastPlay = todayKey;
  }
  localStorage.setItem("streak", String(streak));
  localStorage.setItem("lastPlay", lastPlay);
}

function renderStreakPill() {
  const pill = document.getElementById("streakPill"); if (!pill) return;
  const shown = Math.min(streak, STREAK_MAX_BONUS);
  if (streak > 0) {
    pill.classList.add("streak"); pill.style.display = "inline-block";
    pill.textContent = `🔥 Streak: ${shown} day${shown === 1 ? "" : "s"}`;
  } else pill.style.display = "none";
}

function daysBetween(a, b) {
  const d1 = new Date(a + "T00:00:00Z");
  const d2 = new Date(b + "T00:00:00Z");
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

/* ======= SHOP / COSMETICS ======= */
function openShop() { const m = document.getElementById("shopModal"); if (m) { m.style.display = "flex"; renderShopItems(); } }
function wireShopModal() { document.getElementById("closeShopBtn")?.addEventListener("click", () => { const m = document.getElementById("shopModal"); if (m) m.style.display = "none"; }); }
function renderShopItems() {
  const grid = document.getElementById("shopItems"); if (!grid) return;
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
  const it = SHOP_ITEMS.find(x=>x.id===id); if (!it) return;
  if (currentCoins < it.cost) { alert("Not enough coins"); return; }
  awardCoins(-it.cost); localStorage.setItem("own_"+id, "1"); renderShopItems();
}
function equipFrame(id) {
  chosenFrame = id; localStorage.setItem("avatarFrame", id);
  const avatarEl = document.getElementById("avatarDisplay"); if (avatarEl) applyAvatarFrame(avatarEl, id);
  renderShopItems();
}
function applyAvatarFrame(imgEl, id) {
  const item = SHOP_ITEMS.find(x=>x.id===id);
  if (!item) { imgEl.style.boxShadow = ""; imgEl.style.borderColor=""; imgEl.style.borderWidth="2px"; return; }
  imgEl.style.borderColor = item.color; imgEl.style.borderWidth = "4px";
}

/* ======= AUDIO / EFFECTS ======= */
const soundCorrect = new Audio("assets/sounds/correct.mp3");
const soundWrong = new Audio("assets/sounds/wrong.mp3");
const soundWin = new Audio("assets/sounds/win.mp3");
const bgMusic = new Audio("assets/sounds/background.mp3");
bgMusic.loop = true; bgMusic.volume = 0.4;

let musicOn = true;
function toggleMusic() { musicOn = !musicOn; musicOn ? bgMusic.play() : bgMusic.pause(); alert(`Music ${musicOn ? 'On 🎵' : 'Off 🔇'}`); }
function playWin(){ triggerConfetti(); }
function floatCoin(text) {
  const anchor = document.getElementById("coinDisplay");
  const div = document.createElement("div");
  div.className = "coin-float"; div.textContent = text;
  document.body.appendChild(div);
  const rect = anchor ? anchor.getBoundingClientRect() : { left: window.innerWidth/2, top: 20 };
  div.style.left = rect.left + "px"; div.style.top = (rect.top - 8) + "px";
  div.style.color = "#ffcd3c"; div.style.transform = "translateY(0)"; div.style.opacity = "1";
  requestAnimationFrame(() => { div.style.transform = "translateY(-30px)"; div.style.opacity = "0"; });
  setTimeout(() => div.remove(), 800);
}
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

/* === COIN RAIN MINI-GAME === */
const COIN_RAIN_DURATION_MS = 20000;

// Preload sprite to avoid first-tap jank
let _coinImgPreloaded = false;
function preloadCoinImage() {
  if (_coinImgPreloaded) return;
  const img = new Image();
  img.src = "assets/coin.png";
  img.onload = () => { _coinImgPreloaded = true; };
}

// Ensure overlay exists once
function ensureCoinRainDOM() {
  if (document.getElementById("coinRainOverlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "coinRainOverlay";
  overlay.innerHTML = `
    <div class="cr-hud">
      <span id="crTimer">20s</span>
      <span id="crRoundCoins">+0</span>
      <button id="crCloseBtn" type="button">✖</button>
    </div>
    <div id="crPlayfield"></div>
    <div id="crSummary" class="cr-summary" style="display:none;">
      <h3>Time!</h3>
      <p id="crSummaryText"></p>
      <button type="button" id="crDoneBtn">Back</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector("#crCloseBtn").addEventListener("click", endCoinRainEarly);
  overlay.querySelector("#crDoneBtn").addEventListener("click", closeCoinRain);
}

let crState = null; // { start, timerId, spawnId, caught }

function openCoinRain() {
  preloadCoinImage();
  ensureCoinRainDOM();
  const overlay = document.getElementById("coinRainOverlay");
  overlay.style.display = "flex";
  startCoinRain();
}

function startCoinRain() {
  const playfield = document.getElementById("crPlayfield");
  const timerEl = document.getElementById("crTimer");
  const roundEl = document.getElementById("crRoundCoins");
  playfield.innerHTML = "";
  document.getElementById("crSummary").style.display = "none";

  crState = { start: performance.now(), caught: 0, timerId: null, spawnId: null };

  function tick() {
    const elapsed = performance.now() - crState.start;
    const remain = Math.max(0, COIN_RAIN_DURATION_MS - elapsed);
    timerEl.textContent = Math.ceil(remain / 1000) + "s";
    if (remain <= 0) return endCoinRain();
    crState.timerId = requestAnimationFrame(tick);
  }
  crState.timerId = requestAnimationFrame(tick);

  function scheduleSpawn() {
    const delay = 450 + Math.random() * 150; // 450–600ms
    crState.spawnId = setTimeout(() => { spawnCoin(playfield); scheduleSpawn(); }, delay);
  }
  scheduleSpawn();

  roundEl.textContent = "+0";
}

function spawnCoin(containerEl) {
  const coin = document.createElement("div");
  coin.className = "cr-coin";
  coin.setAttribute("aria-label", "coin");

  const maxX = Math.max(0, window.innerWidth - 56); // width from CSS
  const left = Math.floor(Math.random() * maxX);
  coin.style.left = left + "px";
  coin.style.setProperty("--fall-ms", (2200 + Math.random() * 1600) + "ms");
  coin.style.setProperty("--drift", (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 25) + "px");

  coin.addEventListener("click", () => collectCoin(coin), { once: true, passive: true });

  containerEl.appendChild(coin);
  setTimeout(() => coin.remove(), 4500);
}

function collectCoin(coinEl) {
  if (!crState) return;
  crState.caught += 1;
  document.getElementById("crRoundCoins").textContent = `+${crState.caught}`;
  try { awardCoins(1); floatCoin("+1"); } catch {}
  coinEl.classList.add("cr-pop");
  setTimeout(() => coinEl.remove(), 180);
}

// --- PATCH 2: replace these two functions in the Coin Rain section ---

function endCoinRain() {
  if (!crState) return;

  // stop timers
  cancelAnimationFrame(crState.timerId);
  clearTimeout(crState.spawnId);

  // disable playfield interactions and clear remaining coins (prevents blocking clicks)
  const playfield = document.getElementById("crPlayfield");
  if (playfield) {
    playfield.style.pointerEvents = "none";
    playfield.querySelectorAll(".cr-coin").forEach(n => n.remove());
  }

  // show summary above everything
  const s = document.getElementById("crSummary");
  const txt = document.getElementById("crSummaryText");
  if (txt) txt.textContent = `You caught ${crState.caught} coin${crState.caught === 1 ? "" : "s"}!`;
  if (s) s.style.display = "block";

  crState = null;
}

function closeCoinRain() {
  const overlay = document.getElementById("coinRainOverlay");
  if (!overlay) return;

  // reset playfield for next round
  const playfield = document.getElementById("crPlayfield");
  if (playfield) {
    playfield.innerHTML = "";
    playfield.style.pointerEvents = "auto";
  }

  const s = document.getElementById("crSummary");
  if (s) s.style.display = "none";

  overlay.style.display = "none";
}

function endCoinRainEarly() {
  if (!crState) return closeCoinRain();
  endCoinRain();
}

function closeCoinRain() {
  const overlay = document.getElementById("coinRainOverlay");
  if (overlay) overlay.style.display = "none";
}

/* ======= UTILS ======= */
function setText(id, val){ const el = document.getElementById(id); if (el) el.textContent = val; }

function logoutUser() {
  localStorage.removeItem("playerName");
  localStorage.removeItem("playerAvatar");
  localStorage.removeItem("playerCoins");
  localStorage.removeItem("unlockedLevels");
  localStorage.removeItem("levelTrophies");
  localStorage.removeItem("streak");
  localStorage.removeItem("lastPlay");
  localStorage.removeItem("xp");
  localStorage.removeItem("level");
  localStorage.removeItem("avatarFrame");
  localStorage.removeItem("dailyActive");
  window.location.href = "login.html";
}
