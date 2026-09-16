const DEFAULT_API_URL = "http://localhost:8000";

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

function byId(id) {
  return document.getElementById(id);
}

async function getApiUrl() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  return (stored.apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
}

async function api(path, options = {}) {
  const apiUrl = await getApiUrl();
  const response = await fetch(`${apiUrl}${path}`, options);
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
  setValue("projects", profile.projects || "");
  setValue("answer_bank", answerBankToText(profile.answer_bank));
}

function collectProfile(existing = {}) {
  const facts = Object.fromEntries(factFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const preferences = Object.fromEntries(preferenceFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const links = Object.fromEntries(linkFields.map((field) => [field, byId(field)?.value.trim() || ""]));
  const skills = byId("skills").value.split(",").map((item) => item.trim()).filter(Boolean);
  const projects = byId("projects").value.trim();
  const answer_bank = parseAnswerBank(byId("answer_bank").value);

  // Preserve future/unknown top-level keys so upgrading the extension does not
  // accidentally erase data created by newer API versions.
  return { ...existing, facts, preferences, links, skills, projects, answer_bank };
}

let loadedProfile = {};

async function load() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  byId("apiUrl").value = stored.apiUrl || DEFAULT_API_URL;

  try {
    loadedProfile = await api("/profile") || {};
    fillProfile(loadedProfile);
    byId("connectionStatus").textContent = "Connected";
  } catch (error) {
    byId("connectionStatus").textContent = `Offline: ${error.message}`;
  }
}

byId("saveConnection").addEventListener("click", async () => {
  const apiUrl = byId("apiUrl").value.trim().replace(/\/$/, "") || DEFAULT_API_URL;
  await chrome.storage.sync.set({ apiUrl });
  byId("connectionStatus").textContent = "Connection saved";
  try {
    await api("/health");
    byId("connectionStatus").textContent = "Connected";
  } catch (error) {
    byId("connectionStatus").textContent = `Saved, but API is offline: ${error.message}`;
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
    output.textContent = JSON.stringify(result, null, 2);

    if (result.suggestions?.email && !byId("email").value) setValue("email", result.suggestions.email);
    if (result.suggestions?.phone && !byId("phone").value) setValue("phone", result.suggestions.phone);
  } catch (error) {
    output.textContent = `Import failed: ${error.message}`;
  }
});

load();
