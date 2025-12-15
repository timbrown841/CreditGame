/* File: script.js — full app (quiz + daily + shop + coin rain + server inventory) */

const apiBase = "https://credit-api-uhou.onrender.com";

/* ======= CONSTANTS ======= */
const COINS_PER_CORRECT = 1;
const DAILY_REWARD = 5;
const DAILY_COUNT = 3;
const DAILY_XP_PER_CORRECT = 5;

const DAILY_BONUS = 3;
const STREAK_MAX_BONUS = 7;
const XP_PER_CORRECT = 5;
const XP_BASE_TO_LEVEL = 20;

const COIN_RAIN_DURATION_MS = 20000;

/* ======= SHOP CATALOG ======= */
const SHOP_ITEMS = [
  // Frames
  { id: "frame-gold",  type: "frame",  name: "Gold Frame",  cost: 15, color: "gold" },
  { id: "frame-cyan",  type: "frame",  name: "Cyan Frame",  cost: 10, color: "#00c4cc" },
  { id: "frame-pink",  type: "frame",  name: "Pink Frame",  cost: 10, color: "hotpink" },
  { id: "frame-lime",  type: "frame",  name: "Lime Frame",  cost: 8,  color: "limegreen" },

  // Trails
  { id: "trail-sky",   type: "trail",  name: "Sky Trail",   cost: 8,  color: "#aee7ff" },
  { id: "trail-sunset",type: "trail",  name: "Sunset Trail",cost: 10, color: "#ff8a00" },
  { id: "trail-mint",  type: "trail",  name: "Mint Trail",  cost: 8,  color: "#a2ffcc" },

  // Backgrounds
  { id: "bg-space",    type: "bg",     name: "Space",       cost: 12, asset: "assets/bg-space.jpg" },
  { id: "bg-city",     type: "bg",     name: "City",        cost: 12, asset: "assets/bg-city.jpg" },
  { id: "bg-ocean",    type: "bg",     name: "Ocean",       cost: 12, asset: "assets/bg-ocean.jpg" },

  // Avatars (optional extras)
  { id: "av-robot",    type: "avatar", name: "Robot",       cost: 20, asset: "assets/avatars/robot.jpg" },
  { id: "av-owl",      type: "avatar", name: "Owl",         cost: 20, asset: "assets/avatars/owl.jpg" },

  // Power-up
  { id: "boost-2x-30", type: "powerup", name: "2x Coins (30m)", cost: 25, x: 2, minutes: 30 },
];

/* ======= STATE ======= */
let container;
let currentCoins = 0;
let correctAnswers = 0;

let currentMode = "normal";            // "normal" | "daily"
let currentLevelKey = "easy";
let currentBank = [];
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

// Equipped cosmetics + powerup
let chosenFrame  = localStorage.getItem("avatarFrame") || "";
let chosenTrail  = localStorage.getItem("trailId") || "";
let chosenTheme  = localStorage.getItem("themeId") || "";
let boosterUntil = Number(localStorage.getItem("boosterUntil") || 0);

/* ======= BOOT ======= */
document.addEventListener("DOMContentLoaded", async () => {
  const name = (localStorage.getItem("playerName") || "").trim();
  const avatar = localStorage.getItem("playerAvatar");
  if (!name || !avatar) { window.location.href = "login.html"; return; }

  currentCoins = Number(localStorage.getItem("playerCoins") || 0) || 0;

  setText("displayName", `Welcome, ${name}!`);
  const avatarEl = document.getElementById("avatarDisplay");
  if (avatarEl) { avatarEl.src = `assets/avatars/${avatar}`; applyAvatarFrame(avatarEl, chosenFrame); }

  document.getElementById("loginContainer")?.remove();
  const qc = document.getElementById("quizContainer"); if (qc) qc.style.display = "block";
  container = document.getElementById("quizContent") || document.body;

  // Server inventory sync (owned/equipped/coins/booster)
  await syncInventoryFromServer();

  // Apply cosmetics after sync
  applyTrail(chosenTrail);
  applyTheme(chosenTheme);
  renderBoostPill();

  if (!localStorage.getItem("unlockedLevels"))
    localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
  if (!localStorage.getItem("levelTrophies"))
    localStorage.setItem("levelTrophies", JSON.stringify(levelTrophies));

  handleDailyStreak();
  updateCoinsUI();
  updateXPUI();

  showIntroModule();
  wireShopModal();
  preloadCoinImage?.(); // for Coin Rain PNG
});

