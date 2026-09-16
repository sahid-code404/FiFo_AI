const apiStatus = document.getElementById("apiStatus");
const analyzeButton = document.getElementById("analyzeButton");
const profileButton = document.getElementById("profileButton");
const resultCard = document.getElementById("resultCard");
const message = document.getElementById("message");

function apiRequest(path, method = "GET", body) {
  return chrome.runtime.sendMessage({ type: "FIFO_API", path, method, body });
}

async function checkApi() {
  const response = await apiRequest("/health");
  if (!response?.ok) {
    apiStatus.textContent = "Offline";
    apiStatus.className = "pill bad";
    return;
  }
  const provider = response.data?.ai_provider;
  const model = response.data?.ai_model;
  if (provider === "gemini") apiStatus.textContent = `Connected · Gemini${model ? ` (${model})` : ""}`;
  else if (provider === "openai_compatible") apiStatus.textContent = `Connected · AI${model ? ` (${model})` : ""}`;
  else apiStatus.textContent = "Connected · Gemini key needed";
  apiStatus.className = "pill ok";
}

profileButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

function isSupportedWebPage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) { return false; }
}

function blankSummary() { return { total: 0, filled: 0, review: 0, missing: 0, manual: 0, unknown: 0 }; }
function addSummary(target, source) {
  for (const key of ["total", "filled", "review", "missing", "manual", "unknown"]) target[key] += Number(source?.[key] || 0);
}

async function analyzeTabFrames(tabId) {
  let frames = [];
  try { frames = await chrome.webNavigation.getAllFrames({ tabId }); } catch (_) { frames = []; }
  if (!frames?.length) frames = [{ frameId: 0 }];
  frames.sort((a, b) => (a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : a.frameId - b.frameId));

  const successful = [];
  let lastError = null;
  for (const frame of frames) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "FIFO_ANALYZE_AND_FILL" }, { frameId: frame.frameId });
      if (!result?.ok) { lastError = new Error(result?.error || "Could not analyze this frame."); continue; }
      if ((result.summary?.total || 0) > 0) successful.push({ ...result, _frameId: frame.frameId });
    } catch (error) { lastError = error; }
  }
  if (!successful.length) throw lastError || new Error("No supported form frame was found on this page.");

  const summary = blankSummary();
  for (const result of successful) addSummary(summary, result.summary);
  const best = successful.reduce((current, item) => !current || (item.summary?.total || 0) > (current.summary?.total || 0) ? item : current, null);
  return { ok: true, summary, source: best?.source || "web form", frames: successful.map((item) => item._frameId) };
}

async function generateAiDrafts(tabId, frameIds) {
  const aggregate = { ok: true, drafted: 0, attempted: 0, needs_input: 0, not_configured: false, errors: [] };
  for (const frameId of frameIds) {
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "FIFO_GENERATE_AI_DRAFTS" }, { frameId });
      if (!result?.ok) { aggregate.errors.push(result?.error || "AI drafting failed in a form frame."); continue; }
      aggregate.drafted += Number(result.drafted || 0);
      aggregate.attempted += Number(result.attempted || 0);
      aggregate.needs_input += Number(result.needs_input || 0);
      aggregate.not_configured ||= Boolean(result.not_configured);
    } catch (error) { aggregate.errors.push(error?.message || String(error)); }
  }
  if (aggregate.errors.length && !aggregate.drafted && !aggregate.not_configured) aggregate.ok = false;
  return aggregate;
}

analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing & interacting…";
  message.textContent = "";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedWebPage(tab.url)) throw new Error("Open a normal web-based job/application form first, then run FiFo AI.");

    const result = await analyzeTabFrames(tab.id);
    const aiDrafts = await generateAiDrafts(tab.id, result.frames);
    const summary = result.summary;
    document.getElementById("filledCount").textContent = summary.filled;
    document.getElementById("aiDraftCount").textContent = aiDrafts?.drafted || 0;
    document.getElementById("reviewCount").textContent = summary.review;
    document.getElementById("missingCount").textContent = summary.missing;
    document.getElementById("manualCount").textContent = summary.manual;
    document.getElementById("unknownCount").textContent = summary.unknown;
    resultCard.classList.remove("hidden");

    const parts = [`${summary.filled} verified fact field(s) filled/interacted with on this ${result.source || "web form"}.`];
    if (aiDrafts?.drafted) parts.push(`${aiDrafts.drafted} narrative answer(s) were drafted by AI and inserted for review.`);
    else if (aiDrafts?.not_configured) parts.push("AI drafting is off. Open Edit My Profile → Gemini AI, save your key, then run Test Gemini.");
    else if (aiDrafts && !aiDrafts.ok) parts.push(`AI drafting could not run: ${aiDrafts.errors?.[0] || "unknown error"}`);

    if (summary.manual) parts.push(`${summary.manual} field(s), usually file pickers/uploads, require manual interaction because browsers intentionally restrict silent local-file selection.`);
    if (aiDrafts?.needs_input) parts.push(`${aiDrafts.needs_input} question(s) need your own input because FiFo could not support an answer from saved facts.`);
    if (summary.review || summary.missing || summary.unknown) parts.push("Review every remaining or AI-written answer before submitting.");
    else parts.push("Review the completed form before submitting.");
    message.textContent = parts.join(" ");
  } catch (error) {
    resultCard.classList.remove("hidden");
    const text = error?.message || String(error);
    if (text.includes("Receiving end does not exist") || text.includes("Could not establish connection")) message.textContent = "FiFo AI is not loaded on this tab yet. Reload the page once after updating/reloading the extension, then try again.";
    else message.textContent = text;
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze, Fill & Draft Answers";
  }
});

checkApi();