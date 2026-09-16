const DEFAULT_API_URL = "http://localhost:8000";

async function getApiUrl() {
  const stored = await chrome.storage.sync.get(["apiUrl"]);
  return (stored.apiUrl || DEFAULT_API_URL).replace(/\/$/, "");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FIFO_API") return;

  (async () => {
    try {
      const apiUrl = await getApiUrl();
      const options = {
        method: message.method || "GET",
        headers: { "Content-Type": "application/json" }
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
