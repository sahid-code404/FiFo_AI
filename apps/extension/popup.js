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
  apiStatus.textContent = response?.ok ? "Connected" : "Offline";
  apiStatus.className = `pill ${response?.ok ? "ok" : "bad"}`;
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

      if (!best || (result.summary?.total || 0) > (best.summary?.total || 0)) {
        best = result;
      }

      // Once a frame actually filled known fields, it is almost certainly the
      // application frame. Stop so unrelated embedded widgets are not touched.
      if ((result.summary?.filled || 0) > 0) return result;
    } catch (error) {
      lastError = error;
    }
  }

  if (best) return best;
  throw lastError || new Error("No supported form frame was found on this page.");
}

analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing…";
  message.textContent = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedWebPage(tab.url)) {
      throw new Error("Open a normal web-based job/application form first, then run FiFo AI.");
    }

    const result = await analyzeTabFrames(tab.id);
    if (!result?.ok) throw new Error(result?.error || "Could not analyze the form.");

    const summary = result.summary;
    document.getElementById("filledCount").textContent = summary.filled;
    document.getElementById("reviewCount").textContent = summary.review;
    document.getElementById("missingCount").textContent = summary.missing;
    document.getElementById("unknownCount").textContent = summary.unknown;
    resultCard.classList.remove("hidden");

    const detected = result.source || "web form";
    const aiSuffix = result.semantic_ai?.used ? " AI semantic matching was used for unfamiliar wording." : "";
    if (summary.review || summary.missing || summary.unknown) {
      message.textContent = `${summary.filled} field(s) filled on this ${detected}. Review the remaining questions before submitting.${aiSuffix}`;
    } else {
      message.textContent = `All detected supported fields were filled on this ${detected}. Review the form before submitting.${aiSuffix}`;
    }
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
    analyzeButton.textContent = "Analyze & Fill This Form";
  }
});

checkApi();
