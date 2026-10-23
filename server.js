// Jira Time Tracker - servidor local (Node 18+, sem dependências)
const http = require('http');
const fs = require('fs');
const path = require('path');

const { exec } = require('child_process');
const os = require('os');

let sea = null;
try { sea = require('node:sea'); if (!sea.isSea()) sea = null; } catch { sea = null; }

const PORT = process.env.PORT || 5178;
function getConfigDir() {
  if (!sea) return __dirname;
  if (process.platform === 'win32') return path.join(process.env.APPDATA || os.homedir(), 'JiraTimeTracker');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'JiraTimeTracker');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'jira-time-tracker');
}
const CONFIG_DIR = getConfigDir();
fs.mkdirSync(CONFIG_DIR, { recursive: true });
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function readStatic(name) {
  if (sea) { try { return Buffer.from(sea.getAsset(name)); } catch { return null; } }
  const file = path.normalize(path.join(PUBLIC_DIR, name));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file)) return null;
  return fs.readFileSync(file);
}

// Abre como janela de aplicativo (Edge/Chrome em modo --app); se não houver, usa o navegador padrão
function openAppWindow() {
  const url = `http://localhost:${PORT}`;
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    const browser = candidates.find((p) => fs.existsSync(p));
    if (browser) return exec(`"${browser}" --app=${url} --window-size=1280,860`);
    return exec(`open "${url}"`);
  }
  if (process.platform === 'linux') {
    const browsers = ['google-chrome', 'google-chrome-stable', 'chromium-browser', 'chromium', 'microsoft-edge'];
    const checkAndRun = browsers.map((b) => `command -v ${b} >/dev/null 2>&1 && exec ${b} --app=${url} --window-size=1280,860`).join(' || ');
    return exec(`${checkAndRun} || xdg-open "${url}"`);
  }
  // Windows
  const pf = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf64 = process.env.ProgramFiles || 'C:\\Program Files';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(pf64, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(pf64, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
  ];
  const browser = candidates.find((p) => fs.existsSync(p));
  if (browser) exec(`"${browser}" --app=${url} --window-size=1280,860`);
  else exec(`start "" ${url}`);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
function publicConfig(cfg) {
  return {
    configured: !!(cfg.url && cfg.email && cfg.token),
    url: cfg.url || '', email: cfg.email || '',
    tokenHint: cfg.token ? '••••' + cfg.token.slice(-4) : '',
  };
}
function normUrl(u) { return (u || '').trim().replace(/\/+$/, ''); }

async function jira(cfg, method, apiPath, body) {
  if (!cfg.url || !cfg.email || !cfg.token) return { status: 412, data: { error: 'NOT_CONFIGURED' } };
  const auth = Buffer.from(`${cfg.email}:${cfg.token}`).toString('base64');
  let res;
  try {
    res = await fetch(cfg.url + apiPath, {
      method,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    return { status: 502, data: { error: 'NETWORK', message: e.message } };
  }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (res.status === 401 || res.status === 403) data = { error: 'AUTH', status: res.status, detail: data };
  return { status: res.status, data };
}

function readBody(req) {
  return new Promise((resolve) => {
    let d = ''; req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
  });
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Busca todos os worklogs do usuário atual no período
async function getWorklogs(cfg, from, to) {
  const me = await jira(cfg, 'GET', '/rest/api/3/myself');
  if (me.status !== 200) return me;
  const accountId = me.data.accountId;
  const jql = `worklogAuthor = currentUser() AND worklogDate >= "${from}" AND worklogDate <= "${to}"`;
  const issues = [];
  let nextPageToken;
  do {
    const r = await jira(cfg, 'POST', '/rest/api/3/search/jql', {
      jql, fields: ['summary', 'project', 'issuetype'], maxResults: 100, nextPageToken,
    });
    if (r.status !== 200) return r;
    issues.push(...(r.data.issues || []));
    nextPageToken = r.data.nextPageToken;
  } while (nextPageToken);

  const fromMs = new Date(from + 'T00:00:00').getTime();
  const toMs = new Date(to + 'T23:59:59').getTime();
  const entries = [];
  await Promise.all(issues.map(async (iss) => {
    let startAt = 0, total = 1;
    while (startAt < total) {
      const r = await jira(cfg, 'GET', `/rest/api/3/issue/${iss.key}/worklog?startAt=${startAt}&maxResults=1000&startedAfter=${fromMs - 86400000}`);
      if (r.status !== 200) break;
      total = r.data.total || 0;
      for (const w of r.data.worklogs || []) {
        const st = new Date(w.started).getTime();
        if (w.author?.accountId === accountId && st >= fromMs && st <= toMs) {
          entries.push({
            id: w.id, issueKey: iss.key, summary: iss.fields.summary,
            project: iss.fields.project?.name, started: w.started,
            seconds: w.timeSpentSeconds, comment: adfToText(w.comment),
          });
        }
      }
      startAt += (r.data.worklogs || []).length || total;
    }
  }));
  entries.sort((a, b) => new Date(b.started) - new Date(a.started));
  return { status: 200, data: { entries } };
}

function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.text) return node.text;
  return (node.content || []).map(adfToText).join(node.type === 'doc' ? '\n' : '');
}
function textToAdf(text) {
  if (!text) return undefined;
  return { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}
// Jira exige formato 2026-10-23T10:00:00.000-0300
function jiraDate(iso) {
  const d = new Date(iso);
  const pad = (n, l = 2) => String(Math.abs(n)).padStart(l, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.000${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}${pad(Math.abs(off) % 60)}`;
}

async function api(req, res, url) {
  const cfg = loadConfig();
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/config' && m === 'GET') return send(res, 200, publicConfig(cfg));
  if (p === '/api/config' && (m === 'POST' || m === 'PUT')) {
    const b = await readBody(req);
    const next = { url: normUrl(b.url ?? cfg.url), email: (b.email ?? cfg.email ?? '').trim(), token: (b.token || cfg.token || '').trim() };
    if (b.testOnly) {
      const r = await jira(next, 'GET', '/rest/api/3/myself');
      return send(res, r.status, r.data);
    }
    const r = await jira(next, 'GET', '/rest/api/3/myself');
    if (r.status !== 200) return send(res, r.status, r.data);
    saveConfig(next);
    return send(res, 200, { ...publicConfig(next), user: r.data });
  }
  if (p === '/api/myself') { const r = await jira(cfg, 'GET', '/rest/api/3/myself'); return send(res, r.status, r.data); }

  if (p === '/api/search') {
    const q = (url.searchParams.get('q') || '').trim().replace(/"/g, '\\"');
    let jql;
    if (!q) jql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
    else if (/^[A-Za-z][A-Za-z0-9]+-\d+$/.test(q)) jql = `key = "${q.toUpperCase()}" OR text ~ "${q}*" ORDER BY updated DESC`;
    else jql = `text ~ "${q}*" ORDER BY updated DESC`;
    let r = await jira(cfg, 'POST', '/rest/api/3/search/jql', { jql, fields: ['summary', 'project', 'status', 'issuetype'], maxResults: 30 });
    if (r.status === 400 && q) r = await jira(cfg, 'POST', '/rest/api/3/search/jql', { jql: `text ~ "${q}*"`, fields: ['summary', 'project', 'status', 'issuetype'], maxResults: 30 });
    if (r.status !== 200) return send(res, r.status, r.data);
    return send(res, 200, {
      issues: (r.data.issues || []).map((i) => ({
        key: i.key, summary: i.fields.summary, project: i.fields.project?.name,
        status: i.fields.status?.name, typeIcon: i.fields.issuetype?.iconUrl,
      })),
    });
  }

  if (p === '/api/worklogs' && m === 'GET') {
    const r = await getWorklogs(cfg, url.searchParams.get('from'), url.searchParams.get('to'));
    return send(res, r.status, r.data);
  }

  let mm;
  if ((mm = p.match(/^\/api\/issue\/([^/]+)\/worklog$/)) && m === 'POST') {
    const b = await readBody(req);
    const r = await jira(cfg, 'POST', `/rest/api/3/issue/${encodeURIComponent(mm[1])}/worklog?adjustEstimate=auto`, {
      started: jiraDate(b.started), timeSpentSeconds: Math.max(60, Math.round(b.seconds)), comment: textToAdf(b.comment),
    });
    return send(res, r.status, r.data);
  }
  if ((mm = p.match(/^\/api\/issue\/([^/]+)\/worklog\/(\d+)$/))) {
    const [, key, id] = mm;
    if (m === 'PUT') {
      const b = await readBody(req);
      const r = await jira(cfg, 'PUT', `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${id}?adjustEstimate=auto`, {
        started: jiraDate(b.started), timeSpentSeconds: Math.max(60, Math.round(b.seconds)), comment: textToAdf(b.comment),
      });
      return send(res, r.status, r.data);
    }
    if (m === 'DELETE') {
      const r = await jira(cfg, 'DELETE', `/rest/api/3/issue/${encodeURIComponent(key)}/worklog/${id}?adjustEstimate=auto`);
      return send(res, r.status === 204 ? 200 : r.status, r.status === 204 ? { ok: true } : r.data);
    }
  }
  send(res, 404, { error: 'NOT_FOUND' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    try { return await api(req, res, url); } catch (e) { return send(res, 500, { error: 'SERVER', message: e.message }); }
  }
  let name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  let buf = readStatic(name);
  if (!buf) { name = 'index.html'; buf = readStatic(name); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] || 'application/octet-stream' });
  res.end(buf);
});

server.on('error', (e) => {
  // Já existe uma instância rodando: apenas abre a janela
  if (e.code === 'EADDRINUSE') { openAppWindow(); setTimeout(() => process.exit(0), 1500); }
  else { console.error(e); process.exit(1); }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ⏱  Jira Time Tracker rodando em http://localhost:${PORT}`);
  console.log(`  Configuração: ${CONFIG_FILE}`);
  console.log('  Mantenha esta janela aberta (pode minimizar). Feche para encerrar.\n');
  if (sea || process.argv.includes('--open')) openAppWindow();
});
