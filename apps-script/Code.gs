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

/* ===== 答案區（GitHub 上保持空白；請貼上老師另外收到的「答案區塊」，含前測與第二部分） ===== */
// ↓↓↓ 把答案區塊整段貼在這一行下面 ↓↓↓

// ↑↑↑ 貼到這一行上面為止 ↑↑↑

/* ===== 以下不用修改 ===== */
const ACTIVITY = 'hunter';
const DATA = '程式資料（請勿編輯）';
const LOG = '作答紀錄';
const DATA_HEAD = ['key', '班級', '座號', '姓名', '可重做', 'attempts', '更新時間', 'pretest', 'progress', 'posttest'];
const PRE_LOG = '前測紀錄';
const PRE_HEAD = ['交出時間', '班級', '座號', '姓名', '用時(秒)', '得分', '第1題', '第2題', '第3題', '第4題', '第5題', '檢索', '推論整合', '省思評鑑', '全文重點（第6題）', '第6題理由', '紀錄ID'];
const POST_LOG = '後測紀錄';
const POST_HEAD = ['交出時間', '班級', '座號', '姓名', '用時(秒)', '得分', '第1題', '第2題', '第3題', '第4題', '第5題', '推論整合', '省思評鑑', '紀錄ID'];
const LOG_HEAD = ['交出時間', '班級', '座號', '姓名', '用時(分)', '書寫總字數', '第一部分字數', '第二部分回合', '靶心回合', '郵票', '原創比例', '提醒', '第一部分：我的想法', '第二部分：反駁理由', '第三部分：明信片', '紀錄ID'];
const ARROW_NAMES = { zy: '生存與莊嚴之箭', jj: '火光與禁忌之箭', kz: '獨行與克制之箭', wh: '文化與尊重之箭' };
const CLAIM_TAGS = ['貪多掠奪', '規矩迷信', '白V黑熊', '狩獵偏見', '獵人無用', '保育兩難', '不擇手段', '母子山豬'];
const STAMPS = { guard: '金色．森林守護者', learn: '黑色．山林見習獵人' };
const LIMITS = { name: 20, short: 200, text: 3000 };
const MAX_ATTEMPTS = 20;
const LEVELS = ['檢索', '推論整合', '省思評鑑'];
const OPT = ['A', 'B', 'C', 'D'];
const KEYPOINTS = ['勇敢、智慧與愛', '節制與留給下一代', '找回泰雅的身分', '山林故事的傳承'];
function getAnswers() { return (typeof ANSWERS !== 'undefined' && ANSWERS) ? ANSWERS : {}; }
function getPretest() { return (typeof PRETEST !== 'undefined' && PRETEST) ? PRETEST : []; }
function getPosttest() { return (typeof POSTTEST !== 'undefined' && POSTTEST) ? POSTTEST : []; }

function doGet() {
  return out({ ok: true, app: ACTIVITY, passwordSet: PASSWORD !== 'change-me', answersReady: Object.keys(getAnswers()).length === 8 && getPretest().length === 5 && getPosttest().length === 5 });
}