// 👇 Add this block right here (after DOMContentLoaded)
window.addEventListener("message", (e) => {
  // Security: accept only same-origin
  if (e.origin !== window.location.origin) return;

  const msg = e.data || {};
  if (msg.type === "coincollect_result") {
    const gained = Number(msg.coins) || 0;
    if (gained > 0) {
      awardCoins(gained);        // updates UI + calls /reward-coins
      floatCoin(`+${gained}`);   // small visual pop
      alert(`🪙 Coin Collect bonus: +${gained} coins`);
    }
  }
});


/* ======= QUIZ BANKS ======= */
const quizLevels = {
  easy: [
    { question: "What does a credit score tell people?",
      options: ["How fast you can run", "How good you are with money", "What school you go to"], correct: 1,
      learnId: "what-is-credit-score" },
    { question: "Which is a good money habit?",
      options: ["Always paying bills on time", "Spending all your money", "Losing your wallet"], correct: 0,
      learnId: "good-money-habit" },
	{ question: "What does a credit score mainly show?",
      options: ["Your grades at school", "How reliably you repay money", "How much pocket money you get"], correct: 1,
      learnId: "what-is-credit-score" },
	{ question: "You’ve got a phone contract. What should you do every month to protect your credit score?",
      options: ["Pay on time", "Ignore the bill", "Change your number"], correct: 0,
      learnId: "pay-on-time" },
	{ question: "What is ‘BNPL’ (Buy Now, Pay Later)?",
      options: ["A free gift", "A way to delay paying that can lead to fees if you miss payments", "A student discount"], correct: 1,
      learnId: "bnpl-basics" },
	{ question: "Which habit helps your future credit?",
      options: ["Keeping spending to your limit", "Sharing passwords with friends", "Missing payments occasionally"], correct: 0,
      learnId: "spend-within-limit" },
	{ question: "A ‘hard check’ on your credit file is usually done when…",
      options: ["You open a new credit account", "You check your own score", "You top up your phone"], correct: 0,
      learnId: "hard-search" },
	{ question: "If your card limit is £1000 and you owe £200, your utilisation is…",
      options: ["20%", "50%", "80%"], correct: 0,
      learnId: "utilisation" }
  ],
  medium: [
    { question: "What happens if you forget to pay your phone bill?",
      options: ["Nothing changes", "Your credit score might go down", "You get a prize"], correct: 1,
      learnId: "missed-bills" },
    { question: "Who checks your credit score?",
      options: ["Your friends","Banks and lenders","Your teacher"], correct: 1,
      learnId: "who-checks-score" },
	{ question: "You forgot a phone bill and paid it 30 days late. What’s the risk?",
      options: ["No impact", "It can be recorded and harm your credit", "Your number stops forever"], correct: 1,
      learnId: "late-payment-impact" },
	{ question: "What’s the safest way to build credit when you turn 18?",
      options: ["Apply for lots of cards", "One starter product, small spends, pay in full", "Only use BNPL"], correct: 1,
      learnId: "starter-credit" },
	{ question: "Why register on the electoral roll (if eligible)?",
      options: ["It can help lenders verify you and improve acceptance chances", "It boosts your exam results", "It lowers phone prices"], correct: 0,
      learnId: "electoral-roll" },
	{ question: "Which is a sign of fraud/phishing?",
      options: ["Spelling mistakes + urgent payment links", "Emails from your own address book", "Logos that look perfect"], correct: 0,
      learnId: "anti-fraud" },
	{ question: "Missed payments can remain on your credit report for up to…",
      options: ["6 weeks", "6 months", "6 years"], correct: 2,
      learnId: "missed-duration" },
	{ question: "An overdraft is…",
      options: ["Free money", "A type of credit that can charge interest/fees", "A student grant"], correct: 1,
      learnId: "overdrafts" }
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
      learnId: "bad-habits" },
	{ question: "You’re accepted for a £600 limit card. Best habit to build score?",
      options: ["Use ~10–30% of the limit and repay in full", "Max it and pay minimum", "Open a second card day one"], correct: 0,
      learnId: "smart-usage" },
	{ question: "Multiple hard checks in a short time can…",
      options: ["Look risky to lenders", "Always improve your score", "Have no effect"], correct: 0,
      learnId: "too-many-checks" },
	{ question: "You spot an error on your credit report. What should you do first?",
      options: ["Ignore it", "Raise a dispute with the credit reference agency", "Tell friends"], correct: 1,
      learnId: "dispute-errors" },
	{ question: "You owe £300 at 24% APR and pay only minimums. What’s the problem?",
      options: ["Interest builds and it takes longer to clear", "It boosts your score fast", "Your debt vanishes"], correct: 0,
      learnId: "min-payment-cost" },
	{ question: "Which situation risks a default marker?",
      options: ["Repeatedly missing payments and not agreeing a plan", "Checking your score often", "Paying early"], correct: 0,
      learnId: "defaults" },
	{ question: "Moving out for uni: which bill in your name affects credit?",
      options: ["Mobile/contract utilities in your name", "Library card", "Gym day-pass"], correct: 0,
      learnId: "bills-in-name" }
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

/* ======= UI / MENU ======= */
function showIntroModule() {
  const name = localStorage.getItem("playerName") || "Player";
  const daily = getTodayDailyMeta();

  container.innerHTML = `
    <p>Select a level:</p>
    <button onclick="startQuiz('easy')">🟢 Easy ${levelTrophies.easy ? "🏆" : ""}</button>
    <button onclick="startQuiz('medium')" ${unlockedLevels.medium ? "" : "disabled"}>🟡 Medium ${levelTrophies.medium ? "🏆" : ""}</button>
    <button onclick="startQuiz('hard')" ${unlockedLevels.hard ? "" : "disabled"}>🔴 Hard ${levelTrophies.hard ? "🏆" : ""}</button>

    <p id="coinCount" style="margin-top:.5rem;">🪙 Coins: ${currentCoins}</p>
    <div style="margin:.25rem 0 .5rem 0;">⭐ Level ${level}</div>

    <div class="quiz-summary" style="margin-top:.5rem;">
      <strong>🎯 Daily Challenge:</strong> ${daily.label} — Reward: +${DAILY_REWARD} coins
      <div style="margin-top:.5rem; display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
        <button onclick="startDaily()" ${daily.done ? "disabled" : ""}>${daily.done ? "Completed" : "Start Daily"}</button>
        <button onclick="openCoinRain()">🪙 Coin Rain</button>
        <!-- NEW: Coin Collect button linking to your uploaded game -->
        <a href="coincollect.html" target="_blank" rel="noopener"><button type="button">🕹️ Coin Collect</button></a>
        <button onclick="openShop()">🛍️ Shop</button>
      </div>
    </div>

    <hr>
    <a href="learning.html"><button type="button">📘 Learn About Credit Scores</button></a>
    <a href="tips.html"><button type="button">💡 Credit Score Tips</button></a>
    <button onclick="logoutUser()">🚪 Logout</button>
  `;

  renderStreakPill();
  const xpBar = document.getElementById("xpBar"); if (xpBar) xpBar.style.display = "block";
}

/* ======= QUIZ FLOW ======= */
function startQuiz(levelKey) {
  currentMode = "normal";
  currentLevelKey = levelKey;
  currentBank = quizLevels[levelKey] || [];
  correctAnswers = 0;
  currentIndex = 0;
  renderQuestion();
}

function startDaily() {
  currentMode = "daily";
  currentBank = getTodayDailySet();
  correctAnswers = 0;
  currentIndex = 0;
  localStorage.setItem("dailyActive", "1");
  renderQuestion();
}

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

      const idx = parseInt(e.currentTarget.dataset.index, 10); // crucial: currentTarget
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
      if (currentIndex < currentBank.length) renderQuestion();
      else showQuizSummary();
    }, { once: true });
  });
}

