const VERSION = '2.0.1';

const enc = new TextEncoder();
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra }
});
const html = (body, status = 200) => new Response(body, {
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
});
const text = (body, status = 200, type = 'text/plain; charset=utf-8') => new Response(body, { status, headers: { 'content-type': type, 'cache-control': 'no-store' } });
const now = () => Date.now();
const monthKey = () => new Date().toISOString().slice(0, 7);
const nextMonthISO = () => {
  const d = new Date(); d.setUTCMonth(d.getUTCMonth() + 1, 1); d.setUTCHours(0,0,0,0); return d.toISOString();
};
const rid = (prefix = 'id') => `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
const publicToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const clamp = (v, n = 4000) => String(v ?? '').slice(0, n).trim();

function cfg(env) {
  return {
    appOrigin: String(env.APP_ORIGIN || '').replace(/\/$/, ''),
    botUsername: String(env.BOT_USERNAME || 'loveletter_official_bot').replace(/^@/, ''),
    freeLimit: Math.max(0, Number(env.MONTHLY_FREE_LIMIT || 3)),
    letterPrice: Math.max(1, Number(env.LETTER_PRICE_XTR || 29)),
    support: String(env.SUPPORT_CONTACT || '@loveletter_official_bot'),
    authMaxAge: Math.max(60, Number(env.AUTH_MAX_AGE_SECONDS || 86400))
  };
}

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}
function hex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }

async function verifyInitData(raw, botToken, maxAge) {
  if (!raw) throw Object.assign(new Error('Відкрий Love Letter через Telegram-бота.'), { status: 401, code: 'NO_INIT_DATA' });
  if (!botToken) throw Object.assign(new Error('Telegram secret ще не підключений.'), { status: 503, code: 'BOT_SECRET_MISSING' });
  const p = new URLSearchParams(raw);
  const given = p.get('hash');
  if (!given) throw Object.assign(new Error('Некоректна Telegram-сесія.'), { status: 401, code: 'NO_HASH' });
  p.delete('hash');
  const dataCheck = [...p.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', botToken);
  const expected = hex(await hmac(secret, dataCheck));
  if (expected !== given) throw Object.assign(new Error('Telegram-сесія не пройшла перевірку.'), { status: 401, code: 'BAD_HASH' });
  const authDate = Number(p.get('auth_date') || 0);
  if (!authDate || Math.floor(Date.now()/1000) - authDate > maxAge) throw Object.assign(new Error('Telegram-сесія застаріла. Закрий і відкрий Mini App ще раз.'), { status: 401, code: 'AUTH_EXPIRED' });
  let user = null;
  try { user = JSON.parse(p.get('user') || 'null'); } catch {}
  if (!user?.id) throw Object.assign(new Error('Не вдалося прочитати Telegram-профіль.'), { status: 401, code: 'NO_USER' });
  return { user, startParam: p.get('start_param') || '' };
}

let schemaPromise;
async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is missing');
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = [
      `CREATE TABLE IF NOT EXISTS users (telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', photo_url TEXT, ref_code TEXT NOT NULL UNIQUE, referred_by TEXT, bonus_credits INTEGER NOT NULL DEFAULT 0, paid_credits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS monthly_usage (telegram_id TEXT NOT NULL, month_key TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, free_limit INTEGER NOT NULL DEFAULT 3, updated_at INTEGER NOT NULL, PRIMARY KEY(telegram_id, month_key))`,
      `CREATE TABLE IF NOT EXISTS referrals (id TEXT PRIMARY KEY, inviter_id TEXT NOT NULL, invited_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, qualified_at INTEGER)`,
      `CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY, public_token TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, recipient TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, signature TEXT NOT NULL, style TEXT NOT NULL DEFAULT 'classic', question TEXT NOT NULL DEFAULT 'Що будемо робити?', choices_json TEXT NOT NULL, final_note TEXT NOT NULL DEFAULT '', credit_source TEXT NOT NULL, client_request_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_letters_owner_request ON letters(owner_id, client_request_id)`,
      `CREATE INDEX IF NOT EXISTS idx_letters_owner ON letters(owner_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS choices (letter_id TEXT PRIMARY KEY, choice_index INTEGER NOT NULL, chosen_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, telegram_id TEXT NOT NULL, invoice_payload TEXT NOT NULL UNIQUE, stars INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', telegram_payment_charge_id TEXT UNIQUE, created_at INTEGER NOT NULL, paid_at INTEGER)`
    ];
    for (const q of sql) await env.DB.prepare(q).run();
  })();
  try { await schemaPromise; } catch (e) { schemaPromise = null; throw e; }
}

