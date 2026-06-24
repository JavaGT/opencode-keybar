// keys-lib.mjs — pure data layer for opencode key management.
// Extracted from switch-opencode-keys so the daemon can reuse the same logic
// without depending on the interactive CLI. Single source of truth for the
// daemon; the CLI keeps its own copy. Keep these in sync if you change one.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync } from "fs";
import { execSync } from "child_process";

const HOME = process.env.HOME;
const CONFIG_PATH = `${HOME}/.config/opencode/opencode.json`;
const KEYS_DIR = `${HOME}/.config/opencode/keys`;
const SECRETS_DIR = `${HOME}/.secrets/llm-api-keys`;
const PROFILES_PATH = `${KEYS_DIR}/profiles.json`;
const AUTH_PATH = `${HOME}/.local/share/opencode/auth.json`;

const ENV_PROVIDERS = {
  openrouter: { env: "OPENROUTER_API_KEY", label: "OpenRouter" },
  anthropic: { env: "ANTHROPIC_API_KEY", label: "Anthropic" },
  openai: { env: "OPENAI_API_KEY", label: "OpenAI" },
  google: { env: "GOOGLE_GENERATIVEAI_API_KEY", label: "Google AI" },
  deepseek: { env: "DEEPSEEK_API_KEY", label: "DeepSeek" },
  xai: { env: "XAI_API_KEY", label: "xAI" },
  groq: { env: "GROQ_API_KEY", label: "Groq" },
  mistral: { env: "MISTRAL_API_KEY", label: "Mistral" },
  together: { env: "TOGETHER_API_KEY", label: "Together AI" },
  fireworks: { env: "FIREWORKS_API_KEY", label: "Fireworks AI" },
  novita: { env: "NOVITA_API_KEY", label: "Novita AI" },
  cohere: { env: "COHERE_API_KEY", label: "Cohere" },
};

const AUTH_PROVIDERS = {
  opencode: { label: "OpenCode Zen", authKey: "opencode" },
  "opencode-go": { label: "OpenCode Go", authKey: "opencode-go" },
};
const LINKED_PROFILE_PROVIDER = "opencode";
const LINKED_AUTH_PROVIDERS = ["opencode", "opencode-go"];

function ensureDataDir() {
  if (!existsSync(KEYS_DIR)) mkdirSync(KEYS_DIR, { recursive: true });
  if (!existsSync(SECRETS_DIR)) mkdirSync(SECRETS_DIR, { recursive: true });
}

function secretFilePath(provider) {
  return `${SECRETS_DIR}/${provider}.key`;
}

function readSecretFile(path) {
  try { return readFileSync(path, "utf-8").trim(); } catch { return null; }
}

function writeSecretFile(path, key) {
  writeFileSync(path, key + "\n");
}

function deleteSecretFile(path) {
  try { rmSync(path); } catch {}
}

function resolveFileRef(value) {
  if (typeof value === "string" && value.startsWith("{file:")) {
    const m = value.match(/^\{file:(.+)\}$/);
    if (m) return readSecretFile(m[1].replace(/^~/, HOME));
  }
  return value || null;
}

function loadProfiles() {
  ensureDataDir();
  if (!existsSync(PROFILES_PATH)) return {};
  return JSON.parse(readFileSync(PROFILES_PATH, "utf-8"));
}

function saveProfiles(p) {
  ensureDataDir();
  writeFileSync(PROFILES_PATH, JSON.stringify(p, null, 2) + "\n");
}

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(c) {
  const tmp = CONFIG_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2) + "\n");
  renameSync(tmp, CONFIG_PATH);
}

function normalizeProvider(provider) {
  if (provider === "opencode-zen") return "opencode";
  return provider;
}

function profileProvider(provider) {
  const p = normalizeProvider(provider);
  return LINKED_AUTH_PROVIDERS.includes(p) ? LINKED_PROFILE_PROVIDER : p;
}

function linkedAuthProviders(provider) {
  const p = normalizeProvider(provider);
  return LINKED_AUTH_PROVIDERS.includes(p) ? LINKED_AUTH_PROVIDERS : [p];
}

function isAuthProvider(provider) {
  return !!AUTH_PROVIDERS[normalizeProvider(provider)];
}

