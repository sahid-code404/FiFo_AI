const DEFAULT_API_URL = "http://localhost:8000";
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FIFO_API") return;

  (async () => {
    try {
      const apiUrl = await getApiUrl();
      const ai = await getAiSettings();
      const headers = { "Content-Type": "application/json" };
      if (ai.geminiApiKey) headers["X-FiFo-Gemini-Key"] = ai.geminiApiKey;
      if (ai.geminiModel) headers["X-FiFo-Gemini-Model"] = ai.geminiModel;

      const options = {
        method: message.method || "GET",
        headers
      };

      if (message.body !== undefined) {
        options.body = JSON.stringify(message.body);
      }

      const response = await fetch(`${apiUrl}${message.path}`, options);
      const data = await response.json().catch(() => null);

      sendResponse({
        ok: response.ok,
        status: response.status,
        data,
        error: response.ok ? null : data?.detail || `HTTP ${response.status}`
      });
    } catch (error) {
      sendResponse({ ok: false, status: 0, error: String(error), data: null });
    }
  })();

  return true;
});
