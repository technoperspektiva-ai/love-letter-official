import { backButton, haptic, initData, initTelegram, openInvoice, openTelegram, shareLink, startParam } from "./telegram-bridge.js";
import { defaultChoices, presets, suggestions } from "./data.js";

const root = document.getElementById("app");
const params = new URLSearchParams(location.search);
const LOCAL_DEMO = ["localhost","127.0.0.1"].includes(location.hostname) && params.get("demo") === "1";

const state = {
  route: "home",
  session: null,
  stories: [],
  wizard: null,
  ready: null,
  recipient: null,
  recipientStage: "envelope",
  recipientReturnRoute: null,
  modal: null,
  toast: "",
  query: ""
};

const mock = {
  session: {
    user:{id:"777",username:"hodynnyk",firstName:"Maxwell",lastName:"",photoUrl:null,refCode:"rose7x",termsAccepted:true},
    credits:{monthlyLimit:3,monthlyUsed:1,monthlyRemaining:2,bonus:1,paid:0,totalAvailable:3,resetsAt:new Date(Date.now()+864000000).toISOString()},
    referrals:{qualified:2,pending:1,link:"https://t.me/love_letter_official_bot?startapp=ref_rose7x"},
    pricing:{letterStars:29,currency:"XTR"},stories:2,botUsername:"love_letter_official_bot"
  },
  stories:[
    {id:"story_1",public_token:"demo1",recipient:"Кохана",title:"Побудьмо удвох",created_at:Date.now()-86400000,updated_at:Date.now()-86400000,choice_index:1,chosen_at:Date.now()-3600000},
    {id:"story_2",public_token:"demo2",recipient:"Для тебе",title:"Кілька слів для тебе",created_at:Date.now()-604800000,updated_at:Date.now()-604800000,choice_index:null,chosen_at:null}
  ],
  payloads:{
    story_1:{recipient:"Кохана",salutation:"це тобі",title:"Побудьмо удвох",message:"Хочу трохи сповільнитися й побути з тобою без зайвих планів навколо.\n\nОбери, який вечір зараз звучить найкраще.",signature:"Я все організую ♡",font:"romantic",occasion:"date",choiceTitle:"Що будемо робити?",choices:structuredClone(defaultChoices),finalTitle:"Домовились",finalNote:"Я вже передчуваю цей момент.",finalDate:"",finalTime:""},
    story_2:{recipient:"Для тебе",salutation:"це тобі",title:"Кілька слів для тебе",message:"Серед сотень повідомлень я хочу залишити тобі дещо інше.\n\nМаленьку паузу. Трохи тепла. Нагадування, що я усміхаюся, коли думаю про тебе.",signature:"З ніжністю",font:"classic",occasion:"just-because",choiceTitle:"Що будемо робити?",choices:structuredClone(defaultChoices),finalTitle:"Домовились",finalNote:"Я вже передчуваю цей момент.",finalDate:"",finalTime:""}
  }
};