function loadAuth() {
  if (!existsSync(AUTH_PATH)) return {};
  try { return JSON.parse(readFileSync(AUTH_PATH, "utf-8")); } catch { return {}; }
}

function saveAuth(auth) {
  const dir = AUTH_PATH.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = AUTH_PATH + ".tmp";
  writeFileSync(tmp, JSON.stringify(auth, null, 2) + "\n");
  renameSync(tmp, AUTH_PATH);
}

function getAuthKey(provider) {
  const info = AUTH_PROVIDERS[normalizeProvider(provider)];
  if (!info) return null;
  return loadAuth()[info.authKey]?.key || null;
}

function setAuthKey(provider, key) {
  const auth = loadAuth();
  for (const p of linkedAuthProviders(provider)) {
    const info = AUTH_PROVIDERS[p];
    if (!info) continue;
    auth[info.authKey] = { type: "api", key };
  }
  saveAuth(auth);
}

function removeAuthKey(provider) {
  const auth = loadAuth();
  for (const p of linkedAuthProviders(provider)) {
    const info = AUTH_PROVIDERS[p];
    if (!info) continue;
    delete auth[info.authKey];
  }
  saveAuth(auth);
}

function activeKeyLabel(provider) {
  const linked = linkedAuthProviders(provider);
  return linked.length > 1 ? linked.join(" + ") : normalizeProvider(provider);
}

function profileSecretFile(provider, name) {
  const safe = `${profileProvider(provider)}-${name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${SECRETS_DIR}/${safe}.key`;
}

function resolveProfileKey(provider, name, entry) {
  if (entry.key) return entry.key;
  if (entry.file) return readSecretFile(`${SECRETS_DIR}/${entry.file}`);
  return null;
}

