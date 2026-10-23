// ===== Jira Time Tracker – frontend =====
const $ = (s) => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

const state = {
  config: null, user: null,
  weekStart: startOfWeek(new Date()),
  entries: [], loading: false,
  timer: LS.get('jtt.timer', null), // {issue, desc, startedAt}
  timerIssue: LS.get('jtt.timerIssue', null),
  pending: LS.get('jtt.pending', []),
  view: LS.get('jtt.view', 'week'),
  recentIssues: LS.get('jtt.recent', []),
};

// ---------- utilidades de data ----------
function startOfWeek(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function sameDay(a, b) { return ymd(a) === ymd(b); }
function hm(d) { return d.toTimeString().slice(0, 5); }
function fmtDur(sec, withSec = false) {
  sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return withSec ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${h}:${String(m).padStart(2, '0')}`;
}
function parseDur(str) {
  if (!str) return 0; str = str.trim().toLowerCase();
  if (/^\d+:\d{1,2}$/.test(str)) { const [h, m] = str.split(':').map(Number); return h * 3600 + m * 60; }
  let t = 0; const h = str.match(/([\d.,]+)\s*h/), m = str.match(/([\d.,]+)\s*m/);
  if (h) t += parseFloat(h[1].replace(',', '.')) * 3600;
  if (m) t += parseFloat(m[1].replace(',', '.')) * 60;
  if (!h && !m && /^[\d.,]+$/.test(str)) t = parseFloat(str.replace(',', '.')) * 60;
  return Math.round(t);
}
const fmtDay = (d) => d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- API ----------
class AuthError extends Error {}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (data.error === 'AUTH' || data.error === 'NOT_CONFIGURED') {
    throw new AuthError(data.error === 'AUTH' ? 'Token inválido ou expirado.' : 'Jira não configurado.');
  }
  if (!res.ok) throw new Error(data.errorMessages?.[0] || Object.values(data.errors || {})[0] || data.message || `Erro ${res.status}`);
  return data;
}
function handleErr(e) {
  if (e instanceof AuthError) { toast(e.message + ' Atualize suas credenciais.', 'warn'); openSettings(e.message); }
  else toast(e.message, 'err');
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ---------- worklogs ----------
async function saveWorklog({ issueKey, started, seconds, comment }) {
  return api(`/api/issue/${issueKey}/worklog`, { method: 'POST', body: { started, seconds, comment } });
}
async function submitOrQueue(entry) {
  try {
    await saveWorklog(entry); toast(`✓ ${fmtDur(entry.seconds)} registrado em ${entry.issueKey}`);
    return true;
  } catch (e) {
    if (e instanceof AuthError || e.message.includes('Failed to fetch')) {
      state.pending.push({ ...entry, pid: Date.now() + Math.random() }); LS.set('jtt.pending', state.pending); renderPending();
    }
    handleErr(e); return false;
  }
}
async function flushPending() {
  if (!state.pending.length) return;
  const rest = []; let ok = 0;
  for (const p of state.pending) {
    try { await saveWorklog(p); ok++; } catch (e) { rest.push(p); if (e instanceof AuthError) { rest.push(...state.pending.slice(state.pending.indexOf(p) + 1)); break; } }
  }
  state.pending = rest; LS.set('jtt.pending', rest); renderPending();
  if (ok) toast(`✓ ${ok} entrada(s) pendente(s) enviadas ao Jira`);
}
function renderPending() {
  const b = $('#pending-badge');
  b.classList.toggle('hidden', !state.pending.length);
  b.textContent = `⏳ ${state.pending.length} pendente(s)`;
}

async function loadWeek() {
  if (!state.config?.configured) return;
  state.loading = true; render();
  try {
    const from = ymd(state.weekStart), to = ymd(addDays(state.weekStart, 6));
    const d = await api(`/api/worklogs?from=${from}&to=${to}`);
    state.entries = d.entries;
  } catch (e) { state.entries = []; handleErr(e); }
  state.loading = false; render();
}
function allEntries() {
  const ws = state.weekStart.getTime(), we = addDays(state.weekStart, 7).getTime();
  const pend = state.pending.filter((p) => { const t = new Date(p.started).getTime(); return t >= ws && t < we; })
    .map((p) => ({ ...p, pending: true, summary: p.summary || '' }));
  return [...state.entries, ...pend];
}

// ---------- render ----------
function render() {
  $('#view-week').classList.toggle('hidden', state.view !== 'week');
  $('#view-calendar').classList.toggle('hidden', state.view !== 'calendar');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === state.view));
  const ws = state.weekStart, we = addDays(ws, 6);
  const label = `${ws.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – ${we.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  $('#week-label').textContent = label; $('#cal-label').textContent = label;
  const entries = allEntries();
  const total = entries.reduce((a, e) => a + e.seconds, 0);
  $('#week-total').textContent = fmtDur(total); $('#cal-total').textContent = fmtDur(total);
  if (state.view === 'week') renderWeek(entries); else renderCalendar(entries);
}

function renderWeek(entries) {
  const days = [...Array(7)].map((_, i) => addDays(state.weekStart, i));
  const perDay = days.map((d) => entries.filter((e) => sameDay(new Date(e.started), d)));
  const totals = perDay.map((l) => l.reduce((a, e) => a + e.seconds, 0));
  const max = Math.max(8 * 3600, ...totals);
  $('#week-bars').innerHTML = days.map((d, i) => `
    <div class="bar-col ${sameDay(d, new Date()) ? 'today' : ''}">
      <span class="bar-val">${fmtDur(totals[i])}</span>
      <div class="bar" style="height:${(totals[i] / max) * 100}%"></div>
      <span class="bar-day">${d.toLocaleDateString('pt-BR', { weekday: 'short' })} ${d.getDate()}</span>
    </div>`).join('');

  const list = $('#week-list');
  if (state.loading) { list.innerHTML = '<div class="skeleton"></div>'.repeat(4); return; }
  if (!state.config?.configured) { list.innerHTML = `<div class="empty glass"><div class="big">🔌</div>Configure sua conexão com o Jira em ⚙ Configurações.</div>`; return; }
  if (!entries.length) { list.innerHTML = `<div class="empty glass"><div class="big">🌙</div>Nenhum registro nesta semana.<br>Inicie o timer ou adicione manualmente.</div>`; return; }

  list.innerHTML = days.map((d, i) => ({ d, l: perDay[i], t: totals[i] })).reverse().filter((x) => x.l.length).map(({ d, l, t }) => `
    <div class="day-group glass">
      <div class="day-head"><span>${sameDay(d, new Date()) ? 'Hoje · ' : ''}${fmtDay(d)}</span><span>Total <strong>${fmtDur(t)}</strong></span></div>
      ${l.sort((a, b) => new Date(b.started) - new Date(a.started)).map(entryRow).join('')}
    </div>`).join('');
}
function entryRow(e) {
  const s = new Date(e.started), en = new Date(s.getTime() + e.seconds * 1000);
  const id = e.pending ? `p:${e.pid}` : `${e.issueKey}:${e.id}`;
  return `<div class="entry ${e.pending ? 'pending-entry' : ''}" data-id="${id}">
    <a class="tag" href="${state.config.url}/browse/${e.issueKey}" target="_blank" rel="noopener">${esc(e.issueKey)}</a>
    <div class="desc"><div class="t">${esc(e.comment || e.summary || '(sem descrição)')}</div><div class="s">${esc(e.comment ? e.summary : (e.project || ''))}</div></div>
    <span class="range">${hm(s)} – ${hm(en)}</span>
    <span class="dur">${fmtDur(e.seconds)}</span>
    <div class="acts">
      ${e.pending ? '' : `<button data-act="continue" title="Continuar (iniciar timer)">▶</button><button data-act="edit" title="Editar">✎</button>`}
      <button data-act="delete" title="Excluir">🗑</button>
    </div></div>`;
}

// ---------- calendário ----------
let miniMonth = new Date();
function renderCalendar(entries) {
  // mini calendário
  const m0 = new Date(miniMonth.getFullYear(), miniMonth.getMonth(), 1);
  const gs = startOfWeek(m0);
  const dows = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
  let html = `<div class="mini-head"><button id="mini-prev">‹</button><span>${m0.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span><button id="mini-next">›</button></div><div class="mini-grid">`;
  html += dows.map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(gs, i);
    const cls = ['d', d.getMonth() !== m0.getMonth() && 'other', sameDay(d, new Date()) && 'today', d >= state.weekStart && d < addDays(state.weekStart, 7) && 'inweek'].filter(Boolean).join(' ');
    html += `<div class="${cls}" data-date="${ymd(d)}">${d.getDate()}</div>`;
  }
  $('#mini-cal').innerHTML = html + '</div>';
  $('#mini-prev').onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1); render(); };
  $('#mini-next').onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1); render(); };
  $('#mini-cal').querySelectorAll('.d').forEach((el) => el.onclick = () => { state.weekStart = startOfWeek(new Date(el.dataset.date + 'T12:00')); loadWeek(); });

  // grade semanal
  const H = 48; const days = [...Array(7)].map((_, i) => addDays(state.weekStart, i));
  let g = `<div class="cal-colhead"></div>`;
  g += days.map((d) => {
    const t = entries.filter((e) => sameDay(new Date(e.started), d)).reduce((a, e) => a + e.seconds, 0);
    return `<div class="cal-colhead ${sameDay(d, new Date()) ? 'today' : ''}">${d.toLocaleDateString('pt-BR', { weekday: 'short' })}<b>${d.getDate()}</b><small>${fmtDur(t)}</small></div>`;
  }).join('');
  g += `<div class="cal-hours">${[...Array(24)].map((_, h) => `<div class="cal-hour">${h ? String(h).padStart(2, '0') + ':00' : ''}</div>`).join('')}</div>`;
  g += days.map((d) => {
    const evs = entries.filter((e) => sameDay(new Date(e.started), d)).map((e) => {
      const s = new Date(e.started); const top = (s.getHours() + s.getMinutes() / 60) * H; const h = Math.max(20, (e.seconds / 3600) * H);
      const id = e.pending ? `p:${e.pid}` : `${e.issueKey}:${e.id}`;
      return `<div class="cal-ev" data-id="${id}" style="top:${top}px;height:${h}px" title="${esc(e.issueKey + ' – ' + (e.comment || e.summary))}"><b>${esc(e.issueKey)} · ${fmtDur(e.seconds)}</b>${esc(e.comment || e.summary || '')}</div>`;
    }).join('');
    let now = '';
    if (sameDay(d, new Date())) { const n = new Date(); now = `<div class="cal-now" style="top:${(n.getHours() + n.getMinutes() / 60) * H}px"></div>`; }
    return `<div class="cal-day" data-date="${ymd(d)}" style="height:${24 * H}px">${evs}${now}</div>`;
  }).join('');
  const grid = $('#cal-grid'); const sc = grid.scrollTop; grid.innerHTML = g;
  grid.scrollTop = sc || 7 * H;
  grid.querySelectorAll('.cal-day').forEach((col) => col.addEventListener('click', (ev) => {
    if (ev.target.closest('.cal-ev')) return;
    const mins = Math.floor((ev.offsetY / H) * 60 / 15) * 15;
    const start = new Date(col.dataset.date + 'T00:00'); start.setMinutes(mins);
    openEntry(null, start);
  }));
  grid.querySelectorAll('.cal-ev').forEach((el) => el.onclick = () => openEntryById(el.dataset.id));
}