function esc(value="") {
  return String(value).replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
}
function fmtDate(value) {
  try { return new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"short"}).format(new Date(Number(value)||value)); } catch { return ""; }
}
function monthLabel(iso) {
  try { return new Intl.DateTimeFormat("uk-UA",{day:"numeric",month:"long"}).format(new Date(iso)); } catch { return "наступного місяця"; }
}
function initials(user) {
  return (user?.firstName?.[0] || user?.username?.[0] || "L").toUpperCase();
}
function clone(value){ return structuredClone(value); }
function clientRequestId(){ return crypto.randomUUID?.() || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`; }

function toast(message) {
  state.toast = message;
  renderToast();
  clearTimeout(window.__llToast);
  window.__llToast=setTimeout(()=>{state.toast="";renderToast();},2600);
}
function renderToast() {
  document.querySelector(".toast")?.remove();
  if(!state.toast) return;
  const el=document.createElement("div");
  el.className="toast";
  el.textContent=state.toast;
  document.body.appendChild(el);
}

function draftKey(){
  return state.session?.user?.id ? `love-letter-official:draft:${state.session.user.id}` : "love-letter-official:draft";
}
function readDraft(){
  try{
    const data=JSON.parse(localStorage.getItem(draftKey())||"null");
    if(!data?.payload) return null;
    return data;
  }catch{return null}
}
function saveDraft(){
  if(!state.wizard || state.wizard.editId) return;
  localStorage.setItem(draftKey(), JSON.stringify({...state.wizard,savedAt:Date.now()}));
}
function clearDraft(){ localStorage.removeItem(draftKey()); }
function discardDraft(){ clearDraft(); if(state.route==="home") render(); else go("home"); }

async function api(path, options={}) {
  if (LOCAL_DEMO) return mockApi(path, options);
  const headers = new Headers(options.headers || {});
  if(options.body && !headers.has("content-type")) headers.set("content-type","application/json");
  const data = initData();
  if (data) headers.set("authorization",`tma ${data}`);
  const response = await fetch(path,{...options,headers});
  const payload = await response.json().catch(()=>({ok:false,error:"Некоректна відповідь сервера"}));
  if (!response.ok) {
    const error = new Error(payload.error || "Помилка запиту");
    error.status=response.status; error.payload=payload; throw error;
  }
  return payload;
}

async function mockApi(path, options={}) {
  await new Promise(r=>setTimeout(r,80));
  const method=(options.method||"GET").toUpperCase();
  if(path==="/api/session"||path==="/api/account") return {ok:true,...clone(mock.session)};
  if(path==="/api/stories"&&method==="GET") return {ok:true,stories:clone(mock.stories)};
  const single=path.match(/^\/api\/stories\/([^/]+)$/);
  if(single && method==="GET"){
    const story=mock.stories.find(x=>x.id===single[1]);
    if(!story) throw Object.assign(new Error("Лист не знайдено"),{status:404});
    return {ok:true,story:{...clone(story),payload:clone(mock.payloads[story.id])}};
  }
  if(single && method==="PATCH"){
    const body=JSON.parse(options.body||"{}"), payload=body.payload||body;
    const story=mock.stories.find(x=>x.id===single[1]);
    if(!story) throw Object.assign(new Error("Лист не знайдено"),{status:404});
    mock.payloads[story.id]=clone(payload); story.recipient=payload.recipient; story.title=payload.title; story.updated_at=Date.now();
    return {ok:true,story:{id:story.id,publicToken:story.public_token,recipient:story.recipient,title:story.title,webPath:`/l/${story.public_token}`,miniAppLink:`https://t.me/love_letter_official_bot?startapp=letter_${story.public_token}`}};
  }
  if(path==="/api/stories"&&method==="POST") {
    const body=JSON.parse(options.body||"{}"), payload=body.payload||body;
    if(mock.session.credits.totalAvailable<=0){
      const err=new Error("Усі доступні листи використано");err.status=402;throw err;
    }
    const item={id:`story_${Date.now()}`,public_token:`demo${Date.now()}`,recipient:payload.recipient,title:payload.title,created_at:Date.now(),updated_at:Date.now(),choice_index:null};
    mock.stories.unshift(item);mock.payloads[item.id]=clone(payload);
    if(mock.session.credits.monthlyRemaining>0){mock.session.credits.monthlyUsed++;mock.session.credits.monthlyRemaining--}
    else if(mock.session.credits.bonus>0) mock.session.credits.bonus--;
    else if(mock.session.credits.paid>0) mock.session.credits.paid--;
    mock.session.credits.totalAvailable--;
    mock.session.stories=mock.stories.length;
    return {ok:true,story:{id:item.id,publicToken:item.public_token,recipient:item.recipient,title:item.title,webPath:`/l/${item.public_token}`,miniAppLink:`https://t.me/love_letter_official_bot?startapp=letter_${item.public_token}`},account:clone(mock.session)};
  }
  if(path.startsWith("/api/public/")&&method==="GET") {
    const token=path.split("/").pop();
    const story=mock.stories.find(x=>x.public_token===token)||mock.stories[0];
    return {ok:true,story:{publicToken:token,payload:clone(mock.payloads[story.id]),choiceIndex:story.choice_index}};
  }
  if(path.includes("/choice")&&method==="POST") return {ok:true,choiceIndex:Number(JSON.parse(options.body).choiceIndex),chosenAt:Date.now()};
  if(path==="/api/account/terms"&&method==="POST"){mock.session.user.termsAccepted=true;return {ok:true}};
  if(path==="/api/payments/invoice"&&method==="POST") return {ok:true,paymentId:"pay_demo",invoiceUrl:"https://t.me/$demo_invoice",stars:29};
  if(path.startsWith("/api/payments/")) return {ok:true,payment:{status:"paid"}};
  if(single&&method==="DELETE"){mock.stories=mock.stories.filter(s=>s.id!==single[1]);delete mock.payloads[single[1]];mock.session.stories=mock.stories.length;return {ok:true}};
  return {ok:true};
}

function topbar() {
  const u=state.session?.user;
  return `<header class="tg-topbar">
    <button class="brand-lockup" data-action="home" aria-label="На головну">
      <img src="/brand/logo-main.svg" alt="Love Letter"><span class="brand-fallback hidden">Love Letter</span>
    </button>
    ${u?`<button class="avatar-btn" data-action="profile" aria-label="Профіль">${u.photoUrl?`<img src="${esc(u.photoUrl)}" alt="">`:esc(initials(u))}</button>`:""}
  </header>`;
}
function nav() {
  if(["wizard","ready","recipient"].includes(state.route)) return "";
  const active=state.route;
  return `<nav class="bottom-nav" aria-label="Головна навігація">
    <button class="nav-btn ${active==="home"?"is-active":""}" data-action="home"><span class="nav-icon">⌂</span><span>Головна</span></button>
    <button class="nav-btn ${active==="letters"?"is-active":""}" data-action="letters"><span class="nav-icon">▤</span><span>Листи</span></button>
    <button class="nav-create" data-action="create" aria-label="Створити лист">＋</button>
    <button class="nav-btn ${active==="ideas"?"is-active":""}" data-action="ideas"><span class="nav-icon">✦</span><span>Ідеї</span></button>
    <button class="nav-btn ${active==="profile"?"is-active":""}" data-action="profile"><span class="nav-icon">♡</span><span>Профіль</span></button>
  </nav>`;
}

function render() {
  backButton(
    ["wizard","ready"].includes(state.route) || (state.route==="recipient" && Boolean(state.recipientReturnRoute)),
    ()=>state.route==="wizard"?go("home"):state.route==="ready"?go("letters"):go(state.recipientReturnRoute||"home")
  );
  if(state.route==="recipient") return renderRecipient();
  const body =
    state.route==="home"?renderHome():
    state.route==="letters"?renderLetters():
    state.route==="ideas"?renderIdeas():
    state.route==="profile"?renderProfile():
    state.route==="wizard"?renderWizard():
    state.route==="ready"?renderReady():
    renderHome();
  root.innerHTML=`${topbar()}<main class="page page-enter">${body}</main>${nav()}${renderModal()}`;
  renderToast();
}

