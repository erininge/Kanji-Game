/*
  Kanji Meaning Trainer PWA
  - Meaning only (no readings)
  - Pick JLPT level
  - Optional: include compounds (combination kanji)
  - Direction: Kanji→English / English→Kanji / Mixed
  - Multiple Choice / Written / Mixed
  - NEVER auto-advances (user must tap Next)
*/
const $ = (id) => document.getElementById(id);

const screens = { setup: $("screenSetup"), game: $("screenGame"), done: $("screenDone") };
const LESSON_SIZE = 10;
const STAR_STORAGE_KEY = "kanji-meaning-trainer-starred";

const state = {
  all: [],
  bank: [],
  session: [],
  idx: 0,
  correct: 0,
  wrongAttempts: 0,

  level: "N3",
  lessons: ["all"],
  compounds: "off",
  directionSetting: "mixed", // k-en | en-k | mixed
  modeSetting: "mixed",      // mc | write | mixed
  shuffle: "on",
  count: 10,
  practiceMode: "all",
  starred: new Set(),

  current: null,
  currentDirection: null,
  currentMode: null,
  answeredCorrect: false,
  selectedChoice: null,
};

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("installBtn").hidden = false;
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $("installBtn").hidden = true;
});

function showScreen(name){
  Object.values(screens).forEach(s => s.hidden = true);
  screens[name].hidden = false;
}