// ---------- seletor de card ----------
let ddCallback = null, ddTimer = null, ddItems = [], ddSel = 0;
function openIssuePicker(anchor, cb) {
  ddCallback = cb; const dd = $('#issue-dropdown');
  const dlg = anchor.closest('dialog');
  if (dlg) dlg.appendChild(dd);
  else document.body.appendChild(dd);
  const r = anchor.getBoundingClientRect();
  dd.classList.remove('hidden');
  dd.style.top = `${Math.min(r.bottom + 6, innerHeight - 420)}px`;
  dd.style.left = `${Math.max(10, Math.min(r.left, innerWidth - 460))}px`;
  const inp = $('#issue-search'); inp.value = ''; inp.focus(); searchIssues('');
}
function closeIssuePicker() {
  const dd = $('#issue-dropdown');
  dd.classList.add('hidden');
  document.body.appendChild(dd);
  ddCallback = null;
}
async function searchIssues(q) {
  const box = $('#issue-results');
  if (!q && state.recentIssues.length) renderIssues(state.recentIssues, 'Recentes', true);
  else box.innerHTML = '<div class="dd-msg">Buscando…</div>';
  try {
    const d = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if ($('#issue-search').value.trim() !== q) return;
    if (!q && state.recentIssues.length) {
      const keys = new Set(state.recentIssues.map((i) => i.key));
      renderIssues([...state.recentIssues, ...d.issues.filter((i) => !keys.has(i.key))], null);
    } else renderIssues(d.issues);
  } catch (e) { box.innerHTML = `<div class="dd-msg">${esc(e.message)}</div>`; if (e instanceof AuthError) handleErr(e); }
}
function renderIssues(items) {
  ddItems = items; ddSel = 0;
  $('#issue-results').innerHTML = items.length ? items.map((i, idx) => `
    <div class="issue-item ${idx === 0 ? 'sel' : ''}" data-idx="${idx}">
      ${i.typeIcon ? `<img src="${i.typeIcon}" alt="">` : ''}<span class="key">${esc(i.key)}</span><span class="sum">${esc(i.summary)}</span>${i.status ? `<span class="st">${esc(i.status)}</span>` : ''}
    </div>`).join('') : '<div class="dd-msg">Nenhum card encontrado</div>';
  $('#issue-results').querySelectorAll('.issue-item').forEach((el) => el.onclick = () => pickIssue(ddItems[+el.dataset.idx]));
}
function pickIssue(i) {
  if (!i) return;
  state.recentIssues = [i, ...state.recentIssues.filter((x) => x.key !== i.key)].slice(0, 6); LS.set('jtt.recent', state.recentIssues);
  const cb = ddCallback; closeIssuePicker(); cb && cb(i);
}
function setIssueBtn(btn, issue) {
  btn.classList.toggle('set', !!issue);
  btn.innerHTML = issue ? `<span class="key">${esc(issue.key)}</span> ${esc(issue.summary)}` : '＋ Selecionar card';
}