function showQuizSummary() {
  const total = currentBank.length;
  const stars = "⭐".repeat(correctAnswers) + "☆".repeat(total - correctAnswers);

  if (currentMode === "daily") {
    completeDailyIfEligible();
    container.innerHTML = `
      <div class="quiz-summary">
        <h2>Daily Summary</h2>
        <p>${correctAnswers}/${total} correct</p>
        <button onclick="startDaily()">🔁 Try Again</button>
        <button onclick="showIntroModule()">🔙 Back to Menu</button>
      </div>
    `;
    return;
  }

  let msg = "";
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
  if (levelKey === "easy" && !unlockedLevels.medium) { unlockedLevels.medium = true; changed = true; }
  else if (levelKey === "medium" && !unlockedLevels.hard) { unlockedLevels.hard = true; changed = true; }

  if (changed) {
    localStorage.setItem("unlockedLevels", JSON.stringify(unlockedLevels));
    alert("🏆 Level complete! Next level unlocked.");
  }
}

/* ======= DAILY META / COMPLETION (local only) ======= */
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
function isBoosterActive(){ return Date.now() < boosterUntil; }
function boosterMultiplier(){ return isBoosterActive() ? 2 : 1; }
function renderBoostPill(){
  const pill = document.getElementById("boostPill");
  if (!pill) return;
  if (isBoosterActive()) {
    const mins = Math.max(0, Math.ceil((boosterUntil - Date.now())/60000));
    pill.style.display = "inline-block";
    pill.textContent = `⚡ 2x Coins · ${mins}m`;
  } else pill.style.display = "none";
}
setInterval(renderBoostPill, 15000);

