/**
 * 〈獵人〉山林旅程｜Google Apps Script 後端
 * 部署：試算表 → 擴充功能 → Apps Script → 貼上本檔 → 改第 8 行密碼 → 貼上答案區塊
 *       → 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取權：所有人）
 * 密碼請用 10 字以上、英數混合。維持 change-me 時，教師功能一律無法登入。
 */
// ↓ 第 8 行：教師密碼
const PASSWORD = 'change-me';

// 班級名單，例：['901','902','903']。留空＝只檢查格式（3～4 位數字）。
const CLASSES = [];

/* ===== 第二部分答案（GitHub 上保持空白；請貼上老師另外收到的「答案區塊」） ===== */
const ANSWERS = {
  // ↓↓↓ 把答案區塊整段貼在這一行下面 ↓↓↓

  // ↑↑↑ 貼到這一行上面為止 ↑↑↑
};

/* ===== 以下不用修改 ===== */
const ACTIVITY = 'hunter';
const DATA = '程式資料（請勿編輯）';
const LOG = '作答紀錄';
const DATA_HEAD = ['key', '班級', '座號', '姓名', '可重做', 'attempts', '更新時間'];
const LOG_HEAD = ['交出時間', '班級', '座號', '姓名', '用時(分)', '書寫總字數', '第一部分字數', '第二部分回合', '靶心回合', '郵票', '原創比例', '提醒', '第一部分：我的想法', '第二部分：反駁理由', '第三部分：明信片', '紀錄ID'];
const ARROW_NAMES = { zy: '生存與莊嚴之箭', jj: '火光與禁忌之箭', kz: '獨行與克制之箭', wh: '文化與尊重之箭' };
const CLAIM_TAGS = ['貪多掠奪', '規矩迷信', '白V黑熊', '狩獵偏見', '獵人無用', '保育兩難', '不擇手段', '母子山豬'];
const STAMPS = { guard: '森林守護者', learn: '山林見習獵人' };
const LIMITS = { name: 20, short: 200, text: 3000 };
const MAX_ATTEMPTS = 20;

