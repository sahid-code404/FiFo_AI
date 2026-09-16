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

analyzeButton.addEventListener("click", async () => {
  analyzeButton.disabled = true;
  analyzeButton.textContent = "Analyzing…";
  message.textContent = "";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://docs.google.com/forms/")) {
      throw new Error("Open a Google Form first, then run FiFo AI.");
    }

    const result = await chrome.tabs.sendMessage(tab.id, { type: "FIFO_ANALYZE_AND_FILL" });
    if (!result?.ok) throw new Error(result?.error || "Could not analyze the form.");

    const summary = result.summary;
    document.getElementById("filledCount").textContent = summary.filled;
    document.getElementById("reviewCount").textContent = summary.review;
    document.getElementById("missingCount").textContent = summary.missing;
    document.getElementById("unknownCount").textContent = summary.unknown;
    resultCard.classList.remove("hidden");

    if (summary.review || summary.missing || summary.unknown) {
      message.textContent = "Known facts were filled. Check the remaining questions manually before submitting.";
    } else {
      message.textContent = "All detected supported fields were filled. Review the form before submitting.";
    }
  } catch (error) {
    resultCard.classList.remove("hidden");
    message.textContent = error.message || String(error);
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = "Analyze & Fill This Form";
  }
});

checkApi();
