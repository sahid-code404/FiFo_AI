const DEFAULT_API_URL = "http://localhost:8000";

const factFields = [
  "name", "email", "phone", "college", "degree", "stream", "passing_year", "cgpa",
  "class_x_percentage", "class_xii_percentage", "current_location", "joining_date"
];
const preferenceFields = ["preferred_city"];
const linkFields = ["github", "linkedin"];

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

function fillProfile(profile) {
  const facts = profile.facts || {};
  const preferences = profile.preferences || {};
  const links = profile.links || {};
  factFields.forEach((field) => setValue(field, facts[field] ?? profile[field]));
  preferenceFields.forEach((field) => setValue(field, preferences[field] ?? profile[field]));
  linkFields.forEach((field) => setValue(field, links[field] ?? profile[field]));
  setValue("skills", (profile.skills || []).join(", "));
  setValue("projects", profile.projects || "");
}

function collectProfile() {
  const facts = Object.fromEntries(factFields.map((field) => [field, byId(field).value.trim()]));
  const preferences = Object.fromEntries(preferenceFields.map((field) => [field, byId(field).value.trim()]));
  const links = Object.fromEntries(linkFields.map((field) => [field, byId(field).value.trim()]));
  const skills = byId("skills").value.split(",").map((item) => item.trim()).filter(Boolean);
  const projects = byId("projects").value.trim();
  return { facts, preferences, links, skills, projects };
}

async function load() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  byId("apiUrl").value = stored.apiUrl || DEFAULT_API_URL;

  try {
    const profile = await api("/profile");
    fillProfile(profile || {});
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
    await api("/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectProfile())
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