// ---------- timer ----------
let tick = null;
function renderTimer() {
  const bar = $('.timer-bar'); const running = !!state.timer;
  bar.classList.toggle('running', running);
  $('#timer-toggle').textContent = running ? '■' : '▶';
  setIssueBtn($('#timer-issue-btn'), state.timerIssue);
  clearInterval(tick);
  const upd = () => {
    const s = running ? (Date.now() - state.timer.startedAt) / 1000 : 0;
    $('#timer-display').textContent = fmtDur(s, true);
    document.title = running ? `${fmtDur(s, true)} · ${state.timerIssue?.key || ''} – Jira Tracker` : 'Jira Time Tracker – Registro de horas';
  };
  upd(); if (running) tick = setInterval(upd, 1000);
}
function startTimer(issue, desc) {
  if (issue) state.timerIssue = issue;
  if (desc !== undefined) $('#timer-desc').value = desc;
  if (!state.timerIssue) { toast('Selecione um card antes de iniciar.', 'warn'); openIssuePicker($('#timer-issue-btn'), (i) => { state.timerIssue = i; LS.set('jtt.timerIssue', i); startTimer(); }); return; }
  state.timer = { startedAt: Date.now() }; LS.set('jtt.timer', state.timer); LS.set('jtt.timerIssue', state.timerIssue);
  renderTimer();
}
async function stopTimer() {
  const t = state.timer; const issue = state.timerIssue;
  const seconds = (Date.now() - t.startedAt) / 1000;
  state.timer = null; LS.set('jtt.timer', null); renderTimer();
  if (seconds < 60) { toast('Menos de 1 minuto – não registrado (mínimo do Jira).', 'warn'); return; }
  const desc = $('#timer-desc').value.trim();
  const ok = await submitOrQueue({ issueKey: issue.key, summary: issue.summary, started: new Date(t.startedAt).toISOString(), seconds, comment: desc });
  if (ok) { $('#timer-desc').value = ''; LS.set('jtt.desc', ''); }
  loadWeek();
}