function saveProfileKey(provider, name, key) {
  const safe = `${profileProvider(provider)}-${name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = `${safe}.key`;
  writeSecretFile(`${SECRETS_DIR}/${file}`, key);
  return file;
}

function deleteProfileKey(provider, name) {
  const safe = `${profileProvider(provider)}-${name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
  deleteSecretFile(`${SECRETS_DIR}/${safe}.key`);
}

function getConfigKey(provider) {
  provider = normalizeProvider(provider);
  if (isAuthProvider(provider)) return getAuthKey(provider);
  const config = loadConfig();
  const cfgKey = config?.provider?.[provider]?.options?.apiKey;
  const envInfo = ENV_PROVIDERS[provider];
  const envKey = envInfo ? process.env[envInfo.env] : undefined;
  const resolved = resolveFileRef(cfgKey);
  return resolved || envKey || null;
}

function setConfigKey(provider, key) {
  provider = normalizeProvider(provider);
  if (isAuthProvider(provider)) {
    ensureDataDir();
    writeSecretFile(secretFilePath(LINKED_PROFILE_PROVIDER), key);
    setAuthKey(provider, key);
    return;
  }
  const config = loadConfig();
  const envInfo = ENV_PROVIDERS[provider];
  ensureDataDir();
  const fileArg = `{file:~/.secrets/llm-api-keys/${provider}.key}`;
  writeSecretFile(secretFilePath(provider), key);
  if (envInfo) {
    if (!config.provider) config.provider = {};
    if (!config.provider[provider]) config.provider[provider] = { name: envInfo.label, models: {} };
    if (!config.provider[provider].options) config.provider[provider].options = {};
    config.provider[provider].options.apiKey = fileArg;
    saveConfig(config);
  } else if (config?.provider?.[provider]) {
    if (!config.provider[provider].options) config.provider[provider].options = {};
    config.provider[provider].options.apiKey = fileArg;
    saveConfig(config);
  } else {
    throw new Error(`Unknown provider "${provider}". Add it to opencode.json first.`);
  }
}

function removeConfigKey(provider) {
  provider = normalizeProvider(provider);
  if (isAuthProvider(provider)) {
    deleteSecretFile(secretFilePath(LINKED_PROFILE_PROVIDER));
    removeAuthKey(provider);
    return;
  }
  const config = loadConfig();
  deleteSecretFile(secretFilePath(provider));
  if (config?.provider?.[provider]?.options?.apiKey) {
    delete config.provider[provider].options.apiKey;
    saveConfig(config);
  }
}

function getAllProviders() {
  const config = loadConfig();
  const providers = {};
  for (const [name, cfg] of Object.entries(config?.provider || {})) {
    providers[name] = {
      label: cfg.name || name,
      type: cfg.options?.baseURL ? "custom (config)" : (ENV_PROVIDERS[name] ? "env" : "config"),
      hasKey: !!resolveFileRef(cfg.options?.apiKey),
    };
  }
  for (const [name, info] of Object.entries(ENV_PROVIDERS)) {
    if (!providers[name]) {
      providers[name] = {
        label: info.label,
        type: "env",
        hasKey: !!process.env[info.env],
      };
    }
  }
  for (const [name, info] of Object.entries(AUTH_PROVIDERS)) {
    providers[name] = {
      label: info.label,
      type: "auth",
      hasKey: !!getAuthKey(name),
    };
  }
  return providers;
}

// ── Credits / usage (structured, no display) ────────────────────────

function timeUntilReset(resetHour, timezone) {
  const now = new Date();
  const tzNow = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const tzReset = new Date(tzNow);
  tzReset.setHours(resetHour, 0, 0, 0);
  if (tzReset <= tzNow) tzReset.setDate(tzReset.getDate() + 1);
  const diffMs = tzReset - tzNow;
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours >= 24) return `~${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `~${hours}h ${minutes}m`;
}

function fetchCredits(apiKey) {
  const auth = `Bearer ${apiKey}`;
  let teamsBody;
  try {
    const teamsOut = execSync(
      `curl -sf -H 'Authorization: ${auth}' https://api.pioneer.ai/teams`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
    );
    teamsBody = JSON.parse(teamsOut);
  } catch (e) {
    return { error: `Failed to fetch teams: ${e.stderr || e.message}` };
  }
  if (!teamsBody.teams || !Array.isArray(teamsBody.teams)) {
    return { error: `Unexpected teams response: ${JSON.stringify(teamsBody).slice(0, 200)}` };
  }
  const results = [];
  for (const team of teamsBody.teams) {
    try {
      const overageOut = execSync(
        `curl -sf -H 'Authorization: ${auth}' https://api.pioneer.ai/billing/team/${team.id}/overage-settings`,
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
      );
      const overage = JSON.parse(overageOut);
      results.push({ team_name: team.name, team_id: team.id, ...overage });
    } catch (e) {
      results.push({ team_name: team.name, team_id: team.id, error: (e.stderr || e.message).toString().trim() });
    }
  }
  return { teams: results };
}