function creditsHtml() {
  const c=state.session.credits;
  const hearts=Array.from({length:c.monthlyLimit},(_,i)=>`<span class="credit-heart ${i<c.monthlyUsed?"is-used":""}">♡</span>`).join("");
  const n=c.monthlyRemaining;
  const noun=n===1?"лист":(n>=2&&n<=4?"листи":"листів");
  return `<div class="credit-strip">
    <div class="credit-main"><strong>${n} безкоштовн${n===1?"ий":"их"} ${noun}</strong><small>оновляться ${esc(monthLabel(c.resetsAt))}</small><div class="bonus-line">${c.bonus?`<span class="pill">＋${c.bonus} за друзів</span>`:""}${c.paid?`<span class="pill">＋${c.paid} придбано</span>`:""}</div></div>
    <div class="credit-hearts" aria-label="Використання безкоштовних листів">${hearts}</div>
  </div>`;
}

function draftRibbon(){
  const draft=readDraft();
  if(!draft) return "";
  return `<section class="draft-ribbon">
    <div class="draft-icon">✎</div>
    <div><div class="kicker">Чернетка</div><strong>${esc(draft.payload?.recipient||"Твої слова чекають")}</strong><small>${esc(draft.payload?.title||"Продовж з того місця, де зупинився.")}</small></div>
    <button class="text-btn" data-action="resume-draft">Продовжити →</button>
  </section>`;
}

function renderHome() {
  const u=state.session.user;
  const latest=state.stories.slice(0,2);
  return `<section class="hero">
    <div class="hero-ambient a1"></div><div class="hero-ambient a2"></div>
    <div class="hero-copy"><div class="kicker">Добрий день, ${esc(u.firstName||"друже")} ✦</div><h1>Слова, які хочеться зберегти.</h1><p>Створи особистий лист для однієї людини. Три листи щомісяця — від нас.</p><div class="hero-actions"><button class="primary" data-action="create">＋ Створити лист</button><button class="secondary hero-secondary" data-action="ideas">Ідеї →</button></div></div>
    <div class="hero-envelope" aria-hidden="true"><div class="back"></div><div class="letter"><span>для тебе</span></div><div class="flap"></div><div class="front"></div><div class="seal">L</div></div>
  </section>
  ${creditsHtml()}
  ${draftRibbon()}
  <div class="home-grid">
    <section class="section"><div class="section-head"><div><div class="kicker">Бібліотека</div><h2>Останні листи</h2></div><button class="text-btn" data-action="letters">Усі →</button></div>${latest.length?`<div class="story-list">${latest.map(storyCard).join("")}</div>`:emptyLetters()}</section>
    <section class="section card ideas-preview-card"><div class="section-head"><div><div class="kicker">Почати швидше</div><h2>Ідеї</h2></div><button class="text-btn" data-action="ideas">Усі →</button></div><div class="idea-list">${presets.slice(0,4).map(ideaRow).join("")}</div></section>
  </div>
  <section class="section referral-hero"><div class="ref-spark s1">✦</div><div class="ref-spark s2">♡</div><div class="kicker referral-kicker">Подаруй лист — отримай лист</div><h1>Запроси друга.</h1><p>Коли друг створить свій перший лист, на твоєму балансі з’явиться +1 бонусний лист. Він не згорає.</p><button class="primary referral-btn" data-action="invite">Поділитися запрошенням</button></section>`;
}

function storyCard(s) {
  const chosen=s.choice_index==null?"":`<div class="story-choice">♡ Отримувач уже зробив вибір</div>`;
  return `<article class="story-card" data-story-id="${esc(s.id)}">
    <span class="story-paper"><i></i><i></i></span><span class="story-seal">${esc((s.recipient||"L")[0].toUpperCase())}</span>
    <strong>${esc(s.recipient||"Особистий лист")}</strong><small>${esc(s.title||"")} · ${esc(fmtDate(s.updated_at||s.created_at))}</small>${chosen}
    <span class="story-open-cue">Відкрити <b>→</b></span>
    <button class="story-menu" data-action="story-menu" data-id="${esc(s.id)}" aria-label="Дії">•••</button>
  </article>`;
}
function emptyLetters(){return `<div class="empty card"><div class="empty-seal">L</div><strong>Тут житимуть твої листи</strong><p>Перший — найособливіший. Створи його за кілька хвилин.</p><button class="primary" data-action="create">Створити перший лист</button></div>`}
function ideaRow(p){return `<button class="idea-row" data-action="preset" data-preset="${p.id}"><span class="idea-icon">${p.icon}</span><span><strong>${esc(p.title)}</strong><small>${esc(p.sub)}</small></span><span class="idea-arrow">›</span></button>`}