function awardCoins(amount) {
  // why: do not multiply negative spends
  const mult = amount > 0 ? boosterMultiplier() : 1;
  const delta = amount * mult;

  currentCoins += delta;
  localStorage.setItem("playerCoins", String(currentCoins));
  updateCoinsUI();

  fetch(`${apiBase}/reward-coins`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: localStorage.getItem("playerName"), amount: delta })
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

/* ======= SHOP (server-persisted) ======= */
function openShop(){
  const m = document.getElementById("shopModal");
  if (!m) return;
  document.body.classList.add("no-scroll"); // lock background
  m.style.display = "flex";
  renderShopItems();
}

function wireShopModal() {
  // Close button
  const closeBtn = document.getElementById("closeShopBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      const m = document.getElementById("shopModal");
      if (m) m.style.display = "none";
      document.body.classList.remove("no-scroll"); // unlock background
    });
  }
  // Click overlay to close
  const modal = document.getElementById("shopModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
        document.body.classList.remove("no-scroll");
      }
    });
  }
}

function ownKey(id){ return "own_"+id; }
function isOwned(it){ return it.type==="powerup" ? false : localStorage.getItem(ownKey(it.id))==="1"; }
function isUsing(it){
  if (it.type==="frame")  return chosenFrame===it.id;
  if (it.type==="trail")  return chosenTrail===it.id;
  if (it.type==="bg")     return chosenTheme===it.id;
  if (it.type==="avatar") return (localStorage.getItem("playerAvatar")||"").endsWith(it.asset.split("/").pop());
  return false;
}

function renderShopItems(){
  const grid = document.getElementById("shopItems"); if (!grid) return;
  grid.innerHTML = SHOP_ITEMS.map(it => {
    const owned = isOwned(it), using = isUsing(it);
    const preview = it.type==="frame"  ? `<div class="frame-preview" style="border-color:${it.color}"></div>` :
                   it.type==="trail"   ? `<div class="trail-preview" style="background:linear-gradient(${it.color}, transparent); height:32px;"></div>` :
                   it.type==="bg"      ? `<div class="bg-preview" style="width:64px;height:36px;border-radius:8px;background:url('${it.asset}') center/cover;"></div>` :
                   it.type==="avatar"  ? `<img alt="${it.name}" src="${it.asset}" style="width:48px;height:48px;border-radius:50%;border:2px solid #fff;">` :
                   it.type==="powerup" ? `<div class="power-preview" style="font-weight:700;">⚡ ${it.x}x / ${it.minutes}m</div>` : "";
    const status = it.type==="powerup" ? `Cost: ${it.cost} 🪙` : (owned ? (using?"Equipped":"Owned") : `Cost: ${it.cost} 🪙`);
    const cta = it.type==="powerup" ? `<button onclick="activatePowerup('${it.id}')">Activate</button>`
      : (!owned ? `<button onclick="buyItem('${it.id}')">Buy</button>` : (!using ? `<button onclick="equipItem('${it.id}')">Equip</button>` : `<button disabled>Equipped</button>`));
    return `<div class="shop-item">${preview}<div><strong>${it.name}</strong></div><div>${status}</div><div style="margin-top:.25rem;">${cta}</div></div>`;
  }).join("");
}