function shuffleArray(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nfkc(s){ return (s ?? "").normalize("NFKC"); }

function normalizeEnglish(s){
  s = nfkc(s).trim().toLowerCase();
  s = s.replace(/[\u2019’]/g, "'");
  // drop punctuation
  s = s.replace(/[^a-z0-9\s']/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // soften "a/an/the"
  s = s.replace(/^(a|an|the)\s+/g, "");
  return s;
}

function normalizeKanji(s){
  s = nfkc(s).trim();
  s = s.replace(/[\s　]/g, "");
  return s;
}

function pickDirection(){
  if (state.directionSetting === "mixed"){
    return Math.random() < 0.5 ? "k-en" : "en-k";
  }
  return state.directionSetting;
}

function pickMode(){
  if (state.modeSetting === "mixed"){
    return Math.random() < 0.5 ? "mc" : "write";
  }
  return state.modeSetting;
}

function getLevelItems(level){
  return state.all
    .filter(item => item.level === level)
    .slice()
    .sort((a, b) => a.id - b.id);
}

function getLessonCount(level){
  const total = getLevelItems(level).length;
  return Math.max(1, Math.ceil(total / LESSON_SIZE));
}

function updateLessonOptions(){
  const lessonSelect = $("lesson");
  const previous = state.lessons.length ? state.lessons : getSelectedLessonValues();
  const count = getLessonCount($("level").value);
  lessonSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All lessons";
  lessonSelect.appendChild(allOption);

  for (let i = 1; i <= count; i += 1){
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = `Lesson ${i}`;
    lessonSelect.appendChild(option);
  }

  const available = new Set([...lessonSelect.options].map(option => option.value));
  const filtered = previous.filter(value => available.has(value));
  setLessonSelections(filtered.length ? filtered : ["all"]);
}

function getSelectedLessonValues(){
  return [...$("lesson").selectedOptions].map(option => option.value);
}

function normalizeLessonSelection(values){
  const unique = [...new Set(values)];
  if (unique.includes("all") || unique.length === 0) return ["all"];
  return unique;
}

function setLessonSelections(values){
  const normalized = normalizeLessonSelection(values);
  const select = $("lesson");
  [...select.options].forEach(option => {
    option.selected = normalized.includes(option.value);
  });
  state.lessons = normalized;
}

function lessonLabelText(){
  if (state.lessons.includes("all")) return "All lessons";
  const numbers = state.lessons.map(Number).sort((a, b) => a - b);
  if (numbers.length === 1) return `Lesson ${numbers[0]}`;
  return `Lessons ${numbers.join(", ")}`;
}

function loadStarred(){
  try {
    const raw = localStorage.getItem(STAR_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(Number));
  } catch {
    return new Set();
  }
}

function saveStarred(){
  localStorage.setItem(STAR_STORAGE_KEY, JSON.stringify([...state.starred]));
}

function isStarred(item){
  return state.starred.has(item.id);
}

function updateStarButton(){
  const btn = $("starBtn");
  if (!state.current){
    btn.hidden = true;
    return;
  }
  const starred = isStarred(state.current);
  btn.hidden = false;
  btn.classList.toggle("starred", starred);
  btn.setAttribute("aria-pressed", starred);
  btn.textContent = starred ? "★" : "☆";
  btn.title = starred ? "Unstar" : "Mark for review";
}

function toggleStar(){
  if (!state.current) return;
  if (isStarred(state.current)) state.starred.delete(state.current.id);
  else state.starred.add(state.current.id);
  saveStarred();
  updateStarButton();
}

function setSetupMessage(message){
  const el = $("setupMessage");
  if (!message){
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function setMetaPill(){
  const lesson = lessonLabelText();
  const lvl = `${state.level} ${lesson}${state.compounds === "on" ? " +comp" : ""}`;
  const d = state.directionSetting === "mixed" ? "Mixed dir" : (state.directionSetting === "k-en" ? "K→EN" : "EN→K");
  const m = state.modeSetting === "mixed" ? "Mixed mode" : (state.modeSetting === "mc" ? "MC" : "Written");
  const p = state.practiceMode === "starred" ? "Starred" : "All";
  $("metaPill").textContent = `${lvl} • ${d} • ${m} • ${p}`;
}

function buildBank(){
  setSetupMessage("");
  const lvl = state.level;
  const includeComp = state.compounds === "on";
  const lessonValues = state.lessons;
  const items = getLevelItems(lvl);
  let sliced = items;
  if (!lessonValues.includes("all")){
    const lessonSet = new Set(lessonValues.map(Number));
    sliced = items.filter((item, index) => lessonSet.has(Math.floor(index / LESSON_SIZE) + 1));
  }
  const filtered = sliced.filter(x => (includeComp ? true : !x.compound));
  state.bank = state.practiceMode === "starred"
    ? filtered.filter(x => state.starred.has(x.id))
    : filtered;
  const lessonLabel = lessonValues.includes("all") ? "all lessons" : `lessons ${lessonValues.map(Number).sort((a, b) => a - b).join(", ")}`;
  const practiceLabel = state.practiceMode === "starred" ? "starred only" : "all items";
  $("bankInfo").textContent = `Bank size: ${state.bank.length} item(s) in ${lvl} ${lessonLabel}${includeComp ? " (including compounds)" : ""} • ${practiceLabel}. Starred total: ${state.starred.size}.`;
}

function resetQuestionUI(){
  state.answeredCorrect = false;
  state.selectedChoice = null;

  $("feedback").hidden = true;
  $("feedback").className = "feedback";
  $("nextBtn").disabled = true;

  $("writeInput").value = "";
  $("writeInput").disabled = false;

  $("choices").innerHTML = "";
  $("mcArea").hidden = true;
  $("writeArea").hidden = true;
}

function setFeedback(ok, html){
  const el = $("feedback");
  el.hidden = false;
  el.className = "feedback " + (ok ? "good" : "bad");
  el.innerHTML = html;
}

function promptText(){
  // what user sees as question
  if (state.currentDirection === "k-en") return state.current.kanji;
  return state.current.meaning;
}

function targetText(){
  // correct answer text
  if (state.currentDirection === "k-en") return state.current.meaning;
  return state.current.kanji;
}

function promptLabel(){
  if (state.currentDirection === "k-en") return "What does this mean (English)?";
  return "Which kanji matches this meaning?";
}

function buildChoices(){
  const correct = targetText();
  const pool = state.bank
    .filter(x => x.id !== state.current.id)
    .map(x => (state.currentDirection === "k-en") ? x.meaning : x.kanji);

  const distractors = shuffleArray(pool).slice(0, 3);
  const all = shuffleArray([correct, ...distractors]);
  return all;
}

function renderMC(){
  $("mcArea").hidden = false;
  $("writeArea").hidden = true;

  const choices = buildChoices();
  const wrap = $("choices");
  wrap.innerHTML = "";

  choices.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      [...wrap.querySelectorAll(".choice")].forEach(x => x.classList.remove("selected"));
      btn.classList.add("selected");
      state.selectedChoice = t;
    });
    wrap.appendChild(btn);
  });
}

function renderWritten(){
  $("mcArea").hidden = true;
  $("writeArea").hidden = false;
  $("writeInput").focus();
}

function renderQuestion(){
  resetQuestionUI();

  state.current = state.session[state.idx];
  state.currentDirection = pickDirection();
  state.currentMode = pickMode();

  $("progressPill").textContent = `Q ${state.idx + 1} / ${state.session.length}`;
  $("promptLabel").textContent = promptLabel();
  $("questionText").textContent = promptText();
  updateStarButton();

  if (state.currentMode === "mc") renderMC();
  else renderWritten();
}

function lockAfterCorrect(){
  state.answeredCorrect = true;
  $("nextBtn").disabled = false;
  $("writeInput").disabled = true;
}

function decorateMC(correctText, selectedText){
  const btns = [...$("choices").querySelectorAll(".choice")];
  btns.forEach((btn) => {
    if (btn.textContent === correctText) btn.classList.add("good");
    else if (btn.textContent === selectedText) btn.classList.add("bad");
  });
}

function isCorrectWritten(input){
  if (state.currentDirection === "k-en"){
    const norm = normalizeEnglish(input);
    const targets = [state.current.meaning, ...(state.current.alts ?? [])].map(normalizeEnglish);
    return targets.includes(norm);
  } else {
    const norm = normalizeKanji(input);
    const targets = [state.current.kanji].map(normalizeKanji);
    return targets.includes(norm);
  }
}

function gradeMC(){
  if (!state.selectedChoice){
    setFeedback(false, "Pick an option first.");
    return;
  }
  const correct = targetText();
  const ok = state.selectedChoice === correct;

  decorateMC(correct, state.selectedChoice);

  if (ok){
    state.correct += 1;
    $("correctCount").textContent = state.correct;
    setFeedback(true, "Correct ✅");
    lockAfterCorrect();
  } else {
    state.wrongAttempts += 1;
    $("wrongCount").textContent = state.wrongAttempts;
    setFeedback(false, `Not quite ❌<div class="tiny muted">Correct: <b>${correct}</b></div>`);
    $("nextBtn").disabled = false; // never auto-advance
  }
}

function gradeWritten(){
  const input = $("writeInput").value;
  if (!input.trim()){
    setFeedback(false, "Type an answer first.");
    return;
  }
  const correct = targetText();
  const ok = isCorrectWritten(input);

  if (ok){
    state.correct += 1;
    $("correctCount").textContent = state.correct;
    setFeedback(true, "Correct ✅");
    lockAfterCorrect();
  } else {
    state.wrongAttempts += 1;
    $("wrongCount").textContent = state.wrongAttempts;
    setFeedback(false, `Not quite ❌<div class="tiny muted">Correct: <b>${correct}</b></div>`);
    $("nextBtn").disabled = false; // never auto-advance
  }
}

function submit(){
  if (state.answeredCorrect){
    setFeedback(true, "Already correct ✅ Tap Next when you're ready.");
    return;
  }
  if (state.currentMode === "mc") gradeMC();
  else gradeWritten();
}

function showAnswer(){
  const correct = targetText();
  const extra = state.current.compound ? `<div class="tiny muted">Compound</div>` : `<div class="tiny muted">Single kanji</div>`;
  setFeedback(true, `<div><b>Answer:</b> ${correct}</div>${extra}`);
  $("nextBtn").disabled = false;
}

function next(){
  state.idx += 1;
  if (state.idx >= state.session.length){
    finish();
    return;
  }
  renderQuestion();
}

function finish(){
  showScreen("done");
  $("scoreText").textContent = `${state.correct}/${state.session.length}`;
  $("doneCorrect").textContent = state.correct;
  $("doneWrong").textContent = state.wrongAttempts;
}

function startSession({count, shuffle}){
  setSetupMessage("");
  if (state.practiceMode === "starred" && state.bank.length === 0){
    setSetupMessage("No starred items yet. Tap ☆ on a card to mark it for review, then try Starred only again.");
    return;
  }
  if (state.bank.length < 4){
    setSetupMessage("Not enough items in this bank (need at least 4). Try enabling compounds or choosing another level.");
    return;
  }

  state.count = count;
  state.shuffle = shuffle;

  const bank = shuffle === "on" ? shuffleArray(state.bank) : state.bank.slice();
  state.session = bank.slice(0, Math.min(count, bank.length));

  state.idx = 0;
  state.correct = 0;
  state.wrongAttempts = 0;

  $("correctCount").textContent = "0";
  $("wrongCount").textContent = "0";

  setMetaPill();
  showScreen("game");
  renderQuestion();
}

// UI wiring
$("count").addEventListener("input", () => $("countLabel").textContent = $("count").value);
$("aboutBtn").addEventListener("click", () => $("about").hidden = !$("about").hidden);
$("level").addEventListener("change", () => {
  updateLessonOptions();
  setLessonSelections(getSelectedLessonValues());
  state.level = $("level").value;
  buildBank();
});
$("lesson").addEventListener("change", () => {
  setLessonSelections(getSelectedLessonValues());
  buildBank();
});
$("compounds").addEventListener("change", () => {
  state.compounds = $("compounds").value;
  buildBank();
});
$("practiceMode").addEventListener("change", () => {
  state.practiceMode = $("practiceMode").value;
  buildBank();
});

$("startBtn").addEventListener("click", () => {
  state.level = $("level").value;
  setLessonSelections(getSelectedLessonValues());
  state.compounds = $("compounds").value;
  state.directionSetting = $("direction").value;
  state.modeSetting = $("mode").value;
  state.shuffle = $("shuffle").value;
  state.practiceMode = $("practiceMode").value;

  buildBank();
  startSession({count: parseInt($("count").value, 10), shuffle: state.shuffle});
});

$("practiceBtn").addEventListener("click", () => {
  // quick 5 uses current dropdown values
  state.level = $("level").value;
  setLessonSelections(getSelectedLessonValues());
  state.compounds = $("compounds").value;
  state.directionSetting = $("direction").value;
  state.modeSetting = $("mode").value;
  state.shuffle = "on";
  state.practiceMode = $("practiceMode").value;

  $("count").value = "5";
  $("countLabel").textContent = "5";

  buildBank();
  startSession({count: 5, shuffle: "on"});
});

$("submitBtn").addEventListener("click", submit);
$("showBtn").addEventListener("click", showAnswer);
$("nextBtn").addEventListener("click", next);
$("writeInput").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
$("starBtn").addEventListener("click", toggleStar);

$("quitBtn").addEventListener("click", () => {
  showScreen("setup");
  buildBank();
});
$("restartBtn").addEventListener("click", () => startSession({count: state.count, shuffle: state.shuffle}));
$("backBtn").addEventListener("click", () => {
  showScreen("setup");
  buildBank();
});

async function init(){
  if ("serviceWorker" in navigator){
    try { await navigator.serviceWorker.register("sw.js"); } catch {}
  }
  const res = await fetch("data/kanji.json", {cache: "no-store"});
  state.all = await res.json();
  state.starred = loadStarred();
  updateLessonOptions();
  $("countLabel").textContent = $("count").value;
  buildBank();
  showScreen("setup");
}
init();