function renderLetters(){
  const q=state.query.trim().toLowerCase();
  const filtered=state.stories.filter(s=>!q||`${s.recipient} ${s.title}`.toLowerCase().includes(q));
  return `<div class="kicker">Твоя бібліотека</div><h1 class="display">Листи, до яких хочеться повернутися.</h1><p class="sub">Відкривай, редагуй, ділися й стеж за маленьким вибором отримувача.</p>
  <div class="library-tools"><label class="search"><span>⌕</span><input data-bind-global="story-query" value="${esc(state.query)}" placeholder="Пошук за ім’ям або заголовком"></label><button class="primary compact" data-action="create">＋ Новий лист</button></div>
  <section class="section">${filtered.length?`<div class="story-list">${filtered.map(storyCard).join("")}</div>`:(q?`<div class="empty card"><strong>Нічого не знайшлося</strong><p>Спробуй інше ім’я або заголовок.</p></div>`:emptyLetters())}</section>`;
}
function renderIdeas(){return `<div class="kicker">Бібліотека ідей</div><h1 class="display">Коли важко почати — перші слова вже тут.</h1><p class="sub">Обери настрій. Ми підставимо готовий початок, а ти зробиш його своїм.</p><section class="section"><div class="idea-list card idea-library">${presets.map(ideaRow).join("")}</div></section><section class="section card magic-note"><div class="kicker">Маленька магія</div><h2>Не шукай ідеального тексту.</h2><p class="sub">Найкраще працює те, що звучить як ти. Love Letter лише допомагає знайти правильну форму.</p></section>`}

function renderProfile(){
  const s=state.session,u=s.user,c=s.credits,r=s.referrals;
  return `<div class="kicker">Твій простір</div><h1 class="display">Профіль</h1>
  <section class="section card profile-card"><div class="profile-avatar">${u.photoUrl?`<img src="${esc(u.photoUrl)}" alt="">`:esc(initials(u))}</div><div><strong>${esc([u.firstName,u.lastName].filter(Boolean).join(" ")||"Love Letter")}</strong><small>${u.username?`@${esc(u.username)}`:"Telegram Mini App"}</small></div></section>
  ${creditsHtml()}
  <section class="section purchase-card"><div><div class="kicker">Додатковий лист</div><h2>Ще один особливий момент.</h2><p>${c.monthlyRemaining>0?"Можеш купити лист наперед — кредит не згорає.":"Безкоштовний ліміт використано. Додатковий лист можна придбати через Telegram Stars."}</p></div><button class="primary" data-action="buy-letter">＋1 лист · ${s.pricing.letterStars} ⭐</button></section>
  <section class="section referral-hero"><div class="kicker referral-kicker">Реферали</div><h1>＋1 за друга</h1><p>Надішли своє посилання. Бонус нарахується, коли друг створить перший готовий лист.</p><div class="ref-link">${esc(r.link||"Додай BOT_USERNAME після deploy")}</div><button class="primary full referral-btn" data-action="invite">Поділитися</button></section>
  <div class="stat-grid"><div class="stat"><strong>${r.qualified}</strong><small>бонусів</small></div><div class="stat"><strong>${r.pending}</strong><small>очікують</small></div><div class="stat"><strong>${s.stories}</strong><small>листів</small></div></div>
  <section class="section card settings-card"><button class="secondary full" data-action="terms">Умови та платежі</button><button class="secondary full" data-action="support">Підтримка</button></section>`;
}