// ---------- modal entrada ----------
let editing = null, entryIssue = null;
function findEntry(id) {
  if (id.startsWith('p:')) return state.pending.find((p) => String(p.pid) === id.slice(2)) && { ...state.pending.find((p) => String(p.pid) === id.slice(2)), pending: true };
  const [key, wid] = id.split(':'); return state.entries.find((e) => e.issueKey === key && e.id === wid);
}
function openEntryById(id) { const e = findEntry(id); if (e && !e.pending) openEntry(e); }
function openEntry(e, startAt) {
  editing = e; $('#entry-error').textContent = '';
  $('#entry-title').textContent = e ? 'Editar registro' : 'Novo registro';
  $('#entry-delete').classList.toggle('hidden', !e);
  const s = e ? new Date(e.started) : (startAt || new Date(Date.now() - 3600e3));
  const secs = e ? e.seconds : 3600;
  entryIssue = e ? { key: e.issueKey, summary: e.summary } : (state.timerIssue || null);
  setIssueBtn($('#entry-issue-btn'), entryIssue);
  $('#entry-desc').value = e?.comment || '';
  $('#entry-date').value = ymd(s); $('#entry-start').value = hm(s);
  $('#entry-end').value = hm(new Date(s.getTime() + secs * 1000));
  $('#entry-dur').value = fmtDur(secs);
  $('#entry-modal').showModal();
}
function syncDur(from) {
  const st = $('#entry-start').value, en = $('#entry-end').value;
  if (from === 'dur') {
    const sec = parseDur($('#entry-dur').value); if (!sec || !st) return;
    const d = new Date(`${$('#entry-date').value}T${st}`); $('#entry-end').value = hm(new Date(d.getTime() + sec * 1000));
  } else if (st && en) {
    let diff = (new Date(`2000-01-01T${en}`) - new Date(`2000-01-01T${st}`)) / 1000; if (diff < 0) diff += 86400;
    $('#entry-dur').value = fmtDur(diff);
  }
}
async function saveEntry(ev) {
  ev.preventDefault();
  if (!entryIssue) { $('#entry-error').textContent = 'Selecione um card.'; return; }
  const seconds = parseDur($('#entry-dur').value);
  if (seconds < 60) { $('#entry-error').textContent = 'Duração mínima de 1 minuto.'; return; }
  const started = new Date(`${$('#entry-date').value}T${$('#entry-start').value}`).toISOString();
  const body = { started, seconds, comment: $('#entry-desc').value.trim() };
  const btn = $('#entry-save'); btn.disabled = true;
  try {
    if (editing && editing.issueKey === entryIssue.key) {
      await api(`/api/issue/${editing.issueKey}/worklog/${editing.id}`, { method: 'PUT', body }); toast('✓ Registro atualizado');
    } else {
      if (editing) await api(`/api/issue/${editing.issueKey}/worklog/${editing.id}`, { method: 'DELETE' });
      const ok = await submitOrQueue({ issueKey: entryIssue.key, summary: entryIssue.summary, ...body });
      if (!ok) { btn.disabled = false; return; }
    }
    $('#entry-modal').close(); loadWeek();
  } catch (e) { $('#entry-error').textContent = e.message; handleErr(e); }
  btn.disabled = false;
}
async function deleteEntry(e) {
  if (!confirm(`Excluir ${fmtDur(e.seconds)} de ${e.issueKey}?`)) return false;
  if (e.pending) { state.pending = state.pending.filter((p) => p.pid !== e.pid); LS.set('jtt.pending', state.pending); renderPending(); render(); return true; }
  try { await api(`/api/issue/${e.issueKey}/worklog/${e.id}`, { method: 'DELETE' }); toast('Registro excluído'); loadWeek(); return true; }
  catch (err) { handleErr(err); return false; }
}

