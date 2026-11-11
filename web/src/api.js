async function request(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败(${res.status})`);
  return data;
}

export const api = {
  me: () => request("/api/auth/me"),
  config: () => request("/api/auth/config"),
  login: (email, password) => request("/api/auth/login", "POST", { email, password }),
  register: (email, password, invite) => request("/api/auth/register", "POST", { email, password, invite }),
  logout: () => request("/api/auth/logout", "POST"),
  updateProfile: (patch) => request("/api/auth/profile", "PATCH", patch),
  listInvites: () => request("/api/invites"),
  createInvite: (note) => request("/api/invites", "POST", { note }),
  deleteInvite: (id) => request(`/api/invites/${id}`, "DELETE"),
  feedbackOverview: () => request("/api/feedback/overview"),
  // 灵感池：创作者视角（可收集所有用户的灵感）
  ideasAll: () => request("/api/ideas/all"),
  ideasPatch: (id, patch) => request(`/api/ideas/${id}`, "PATCH", patch),
  ideasDelete: (id) => request(`/api/ideas/${id}`, "DELETE"),
  assistantTokenStatus: () => request("/api/assistant/token"),
  assistantTokenCreate: () => request("/api/assistant/token", "POST"),
  assistantTokenRevoke: () => request("/api/assistant/token", "DELETE"),
  listTokens: () => request("/api/tokens"),
  createToken: (name, scope) => request("/api/tokens", "POST", { name, scope }),
  revokeToken: (id) => request(`/api/tokens/${id}`, "DELETE"),
  // AI
  aiConfig: () => request("/api/ai/config"),
  saveAiConfig: (patch) => request("/api/ai/config", "PATCH", patch),
  testAi: () => request("/api/ai/test", "POST"),
  aiUsage: () => request("/api/ai/usage"),
  aiChat: (messages, opts = {}) => request("/api/ai/chat", "POST", { messages, ...opts }),
  aiPolish: (text, style) => request("/api/ai/polish", "POST", { text, style }),
  aiSummarize: (text) => request("/api/ai/summarize", "POST", { text }),
  aiWeekly: (days = 7) => request("/api/ai/weekly", "POST", { days }),
  aiParse: (text) => request("/api/ai/parse", "POST", { text }),
  aiTidyNote: (text) => request("/api/ai/tidy-note", "POST", { text }),
  aiShoppingList: (ids) => request("/api/ai/shopping-list", "POST", { ids }),
  aiInterviewReview: (text, company, round) => request("/api/ai/interview-review", "POST", { text, company, round }),
};

export async function listRows(coll) {
  const { rows } = await request(`/api/data/${coll}`);
  return rows || [];
}

export async function insertRow(coll, row) {
  const { row: saved } = await request(`/api/data/${coll}`, "POST", row);
  return saved;
}

export async function updateRow(coll, id, patch) {
  const { row: saved } = await request(`/api/data/${coll}/${id}`, "PATCH", patch);
  return saved;
}

export async function deleteRow(coll, id) {
  return request(`/api/data/${coll}/${id}`, "DELETE");
}

export async function uploadImage(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", credentials: "same-origin", body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `上传失败(${res.status})`);
  return data.url;
}

export async function fetchMeta(url) {
  return request("/api/fetch-meta", "POST", { url });
}

export function exportUrl() {
  return "/api/export";
}

export function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fmtDate(s) {
  return s ? String(s).slice(0, 10) : "";
}

export function fmtTime(s) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