function fetchOpenCodeZenCost() {
  let opencodeBin = null;
  try { opencodeBin = execSync("which opencode", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim(); } catch {}
  if (!opencodeBin) {
    for (const p of ["/opt/homebrew/bin/opencode", "/usr/local/bin/opencode", `${HOME}/.opencode/bin/opencode`]) {
      if (existsSync(p)) { opencodeBin = p; break; }
    }
  }
  if (!opencodeBin) return { error: "opencode CLI not found" };
  try {
    const out = execSync(`"${opencodeBin}" stats --days 7 --models`, {
      encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 30000,
    });
    return parseOpenCodeStats(out);
  } catch (e) {
    return { error: `opencode stats failed: ${e.stderr || e.message}` };
  }
}

function parseOpenCodeStats(output) {
  const strip = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  const BOX_V = "\u2502";
  const BOX_T = "\u251C";
  const BOX_B = "\u2514";
  const totalMatch = output.match(/Total Cost\s+\$([0-9.]+)/);
  const avgMatch = output.match(/Avg Cost\/Day\s+\$([0-9.]+)/);
  const totalCost = totalMatch ? parseFloat(totalMatch[1]) : 0;
  const avgCostPerDay = avgMatch ? parseFloat(avgMatch[1]) : 0;
  const modelCosts = {};
  const modelMessages = {};
  let inModelSection = false;
  let currentModel = null;
  for (const raw of output.split("\n")) {
    const line = strip(raw);
    if (!line.startsWith(BOX_V)) continue;
    const chars = Array.from(line);
    if (chars[1] === BOX_T || chars[1] === BOX_B) { currentModel = null; continue; }
    const text = line.slice(1).replace(new RegExp(BOX_V + "$"), "").trim();
    if (!text) { currentModel = null; continue; }
    if (text === "MODEL USAGE") { inModelSection = true; currentModel = null; continue; }
    if (!inModelSection) continue;
    if (["OVERVIEW", "COST & TOKENS", "TOOL USAGE"].includes(text)) { inModelSection = false; continue; }
    const prefix = text.split(/[ \t]/)[0];
    if (["Messages", "Input", "Output", "Cache", "Cost"].includes(prefix)) {
      if (!currentModel) continue;
      if (prefix === "Messages") {
        const val = text.replace(/^Messages\s*/, "").replace(/,/g, "").trim();
        const n = parseInt(val, 10);
        if (!isNaN(n)) modelMessages[currentModel] = n;
      }
      if (prefix === "Cost") {
        const m = text.match(/\x24([0-9.]+)/);
        if (m) modelCosts[currentModel] = parseFloat(m[1]);
      }
    } else {
      currentModel = text;
      if (!modelCosts[currentModel]) modelCosts[currentModel] = 0;
    }
  }
  const zenModelCosts = {};
  let zenCost = 0, zenMessages = 0;
  for (const [model, cost] of Object.entries(modelCosts)) {
    const n = model.trim().toLowerCase();
    if (n.startsWith("opencode/") || n.startsWith("opencode-go/")) {
      zenModelCosts[model] = cost;
      zenCost += Math.max(cost, 0);
    }
  }
  for (const [model, msg] of Object.entries(modelMessages)) {
    const n = model.trim().toLowerCase();
    if (n.startsWith("opencode/") || n.startsWith("opencode-go/")) {
      zenMessages += Math.max(msg, 0);
    }
  }
  const allModelCosts = {};
  for (const [model, cost] of Object.entries(modelCosts)) {
    if (cost > 0) allModelCosts[model] = cost;
  }
  return { totalCost: totalCost || 0, avgCostPerDay: avgCostPerDay || 0, zenCost, zenMessages, modelCosts: zenModelCosts, allCost: totalCost, allModels: allModelCosts };
}

function validateOpenCodeGoKey(apiKey) {
  try {
    const out = execSync(
      `curl -sf -H 'Authorization: Bearer ${apiKey}' -H 'Accept: application/json' https://opencode.ai/zen/go/v1/models`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
    );
    const body = JSON.parse(out);
    return (body.data || body.models || []).length;
  } catch { return null; }
}

function discoverGoDashboardCredentials() {
  const wsId = process.env.OPENCODE_GO_WORKSPACE_ID;
  const cookie = process.env.OPENCODE_GO_AUTH_COOKIE;
  if (wsId && cookie) return { workspaceId: wsId, authCookie: cookie, source: "environment" };
  const configPaths = [
    `${HOME}/.config/opencode-bar/opencode-go.json`,
    `${HOME}/.config/opencode-quota/opencode-go.json`,
  ];
  for (const path of configPaths) {
    if (!existsSync(path)) continue;
    try {
      const config = JSON.parse(readFileSync(path, "utf-8"));
      const id = config.workspaceId || config.workspaceID || config.workspace_id;
      const c = config.authCookie || config.auth_cookie || config.cookie;
      if (id && c) return { workspaceId: id, authCookie: c, source: path };
    } catch {}
  }
  return discoverBrowserCredentials();
}

function discoverBrowserCredentials() {
  const script = `
import shutil, sqlite3, os, re, sys, json, tempfile, subprocess
from pathlib import Path
from hashlib import pbkdf2_hmac
try:
    from Crypto.Cipher import AES
except ImportError:
    try:
        from cryptography.hazmat.backends import default_backend
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        AES_AVAILABLE = "cryptography"
    except ImportError:
        print(json.dumps([])); sys.exit(0)
else:
    AES_AVAILABLE = "pycryptodome"
BROWSERS = [
    {"name":"Chrome","base":Path.home()/"Library/Application Support/Google/Chrome","ks":"Chrome Safe Storage","ka":"Chrome"},
    {"name":"Brave","base":Path.home()/"Library/Application Support/BraveSoftware/Brave-Browser","ks":"Brave Safe Storage","ka":"Brave"},
    {"name":"Arc","base":Path.home()/"Library/Application Support/Arc/User Data","ks":"Arc Safe Storage","ka":"Arc"},
    {"name":"Edge","base":Path.home()/"Library/Application Support/Microsoft Edge","ks":"Microsoft Edge Safe Storage","ka":"Microsoft Edge"},
]
def key_for(b):
    try:
        pw = subprocess.check_output(["security","find-generic-password","-s",b["ks"],"-a",b["ka"],"-w"], stderr=subprocess.DEVNULL).rstrip(b"\\n")
        return pbkdf2_hmac("sha1", pw, b"saltysalt", 1003, 16)
    except: return None
def decrypt(enc_val, key):
    if not enc_val: return ""
    if not enc_val.startswith((b"v10",b"v11")):
        try: return enc_val.decode("utf-8")
        except: return ""
    enc_val = enc_val[3:]
    iv = b" " * 16
    if AES_AVAILABLE == "pycryptodome":
        dec = AES.new(key, AES.MODE_CBC, iv).decrypt(enc_val)
    else:
        d = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend()).decryptor()
        dec = d.update(enc_val) + d.finalize()
    pad = dec[-1]
    if 1 <= pad <= 16 and dec.endswith(bytes([pad])*pad): dec = dec[:-pad]
    if len(dec) > 32:
        cand = dec[32:]
        if all(b >= 32 or b in (9,10,13) for b in cand[:16]): dec = cand
    try: return dec.decode("utf-8")
    except: return ""
def copy_db(p):
    t = tempfile.NamedTemporaryFile(delete=False, suffix=".db"); t.close()
    shutil.copy2(p, t.name); return t.name
def auth_cookie(profile, key):
    tmp = copy_db(profile/"Cookies")
    try:
        c = sqlite3.connect(tmp)
        rows = c.execute("SELECT encrypted_value, value FROM cookies WHERE host_key LIKE '%opencode.ai' AND name='auth' ORDER BY expires_utc DESC LIMIT 1").fetchall(); c.close()
    finally: os.unlink(tmp)
    if not rows: return ""
    ev, pv = rows[0]
    return pv if pv else decrypt(ev, key)
def workspace_history(profile):
    tmp = copy_db(profile/"History")
    try:
        c = sqlite3.connect(tmp)
        rows = c.execute("SELECT url, last_visit_time FROM urls WHERE url LIKE '%/workspace/%/go%' ORDER BY last_visit_time DESC LIMIT 50").fetchall(); c.close()
    finally: os.unlink(tmp)
    seen, result = set(), []
    for url, lvt in rows:
        m = re.search(r'/workspace/(wrk_[A-Z0-9]+)', url)
        if not m: continue
        wid = m.group(1)
        if wid in seen: continue
        seen.add(wid)
        result.append((wid, lvt))
    return result
candidates = []
for b in BROWSERS:
    if not b["base"].exists(): continue
    key = key_for(b)
    if not key: continue
    for child in b["base"].iterdir():
        if child.name not in ("Default",) and not child.name.startswith("Profile "): continue
        if not (child/"Cookies").exists() or not (child/"History").exists(): continue
        try:
            ck = auth_cookie(child, key)
            ws = workspace_history(child)
        except: continue
        if not ck or not ws: continue
        for wid, lvt in ws:
            candidates.append({"workspaceId":wid,"authCookie":ck,"source":f"Browser ({b['name']} {child.name})","lastVisitTime":lvt})
seen = set()
for c in sorted(candidates, key=lambda x: x["lastVisitTime"], reverse=True):
    k = (c["workspaceId"], c["authCookie"])
    if k in seen: continue
    seen.add(k)
    print(json.dumps(c))
`;
  try {
    const out = execSync("python3 -", {
      encoding: "utf-8", input: script,
      stdio: ["pipe", "pipe", "pipe"], timeout: 15000,
    });
    const lines = out.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const c = JSON.parse(line);
        if (c.workspaceId && c.authCookie) return { workspaceId: c.workspaceId, authCookie: c.authCookie, source: c.source };
      } catch {}
    }
  } catch {}
  return null;
}

