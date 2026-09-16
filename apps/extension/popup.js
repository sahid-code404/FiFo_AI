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
  if (provider === "gemini") {
    apiStatus.textContent = `Connected · Gemini${model ? ` (${model})` : ""}`;
  } else if (provider === "openai_compatible") {
    apiStatus.textContent = `Connected · AI${model ? ` (${model})` : ""}`;
  } else {
    apiStatus.textContent = "Connected · Gemini key needed";
  }
  apiStatus.className = "pill ok";
}

profileButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

function isSupportedWebPage(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_) {
    return false;
  }
}

async function analyzeTabFrames(tabId) {
  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch (_) {
    frames = [];
  }

  if (!frames?.length) frames = [{ frameId: 0 }];
  frames.sort((a, b) => (a.frameId === 0 ? -1 : b.frameId === 0 ? 1 : a.frameId - b.frameId));

  let best = null;
  let lastError = null;

  for (const frame of frames) {
    try {
      const result = await chrome.tabs.sendMessage(
        tabId,
        { type: "FIFO_ANALYZE_AND_FILL" },
        { frameId: frame.frameId }
      );
      if (!result?.ok) {
        lastError = new Error(result?.error || "Could not analyze this frame.");
        continue;
      }

      const withFrame = { ...result, _frameId: frame.frameId };
      if (!best || (result.summary?.total || 0) > (best.summary?.total || 0)) {
        best = withFrame;
      }

      if ((result.summary?.filled || 0) > 0) return withFrame;
    } catch (error) {
      lastError = error;
    }
  }

  if (best) return best;
  throw lastError || new Error("No supported form frame was found on this page.");
}

async function generateAiDrafts(tabId, frameId) {
  try {
    const result = await chrome.tabs.sendMessage(
      tabId,
      { type: "FIFO_GENERATE_AI_DRAFTS" },
      { frameId: frameId ?? 0 }
    );
    return result?.ok ? result : { ok: false, error: result?.error || "AI drafting failed." };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing & drafting…";
  message.textContent = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedWebPage(tab.url)) {
      throw new Error("Open a normal web-based job/application form first, then run FiFo AI.");
    }

    const result = await analyzeTabFrames(tab.id);
    if (!result?.ok) throw new Error(result?.error || "Could not analyze the form.");

    const aiDrafts = await generateAiDrafts(tab.id, result._frameId);
    const summary = result.summary;
    document.getElementById("filledCount").textContent = summary.filled;
    document.getElementById("aiDraftCount").textContent = aiDrafts?.drafted || 0;
    document.getElementById("reviewCount").textContent = summary.review;
    document.getElementById("missingCount").textContent = summary.missing;
    document.getElementById("unknownCount").textContent = summary.unknown;
    resultCard.classList.remove("hidden");

    const detected = result.source || "web form";
    const parts = [`${summary.filled} verified fact field(s) filled on this ${detected}.`];

    if (aiDrafts?.drafted) {
      parts.push(`${aiDrafts.drafted} narrative answer(s) were drafted by Gemini and inserted for review.`);
    } else if (aiDrafts?.not_configured) {
      parts.push("Gemini is not configured. Open Edit My Profile, paste your Gemini API key, click Save AI settings, then Test Gemini.");
    } else if (aiDrafts && !aiDrafts.ok) {
      parts.push(`Gemini drafting could not run: ${aiDrafts.error}`);
    }

    if (aiDrafts?.needs_input) {
      parts.push(`${aiDrafts.needs_input} question(s) need your own input because FiFo could not support an answer from your saved facts.`);
    }
    if (summary.review || summary.missing || summary.unknown) {
      parts.push("Review every remaining or AI-written answer before submitting.");
    } else {
      parts.push("Review the completed form before submitting.");
    }

    message.textContent = parts.join(" ");
  } catch (error) {
    resultCard.classList.remove("hidden");
    const text = error?.message || String(error);
    if (text.includes("Receiving end does not exist") || text.includes("Could not establish connection")) {
      message.textContent = "FiFo AI is not loaded on this tab yet. Reload the page once after updating/reloading the extension, then try again.";
    } else {
      message.textContent = text;
    }
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze, Fill & Draft Answers";
  }
});

checkApi();