/* Server-backed buy/equip + sync */
async function syncInventoryFromServer() {
  try {
    const username = (localStorage.getItem("playerName") || "").trim();
    if (!username) return;

    const res = await fetch(`${apiBase}/inventory?username=` + encodeURIComponent(username));
    if (!res.ok) return;
    const inv = await res.json();

    (inv.ownedItems || []).forEach(id => localStorage.setItem("own_" + id, "1"));

    if (inv.avatarFrame) {
      localStorage.setItem("avatarFrame", inv.avatarFrame);
      chosenFrame = inv.avatarFrame;
      const avatarEl = document.getElementById("avatarDisplay");
      if (avatarEl) applyAvatarFrame(avatarEl, chosenFrame);
    }
    if (inv.trailId) {
      localStorage.setItem("trailId", inv.trailId);
      chosenTrail = inv.trailId;
    }
    if (inv.themeId) {
      localStorage.setItem("themeId", inv.themeId);
      chosenTheme = inv.themeId;
    }
    if (typeof inv.boosterUntil === "number") {
      localStorage.setItem("boosterUntil", String(inv.boosterUntil));
      boosterUntil = inv.boosterUntil;
    }
    if (Number.isFinite(inv.coins)) {
      currentCoins = inv.coins;
      localStorage.setItem("playerCoins", String(currentCoins));
    }
    if (inv.avatar) {
      localStorage.setItem("playerAvatar", inv.avatar);
      const avatarEl = document.getElementById("avatarDisplay");
      if (avatarEl) avatarEl.src = `assets/avatars/${inv.avatar}`;
    }
  } catch {}
}

async function buyItem(id){
  const it = SHOP_ITEMS.find(x=>x.id===id); if(!it) return;
  const cost = it.cost || 0;

  try {
    const res = await fetch(`${apiBase}/inventory/buy`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: localStorage.getItem("playerName"), itemId: id, cost })
    });
    if (!res.ok) { const msg = await res.text(); alert(msg || "Purchase failed"); return; }
    const data = await res.json();

    localStorage.setItem("own_" + id, "1");
    if (Number.isFinite(data.coins)) {
      currentCoins = data.coins;
      localStorage.setItem("playerCoins", String(currentCoins));
      updateCoinsUI();
    }
    renderShopItems();

    // auto-equip on first buy for cosmetics
    const t = itemTypeFromIdClient(id);
    if (t === "frame" || t === "trail" || t === "bg") equipItem(id);
    if (t === "avatar") equipItem(id); // set avatar immediately
  } catch {
    alert("Network error buying item");
  }
}