function newWizard(presetId=null){
  const p=presets.find(x=>x.id===presetId);
  return {step:0,editId:null,requestId:clientRequestId(),payload:{recipient:"",salutation:"це тобі",title:p?.data.title||"Кілька слів для тебе",message:p?.data.message||"",signature:p?.data.signature||"З ніжністю",font:"classic",occasion:p?.id||"just-because",choiceTitle:"Що будемо робити?",choices:clone(defaultChoices),finalTitle:"Домовились",finalNote:"Я вже передчуваю цей момент.",finalDate:"",finalTime:""}};
}
function renderWizard(){
  const w=state.wizard||newWizard();state.wizard=w;const step=w.step;
  return `<section class="wizard"><div class="wizard-head"><div><div class="kicker">${w.editId?"Редагування · ":""}${["Отримувач","Твій лист","Перед відправленням"][step]}</div><h1 class="display">${["Для кого ці слова?","Напиши свій лист","Подивись його очима отримувача"][step]}</h1></div><span class="step-chip">${step+1} з 3</span></div><div class="progress"><span style="width:${((step+1)/3)*100}%"></span></div>${step===0?wizardRecipient():step===1?wizardMessage():wizardReview()}<div class="wizard-actions">${step>0?`<button class="secondary" data-action="wizard-back">Назад</button>`:`<button class="secondary" data-action="home">Скасувати</button>`}<button class="primary" data-action="wizard-next">${step===2?(w.editId?"Зберегти зміни ✦":"Створити лист ✦"):"Продовжити →"}</button></div></section>`;
}
function wizardRecipient(){
  const p=state.wizard.payload;const names=["Кохана","Коханий","Мама","Тато","Подруга","Друг"];
  return `<div class="wizard-card"><div class="kicker">Починається з однієї людини</div><p class="sub">Ім’я з’явиться на конверті й у першому моменті відкриття.</p><div class="field"><label>Ім’я або звертання</label><input class="input" data-bind="recipient" value="${esc(p.recipient)}" placeholder="Наприклад, Кохана" autocomplete="off"></div><div class="chip-row">${names.map(n=>`<button class="chip ${p.recipient===n?"is-active":""}" data-action="quick-name" data-name="${esc(n)}">${esc(n)}</button>`).join("")}</div><div class="field"><label>Як почнеться лист?</label><input class="input" data-bind="salutation" value="${esc(p.salutation)}" placeholder="це тобі"></div><div class="draft-status">✓ Чернетка зберігається на цьому пристрої</div></div>`;
}
function wizardMessage(){
  const p=state.wizard.payload;
  return `<div class="wizard-card"><div class="kicker">Скажи те, заради чого все це</div><div class="field"><label>Заголовок</label><input class="input" data-bind="title" value="${esc(p.title)}"></div><div class="field"><label>Текст листа</label><textarea class="textarea" data-bind="message" placeholder="Напиши тут те, що хочеш сказати…">${esc(p.message)}</textarea><span class="helper">Не намагайся написати ідеально. Найкраще працює те, що звучить як ти.</span></div><div class="suggestion-grid">${suggestions.slice(0,6).map(s=>`<button class="suggestion" data-action="use-suggestion" data-text="${esc(s)}">＋ ${esc(s)}</button>`).join("")}</div><div class="field"><label>Підпис</label><input class="input" data-bind="signature" value="${esc(p.signature)}"></div><div class="field"><label>Стиль листа</label><div class="font-grid">${fontOption("classic","Aa","Класика")}${fontOption("romantic","Aa","Романтика")}${fontOption("modern","Aa","Сучасний")}${fontOption("handwritten","Aa","Рукопис")}</div></div></div>`;
}
function fontOption(id,label,name){const active=state.wizard.payload.font===id;return `<button class="font-option font-${id} ${active?"is-active":""}" data-action="font" data-font="${id}"><strong>${label}</strong><small>${name}</small></button>`}
function wizardReview(){
  const p=state.wizard.payload;
  return `<div class="wizard-card"><div class="kicker">Preview</div><p class="sub">Саме так лист народиться перед людиною — з конверта, паперу й кількох секунд очікування.</p>
  <div class="review-envelope-scene"><div class="review-envelope"><span class="r-paper">для ${esc(p.recipient||"тебе")}</span><span class="r-flap"></span><span class="r-front"></span><span class="r-seal">♡</span></div></div>
  <div class="review-stage"><article class="review-paper ${esc(p.font)}"><div class="to">${esc(p.salutation)}, ${esc(p.recipient||"Для тебе")}</div><h3>${esc(p.title)}</h3><div class="review-divider">♡</div><div class="message">${esc(p.message||"Тут з’являться твої слова.")}</div><div class="sign">${esc(p.signature)}</div></article></div>
  <div class="field"><label>Фінальний вибір</label><span class="helper">Після листа отримувач обере один із чотирьох маленьких планів.</span></div><div class="choice-list">${p.choices.map(c=>`<div class="choice-btn static"><span class="choice-emoji">${c.emoji}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.subtitle)}</small></span><span class="choice-arrow">›</span></div>`).join("")}</div></div>`;
}

function renderReady(){
  const s=state.ready;const share=s?.miniAppLink||`${location.origin}${s?.webPath||""}`;
  return `<section class="ready-card"><div class="ready-spark rs1">✦</div><div class="ready-spark rs2">♡</div><div class="ready-seal">L</div><div class="kicker">${s?.updated?"Оновлено":"Готово"}</div><h1>${s?.updated?"Лист оновлено.":"Твій лист уже живе."}</h1><p>${s?.updated?"Посилання лишилося тим самим — зміни вже бачить отримувач.":"Надішли його одній людині. Вона відкриє конверт, прочитає слова й зробить маленький вибір."}</p><div class="ready-link">${esc(share)}</div><div class="ready-actions"><button class="primary full" data-action="share-ready">Поділитися в Telegram</button><button class="secondary full" data-action="copy-ready">Копіювати посилання</button><button class="soft full" data-action="letters">До моїх листів</button></div></section>`;
}

function renderModal(){
  if(!state.modal)return"";
  if(state.modal.type==="paywall"){
    const c=state.session.credits,p=state.session.pricing;
    return `<div class="modal-backdrop"><section class="modal"><div class="modal-seal">L</div><h2>Безкоштовні листи вже використані</h2><p>Нові ${c.monthlyLimit} з’являться ${esc(monthLabel(c.resetsAt))}. Або створи цей лист зараз за Telegram Stars.</p><div class="modal-actions"><button class="primary full" data-action="buy-letter">Створити ще один · ${p.letterStars} ⭐</button><button class="secondary full" data-action="invite">Запросити друга · +1 лист</button><button class="soft full" data-action="close-modal">Не зараз</button></div></section></div>`;
  }
  if(state.modal.type==="story-menu"){
    const s=state.stories.find(x=>x.id===state.modal.id);if(!s)return"";
    return `<div class="modal-backdrop"><section class="modal"><div class="modal-seal">${esc((s.recipient||"L")[0])}</div><h2>${esc(s.recipient)}</h2><p>${esc(s.title)}</p><div class="modal-actions">
      <button class="primary full" data-action="preview-story" data-token="${esc(s.public_token)}">Переглянути як отримувач</button>
      ${s.choice_index==null?`<button class="secondary full" data-action="edit-story" data-id="${esc(s.id)}">Редагувати</button>`:""}
      <button class="secondary full" data-action="duplicate-story" data-id="${esc(s.id)}">Створити копію</button>
      <button class="secondary full" data-action="share-story" data-token="${esc(s.public_token)}">Поділитися</button>
      <button class="secondary full" data-action="copy-story" data-token="${esc(s.public_token)}">Копіювати посилання</button>
      <button class="danger-btn full" data-action="delete-story" data-id="${esc(s.id)}">Видалити лист</button><button class="soft full" data-action="close-modal">Закрити</button></div></section></div>`;
  }
  if(state.modal.type==="confirm-delete"){
    const s=state.stories.find(x=>x.id===state.modal.id);if(!s)return"";
    return `<div class="modal-backdrop"><section class="modal danger-modal"><div class="modal-seal">♡</div><div class="kicker">Обережно</div><h2>Видалити лист для ${esc(s.recipient)}?</h2><p>Посилання перестане відкриватися. Цю дію не можна скасувати.</p><div class="modal-actions"><button class="danger-btn full" data-action="confirm-delete-story" data-id="${esc(s.id)}">Так, видалити</button><button class="soft full" data-action="story-menu" data-id="${esc(s.id)}">Залишити лист</button></div></section></div>`;
  }
  if(state.modal.type==="terms"){
    return `<div class="modal-backdrop"><section class="modal legal-modal"><div class="modal-seal">♡</div><h2>Як працює Love Letter</h2><div class="legal-copy"><p><b>3 листи щомісяця безкоштовно.</b> Ліміт оновлюється першого числа.</p><p>Бонуси за друзів і придбані кредити не згорають. Додаткові цифрові листи оплачуються тільки Telegram Stars.</p><p>Оплата списується після підтвердження Telegram. Для питань щодо платежів доступна команда <b>/paysupport</b> у боті.</p></div><button class="primary full" data-action="close-modal">Зрозуміло</button></section></div>`;
  }
  return "";
}