function scrapeGoDashboard(workspaceId, authCookie) {
  const cookieHeader = authCookie.includes("auth=") ? authCookie : `auth=${authCookie}`;
  try {
    const html = execSync(
      `curl -sfL -H 'Accept: text/html,application/xhtml+xml' -H 'Cookie: ${cookieHeader}' -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' "https://opencode.ai/workspace/${workspaceId}/go"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 }
    );
    return parseDashboardHTML(html);
  } catch { return null; }
}

function parseDashboardHTML(html) {
  let text = html
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&").replace(/\\"/g, '"');
  const parseWindow = (fieldName) => {
    const bodyRe = new RegExp(`["']?${fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?\\s*:\\s*(?:\\$R\\[\\d+\\]\\s*=\\s*)?\\{([^{}]*)\\}`, "s");
    const m = text.match(bodyRe);
    if (!m) return null;
    const body = m[1];
    const usageM = body.match(/["']?usagePercent["']?\s*:\s*"?(-?\d+(?:\.\d+)?)"?/);
    const resetM = body.match(/["']?resetInSec["']?\s*:\s*"?(-?\d+(?:\.\d+)?)"?/);
    if (!usageM || !resetM) return null;
    return { usagePercent: parseFloat(usageM[1]), resetInSec: parseInt(parseFloat(resetM[1])) };
  };
  return { rolling: parseWindow("rollingUsage"), weekly: parseWindow("weeklyUsage"), monthly: parseWindow("monthlyUsage") };
}

function fetchOpenCodeGoUsage(apiKey) {
  const modelCount = validateOpenCodeGoKey(apiKey);
  if (modelCount == null) return { error: "Failed to validate OpenCode Go API key" };
  const creds = discoverGoDashboardCredentials();
  if (!creds) return { error: "No dashboard credentials found", modelCount };
  const usage = scrapeGoDashboard(creds.workspaceId, creds.authCookie);
  if (!usage) return { error: "Failed to parse dashboard usage", modelCount };
  const percents = [usage.rolling?.usagePercent, usage.weekly?.usagePercent, usage.monthly?.usagePercent].filter(p => p != null);
  const maxUsed = percents.length > 0 ? Math.max(...percents) : 0;
  return { modelCount, ...usage, maxUsedPercent: maxUsed, source: creds.source, workspaceId: creds.workspaceId };
}

function formatDuration(seconds) {
  if (seconds == null) return "?";
  const s = Math.max(0, seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `~${d}d ${h}h`;
  if (h > 0) return `~${h}h ${m}m`;
  return `~${m}m`;
}

// ── High-level helpers for the daemon ───────────────────────────────

function maskKey(key) {
  if (!key) return null;
  return key.slice(0, 10) + "…" + key.slice(-4);
}

// Build the full menu snapshot in one call: providers + their profiles +
// which profile is active. Cheap file reads only — no network/credits.
function getStatus() {
  try { migrateInlineKeys(); } catch {}
  const providers = getAllProviders();
  const profiles = loadProfiles();
  const out = [];
  for (const [name, p] of Object.entries(providers)) {
    const pkey = profileProvider(name);
    const profs = profiles[pkey] || {};
    const currentKey = getConfigKey(name);
    const profEntries = Object.entries(profs).map(([pname, entry]) => {
      const key = resolveProfileKey(name, pname, entry);
      return {
        name: pname,
        description: entry.description || null,
        maskedKey: maskKey(key),
        active: key && currentKey && key === currentKey,
      };
    });
    out.push({
      provider: name,
      label: p.label,
      type: p.type,
      hasKey: p.hasKey,
      activeMaskedKey: maskKey(currentKey),
      profileKey: pkey,
      profiles: profEntries,
    });
  }
  return out;
}

function setProfile(provider, name) {
  provider = normalizeProvider(provider);
  const profiles = loadProfiles();
  const pkey = profileProvider(provider);
  if (!profiles[pkey]?.[name]) {
    return { ok: false, error: `Profile "${name}" not found for ${pkey}.` };
  }
  const key = resolveProfileKey(provider, name, profiles[pkey][name]);
  if (!key) return { ok: false, error: `Key file missing for "${name}" (${pkey}).` };
  try {
    setConfigKey(provider, key);
    return { ok: true, provider, name, label: activeKeyLabel(provider) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function addProfile(provider, name, key, description) {
  provider = normalizeProvider(provider);
  if (!provider || !name || !key) return { ok: false, error: "provider, name and key are required" };
  ensureDataDir();
  const profiles = loadProfiles();
  const pkey = profileProvider(provider);
  if (!profiles[pkey]) profiles[pkey] = {};
  if (profiles[pkey][name]) return { ok: false, error: `Profile "${name}" already exists for ${pkey}.` };
  const file = saveProfileKey(provider, name, key);
  profiles[pkey][name] = { file, description: description || undefined };
  saveProfiles(profiles);
  return { ok: true, provider, name, scope: isAuthProvider(provider) ? activeKeyLabel(provider) : provider };
}

function deleteProfile(provider, name) {
  provider = normalizeProvider(provider);
  const profiles = loadProfiles();
  const pkey = profileProvider(provider);
  if (!profiles[pkey]?.[name]) return { ok: false, error: `Profile "${name}" not found for ${pkey}.` };
  const current = getConfigKey(provider);
  const key = resolveProfileKey(provider, name, profiles[pkey][name]);
  const wasActive = key === current;
  deleteProfileKey(provider, name);
  delete profiles[pkey][name];
  saveProfiles(profiles);
  if (wasActive) removeConfigKey(provider);
  return { ok: true, provider, name, wasActive };
}

function getCredits(provider) {
  provider = normalizeProvider(provider);
  if (provider === "opencode" || provider === "opencode-zen") {
    return { provider: "opencode", zen: fetchOpenCodeZenCost() };
  }
  if (provider === "opencode-go") {
    const key = getConfigKey("opencode-go");
    if (!key) return { provider: "opencode-go", error: "No API key found for OpenCode Go." };
    return { provider: "opencode-go", go: fetchOpenCodeGoUsage(key) };
  }
  const key = getConfigKey(provider);
  if (!key) return { provider, error: `No active key for ${provider}.` };
  const r = fetchCredits(key);
  const t = (r.teams || [])[0];
  if (r.error) return { provider, error: r.error };
  if (t && !t.error) {
    return {
      provider, pioneer: {
        credit_limit: t.credit_limit ?? 5000,
        current_period_usage: t.current_period_usage ?? 0,
        current_period_requests: t.current_period_requests ?? 0,
        usage_reset_hour: t.usage_reset_hour ?? null,
        usage_reset_timezone: t.usage_reset_timezone || "UTC",
        team_name: t.team_name,
        remaining: (t.credit_limit ?? 5000) - (t.current_period_usage ?? 0),
        remaining_usd: ((t.credit_limit ?? 5000) - (t.current_period_usage ?? 0)) / 100,
      },
    };
  }
  return { provider, error: t?.error || "no data" };
}

function migrateInlineKeys() {
  const config = loadConfig();
  const profiles = loadProfiles();
  let changed = false;
  for (const [provider, cfg] of Object.entries(config?.provider || {})) {
    const val = cfg?.options?.apiKey;
    if (val && typeof val === "string" && !val.startsWith("{file:") && !val.startsWith("{env:")) {
      ensureDataDir();
      writeSecretFile(secretFilePath(provider), val);
      config.provider[provider].options.apiKey = `{file:~/.secrets/llm-api-keys/${provider}.key}`;
      changed = true;
    }
  }
  if (changed) saveConfig(config);
  let profilesChanged = false;
  for (const [provider, entries] of Object.entries(profiles)) {
    for (const [name, entry] of Object.entries(entries || {})) {
      if (entry.key && !entry.file) {
        ensureDataDir();
        const file = saveProfileKey(provider, name, entry.key);
        delete entry.key;
        entry.file = file;
        profilesChanged = true;
      }
    }
  }
  if (profilesChanged) saveProfiles(profiles);
}

export {
  getStatus, setProfile, addProfile, deleteProfile, getCredits,
  maskKey, formatDuration, timeUntilReset,
};
