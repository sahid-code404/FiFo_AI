const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const factFields = [
  "name", "first_name", "middle_name", "last_name", "email", "phone", "date_of_birth", "gender",
  "nationality", "address", "city", "state", "country", "postal_code", "current_location",
  "college", "degree", "stream", "passing_year", "semester", "cgpa",
  "class_x_percentage", "class_x_board", "class_x_year",
  "class_xii_percentage", "class_xii_board", "class_xii_year",
  "current_employer", "current_job_title", "years_experience", "joining_date", "notice_period"
];
const preferenceFields = ["preferred_city", "work_mode"];
const linkFields = ["github", "linkedin", "portfolio"];
const aiKnowledgeFields = ["projects", "experience", "achievements", "career_goals", "resume_text"];

function byId(id) {
  return document.getElementById(id);
}

async function getApiUrl() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  return (stored.apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
}

async function getAiSettings() {
  const stored = await chrome.storage.local.get(["geminiApiKey", "geminiModel"]);
  return {
    geminiApiKey: String(stored.geminiApiKey || "").trim(),
    geminiModel: String(stored.geminiModel || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL
  };
}

async function api(path, options = {}) {
  const apiUrl = await getApiUrl();
  const ai = await getAiSettings();
  const body = options.body;
  const headers = new Headers(options.headers || {});

  if (!(body instanceof FormData) && body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (ai.geminiApiKey) headers.set("X-FiFo-Gemini-Key", ai.geminiApiKey);
  if (ai.geminiModel) headers.set("X-FiFo-Gemini-Model", ai.geminiModel);

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.detail || `HTTP ${response.status}`);
  return data;
}

function setValue(id, value) {
  const element = byId(id);
  if (element) element.value = value ?? "";
}

function answerBankToText(bank) {
  if (!Array.isArray(bank)) return "";
  return bank
    .filter((item) => item && item.value && Array.isArray(item.aliases) && item.aliases.length)
    .map((item) => `${item.aliases.join(" / ")} = ${item.value}`)
    .join("\n");
}

function parseAnswerBank(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) return null;
      const aliases = line.slice(0, separator)
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);
      const value = line.slice(separator + 1).trim();
      if (!aliases.length || !value) return null;
      return { aliases, value, auto_fill: true };
    })
    .filter(Boolean);
}

function fillProfile(profile) {
  const facts = profile.facts || {};
  const preferences = profile.preferences || {};
  const links = profile.links || {};
  factFields.forEach((field) => setValue(field, facts[field] ?? profile[field]));
  preferenceFields.forEach((field) => setValue(field, preferences[field] ?? profile[field]));
  linkFields.forEach((field) => setValue(field, links[field] ?? profile[field]));
  setValue("skills", (profile.skills || []).join(", "));
  aiKnowledgeFields.forEach((field) => setValue(field, profile[field] || ""));
  setValue("answer_bank", answerBankToText(profile.answer_bank));
}