// ---------- configurações ----------
function openSettings(alertMsg) {
  const c = state.config || {};
  $('#cfg-url').value = c.url || ''; $('#cfg-email').value = c.email || ''; $('#cfg-token').value = '';
  $('#cfg-token').required = !c.configured;
  $('#cfg-hint').textContent = c.tokenHint ? `Token atual: ${c.tokenHint} — deixe em branco para manter.` : '';
  $('#cfg-result').textContent = ''; $('#cfg-result').className = 'cfg-result';
  const a = $('#settings-alert'); a.classList.toggle('hidden', !alertMsg);
  a.textContent = alertMsg ? `⚠ ${alertMsg} Gere um novo token e cole abaixo.` : '';
  if (!$('#settings-modal').open) $('#settings-modal').showModal();
}
function cfgBody() { return { url: $('#cfg-url').value, email: $('#cfg-email').value, token: $('#cfg-token').value }; }
async function testConfig() {
  const r = $('#cfg-result'); r.className = 'cfg-result'; r.textContent = 'Testando…';
  try {
    const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cfgBody(), testOnly: true }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error === 'AUTH' ? 'Credenciais inválidas ou token expirado.' : d.error === 'NETWORK' ? 'Não foi possível acessar a URL.' : d.error === 'NOT_CONFIGURED' ? 'Preencha todos os campos.' : `Erro ${res.status}`);
    r.className = 'cfg-result ok'; r.textContent = `✓ Conectado como ${d.displayName}`; return true;
  } catch (e) { r.className = 'cfg-result err'; r.textContent = '✗ ' + e.message; return false; }
}
async function saveConfig(ev) {
  ev.preventDefault();
  const btn = $('#cfg-save'); btn.disabled = true; const r = $('#cfg-result');
  try {
    const res = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfgBody()) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error === 'AUTH' ? 'Credenciais inválidas ou token expirado.' : d.error === 'NETWORK' ? 'Não foi possível acessar a URL.' : 'Preencha todos os campos.');
    state.config = d; setUser(d.user);
    $('#settings-modal').close(); toast('✓ Configurações salvas');
    await flushPending(); loadWeek();
  } catch (e) { r.className = 'cfg-result err'; r.textContent = '✗ ' + e.message; }
  btn.disabled = false;
}
function setUser(u) {
  state.user = u;
  $('#user-chip').innerHTML = u ? `<img src="${u.avatarUrls?.['48x48'] || ''}" alt=""> ${esc(u.displayName)}` : '';
}