async function auth(request, env) {
  if (String(env.DEV_BYPASS_AUTH || '').toLowerCase() === 'true') {
    const raw = request.headers.get('x-debug-user');
    if (raw) return { user: JSON.parse(raw), startParam: request.headers.get('x-debug-start') || '' };
  }
  const a = request.headers.get('authorization') || '';
  const raw = a.startsWith('tma ') ? a.slice(4) : '';
  return verifyInitData(raw, env.TELEGRAM_BOT_TOKEN, cfg(env).authMaxAge);
}

async function ensureUser(env, tg, startParam) {
  const id = String(tg.id), t = now();
  let u = await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(id).first();
  if (!u) {
    let ref = Math.random().toString(36).slice(2, 9).toUpperCase();
    for (let i=0;i<5;i++) {
      const x = await env.DB.prepare('SELECT 1 FROM users WHERE ref_code=?').bind(ref).first();
      if (!x) break; ref = Math.random().toString(36).slice(2, 10).toUpperCase();
    }
    await env.DB.prepare('INSERT INTO users (telegram_id,username,first_name,last_name,photo_url,ref_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id, tg.username || null, tg.first_name || '', tg.last_name || '', tg.photo_url || null, ref, t, t).run();
    u = await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(id).first();
  } else {
    await env.DB.prepare('UPDATE users SET username=?, first_name=?, last_name=?, photo_url=?, updated_at=? WHERE telegram_id=?')
      .bind(tg.username || null, tg.first_name || '', tg.last_name || '', tg.photo_url || null, t, id).run();
  }
  if (startParam?.startsWith('ref_') && !u.referred_by) {
    const code = startParam.slice(4);
    const inviter = await env.DB.prepare('SELECT telegram_id FROM users WHERE ref_code=?').bind(code).first();
    if (inviter && String(inviter.telegram_id) !== id) {
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO referrals (id,inviter_id,invited_id,status,created_at) VALUES (?,?,?,'pending',?)")
        .bind(rid('ref'), String(inviter.telegram_id), id, t).run();
      if ((ins.meta?.changes || 0) > 0) {
        await env.DB.prepare('UPDATE users SET referred_by=?, updated_at=? WHERE telegram_id=? AND referred_by IS NULL').bind(String(inviter.telegram_id), t, id).run();
      }
    }
  }
  return await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(id).first();
}

async function ensureMonth(env, userId) {
  const c = cfg(env), key = monthKey(), t = now();
  await env.DB.prepare('INSERT OR IGNORE INTO monthly_usage (telegram_id,month_key,used,free_limit,updated_at) VALUES (?,?,0,?,?)').bind(userId,key,c.freeLimit,t).run();
  await env.DB.prepare('UPDATE monthly_usage SET free_limit=?,updated_at=? WHERE telegram_id=? AND month_key=?').bind(c.freeLimit,t,userId,key).run();
  return env.DB.prepare('SELECT * FROM monthly_usage WHERE telegram_id=? AND month_key=?').bind(userId,key).first();
}

async function account(env, id) {
  const c=cfg(env), u=await env.DB.prepare('SELECT * FROM users WHERE telegram_id=?').bind(id).first(), m=await ensureMonth(env,id);
  const monthlyRemaining=Math.max(0, Number(m.free_limit)-Number(m.used));
  const q=await env.DB.prepare("SELECT COUNT(*) n FROM referrals WHERE inviter_id=? AND status='qualified'").bind(id).first();
  const p=await env.DB.prepare("SELECT COUNT(*) n FROM referrals WHERE inviter_id=? AND status='pending'").bind(id).first();
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM letters WHERE owner_id=?').bind(id).first();
  return {
    user:{id,username:u.username,firstName:u.first_name,lastName:u.last_name,photoUrl:u.photo_url,refCode:u.ref_code},
    credits:{monthlyLimit:Number(m.free_limit),monthlyUsed:Number(m.used),monthlyRemaining,bonus:Number(u.bonus_credits||0),paid:Number(u.paid_credits||0),totalAvailable:monthlyRemaining+Number(u.bonus_credits||0)+Number(u.paid_credits||0),resetsAt:nextMonthISO()},
    referrals:{qualified:Number(q?.n||0),pending:Number(p?.n||0),link:`https://t.me/${c.botUsername}?startapp=ref_${u.ref_code}`},
    pricing:{letterStars:c.letterPrice,currency:'XTR'}, letters:Number(count?.n||0), botUsername:c.botUsername
  };
}

async function consumeCredit(env,id){
  const m=await ensureMonth(env,id), t=now(), key=monthKey();
  const a=await env.DB.prepare('UPDATE monthly_usage SET used=used+1,updated_at=? WHERE telegram_id=? AND month_key=? AND used<free_limit').bind(t,id,key).run();
  if((a.meta?.changes||0)>0) return 'monthly';
  const b=await env.DB.prepare('UPDATE users SET bonus_credits=bonus_credits-1,updated_at=? WHERE telegram_id=? AND bonus_credits>0').bind(t,id).run();
  if((b.meta?.changes||0)>0) return 'bonus';
  const p=await env.DB.prepare('UPDATE users SET paid_credits=paid_credits-1,updated_at=? WHERE telegram_id=? AND paid_credits>0').bind(t,id).run();
  if((p.meta?.changes||0)>0) return 'paid';
  return null;
}

async function rewardReferral(env, invitedId) {
  const r=await env.DB.prepare("SELECT * FROM referrals WHERE invited_id=? AND status='pending'").bind(invitedId).first();
  if(!r) return;
  const t=now();
  const up=await env.DB.prepare("UPDATE referrals SET status='qualified',qualified_at=? WHERE id=? AND status='pending'").bind(t,r.id).run();
  if((up.meta?.changes||0)>0) {
    await env.DB.prepare('UPDATE users SET bonus_credits=bonus_credits+1,updated_at=? WHERE telegram_id=?').bind(t,r.inviter_id).run();
    sendMessage(env,r.inviter_id,'💌 Твій друг створив перший Love Letter. +1 безкоштовний лист уже на балансі.').catch(()=>{});
  }
}

function parseBody(request){ return request.json().catch(()=>({})); }
function normalizeLetter(x={}) {
  const choices = Array.isArray(x.choices) ? x.choices.slice(0,4).map(v=>({emoji:clamp(v.emoji,4)||'♡',title:clamp(v.title,60)||'Разом',subtitle:clamp(v.subtitle,100)})) : [];
  while(choices.length<4) choices.push([{emoji:'☕',title:'Випити кави',subtitle:'Десь удвох'},{emoji:'🌿',title:'Прогулятися',subtitle:'Без поспіху'},{emoji:'💭',title:'Поговорити',subtitle:'Про все'},{emoji:'♡',title:'Обійнятися',subtitle:'Просто так'}][choices.length]);
  return { recipient:clamp(x.recipient,80), title:clamp(x.title,120)||'Для тебе', body:clamp(x.body||x.message,6000), signature:clamp(x.signature,80)||'З любовʼю', style:['classic','soft','modern','handwritten'].includes(x.style)?x.style:'classic', question:clamp(x.question,120)||'Що будемо робити?', choices, finalNote:clamp(x.finalNote,600) };
}

async function sendMessage(env, chatId, message){
  if(!env.TELEGRAM_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chatId,text:message})});
}
async function tgCall(env, method, payload){
  const r=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json(); if(!d.ok) throw new Error(d.description||method); return d.result;
}