async function equipItem(id){
  const it = SHOP_ITEMS.find(x=>x.id===id); if(!it) return;
  const t = itemTypeFromIdClient(id);
  const payload = { username: localStorage.getItem("playerName"), itemId: id, type: t };

  if (t === "avatar") {
    const filename = (it.asset || "").split("/").pop();
    payload.value = filename;
  }

  try {
    const res = await fetch(`${apiBase}/inventory/equip`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { const msg = await res.text(); alert(msg || "Equip failed"); return; }
    const data = await res.json();

    if (t === "frame") {
      chosenFrame = id; localStorage.setItem("avatarFrame", id);
      const avatarEl=document.getElementById("avatarDisplay"); if(avatarEl) applyAvatarFrame(avatarEl, id);
    } else if (t === "trail") {
      chosenTrail = id; localStorage.setItem("trailId", id); applyTrail(id);
    } else if (t === "bg") {
      chosenTheme = id; localStorage.setItem("themeId", id); applyTheme(id);
    } else if (t === "avatar") {
      const filename = (it.asset || "").split("/").pop();
      localStorage.setItem("playerAvatar", filename);
      const avatarEl=document.getElementById("avatarDisplay"); if(avatarEl) avatarEl.src=`assets/avatars/${filename}`;
    }
    renderShopItems();
  } catch {
    alert("Network error equipping item");
  }
}

function activatePowerup(id){
  const it = SHOP_ITEMS.find(x=>x.id===id && x.type==="powerup"); if(!it) return;
  if (currentCoins < it.cost) { alert("Not enough coins"); return; }
  awardCoins(-it.cost);
  boosterUntil = Math.max(Date.now(), boosterUntil) + it.minutes*60*1000;
  localStorage.setItem("boosterUntil", String(boosterUntil));
  alert(`⚡ ${it.x}x coins active for ${it.minutes} minutes`);
  renderBoostPill();
}

/* Cosmetics appliers */
function applyAvatarFrame(imgEl, id){
  const item = SHOP_ITEMS.find(x=>x.id===id && x.type==="frame");
  if (!item){ imgEl.style.boxShadow=""; imgEl.style.borderColor=""; imgEl.style.borderWidth="2px"; return; }
  imgEl.style.borderColor=item.color; imgEl.style.borderWidth="4px";
}
function applyTrail(id){
  const el=document.querySelector(".rocket-trail"); if(!el) return;
  const item=SHOP_ITEMS.find(x=>x.id===id && x.type==="trail");
  if(!item){ el.style.background="linear-gradient(#fff, transparent)"; return; }
  el.style.background=`linear-gradient(${item.color}, transparent)`;
}
function applyTheme(id){
  const item=SHOP_ITEMS.find(x=>x.id===id && x.type==="bg");
  const body=document.body;
  if(!item){
    body.style.backgroundImage="url('assets/bg-kids.jpg')";
    body.style.backgroundSize="cover"; body.style.backgroundPosition="center"; return;
  }
  body.style.backgroundImage=`url('${item.asset}')`;
  body.style.backgroundSize="cover"; body.style.backgroundPosition="center";
}

/* ======= COIN RAIN MINI-GAME (PNG) ======= */
let _coinImgPreloaded = false;
function preloadCoinImage() {
  if (_coinImgPreloaded) return;
  const img = new Image();
  img.src = "assets/coin.png";
  img.onload = () => { _coinImgPreloaded = true; };
}

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
  document.getElementById('crCloseBtn')?.addEventListener('click', endCoinRainEarly);
  document.getElementById('crDoneBtn')?.addEventListener('click', closeCoinRain);
  document.addEventListener('keydown', (e) => {
    if (document.getElementById("coinRainOverlay")?.style.display === "flex" && e.key === "Escape") {
      if (crState) endCoinRainEarly(); else closeCoinRain();
    }
  });
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
    const delay = 450 + Math.random() * 150;
    crState.spawnId = setTimeout(() => { spawnCoin(playfield); scheduleSpawn(); }, delay);
  }
  scheduleSpawn();

  roundEl.textContent = "+0";
}

function spawnCoin(containerEl) {
  const coin = document.createElement("div");
  coin.className = "cr-coin";
  coin.setAttribute("aria-label", "coin");

  const maxX = Math.max(0, window.innerWidth - 56);
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

function endCoinRain() {
  if (!crState) return;

  cancelAnimationFrame(crState.timerId);
  clearTimeout(crState.spawnId);

  const playfield = document.getElementById("crPlayfield");
  if (playfield) {
    playfield.style.pointerEvents = "none";
    playfield.querySelectorAll(".cr-coin").forEach(n => n.remove());
  }

  const s = document.getElementById("crSummary");
  const txt = document.getElementById("crSummaryText");
  if (txt) txt.textContent = `You caught ${crState.caught} coin${crState.caught === 1 ? "" : "s"}!`;
  if (s) s.style.display = "block";

  crState = null;
}

function endCoinRainEarly() {
  if (!crState) return closeCoinRain();
  endCoinRain();
}

function closeCoinRain() {
  const overlay = document.getElementById("coinRainOverlay");
  if (!overlay) return;

  const playfield = document.getElementById("crPlayfield");
  if (playfield) {
    playfield.innerHTML = "";
  }
  const s = document.getElementById("crSummary");
  if (s) s.style.display = "none";

  overlay.style.display = "none";
  if (playfield) playfield.style.pointerEvents = "auto";
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

/* ======= UTILS ======= */
function setText(id, val){ const el = document.getElementById(id); if (el) el.textContent = val; }

function itemTypeFromIdClient(itemId){
  if (itemId.startsWith("frame-")) return "frame";
  if (itemId.startsWith("trail-")) return "trail";
  if (itemId.startsWith("bg-"))    return "bg";
  if (itemId.startsWith("av-"))    return "avatar";
  if (itemId.startsWith("boost-")) return "powerup";
  return "unknown";
}

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
  localStorage.removeItem("trailId");
  localStorage.removeItem("themeId");
  localStorage.removeItem("boosterUntil");
  localStorage.removeItem("dailyActive");
  window.location.href = "login.html";
}