function publicShareLink(token){
  const bot=state.session?.botUsername;
  return bot?`https://t.me/${bot}?startapp=letter_${token}`:`${location.origin}/l/${token}`;
}
async function loadStories(){try{const data=await api("/api/stories");state.stories=data.stories||[]}catch(e){console.error(e)}}
async function refreshAccount(){const data=await api("/api/account");state.session={...state.session,...data};return data}
async function fetchStory(id){const data=await api(`/api/stories/${id}`);return data.story}

async function publishWizard(){
  const w=state.wizard,p=w.payload;
  if(!p.recipient.trim()) return toast("Додай ім’я отримувача");
  if(!p.message.trim()) return toast("Напиши хоча б кілька слів");
  try{
    haptic("medium");
    if(w.editId){
      const data=await api(`/api/stories/${w.editId}`,{method:"PATCH",body:JSON.stringify({payload:p})});
      const publicToken=data.story.publicToken;
      state.ready={...data.story,updated:true,webPath:`/l/${publicToken}`,miniAppLink:publicShareLink(publicToken)};
    }else{
      w.requestId ||= clientRequestId();
      const data=await api("/api/stories",{method:"POST",body:JSON.stringify({payload:p,clientRequestId:w.requestId})});
      state.session={...state.session,...data.account};
      state.ready=data.story;
      clearDraft();
    }
    state.wizard=null;
    await loadStories();
    state.route="ready";render();window.scrollTo({top:0});
    haptic("success");
  }catch(e){
    if(e.status===402){state.modal={type:"paywall"};render();return}
    toast(e.message||"Не вдалося зберегти лист");
  }
}

async function startEdit(id, duplicate=false){
  try{
    const story=await fetchStory(id);
    state.modal=null;
    state.wizard={step:0,editId:duplicate?null:id,requestId:duplicate?clientRequestId():null,payload:clone(story.payload)};
    if(duplicate){
      state.wizard.payload.recipient=story.payload.recipient;
      saveDraft();
    }
    go("wizard");
  }catch(e){toast(e.message||"Не вдалося відкрити лист")}
}

function renderTermsConfirmForPayment(){
  state.modal=null;render();
  root.insertAdjacentHTML("beforeend",`<div class="modal-backdrop" id="terms-modal"><section class="modal"><div class="modal-seal">L</div><h2>Перед першим платним листом</h2><p>Love Letter продає цифрові листи через Telegram Stars. Три листи щомісяця безкоштовні; бонуси за друзів не згорають. Натискаючи «Продовжити», ти приймаєш умови сервісу.</p><div class="modal-actions"><button class="primary full" id="accept-terms">Приймаю та продовжити</button><button class="soft full" id="cancel-terms">Назад</button></div></section></div>`);
  document.getElementById("accept-terms").onclick=async()=>{await api("/api/account/terms",{method:"POST",body:"{}"});state.session.user.termsAccepted=true;document.getElementById("terms-modal").remove();buyLetter()};
  document.getElementById("cancel-terms").onclick=()=>document.getElementById("terms-modal").remove();
}
async function buyLetter(){
  if(!state.session.user.termsAccepted) return renderTermsConfirmForPayment();
  try{
    haptic("light");
    const inv=await api("/api/payments/invoice",{method:"POST",body:"{}"});
    const status=await openInvoice(inv.invoiceUrl);
    if(["paid","opened","pending"].includes(status)){
      toast("Перевіряємо оплату…");
      for(let i=0;i<12;i++){
        await new Promise(r=>setTimeout(r,900));
        const p=await api(`/api/payments/${inv.paymentId}`);
        if(p.payment?.status==="paid"){
          await refreshAccount();state.modal=null;render();
          toast("＋1 лист уже на балансі ✦");haptic("success");return;
        }
      }
    }
    toast(status==="cancelled"?"Оплату скасовано":"Платіж ще обробляється");
  }catch(e){toast(e.message||"Не вдалося відкрити оплату")}
}