function doGet() {
  return out({ ok: true, app: ACTIVITY, passwordSet: PASSWORD !== 'change-me', answersReady: Object.keys(ANSWERS).length === 8 });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'bad-json' }); }
  try {
    switch (req.action) {
      case 'check': return out(check(req));
      case 'judge': return out(judge(req));
      case 'save': return out(withLock(() => save(req.student, req.record, false)));
      case 'report': return out(report(req));
      case 'list': return out(list(req));
      case 'stats': return out(stats(req));
      case 'login': checkPw(req.password); return out({ ok: true });
      case 'setting': return out(withLock(() => setting(req)));
      case 'redo': return out(withLock(() => redo(req)));
      case 'deleteAttempt': return out(withLock(() => deleteAttempt(req)));
      case 'clearClass': return out(withLock(() => clearClass(req)));
      case 'import': return out(withLock(() => importCode(req)));
      default: return out({ ok: false, error: 'unknown-action' });
    }
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ---------- 共用 ---------- */
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function withLock(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function cut(s, n) { return String(s == null ? '' : s).slice(0, n); }
function safe(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafe(s) { return String(s == null ? '' : s).replace(/^'/, ''); }
function intIn(v, lo, hi) { const n = parseInt(v, 10); return (n >= lo && n <= hi) ? n : null; }
function len(s) { return String(s || '').replace(/\s/g, '').length; }
function prop(k, d) { const v = PropertiesService.getScriptProperties().getProperty(k); return v == null ? d : v; }
function setProp(k, v) { PropertiesService.getScriptProperties().setProperty(k, String(v)); }
function threshold() { return Number(prop('threshold', '600')) || 600; }
function published() { return prop('published', 'false') === 'true'; }

function checkPw(pw) {
  const c = CacheService.getScriptCache();
  const n = Number(c.get('pwfail') || 0);
  if (n >= 5) throw new Error('locked');
  if (PASSWORD === 'change-me' || String(pw || '') !== PASSWORD) {
    c.put('pwfail', String(n + 1), 600);
    throw new Error(n + 1 >= 5 ? 'locked' : 'bad-password');
  }
}

function cleanStudent(s) {
  s = s || {};
  const cls = String(s.cls || '').trim();
  const seat = intIn(s.seat, 1, 60);
  const name = cut(String(s.name || '').trim(), LIMITS.name);
  if (CLASSES.length ? CLASSES.indexOf(cls) < 0 : !/^\d{3,4}$/.test(cls)) throw new Error('bad-class');
  if (seat == null) throw new Error('bad-seat');
  if (!name) throw new Error('bad-name');
  return { cls: cls, seat: seat, name: name };
}

function cleanRecord(r) {
  r = r || {};
  const p1 = (Array.isArray(r.p1) ? r.p1 : []).slice(0, 7).map(x => {
    x = x || {};
    return {
      lens: ['wide', 'mid', 'macro'].indexOf(x.lens) >= 0 ? x.lens : '',
      clues: (Array.isArray(x.clues) ? x.clues : []).map(n => intIn(n, 0, 9)).filter(n => n != null).slice(0, 10),
      did: cut(x.did, LIMITS.short), said: cut(x.said, LIMITS.short), mood: cut(x.mood, LIMITS.short),
      thought: cut(x.thought, LIMITS.text)
    };
  });
  const p2 = (Array.isArray(r.p2) ? r.p2 : []).slice(0, 8).map(x => {
    x = x || {};
    return {
      id: intIn(x.id, 0, 7),
      shots: (Array.isArray(x.shots) ? x.shots : []).slice(0, 12).map(s => ({ arrow: ARROW_NAMES[s && s.arrow] ? s.arrow : '' })).filter(s => s.arrow),
      reason: cut(x.reason, LIMITS.text)
    };
  }).filter(x => x.id != null && x.shots.length);
  const p3r = r.p3 || {};
  const orig = Number(p3r.originality);
  const p3 = {
    bg: intIn(p3r.bg, 0, 2) || 0,
    text: cut(p3r.text, LIMITS.text),
    originality: (orig >= 0 && orig <= 1) ? Math.round(orig * 100) / 100 : 0,
    stamp: STAMPS[p3r.stamp] ? p3r.stamp : ''
  };
  const durationSec = intIn(r.durationSec, 0, 86400) || 0;
  const partSec = (Array.isArray(r.partSec) ? r.partSec : []).slice(0, 3).map(n => intIn(n, 0, 86400) || 0);
  return { p1: p1, p2: p2, p3: p3, durationSec: durationSec, partSec: partSec };
}

function accOf(a, arrow) { return a.best.indexOf(arrow) >= 0 ? 3 : (a.near.indexOf(arrow) >= 0 ? 2 : 1); }

function analyze(rec) {
  const p1Words = rec.p1.reduce((t, x) => t + len(x.thought) + len(x.did) + len(x.said) + len(x.mood), 0);
  const p2Words = rec.p2.reduce((t, x) => t + len(x.reason), 0);
  const p3Words = len(rec.p3.text);
  const rounds = rec.p2.map(x => {
    const a = ANSWERS[x.id];
    const accs = a ? x.shots.map(s => accOf(a, s.arrow)) : [];
    return { id: x.id, shots: x.shots.length, accs: accs, final: accs.length ? accs[accs.length - 1] : 0 };
  });
  const p1Done = rec.p1.length === 7 && rec.p1.every(x => x.lens && x.clues.length && len(x.thought) >= 10);
  return {
    p1Words: p1Words, p2Words: p2Words, p3Words: p3Words, words: p1Words + p2Words + p3Words,
    clues: rec.p1.reduce((t, x) => t + x.clues.length, 0),
    rounds: rounds, bulls: rounds.filter(r => r.final === 3).length,
    parts: [p1Done, rec.p2.length >= 3, p3Words >= 20],
    partsDone: (p1Done ? 1 : 0) + (rec.p2.length >= 3 ? 1 : 0) + (p3Words >= 20 ? 1 : 0)
  };
}

function flagsOf(att) {
  const f = [];
  if (att.rec.durationSec && att.rec.durationSec < threshold()) f.push('用時偏短');
  if (att.ana.words < 300) f.push('書寫偏少');
  return f;
}

/* ---------- 試算表 ---------- */
function sheet(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function readData() {
  const sh = sheet(DATA, DATA_HEAD);
  const v = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i];
    if (!r[0]) continue;
    let att = [];
    try { att = JSON.parse(r[5] || '[]'); } catch (e) { att = []; }
    rows.push({ row: i + 1, key: String(r[0]), cls: String(r[1]), seat: Number(r[2]), name: unsafe(r[3]), redo: r[4] === true || String(r[4]).toUpperCase() === 'TRUE', attempts: att });
  }
  return { sh: sh, rows: rows };
}
function writeRow(sh, obj) {
  let json = JSON.stringify(obj.attempts);
  while (json.length > 45000 && obj.attempts.length > 1) { obj.attempts.shift(); json = JSON.stringify(obj.attempts); }
  const vals = [[obj.key, obj.cls, obj.seat, safe(obj.name), obj.redo ? true : false, json, new Date()]];
  if (obj.row) sh.getRange(obj.row, 1, 1, 7).setValues(vals);
  else sh.appendRow(vals[0]);
}
function findRow(rows, cls, seat) { return rows.filter(r => r.cls === String(cls) && r.seat === Number(seat))[0] || null; }

/* ---------- 學生端 ---------- */
function check(req) {
  const st = cleanStudent(req.student);
  const r = findRow(readData().rows, st.cls, st.seat);
  return { ok: true, already: !!(r && r.attempts.length && !r.redo) };
}

function judge(req) {
  const a = ANSWERS[req.claimId];
  if (!a) return { ok: false, error: 'answers-not-set' };
  if (!ARROW_NAMES[req.arrow]) return { ok: false, error: 'bad-arrow' };
  const acc = accOf(a, req.arrow);
  return { ok: true, acc: acc, text: acc === 3 ? a.note : a.hint };
}

function save(student, record, force) {
  const st = cleanStudent(student);
  const rec = cleanRecord(record);
  if (!rec.p1.length && !rec.p2.length && !rec.p3.text) throw new Error('empty');
  const d = readData();
  let r = findRow(d.rows, st.cls, st.seat);
  if (r && r.attempts.length && !r.redo && !force) return { ok: false, error: 'already' };
  const ana = analyze(rec);
  const ts = new Date().toISOString();
  const att = { ts: ts, name: st.name, rec: rec, ana: ana };
  if (!r) r = { row: null, key: st.cls + '-' + st.seat, cls: st.cls, seat: st.seat, name: st.name, redo: false, attempts: [] };
  r.name = st.name; r.redo = false;
  r.attempts.push(att);
  if (r.attempts.length > MAX_ATTEMPTS) r.attempts = r.attempts.slice(-MAX_ATTEMPTS);
  writeRow(d.sh, r);
  const p1t = rec.p1.map((x, i) => '【' + (i + 1) + '】' + x.thought).join('\n');
  const p2t = rec.p2.map(x => '【' + CLAIM_TAGS[x.id] + '】' + x.reason).join('\n');
  sheet(LOG, LOG_HEAD).appendRow([new Date(ts), st.cls, st.seat, safe(st.name),
    Math.round(rec.durationSec / 6) / 10, ana.words, ana.p1Words, rec.p2.length, ana.bulls,
    STAMPS[rec.p3.stamp] || '', rec.p3.originality, flagsOf(att).join('、'),
    safe(p1t), safe(p2t), safe(rec.p3.text), st.cls + '-' + st.seat + '@' + ts]);
  return { ok: true, ts: ts, report: buildReport(st, att, false) };
}

function answersForView() {
  const o = {};
  Object.keys(ANSWERS).forEach(k => {
    const a = ANSWERS[k];
    o[k] = { best: a.best.map(x => ARROW_NAMES[x]), near: a.near.map(x => ARROW_NAMES[x]), note: a.note };
  });
  return o;
}

function buildReport(st, att, teacher) {
  const pub = published() || !!teacher;
  const ana = JSON.parse(JSON.stringify(att.ana));
  if (!pub) ana.rounds = ana.rounds.map(r => ({ id: r.id, shots: r.shots }));
  return { student: { cls: st.cls, seat: st.seat, name: att.name || st.name }, ts: att.ts, rec: att.rec, ana: ana, published: pub, answers: pub ? answersForView() : null };
}

function report(req) {
  const st = cleanStudent(req.student);
  const r = findRow(readData().rows, st.cls, st.seat);
  if (!r || !r.attempts.length || r.name !== st.name) return { ok: false, error: 'not-found' };
  return { ok: true, report: buildReport(st, r.attempts[r.attempts.length - 1], false) };
}

/* ---------- 成績與大屏 ---------- */
function list(req) {
  const teacher = !!req.password && (checkPw(req.password), true);
  const rows = readData().rows.filter(r => r.attempts.length);
  const board = rows.map(r => {
    const last = r.attempts[r.attempts.length - 1];
    const b = { cls: r.cls, seat: r.seat, name: r.name, partsDone: last.ana.partsDone, words: last.ana.words, bulls: last.ana.bulls, stamp: last.rec.p3.stamp };
    if (teacher) {
      b.lastTs = last.ts;
      b.redo = r.redo;
      b.attempts = r.attempts.map(a => ({ ts: a.ts, name: a.name, rec: a.rec, ana: a.ana, flags: flagsOf(a) }));
      b.flagCount = b.attempts.filter(a => a.flags.length).length;
    }
    return b;
  });
  const res = { ok: true, teacher: teacher, board: board, published: published() };
  if (teacher) { res.threshold = threshold(); res.answers = answersForView(); }
  return res;
}

function stats(req) {
  const rows = readData().rows.filter(r => r.attempts.length);
  const classes = {};
  rows.forEach(r => { classes[r.cls] = (classes[r.cls] || 0) + 1; });
  const cls = String(req.cls || '');
  const mine = rows.filter(r => r.cls === cls).map(r => r.attempts[r.attempts.length - 1]);
  const lens = [0, 1, 2, 3, 4, 5, 6].map(() => ({ wide: 0, mid: 0, macro: 0 }));
  const claims = CLAIM_TAGS.map(t => ({ tag: t, n: 0, bulls: 0 }));
  const stamps = { guard: 0, learn: 0 };
  mine.forEach(a => {
    a.rec.p1.forEach((x, i) => { if (lens[i] && x.lens) lens[i][x.lens]++; });
    a.ana.rounds.forEach(r => { claims[r.id].n++; if (r.final === 3) claims[r.id].bulls++; });
    if (stamps[a.rec.p3.stamp] != null) stamps[a.rec.p3.stamp]++;
  });
  const top = rows.filter(r => r.cls === cls).map(r => { const a = r.attempts[r.attempts.length - 1]; return { seat: r.seat, name: r.name, words: a.ana.words }; })
    .sort((x, y) => y.words - x.words).slice(0, 5);
  return { ok: true, classes: classes, cls: cls, count: mine.length, finished: mine.filter(a => a.ana.partsDone === 3).length, lens: lens, claims: claims, stamps: stamps, top: top };
}

/* ---------- 教師區 ---------- */
function setting(req) {
  checkPw(req.password);
  if (req.key === 'published') setProp('published', req.value ? 'true' : 'false');
  else if (req.key === 'threshold') { const n = intIn(req.value, 0, 7200); if (n == null) throw new Error('bad-value'); setProp('threshold', n); }
  else throw new Error('bad-key');
  return { ok: true };
}
function redo(req) {
  checkPw(req.password);
  const d = readData();
  const r = findRow(d.rows, req.cls, req.seat);
  if (!r) throw new Error('not-found');
  r.redo = !!req.value;
  writeRow(d.sh, r);
  return { ok: true };
}
function deleteLogRows(test) {
  const sh = sheet(LOG, LOG_HEAD);
  const v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) if (test(v[i])) sh.deleteRow(i + 1);
}
function deleteAttempt(req) {
  checkPw(req.password);
  const d = readData();
  const r = findRow(d.rows, req.cls, req.seat);
  if (!r) throw new Error('not-found');
  r.attempts = r.attempts.filter(a => a.ts !== req.ts);
  if (r.attempts.length) writeRow(d.sh, r); else d.sh.deleteRow(r.row);
  const id = r.cls + '-' + r.seat + '@' + req.ts;
  deleteLogRows(row => String(row[15]) === id);
  return { ok: true };
}
function clearClass(req) {
  checkPw(req.password);
  const cls = String(req.cls || '');
  if (!cls) throw new Error('bad-class');
  const d = readData();
  d.rows.filter(r => r.cls === cls).sort((a, b) => b.row - a.row).forEach(r => d.sh.deleteRow(r.row));
  deleteLogRows(row => String(row[1]) === cls);
  return { ok: true };
}
function importCode(req) {
  checkPw(req.password);
  let obj;
  try { obj = JSON.parse(Utilities.newBlob(Utilities.base64Decode(String(req.code || '').trim())).getDataAsString('UTF-8')); }
  catch (e) { throw new Error('bad-code'); }
  if (!obj || obj.app !== ACTIVITY) throw new Error('bad-code');
  return save(obj.student, obj.record, true);
}