function doPost(e) {
  let req = {};
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'bad-json' }); }
  try {
    switch (req.action) {
      case 'check': return out(check(req));
      case 'judge': return out(judge(req));
      case 'pretest': return out(withLock(() => pretest(req)));
      case 'deletePretest': return out(withLock(() => deletePretest(req)));
      case 'posttest': return out(withLock(() => posttest(req)));
      case 'deletePosttest': return out(withLock(() => deletePosttest(req)));
      case 'progress': return out(withLock(() => saveProgress(req)));
      case 'loadProgress': return out(loadProgress(req));
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

const P1_TAGS = ['動作', '想法', '感情', '背景說明'];
const P1_RELS = ['順順承接', '明顯轉折'];
const ANGLE_NAMES = { A: '事件推進線', B: '空間與光影線', C: '敘事焦點線', D: '成長試煉線' };
const FOCUS_NAMES = { me: '「我」', hunter: '獵人', gap: '視角落差' };
function intList(a) { return (Array.isArray(a) ? a : []).map(n => intIn(n, 0, 9)).filter(n => n != null).slice(0, 10); }
function cleanP1(x) {
  x = x || {};
  const secs = (Array.isArray(x.secs) ? x.secs : []).slice(0, 3).map(s => {
    s = s || {};
    return {
      items: (Array.isArray(s.items) ? s.items : []).slice(0, 4).map(it => {
        it = it || {};
        const si = parseInt(it.si, 10);
        return { si: (si >= -1 && si <= 999) ? si : -1, text: cut(it.text, 300), p: intIn(it.p, 0, 15) || 0, custom: !!it.custom,
          tags: (Array.isArray(it.tags) ? it.tags : []).filter(t => P1_TAGS.indexOf(t) >= 0) };
      }).filter(it => it.text),
      rel: P1_RELS.indexOf(s.rel) >= 0 ? s.rel : ''
    };
  });
  while (secs.length < 3) secs.push({ items: [], rel: '' });
  const c = x.cmp || {}, t = x.theme || {};
  return {
    focus: FOCUS_NAMES[x.focus] ? x.focus : '', angle: ANGLE_NAMES[x.angle] ? x.angle : '', secs: secs,
    cmp: { angle: ANGLE_NAMES[c.angle] ? c.angle : '', focus: FOCUS_NAMES[c.focus] ? c.focus : '', diffs: intList(c.diffs), sentence: cut(c.sentence, LIMITS.text) },
    theme: { keys: intList(t.keys), text: cut(t.text, LIMITS.text) }
  };
}
function cleanRecord(r) {
  r = r || {};
  const p1 = cleanP1(r.p1);
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
    to: ['author', 'hunter', 'me'].indexOf(p3r.to) >= 0 ? p3r.to : '',
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
  const P = rec.p1;
  const pulled = P.secs.reduce((t, s) => t + s.items.length, 0);
  const p1Words = len(P.cmp.sentence) + len(P.theme.text) + P.secs.reduce((t, s) => t + s.items.filter(i => i.custom).reduce((a, i) => a + len(i.text), 0), 0);
  const p2Words = rec.p2.reduce((t, x) => t + len(x.reason), 0);
  const p3Words = len(rec.p3.text);
  const rounds = rec.p2.map(x => {
    const a = getAnswers()[x.id];
    const accs = a ? x.shots.map(s => accOf(a, s.arrow)) : [];
    return { id: x.id, shots: x.shots.length, accs: accs, final: accs.length ? accs[accs.length - 1] : 0 };
  });
  const p1Done = !!(P.focus && P.angle && P.secs.every(s => s.items.length) && len(P.cmp.sentence) >= 10 && len(P.theme.text) >= 10);
  return {
    p1Words: p1Words, p2Words: p2Words, p3Words: p3Words, words: p1Words + p2Words + p3Words,
    clues: pulled,
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
    let pre = null, prog = null;
    try { pre = r[7] ? JSON.parse(r[7]) : null; } catch (e) { pre = null; }
    try { prog = r[8] ? JSON.parse(r[8]) : null; } catch (e) { prog = null; }
    let post = null;
    try { post = r[9] ? JSON.parse(r[9]) : null; } catch (e) { post = null; }
    rows.push({ row: i + 1, key: String(r[0]), cls: String(r[1]), seat: Number(r[2]), name: unsafe(r[3]), redo: r[4] === true || String(r[4]).toUpperCase() === 'TRUE', attempts: att, pretest: pre, progress: prog, posttest: post });
  }
  return { sh: sh, rows: rows };
}
function writeRow(sh, obj) {
  let json = JSON.stringify(obj.attempts);
  while (json.length > 45000 && obj.attempts.length > 1) { obj.attempts.shift(); json = JSON.stringify(obj.attempts); }
  const vals = [[obj.key, obj.cls, obj.seat, safe(obj.name), obj.redo ? true : false, json, new Date(), obj.pretest ? JSON.stringify(obj.pretest) : '', obj.progress ? JSON.stringify(obj.progress) : '', obj.posttest ? JSON.stringify(obj.posttest) : '']];
  if (obj.row) sh.getRange(obj.row, 1, 1, 10).setValues(vals);
  else sh.appendRow(vals[0]);
}
function findRow(rows, cls, seat) { return rows.filter(r => r.cls === String(cls) && r.seat === Number(seat))[0] || null; }

/* ---------- 學生端 ---------- */
function check(req) {
  const st = cleanStudent(req.student);
  const r = findRow(readData().rows, st.cls, st.seat);
  const mine = !!(r && r.name === st.name);
  return { ok: true, already: !!(r && r.attempts.length && !r.redo), pretestDone: !!(r && r.pretest && !r.redo), posttestDone: !!(r && r.posttest && !r.redo),
    progressAt: (mine && r.progress) ? (r.progress.savedAt || r.progress.at) : 0, nameTaken: !!(r && !mine && (r.progress || r.pretest || r.attempts.length)) };
}

function judge(req) {
  const a = getAnswers()[req.claimId];
  if (!a) return { ok: false, error: 'answers-not-set' };
  if (!ARROW_NAMES[req.arrow]) return { ok: false, error: 'bad-arrow' };
  const acc = accOf(a, req.arrow);
  return { ok: true, acc: acc, text: acc === 3 ? a.note : a.hint };
}

function save(student, record, force) {
  const st = cleanStudent(student);
  const rec = cleanRecord(record);
  if (!rec.p1.angle && !rec.p2.length && !rec.p3.text) throw new Error('empty');
  const d = readData();
  let r = findRow(d.rows, st.cls, st.seat);
  if (r && r.attempts.length && !r.redo && !force) return { ok: false, error: 'already' };
  const ana = analyze(rec);
  const ts = new Date().toISOString();
  const att = { ts: ts, name: st.name, rec: rec, ana: ana };
  if (!r) r = { row: null, key: st.cls + '-' + st.seat, cls: st.cls, seat: st.seat, name: st.name, redo: false, attempts: [], pretest: null, progress: null, posttest: null };
  r.name = st.name; r.redo = false; r.progress = null;
  r.attempts.push(att);
  if (r.attempts.length > MAX_ATTEMPTS) r.attempts = r.attempts.slice(-MAX_ATTEMPTS);
  writeRow(d.sh, r);
  const P = rec.p1;
  const p1t = P.angle ? ['焦點：' + (FOCUS_NAMES[P.focus] || '') + '｜切法：' + ANGLE_NAMES[P.angle]]
    .concat(P.secs.map((s, k) => '【' + (k + 1) + '】' + s.items.map(i => '「' + i.text + '」').join('')))
    .concat(['比較：' + P.cmp.sentence, '主旨：' + P.theme.text]).join('\n') : '';
  const p2t = rec.p2.map(x => '【' + CLAIM_TAGS[x.id] + '】' + x.reason).join('\n');
  sheet(LOG, LOG_HEAD).appendRow([new Date(ts), st.cls, st.seat, safe(st.name),
    Math.round(rec.durationSec / 6) / 10, ana.words, ana.p1Words, rec.p2.length, ana.bulls,
    STAMPS[rec.p3.stamp] || '', rec.p3.originality, flagsOf(att).join('、'),
    safe(p1t), safe(p2t), safe(rec.p3.text), st.cls + '-' + st.seat + '@' + ts]);
  return { ok: true, ts: ts, report: buildReport(st, att, false, r.pretest, r.posttest) };
}

/* ---------- 後測 ---------- */
function postSummary(p, pub) {
  if (!p) return null;
  const P = getPosttest();
  const lv = {};
  P.forEach((q, i) => { if (!lv[q.level]) lv[q.level] = [0, 0]; lv[q.level][1]++; if (p.correct[i]) lv[q.level][0]++; });
  const o = { ts: p.ts, score: p.score, total: P.length, levels: lv, durationSec: p.durationSec };
  if (pub) o.items = P.map((q, i) => ({ level: q.level, chosen: p.answers[i], correct: p.correct[i], ans: q.ans, explain: q.explain }));
  return o;
}
function posttest(req) {
  const st = cleanStudent(req.student);
  const P = getPosttest();
  if (P.length !== 5) return { ok: false, error: 'answers-not-set' };
  const answers = cleanChoices(req.answers);
  if (answers.indexOf(-1) >= 0) throw new Error('incomplete');
  const d = readData();
  let r = findRow(d.rows, st.cls, st.seat);
  if (r && r.name !== st.name && (r.progress || r.pretest || r.attempts.length)) return { ok: false, error: 'name-taken' };
  if (r && r.posttest && !r.redo) return { ok: false, error: 'already-posttest' };
  if (!r) r = { row: null, key: st.cls + '-' + st.seat, cls: st.cls, seat: st.seat, name: st.name, redo: false, attempts: [], pretest: null, progress: null, posttest: null };
  const correct = P.map((q, i) => answers[i] === q.ans);
  const ts = new Date().toISOString();
  r.posttest = { ts: ts, answers: answers, correct: correct, score: correct.filter(Boolean).length, durationSec: intIn(req.durationSec, 0, 86400) || 0 };
  writeRow(d.sh, r);
  const sum = postSummary(r.posttest, false);
  sheet(POST_LOG, POST_HEAD).appendRow([new Date(ts), st.cls, st.seat, safe(st.name), r.posttest.durationSec, r.posttest.score]
    .concat(answers.map((a, i) => OPT[a] + (correct[i] ? '' : '✗')))
    .concat(['推論整合', '省思評鑑'].map(l => sum.levels[l] ? sum.levels[l][0] + '/' + sum.levels[l][1] : '')).concat([st.cls + '-' + st.seat + '@' + ts]));
  return { ok: true, ts: ts };
}
function deletePosttest(req) {
  checkPw(req.password);
  const d = readData();
  const r = findRow(d.rows, req.cls, req.seat);
  if (!r || !r.posttest) throw new Error('not-found');
  const id = r.cls + '-' + r.seat + '@' + r.posttest.ts;
  r.posttest = null;
  writeRow(d.sh, r);
  const sh = sheet(POST_LOG, POST_HEAD);
  const v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) if (String(v[i][13]) === id) sh.deleteRow(i + 1);
  return { ok: true };
}

/* ---------- 做到一半的進度（換裝置接著做） ---------- */
function saveProgress(req) {
  const st = cleanStudent(req.student);
  const data = String(req.data || '');
  if (!data || data.length > 45000) throw new Error('bad-progress');
  let parsed;
  try { parsed = JSON.parse(data); } catch (e) { throw new Error('bad-progress'); }
  const d = readData();
  let r = findRow(d.rows, st.cls, st.seat);
  if (r && r.attempts.length && !r.redo) return { ok: false, error: 'already' };
  if (r && r.name !== st.name && (r.progress || r.pretest || r.attempts.length)) return { ok: false, error: 'name-taken' };
  if (!r) r = { row: null, key: st.cls + '-' + st.seat, cls: st.cls, seat: st.seat, name: st.name, redo: false, attempts: [], pretest: null, progress: null, posttest: null };
  r.name = st.name;
  const at = Date.now();
  r.progress = { at: at, savedAt: Number(parsed && parsed.savedAt) || 0, data: data };
  writeRow(d.sh, r);
  return { ok: true, at: at };
}
function loadProgress(req) {
  const st = cleanStudent(req.student);
  const r = findRow(readData().rows, st.cls, st.seat);
  if (!r || r.name !== st.name || !r.progress) return { ok: false, error: 'not-found' };
  return { ok: true, at: r.progress.at, data: r.progress.data };
}

/* ---------- 前測 ---------- */
function cleanChoices(a) {
  return [0, 1, 2, 3, 4].map(i => { const n = intIn((Array.isArray(a) ? a : [])[i], 0, 3); return n == null ? -1 : n; });
}
function preSummary(p, pub) {
  if (!p) return null;
  const P = getPretest();
  const lv = {};
  LEVELS.forEach(l => { lv[l] = [0, 0]; });
  P.forEach((q, i) => { if (!lv[q.level]) lv[q.level] = [0, 0]; lv[q.level][1]++; if (p.correct[i]) lv[q.level][0]++; });
  const o = { ts: p.ts, score: p.score, total: P.length, levels: lv, durationSec: p.durationSec, open: p.open || null };
  if (pub) o.items = P.map((q, i) => ({ level: q.level, chosen: p.answers[i], correct: p.correct[i], ans: q.ans, explain: q.explain }));
  return o;
}
function pretest(req) {
  const st = cleanStudent(req.student);
  const P = getPretest();
  if (P.length !== 5) return { ok: false, error: 'answers-not-set' };
  const answers = cleanChoices(req.answers);
  if (answers.indexOf(-1) >= 0) throw new Error('incomplete');
  const oc = intIn(req.open && req.open.choice, 0, 3);
  const reason = cut(req.open && req.open.reason, LIMITS.text);
  if (oc == null || len(reason) < 5) throw new Error('incomplete');
  const d = readData();
  let r = findRow(d.rows, st.cls, st.seat);
  if (r && r.pretest && !r.redo) return { ok: false, error: 'already-pretest' };
  if (!r) r = { row: null, key: st.cls + '-' + st.seat, cls: st.cls, seat: st.seat, name: st.name, redo: false, attempts: [], pretest: null, progress: null, posttest: null };
  r.name = st.name;
  const correct = P.map((q, i) => answers[i] === q.ans);
  const ts = new Date().toISOString();
  r.pretest = { ts: ts, answers: answers, correct: correct, score: correct.filter(Boolean).length, durationSec: intIn(req.durationSec, 0, 86400) || 0, open: { choice: oc, reason: reason } };
  writeRow(d.sh, r);
  const sum = preSummary(r.pretest, false);
  sheet(PRE_LOG, PRE_HEAD).appendRow([new Date(ts), st.cls, st.seat, safe(st.name), r.pretest.durationSec, r.pretest.score]
    .concat(answers.map((a, i) => OPT[a] + (correct[i] ? '' : '✗')))
    .concat(LEVELS.map(l => sum.levels[l][0] + '/' + sum.levels[l][1])).concat([OPT[oc] + ' ' + KEYPOINTS[oc], safe(reason), st.cls + '-' + st.seat + '@' + ts]));
  return { ok: true, ts: ts };
}
function deletePretest(req) {
  checkPw(req.password);
  const d = readData();
  const r = findRow(d.rows, req.cls, req.seat);
  if (!r || !r.pretest) throw new Error('not-found');
  const id = r.cls + '-' + r.seat + '@' + r.pretest.ts;
  r.pretest = null;
  if (r.attempts.length || r.posttest) writeRow(d.sh, r); else d.sh.deleteRow(r.row);
  const sh = sheet(PRE_LOG, PRE_HEAD);
  const v = sh.getDataRange().getValues();
  for (let i = v.length - 1; i >= 1; i--) if (String(v[i][16]) === id) sh.deleteRow(i + 1);
  return { ok: true };
}

function answersForView() {
  const o = {};
  const A = getAnswers();
  Object.keys(A).forEach(k => {
    const a = A[k];
    o[k] = { best: a.best.map(x => ARROW_NAMES[x]), near: a.near.map(x => ARROW_NAMES[x]), note: a.note };
  });
  o.pretest = getPretest().map(q => ({ level: q.level, ans: q.ans, explain: q.explain }));
  o.posttest = getPosttest().map(q => ({ level: q.level, ans: q.ans, explain: q.explain }));
  return o;
}

function buildReport(st, att, teacher, pre, post) {
  const pub = published() || !!teacher;
  const ana = JSON.parse(JSON.stringify(att.ana));
  if (!pub) ana.rounds = ana.rounds.map(r => ({ id: r.id, shots: r.shots }));
  return { student: { cls: st.cls, seat: st.seat, name: att.name || st.name }, ts: att.ts, rec: att.rec, ana: ana, published: pub, answers: pub ? answersForView() : null, pretest: preSummary(pre, pub), posttest: postSummary(post, pub) };
}

function report(req) {
  const st = cleanStudent(req.student);
  const r = findRow(readData().rows, st.cls, st.seat);
  if (!r || !r.attempts.length || r.name !== st.name) return { ok: false, error: 'not-found' };
  return { ok: true, report: buildReport(st, r.attempts[r.attempts.length - 1], false, r.pretest, r.posttest) };
}

/* ---------- 成績與大屏 ---------- */
function list(req) {
  const teacher = !!req.password && (checkPw(req.password), true);
  const rows = readData().rows.filter(r => r.attempts.length || r.pretest || r.posttest);
  const board = rows.map(r => {
    const last = r.attempts[r.attempts.length - 1];
    const b = last ? { cls: r.cls, seat: r.seat, name: r.name, partsDone: last.ana.partsDone, words: last.ana.words, bulls: last.ana.bulls, stamp: last.rec.p3.stamp }
      : { cls: r.cls, seat: r.seat, name: r.name, partsDone: 0, words: 0, bulls: 0, stamp: '' };
    b.preDone = !!r.pretest;
    b.postDone = !!r.posttest;
    if (teacher) {
      b.pretest = r.pretest;
      b.posttest = r.posttest;
      b.lastTs = last ? last.ts : (r.pretest ? r.pretest.ts : '');
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
  const all = readData().rows;
  const rows = all.filter(r => r.attempts.length);
  const classes = {};
  rows.forEach(r => { classes[r.cls] = (classes[r.cls] || 0) + 1; });
  const cls = String(req.cls || '');
  const mine = rows.filter(r => r.cls === cls).map(r => r.attempts[r.attempts.length - 1]);
  const angles = { A: 0, B: 0, C: 0, D: 0 }, focus = { me: 0, hunter: 0, gap: 0 }, sc = {};
  const claims = CLAIM_TAGS.map(t => ({ tag: t, n: 0, bulls: 0 }));
  const stamps = { guard: 0, learn: 0 };
  mine.forEach(a => {
    const P = a.rec.p1 || {};
    if (angles[P.angle] != null) angles[P.angle]++;
    if (focus[P.focus] != null) focus[P.focus]++;
    (P.secs || []).forEach(s => s.items.forEach(it => { sc[it.text] = (sc[it.text] || 0) + 1; }));
    a.ana.rounds.forEach(r => { claims[r.id].n++; if (r.final === 3) claims[r.id].bulls++; });
    if (stamps[a.rec.p3.stamp] != null) stamps[a.rec.p3.stamp]++;
  });
  const top = rows.filter(r => r.cls === cls).map(r => { const a = r.attempts[r.attempts.length - 1]; return { seat: r.seat, name: r.name, words: a.ana.words }; })
    .sort((x, y) => y.words - x.words).slice(0, 5);
  const pres = all.filter(r => r.cls === cls && r.pretest).map(r => r.pretest);
  const preQ = getPretest().map((q, i) => ({ level: q.level, n: pres.length, right: pres.filter(p => p.correct[i]).length }));
  const keypts = [0, 0, 0, 0];
  pres.forEach(p => { if (p.open) keypts[p.open.choice]++; });
  const posts = all.filter(r => r.cls === cls && r.posttest).map(r => r.posttest);
  const postQ = getPosttest().map((q, i) => ({ level: q.level, n: posts.length, right: posts.filter(p => p.correct[i]).length }));
  return { ok: true, postCount: posts.length, postQ: postQ, preCount: pres.length, preQ: preQ, keypts: keypts, classes: classes, cls: cls, count: mine.length, finished: mine.filter(a => a.ana.partsDone === 3).length, angles: angles, focus: focus, topSents: Object.keys(sc).map(k => ({ t: k, n: sc[k] })).sort((x, y) => y.n - x.n).slice(0, 5), claims: claims, stamps: stamps, top: top };
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
  if (r.attempts.length || r.pretest || r.posttest) writeRow(d.sh, r); else d.sh.deleteRow(r.row);
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
  [sheet(PRE_LOG, PRE_HEAD), sheet(POST_LOG, POST_HEAD)].forEach(ps => {
    const v = ps.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) if (String(v[i][1]) === cls) ps.deleteRow(i + 1);
  });
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