function invite(){
  const link=state.session.referrals.link;
  if(!link)return toast("Додай BOT_USERNAME у Worker");
  shareLink(link,"Створи свій перший Love Letter 💌 — 3 листи щомісяця безкоштовно.");
}
function go(route){
  state.route=route;state.modal=null;
  if(route==="letters") loadStories().then(render); else render();
  window.scrollTo({top:0,behavior:"smooth"});
}

async function openRecipient(token, returnRoute=null){
  state.route="recipient";state.recipientStage="envelope";state.recipientReturnRoute=returnRoute;state.recipient=null;
  root.innerHTML=`<div class="boot-screen"><div class="boot-seal">L</div><div class="boot-copy">Готуємо лист…</div></div>`;
  try{
    const data=await api(`/api/public/${token}`);
    state.recipient={...data.story,token};
    if(data.story.choiceIndex!=null) state.recipientStage="final";
    renderRecipient();
  }catch(e){
    root.innerHTML=`<div class="boot-screen"><div class="boot-seal">L</div><div class="boot-copy">${esc(e.message||"Лист не знайдено")}</div></div>`;
  }
}
function renderRecipient(){
  const s=state.recipient;if(!s)return;
  backButton(Boolean(state.recipientReturnRoute),()=>go(state.recipientReturnRoute||"home"));
  const p=s.payload;let content="";
  if(state.recipientStage==="envelope"){
    content=`<div class="recipient-card envelope-card"><div class="recipient-kicker">Так починається маленьке диво</div><div class="recipient-title">Для тебе.</div><p class="recipient-copy">Деякі слова заслуговують на маленький ритуал.</p><button class="magic-envelope" data-action="open-envelope" aria-label="Відкрити конверт"><span class="env"></span><span class="paper-peek"><i>кілька слів</i></span><span class="flap"></span><span class="front"></span><span class="wax">♡</span><span class="label">Для тебе</span></button><p class="recipient-copy open-hint">Торкнись, щоб відкрити</p></div>`;
  }else if(state.recipientStage==="letter"){
    content=`<div class="recipient-card letter-card"><article class="recipient-letter ${esc(p.font||"classic")}"><div class="to">${esc(p.salutation)}, ${esc(p.recipient)}</div><h2>${esc(p.title)}</h2><div class="divider">♡</div><div class="body">${esc(p.message)}</div><div class="sign">${esc(p.signature)}</div></article><button class="primary full recipient-next" data-action="recipient-choices">Що будемо робити? →</button></div>`;
  }else if(state.recipientStage==="choices"){
    content=`<div class="recipient-card choice-card-shell"><div class="recipient-kicker">Останній маленький вибір</div><h1 class="recipient-title">${esc(p.choiceTitle)}</h1><p class="recipient-copy">Обери один варіант — він одразу з’явиться у фіналі.</p><div class="choice-list">${p.choices.map((c,i)=>`<button class="choice-btn recipient-choice" data-action="choose" data-index="${i}"><span class="choice-emoji">${c.emoji}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.subtitle)}</small></span><span class="choice-arrow">›</span></button>`).join("")}</div></div>`;
  }else{
    const idx=s.choiceIndex??0,c=p.choices[idx]||p.choices[0];
    content=`<div class="recipient-card final-card-shell"><section class="recipient-final"><div class="recipient-kicker">Ваш маленький план</div><h2>${esc(p.finalTitle)}</h2><div class="chosen"><span class="choice-emoji">${c.emoji}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.subtitle)}</small></span></div>${p.finalDate||p.finalTime?`<div class="final-when">${esc([p.finalDate,p.finalTime].filter(Boolean).join(" · "))}</div>`:""}<p>${esc(p.finalNote)}</p></section><div class="final-magic"><span>✦</span><div class="ready-seal">♡</div><span>♡</span></div><p class="recipient-copy">Вибір уже збережено. Тепер залишається тільки прожити цей момент.</p></div>`;
  }
  root.innerHTML=`<main class="recipient-shell"><div class="recipient-top"><img src="/brand/logo-main.svg" alt="Love Letter"><span class="recipient-badge">для отримувача</span></div>${content}</main>`;
  renderToast();
}
async function chooseRecipient(index){
  try{
    const data=await api(`/api/public/${state.recipient.token}/choice`,{method:"POST",body:JSON.stringify({choiceIndex:index})});
    state.recipient.choiceIndex=data.choiceIndex;state.recipientStage="final";
    haptic("success");renderRecipient();
  }catch(e){toast(e.message||"Не вдалося зберегти вибір")}
}