async function api(request, env, url) {
  await ensureSchema(env);
  if(url.pathname==='/api/health') return json({ok:true,version:VERSION,worker:true,db:true});
  if(url.pathname==='/api/telegram/webhook' && request.method==='POST') return webhook(request,env);
  if(url.pathname.startsWith('/api/public/')) return publicApi(request,env,url);

  let a;
  try { a=await auth(request,env); } catch(e){ return json({ok:false,error:e.message,code:e.code||'AUTH_ERROR'},e.status||401); }
  const u=await ensureUser(env,a.user,a.startParam); const uid=String(u.telegram_id);
  if(url.pathname==='/api/session' && request.method==='POST') return json({ok:true,...await account(env,uid)});
  if(url.pathname==='/api/account' && request.method==='GET') return json({ok:true,...await account(env,uid)});
  if(url.pathname==='/api/letters' && request.method==='GET'){
    const r=await env.DB.prepare('SELECT id,public_token,recipient,title,style,created_at,updated_at FROM letters WHERE owner_id=? ORDER BY created_at DESC LIMIT 100').bind(uid).all();
    return json({ok:true,letters:r.results||[]});
  }
  if(url.pathname==='/api/letters' && request.method==='POST'){
    const raw=await parseBody(request); const payload=normalizeLetter(raw.payload||raw); const req=clamp(raw.clientRequestId,120)||rid('req');
    if(!payload.recipient||!payload.body) return json({ok:false,error:'Заповни отримувача і текст листа.'},400);
    const existing=await env.DB.prepare('SELECT * FROM letters WHERE owner_id=? AND client_request_id=?').bind(uid,req).first();
    if(existing) return json({ok:true,letter:formatLetter(existing,env)});
    const credit=await consumeCredit(env,uid); if(!credit) return json({ok:false,error:'Безкоштовні листи закінчилися. Запроси друга або придбай ще один.',code:'LETTER_CREDIT_REQUIRED'},402);
    const id=rid('letter'), token=publicToken(), t=now();
    try{
      await env.DB.prepare('INSERT INTO letters (id,public_token,owner_id,recipient,title,body,signature,style,question,choices_json,final_note,credit_source,client_request_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id,token,uid,payload.recipient,payload.title,payload.body,payload.signature,payload.style,payload.question,JSON.stringify(payload.choices),payload.finalNote,credit,req,t,t).run();
    }catch(e){ throw e; }
    const count=await env.DB.prepare('SELECT COUNT(*) n FROM letters WHERE owner_id=?').bind(uid).first(); if(Number(count?.n||0)===1) await rewardReferral(env,uid);
    const row=await env.DB.prepare('SELECT * FROM letters WHERE id=?').bind(id).first(); return json({ok:true,letter:formatLetter(row,env)});
  }
  if(url.pathname.startsWith('/api/letters/')){
    const id=url.pathname.split('/').pop(); const row=await env.DB.prepare('SELECT * FROM letters WHERE id=? AND owner_id=?').bind(id,uid).first(); if(!row) return json({ok:false,error:'Лист не знайдено.'},404);
    if(request.method==='GET') return json({ok:true,letter:formatLetter(row,env,true)});
    if(request.method==='DELETE'){ await env.DB.prepare('DELETE FROM letters WHERE id=? AND owner_id=?').bind(id,uid).run(); return json({ok:true}); }
  }
  if(url.pathname==='/api/payments/invoice' && request.method==='POST'){
    const c=cfg(env), id=rid('pay'), payload=`loveletter:${id}:${uid}`, t=now();
    await env.DB.prepare("INSERT INTO payments (id,telegram_id,invoice_payload,stars,status,created_at) VALUES (?,?,?,?,'pending',?)").bind(id,uid,payload,c.letterPrice,t).run();
    const invoice=await tgCall(env,'createInvoiceLink',{title:'Ще один Love Letter',description:'1 додатковий цифровий лист',payload,currency:'XTR',prices:[{label:'Love Letter',amount:c.letterPrice}]});
    return json({ok:true,paymentId:id,invoiceUrl:invoice});
  }
  if(url.pathname.startsWith('/api/payments/') && request.method==='GET'){
    const id=url.pathname.split('/').pop(); const p=await env.DB.prepare('SELECT id,status,stars,created_at,paid_at FROM payments WHERE id=? AND telegram_id=?').bind(id,uid).first(); return p?json({ok:true,payment:p}):json({ok:false,error:'Платіж не знайдено.'},404);
  }
  return json({ok:false,error:'Not found'},404);
}

function formatLetter(r,env,full=false){
  const c=cfg(env); const base={id:r.id,publicToken:r.public_token,recipient:r.recipient,title:r.title,style:r.style,createdAt:r.created_at,updatedAt:r.updated_at,webUrl:`${c.appOrigin}/l/${r.public_token}`,miniAppUrl:`https://t.me/${c.botUsername}?startapp=letter_${r.public_token}`};
  if(full) Object.assign(base,{body:r.body,signature:r.signature,question:r.question,choices:JSON.parse(r.choices_json||'[]'),finalNote:r.final_note});
  return base;
}

async function publicApi(request,env,url){
  const parts=url.pathname.split('/').filter(Boolean); const token=parts[2];
  const row=await env.DB.prepare('SELECT * FROM letters WHERE public_token=?').bind(token).first(); if(!row) return json({ok:false,error:'Лист не знайдено.'},404);
  if(parts.length===3 && request.method==='GET'){
    const choice=await env.DB.prepare('SELECT choice_index,chosen_at FROM choices WHERE letter_id=?').bind(row.id).first();
    return json({ok:true,letter:{recipient:row.recipient,title:row.title,body:row.body,signature:row.signature,style:row.style,question:row.question,choices:JSON.parse(row.choices_json||'[]'),finalNote:row.final_note,choiceIndex:choice?.choice_index??null}});
  }
  if(parts[3]==='choice' && request.method==='POST'){
    const b=await parseBody(request), i=Number(b.choiceIndex); const choices=JSON.parse(row.choices_json||'[]'); if(!Number.isInteger(i)||i<0||i>=choices.length) return json({ok:false,error:'Некоректний вибір.'},400);
    const ins=await env.DB.prepare('INSERT OR IGNORE INTO choices (letter_id,choice_index,chosen_at) VALUES (?,?,?)').bind(row.id,i,now()).run();
    const saved=await env.DB.prepare('SELECT choice_index FROM choices WHERE letter_id=?').bind(row.id).first();
    if((ins.meta?.changes||0)>0) sendMessage(env,row.owner_id,`💌 Відповідь на Love Letter: ${choices[i]?.emoji||''} ${choices[i]?.title||''}`).catch(()=>{});
    return json({ok:true,choiceIndex:Number(saved.choice_index)});
  }
  return json({ok:false,error:'Not found'},404);
}

async function webhook(request,env){
  if(env.TELEGRAM_WEBHOOK_SECRET && request.headers.get('x-telegram-bot-api-secret-token')!==env.TELEGRAM_WEBHOOK_SECRET) return json({ok:false},403);
  const u=await parseBody(request);
  if(u.pre_checkout_query){
    const q=u.pre_checkout_query; const p=await env.DB.prepare('SELECT * FROM payments WHERE invoice_payload=?').bind(q.invoice_payload).first(); const ok=!!(p&&p.status==='pending'&&String(p.telegram_id)===String(q.from?.id)&&q.currency==='XTR'&&Number(q.total_amount)===Number(p.stars));
    await tgCall(env,'answerPreCheckoutQuery',{pre_checkout_query_id:q.id,ok,error_message:ok?undefined:'Платіж недоступний.'}); return json({ok:true});
  }
  const m=u.message;
  if(m?.successful_payment){
    const s=m.successful_payment; const p=await env.DB.prepare('SELECT * FROM payments WHERE invoice_payload=?').bind(s.invoice_payload).first();
    if(p&&p.status==='pending'&&s.currency==='XTR'&&Number(s.total_amount)===Number(p.stars)){
      const t=now(); const up=await env.DB.prepare("UPDATE payments SET status='paid',telegram_payment_charge_id=?,paid_at=? WHERE id=? AND status='pending'").bind(s.telegram_payment_charge_id,t,p.id).run();
      if((up.meta?.changes||0)>0){ await env.DB.prepare('UPDATE users SET paid_credits=paid_credits+1,updated_at=? WHERE telegram_id=?').bind(t,p.telegram_id).run(); sendMessage(env,p.telegram_id,'⭐ +1 Love Letter уже на балансі.').catch(()=>{}); }
    }
    return json({ok:true});
  }
  if(m?.text&&m?.chat?.id){ const cmd=m.text.split(/\s+/)[0].toLowerCase(); const c=cfg(env); if(cmd==='/start') await sendMessage(env,m.chat.id,'💌 Love Letter — 3 безкоштовні листи щомісяця. Відкрий Mini App через кнопку меню.'); else if(cmd==='/support'||cmd==='/paysupport') await sendMessage(env,m.chat.id,`Підтримка: ${c.support}`); return json({ok:true}); }
  return json({ok:true});
}

const CSS = `
:root{--wine:#7c1539;--wine2:#4e0c26;--rose:#f4d9dd;--cream:#fff8f2;--paper:#fffdf9;--ink:#2f2025;--muted:#8c747d;--line:#ead7d9;--shadow:0 24px 60px rgba(76,14,38,.15)}*{box-sizing:border-box}html,body{margin:0;background:var(--cream);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif}body{min-height:100vh}.app{min-height:100vh;padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 90px);max-width:720px;margin:auto}.brand{display:flex;align-items:center;gap:12px}.seal{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#a43861,var(--wine) 58%,#4b0a25);color:#f7dfbe;font:700 25px Georgia;box-shadow:0 10px 28px #7c153933}.brand h1{font:600 22px Georgia;margin:0}.hello{margin:26px 0 14px}.hello h2{font:500 38px Georgia;margin:0 0 8px}.muted{color:var(--muted)}.card{background:rgba(255,255,255,.78);border:1px solid rgba(124,21,57,.1);border-radius:28px;padding:20px;box-shadow:var(--shadow);backdrop-filter:blur(14px);margin:14px 0}.quota{background:linear-gradient(145deg,#fffaf6,#fae9ea)}.big{font:600 42px Georgia;color:var(--wine)}button{font:inherit}.primary,.secondary,.ghost{border:0;border-radius:18px;padding:15px 18px;font-weight:700}.primary{background:linear-gradient(135deg,var(--wine),var(--wine2));color:#fff;box-shadow:0 10px 26px #7c15393a}.secondary{background:#f5e5e8;color:var(--wine)}.ghost{background:transparent;color:var(--wine)}.full{width:100%}.row{display:flex;gap:10px}.row>*{flex:1}.nav{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom) + 12px);width:min(92%,680px);background:rgba(255,248,242,.92);backdrop-filter:blur(20px);border:1px solid #ecdadd;border-radius:24px;padding:8px;display:grid;grid-template-columns:repeat(4,1fr);z-index:10;box-shadow:var(--shadow)}.nav button{border:0;background:transparent;padding:10px 4px;color:var(--muted);font-size:12px}.nav button.active{color:var(--wine);font-weight:700}.field{margin:14px 0}.field label{display:block;font-size:13px;color:var(--muted);margin:0 0 7px}.field input,.field textarea,.field select{width:100%;border:1px solid var(--line);border-radius:16px;background:#fff;padding:14px 15px;font:inherit;color:var(--ink);outline:none}.field textarea{min-height:170px;resize:vertical}.letter{background:var(--paper);border-radius:26px;padding:26px;box-shadow:var(--shadow);font-family:Georgia,serif;line-height:1.65}.letter.soft{font-family:"Times New Roman",serif}.letter.modern{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif}.letter.handwritten{font-family:"Bradley Hand","Comic Sans MS",cursive}.list{display:grid;gap:10px}.item{padding:16px;border:1px solid var(--line);border-radius:18px;background:#fff}.item h3{margin:0 0 5px}.kicker{text-transform:uppercase;letter-spacing:.15em;color:var(--wine);font-size:11px;font-weight:800}.title{font:500 34px Georgia;margin:8px 0}.choice{width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:18px;padding:15px;margin:7px 0}.choice strong{display:block}.center{text-align:center}.envelope{width:260px;height:170px;margin:26px auto;position:relative;background:#d997a6;border-radius:10px;box-shadow:0 18px 40px #7c15392b}.envelope:before{content:"";position:absolute;inset:0;background:linear-gradient(145deg,transparent 49%,#c88094 50%);clip-path:polygon(0 0,100% 0,50% 58%)}.wax{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%);width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#a43861,var(--wine) 60%,#4b0a25);display:grid;place-items:center;color:#f4dcc0;font:26px Georgia}.error{padding:18px;border-radius:18px;background:#fff0f2;color:#8e163c}.topspace{height:9vh}@media(min-width:800px){.app{padding-top:38px}.hello h2{font-size:48px}.grid2{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}}
`;

const APP_JS = String.raw`
const tg=window.Telegram?.WebApp||null;const root=document.getElementById('app');const S={route:'home',session:null,letters:[],draft:null,recipient:null,stage:'envelope'};try{tg?.ready();tg?.expand();tg?.setHeaderColor?.('#fff8f2');tg?.setBackgroundColor?.('#fff8f2')}catch{}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const initData=()=>tg?.initData||'';const start=()=>tg?.initDataUnsafe?.start_param||new URLSearchParams(location.search).get('tgWebAppStartParam')||'';
async function api(path,opt={}){const h=new Headers(opt.headers||{});if(opt.body)h.set('content-type','application/json');if(initData())h.set('authorization','tma '+initData());const r=await fetch(path,{...opt,headers:h,cache:'no-store'});const ct=r.headers.get('content-type')||'';if(!ct.includes('application/json'))throw new Error('Backend ще не активний. Відкрий Mini App повторно після деплою Worker.');const d=await r.json();if(!r.ok)throw Object.assign(new Error(d.error||'Помилка'),{status:r.status,code:d.code});return d}
function nav(){return '<div class="nav">'+[['home','♡','Головна'],['create','✦','Створити'],['letters','✉','Листи'],['profile','◌','Профіль']].map(([r,i,t])=>'<button data-go="'+r+'" class="'+(S.route===r?'active':'')+'"><div>'+i+'</div>'+t+'</button>').join('')+'</div>'}
function header(){return '<div class="brand"><div class="seal">L</div><div><h1>Love Letter</h1><div class="muted">official mini app</div></div></div>'}
function render(){if(!S.session)return;const u=S.session.user,c=S.session.credits;let body='';if(S.route==='home')body='<div class="hello"><div class="muted">Добрий день, '+esc(u.firstName||u.username||'ти')+' ✦</div><h2>Слова, які хочеться зберегти.</h2></div><section class="card quota"><div class="kicker">Безкоштовні листи цього місяця</div><div class="big">'+c.monthlyRemaining+' / '+c.monthlyLimit+'</div><p class="muted">Бонусних: '+c.bonus+' · Придбаних: '+c.paid+'</p><button class="primary full" data-go="create">Створити Love Letter</button></section><section class="card"><div class="kicker">Запроси друга</div><h3>+1 лист за перший лист друга</h3><p class="muted">Бонус не згорає.</p><button class="secondary full" data-action="invite">Поділитися запрошенням</button></section>';
else if(S.route==='create')body=createView();else if(S.route==='letters')body=lettersView();else body=profileView();root.innerHTML='<main class="app">'+header()+body+'</main>'+nav()}
function blank(){return{recipient:'',title:'Для тебе',body:'',signature:'З любовʼю',style:'classic',question:'Що будемо робити?',choices:[{emoji:'☕',title:'Випити кави',subtitle:'Десь удвох'},{emoji:'🌿',title:'Прогулятися',subtitle:'Без поспіху'},{emoji:'💭',title:'Поговорити',subtitle:'Про все'},{emoji:'♡',title:'Обійнятися',subtitle:'Просто так'}],finalNote:'Домовились ♡'}}
function createView(){S.draft=S.draft||blank();const d=S.draft;return '<div class="hello"><div class="kicker">Новий лист</div><h2>Напиши так, як відчуваєш.</h2></div><div class="grid2"><section class="card"><div class="field"><label>Для кого</label><input data-bind="recipient" value="'+esc(d.recipient)+'" placeholder="Наприклад: Кохана"></div><div class="field"><label>Заголовок</label><input data-bind="title" value="'+esc(d.title)+'"></div><div class="field"><label>Текст</label><textarea data-bind="body" placeholder="Скажи найважливіше...">'+esc(d.body)+'</textarea></div><div class="field"><label>Підпис</label><input data-bind="signature" value="'+esc(d.signature)+'"></div><div class="field"><label>Стиль</label><select data-bind="style"><option value="classic">Класичний</option><option value="soft">Ніжний</option><option value="modern">Сучасний</option><option value="handwritten">Рукописний</option></select></div><button class="primary full" data-action="publish">Створити лист</button></section><section class="letter '+esc(d.style)+'"><div class="muted">Для '+esc(d.recipient||'тебе')+'</div><h2>'+esc(d.title)+'</h2><p>'+esc(d.body||'Твій текст зʼявиться тут...').replace(/\n/g,'<br>')+'</p><p style="text-align:right">'+esc(d.signature)+'</p></section></div>'}
function lettersView(){return '<div class="hello"><div class="kicker">Мої листи</div><h2>Те, що вже сказано.</h2></div><div class="list">'+(S.letters.length?S.letters.map(x=>'<div class="item"><h3>'+esc(x.title)+'</h3><div class="muted">Для '+esc(x.recipient)+'</div><div class="row" style="margin-top:12px"><button class="secondary" data-preview="'+esc(x.public_token)+'">Переглянути</button><button class="ghost" data-share="'+esc(x.public_token)+'">Поділитися</button></div></div>').join(''):'<div class="card center">Ще немає листів.</div>')+'</div>'}
function profileView(){const s=S.session,c=s.credits;return '<div class="hello"><div class="kicker">Профіль</div><h2>'+esc(s.user.firstName||s.user.username||'Love Letter')+'</h2></div><section class="card"><div class="big">'+c.totalAvailable+'</div><div class="muted">доступних листів зараз</div></section><section class="card"><h3>Баланс</h3><p>Щомісячні: '+c.monthlyRemaining+' / '+c.monthlyLimit+'</p><p>За друзів: '+c.bonus+'</p><p>Придбані: '+c.paid+'</p><button class="primary full" data-action="buy">Купити +1 за '+S.session.pricing.letterStars+' ⭐</button></section><section class="card"><h3>Запрошення</h3><p class="muted">За друга, який створить свій перший лист, ти отримаєш +1.</p><button class="secondary full" data-action="invite">Запросити друга</button></section>'}
async function load(){S.session=await api('/api/session',{method:'POST',body:'{}'});const l=await api('/api/letters');S.letters=l.letters||[];render()}
async function publish(){if(!S.draft?.recipient.trim()||!S.draft?.body.trim())return alert('Додай отримувача і текст.');try{const d=await api('/api/letters',{method:'POST',body:JSON.stringify({payload:S.draft,clientRequestId:crypto.randomUUID()})});S.draft=null;S.route='letters';await load();alert('Лист створено ♡')}catch(e){if(e.status===402){if(confirm(e.message+'\n\nКупити ще один?'))buy();}else alert(e.message)}}
async function buy(){try{const x=await api('/api/payments/invoice',{method:'POST',body:'{}'});if(tg?.openInvoice)tg.openInvoice(x.invoiceUrl,async status=>{if(status==='paid'){await new Promise(r=>setTimeout(r,900));await load()}});else location.href=x.invoiceUrl}catch(e){alert(e.message)}}
function invite(){const url=S.session.referrals.link;const share='https://t.me/share/url?url='+encodeURIComponent(url)+'&text='+encodeURIComponent('Створи свій Love Letter 💌');try{tg?.openTelegramLink?tg.openTelegramLink(share):location.href=share}catch{location.href=share}}
async function openLetter(token){S.recipient=(await api('/api/public/'+token)).letter;S.stage=S.recipient.choiceIndex==null?'envelope':'final';renderRecipient(token)}
function renderRecipient(token){const l=S.recipient;let content='';if(S.stage==='envelope')content='<div class="topspace"></div><div class="card center"><div class="kicker">Так починається маленьке диво</div><div class="title">Для тебе.</div><button class="ghost" data-open="1"><div class="envelope"><div class="wax">♡</div></div></button><div class="muted">Торкнись, щоб відкрити</div></div>';else if(S.stage==='letter')content='<div class="topspace"></div><article class="letter '+esc(l.style)+'"><div class="muted">Для тебе</div><h2>'+esc(l.title)+'</h2><p>'+esc(l.body).replace(/\n/g,'<br>')+'</p><p style="text-align:right">'+esc(l.signature)+'</p></article><button class="primary full" style="margin-top:16px" data-next="1">'+esc(l.question)+' →</button>';else if(S.stage==='choices')content='<div class="topspace"></div><section class="card"><div class="kicker">Останній маленький вибір</div><div class="title">'+esc(l.question)+'</div>'+l.choices.map((c,i)=>'<button class="choice" data-choice="'+i+'"><strong>'+esc(c.emoji)+' '+esc(c.title)+'</strong><span class="muted">'+esc(c.subtitle)+'</span></button>').join('')+'</section>';else{const c=l.choices[l.choiceIndex]||l.choices[0];content='<div class="topspace"></div><section class="card center"><div class="kicker">Ваш маленький план</div><div class="title">'+esc(c.emoji)+' '+esc(c.title)+'</div><p class="muted">'+esc(c.subtitle)+'</p><p>'+esc(l.finalNote||'Домовились ♡')+'</p></section>'}root.innerHTML='<main class="app">'+header()+content+'</main>';root.onclick=async e=>{if(e.target.closest('[data-open]')){S.stage='letter';renderRecipient(token)}else if(e.target.closest('[data-next]')){S.stage='choices';renderRecipient(token)}else{const b=e.target.closest('[data-choice]');if(b){const r=await api('/api/public/'+token+'/choice',{method:'POST',body:JSON.stringify({choiceIndex:Number(b.dataset.choice)})});l.choiceIndex=r.choiceIndex;S.stage='final';renderRecipient(token)}}}}
root.addEventListener('click',async e=>{const g=e.target.closest('[data-go]');if(g){S.route=g.dataset.go;if(S.route==='letters'){const l=await api('/api/letters');S.letters=l.letters||[]}render();return}const a=e.target.closest('[data-action]');if(a?.dataset.action==='publish')publish();if(a?.dataset.action==='buy')buy();if(a?.dataset.action==='invite')invite();const p=e.target.closest('[data-preview]');if(p)openLetter(p.dataset.preview);const sh=e.target.closest('[data-share]');if(sh){const url=location.origin+'/l/'+sh.dataset.share;try{tg?.openTelegramLink?.('https://t.me/share/url?url='+encodeURIComponent(url))||navigator.share?.({url})}catch{}}});root.addEventListener('input',e=>{const k=e.target.dataset.bind;if(k&&S.draft){S.draft[k]=e.target.value;if(k==='style')render()}});
(async()=>{try{const path=location.pathname.match(/^\/l\/([A-Za-z0-9_-]+)/)?.[1],sp=start();const tok=path||(sp.startsWith('letter_')?sp.slice(7):'');if(tok)return openLetter(tok);if(!initData()){root.innerHTML='<main class="app"><div class="topspace"></div><section class="card center">'+header()+'<h2>Відкрий Love Letter через Telegram</h2><p class="muted">Mini App використовує Telegram для безпечної авторизації.</p></section></main>';return}await load()}catch(e){root.innerHTML='<main class="app"><div class="topspace"></div><section class="card center"><div class="seal" style="margin:auto">L</div><h2>Не вдалося запустити Love Letter</h2><div class="error">'+esc(e.message)+'</div><button class="primary full" style="margin-top:16px" onclick="location.reload()">Спробувати ще раз</button></section></main>'}})();
`;

function shell(){return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#fff8f2"><title>Love Letter</title><style>${CSS}</style><script src="https://telegram.org/js/telegram-web-app.js?63"></script></head><body><div id="app"><main class="app"><div class="topspace"></div><section class="card center"><div class="seal" style="margin:auto">L</div><p class="muted">Відкриваємо Love Letter…</p></section></main></div><script>${APP_JS}</script></body></html>`}

export default { async fetch(request,env){ const url=new URL(request.url); try{ if(url.pathname.startsWith('/api/')) return await api(request,env,url); if(url.pathname==='/'||url.pathname.startsWith('/l/')) return html(shell()); return text('Not found',404); }catch(e){ console.error(e); return json({ok:false,error:'Внутрішня помилка сервісу',code:'INTERNAL_ERROR'},500); } } };