// ---------- eventos ----------
function bind() {
  document.querySelectorAll('.tab').forEach((t) => t.onclick = () => { state.view = t.dataset.view; LS.set('jtt.view', state.view); render(); });
  const shift = (n) => { state.weekStart = addDays(state.weekStart, n * 7); miniMonth = new Date(state.weekStart); loadWeek(); };
  const today = () => { state.weekStart = startOfWeek(new Date()); miniMonth = new Date(); loadWeek(); };
  $('#week-prev').onclick = $('#cal-prev').onclick = () => shift(-1);
  $('#week-next').onclick = $('#cal-next').onclick = () => shift(1);
  $('#week-today').onclick = $('#cal-today').onclick = today;
  $('#btn-refresh').onclick = loadWeek;
  $('#btn-settings').onclick = () => openSettings();
  $('#pending-badge').onclick = flushPending;

  $('#timer-toggle').onclick = () => (state.timer ? stopTimer() : startTimer());
  $('#timer-issue-btn').onclick = (e) => openIssuePicker(e.currentTarget, (i) => { state.timerIssue = i; LS.set('jtt.timerIssue', i); renderTimer(); });
  $('#timer-desc').value = LS.get('jtt.desc', '');
  $('#timer-desc').oninput = (e) => LS.set('jtt.desc', e.target.value);
  $('#timer-desc').onkeydown = (e) => { if (e.key === 'Enter' && !state.timer) startTimer(); };
  $('#btn-manual').onclick = () => openEntry(null);

  $('#issue-search').oninput = (e) => { clearTimeout(ddTimer); const q = e.target.value.trim(); ddTimer = setTimeout(() => searchIssues(q), 300); };
  $('#issue-search').onkeydown = (e) => {
    const els = $('#issue-results').querySelectorAll('.issue-item');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ddSel = Math.max(0, Math.min(els.length - 1, ddSel + (e.key === 'ArrowDown' ? 1 : -1))); els.forEach((el, i) => el.classList.toggle('sel', i === ddSel)); els[ddSel]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter') { e.preventDefault(); pickIssue(ddItems[ddSel]); }
    if (e.key === 'Escape') closeIssuePicker();
  };
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#issue-dropdown') && !e.target.closest('.issue-btn')) closeIssuePicker(); });

  $('#week-list').onclick = async (ev) => {
    const btn = ev.target.closest('button[data-act]'); if (!btn) return;
    const e = findEntry(btn.closest('.entry').dataset.id); if (!e) return;
    if (btn.dataset.act === 'edit') openEntry(e);
    if (btn.dataset.act === 'delete') deleteEntry(e);
    if (btn.dataset.act === 'continue') { if (state.timer) await stopTimer(); startTimer({ key: e.issueKey, summary: e.summary }, e.comment || ''); }
  };

  $('#entry-form').onsubmit = saveEntry;
  $('#entry-cancel').onclick = () => $('#entry-modal').close();
  $('#entry-modal').addEventListener('close', closeIssuePicker);
  $('#entry-delete').onclick = async () => { if (editing && await deleteEntry(editing)) $('#entry-modal').close(); };
  $('#entry-issue-btn').onclick = (e) => openIssuePicker(e.currentTarget, (i) => { entryIssue = i; setIssueBtn($('#entry-issue-btn'), i); });
  $('#entry-start').onchange = () => syncDur('range'); $('#entry-end').onchange = () => syncDur('range');
  $('#entry-dur').onchange = () => syncDur('dur'); $('#entry-date').onchange = () => syncDur('dur');

  $('#settings-form').onsubmit = saveConfig;
  $('#cfg-test').onclick = testConfig;
  $('#cfg-cancel').onclick = () => $('#settings-modal').close();
  $('#cfg-toggle').onclick = () => { const i = $('#cfg-token'); i.type = i.type === 'password' ? 'text' : 'password'; };

  window.addEventListener('storage', (e) => { if (e.key?.startsWith('jtt.')) { state.timer = LS.get('jtt.timer', null); state.timerIssue = LS.get('jtt.timerIssue', null); renderTimer(); } });
  setInterval(() => { if (state.view === 'calendar') render(); }, 60000);
}

// ---------- init ----------
(async function init() {
  bind(); renderTimer(); renderPending(); render();
  try { state.config = await (await fetch('/api/config')).json(); } catch { toast('Servidor local indisponível', 'err'); return; }
  if (!state.config.configured) { render(); openSettings(); return; }
  try { setUser(await api('/api/myself')); await flushPending(); } catch (e) { handleErr(e); }
  loadWeek();
})();