function collectProfile(existing = {}) {
  const facts = Object.fromEntries(factFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const preferences = Object.fromEntries(preferenceFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const links = Object.fromEntries(linkFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const skills = byId("skills").value.split(",").map((item) => item.trim()).filter(Boolean);
  const answer_bank = parseAnswerBank(byId("answer_bank").value);
  const aiKnowledge = Object.fromEntries(
    aiKnowledgeFields.map((field) => [field, byId(field)?.value.trim() || ""])
  );

  return {
    ...existing,
    facts,
    preferences,
    links,
    skills,
    answer_bank,
    ...aiKnowledge,
  };
}

async function refreshConnectionStatus() {
  try {
    const health = await api("/health");
    if (health?.ai_provider === "gemini") {
      byId("connectionStatus").textContent = `Connected · Gemini ${health.ai_model || ""}`.trim();
      byId("aiStatus").textContent = `Gemini configured (${health.ai_model || DEFAULT_GEMINI_MODEL})`;
    } else if (health?.ai_provider === "openai_compatible") {
      byId("connectionStatus").textContent = `Connected · AI ${health.ai_model || ""}`.trim();
      byId("aiStatus").textContent = `AI configured (${health.ai_model || "custom model"})`;
    } else {
      byId("connectionStatus").textContent = "Connected · AI not configured";
      byId("aiStatus").textContent = "Gemini key not configured";
    }
  } catch (error) {
    byId("connectionStatus").textContent = `Offline: ${error.message}`;
  }
}

let loadedProfile = {};

async function load() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  byId("apiUrl").value = stored.apiUrl || DEFAULT_API_URL;

  const ai = await getAiSettings();
  byId("geminiApiKey").value = ai.geminiApiKey;
  byId("geminiModel").value = ai.geminiModel;

  try {
    loadedProfile = await api("/profile") || {};
    fillProfile(loadedProfile);
    await refreshConnectionStatus();
  } catch (error) {
    byId("connectionStatus").textContent = `Offline: ${error.message}`;
  }
}

byId("saveConnection").addEventListener("click", async () => {
  const apiUrl = byId("apiUrl").value.trim().replace(/\/$/, "") || DEFAULT_API_URL;
  await chrome.storage.sync.set({ apiUrl });
  byId("connectionStatus").textContent = "Connection saved";
  await refreshConnectionStatus();
});

byId("saveAiSettings").addEventListener("click", async () => {
  const geminiApiKey = byId("geminiApiKey").value.trim();
  const geminiModel = byId("geminiModel").value.trim() || DEFAULT_GEMINI_MODEL;
  await chrome.storage.local.set({ geminiApiKey, geminiModel });
  byId("aiStatus").textContent = geminiApiKey
    ? `Saved locally · ${geminiModel}`
    : "Gemini key cleared";
  await refreshConnectionStatus();
});

byId("testAi").addEventListener("click", async () => {
  const geminiApiKey = byId("geminiApiKey").value.trim();
  const geminiModel = byId("geminiModel").value.trim() || DEFAULT_GEMINI_MODEL;
  await chrome.storage.local.set({ geminiApiKey, geminiModel });

  if (!geminiApiKey) {
    byId("aiStatus").textContent = "Paste a Gemini API key first.";
    return;
  }

  byId("aiStatus").textContent = "Testing Gemini…";
  try {
    const result = await api("/ai/test", { method: "POST" });
    byId("aiStatus").textContent = result?.ok
      ? `Gemini ready · ${result.model || geminiModel}`
      : `Gemini test failed${result?.error ? `: ${result.error}` : ""}`;
  } catch (error) {
    byId("aiStatus").textContent = `Gemini test failed: ${error.message}`;
  }
});

byId("saveProfile").addEventListener("click", async () => {
  byId("saveStatus").textContent = "Saving…";
  try {
    const payload = collectProfile(loadedProfile);
    loadedProfile = await api("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    byId("saveStatus").textContent = "Profile saved";
  } catch (error) {
    byId("saveStatus").textContent = `Save failed: ${error.message}`;
  }
});

byId("importResume").addEventListener("click", async () => {
  const file = byId("resume").files?.[0];
  const output = byId("resumeResult");
  output.classList.remove("hidden");
  if (!file) {
    output.textContent = "Choose a PDF resume first.";
    return;
  }

  const form = new FormData();
  form.append("file", file);
  output.textContent = "Inspecting resume…";

  try {
    const result = await api("/profile/import-resume", { method: "POST", body: form });
    const summary = {
      filename: result.filename,
      characters: result.characters,
      suggestions: result.suggestions,
      resume_text_loaded: Boolean(result.resume_text),
      note: result.note,
    };
    output.textContent = JSON.stringify(summary, null, 2);

    if (result.suggestions?.email && !byId("email").value) setValue("email", result.suggestions.email);
    if (result.suggestions?.phone && !byId("phone").value) setValue("phone", result.suggestions.phone);
    if (result.resume_text) setValue("resume_text", result.resume_text);
  } catch (error) {
    output.textContent = `Import failed: ${error.message}`;
  }
});

load();