async function handleAction(action,el){
  if(action==="home")return go("home");
  if(action==="letters")return go("letters");
  if(action==="ideas")return go("ideas");
  if(action==="profile")return go("profile");
  if(action==="create"){state.wizard=newWizard();saveDraft();return go("wizard")}
  if(action==="resume-draft"){const d=readDraft();state.wizard=d?{step:d.step||0,editId:null,requestId:d.requestId||clientRequestId(),payload:d.payload}:newWizard();saveDraft();return go("wizard")}
  if(action==="discard-draft")return discardDraft();
  if(action==="preset"){state.wizard=newWizard(el.dataset.preset);state.wizard.step=1;saveDraft();return go("wizard")}
  if(action==="quick-name"){state.wizard.payload.recipient=el.dataset.name;saveDraft();haptic("light");return render()}
  if(action==="font"){state.wizard.payload.font=el.dataset.font;saveDraft();return render()}
  if(action==="use-suggestion"){const t=el.dataset.text;state.wizard.payload.message+=(state.wizard.payload.message.trim()?"\n\n":"")+t;saveDraft();haptic("light");return render()}
  if(action==="wizard-back"){state.wizard.step=Math.max(0,state.wizard.step-1);saveDraft();haptic("light");return render()}
  if(action==="wizard-next"){
    if(state.wizard.step===0&&!state.wizard.payload.recipient.trim())return toast("Для кого цей лист?");
    if(state.wizard.step===1&&!state.wizard.payload.message.trim())return toast("Додай кілька слів");
    if(state.wizard.step<2){state.wizard.step++;saveDraft();haptic("light");return render()}
    return publishWizard();
  }
  if(action==="invite")return invite();
  if(action==="close-modal"){state.modal=null;return render()}
  if(action==="buy-letter")return buyLetter();
  if(action==="story-menu"){state.modal={type:"story-menu",id:el.dataset.id};return render()}
  if(action==="edit-story")return startEdit(el.dataset.id,false);
  if(action==="duplicate-story")return startEdit(el.dataset.id,true);
  if(action==="preview-story"){state.modal=null;return openRecipient(el.dataset.token,"letters")}
  if(action==="share-story")return shareLink(publicShareLink(el.dataset.token),"Для тебе є Love Letter 💌");
  if(action==="copy-story"){await navigator.clipboard.writeText(publicShareLink(el.dataset.token));return toast("Посилання скопійовано")}
  if(action==="delete-story"){state.modal={type:"confirm-delete",id:el.dataset.id};return render()}
  if(action==="confirm-delete-story"){await api(`/api/stories/${el.dataset.id}`,{method:"DELETE"});state.modal=null;await loadStories();state.session.stories=state.stories.length;render();return toast("Лист видалено")}
  if(action==="share-ready"){const link=state.ready.miniAppLink||`${location.origin}${state.ready.webPath}`;return shareLink(link,"Я залишив / залишила дещо для тебе 💌")}
  if(action==="copy-ready"){await navigator.clipboard.writeText(state.ready.miniAppLink||`${location.origin}${state.ready.webPath}`);return toast("Посилання скопійовано")}
  if(action==="terms"){state.modal={type:"terms"};return render()}
  if(action==="support"){const bot=state.session.botUsername;if(bot)return openTelegram(`https://t.me/${bot}?text=${encodeURIComponent("/support")}`);return toast("Додай BOT_USERNAME")}
  if(action==="open-envelope"){el.classList.add("is-opening");haptic("medium");setTimeout(()=>{state.recipientStage="letter";renderRecipient()},1050);return}
  if(action==="recipient-choices"){state.recipientStage=state.recipient.choiceIndex==null?"choices":"final";haptic("light");return renderRecipient()}
  if(action==="choose")return chooseRecipient(Number(el.dataset.index));
}

root.addEventListener("click",event=>{
  const el=event.target.closest("[data-action]");if(!el)return;
  event.preventDefault();
  handleAction(el.dataset.action,el).catch(err=>{console.error(err);toast(err.message||"Щось пішло не так")});
});
root.addEventListener("input",event=>{
  const bind=event.target.dataset.bind;
  if(bind&&state.wizard){state.wizard.payload[bind]=event.target.value;saveDraft()}
  if(event.target.dataset.bindGlobal==="story-query"){state.query=event.target.value;render()}
});
window.addEventListener("offline",()=>{if(document.querySelector(".offline"))return;document.body.insertAdjacentHTML("beforeend",`<div class="offline">Немає мережі. Чернетка лишиться на цьому пристрої.</div>`)});
window.addEventListener("online",()=>document.querySelector(".offline")?.remove());

async function init(){
  initTelegram();
  if("serviceWorker" in navigator && !LOCAL_DEMO) navigator.serviceWorker.register("/sw.js").catch(()=>{});
  const pathMatch=location.pathname.match(/^\/l\/([a-z0-9_-]+)/i);
  const sp=startParam();
  const demoLetter=LOCAL_DEMO?params.get("letter"):null;
  const letterToken=pathMatch?.[1] || demoLetter || (sp?.startsWith("letter_")?sp.slice(7):null);
  if(letterToken) return openRecipient(letterToken);
  if(!LOCAL_DEMO && !initData()){
    root.innerHTML=`<main class="page telegram-gate"><section class="ready-card"><img class="gate-logo" src="/brand/logo-icon.svg" alt=""><div class="kicker">Telegram Mini App</div><h1>Love Letter живе всередині Telegram.</h1><p>Відкрий застосунок через профіль бота. Там працюють авторизація, 3 безкоштовні листи на місяць, реферали й Telegram Stars.</p><button class="primary full" onclick="location.reload()">Я вже відкрив у Telegram</button></section></main>`;
    return;
  }
  try{
    const session=await api("/api/session",{method:"POST",body:"{}"});
    state.session=session;
    await loadStories();
    render();
  }catch(e){
    console.error(e);
    root.innerHTML=`<div class="boot-screen"><div class="boot-seal">L</div><div class="boot-copy">${esc(e.message||"Не вдалося відкрити Love Letter")}</div></div>`;
  }
}
init();
