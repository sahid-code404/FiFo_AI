function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function questionBlocks() {
  const googleBlocks = [...document.querySelectorAll(".Qr7Oae")];
  if (googleBlocks.length) return googleBlocks;
  return [...document.querySelectorAll("[data-params]")];
}

function findLabel(block) {
  const preferred = [
    ".M7eMe",
    "[role='heading']",
    "label",
    ".freebirdFormviewerComponentsQuestionBaseTitle"
  ];

  for (const selector of preferred) {
    const element = block.querySelector(selector);
    const text = element?.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, "").trim();
  }

  return "";
}

function getFieldType(block) {
  if (block.querySelector("input[type='file']")) return "file";
  if (block.querySelector("textarea")) return "textarea";
  if (block.querySelector("[role='radiogroup']")) return "radio";
  if (block.querySelector("[role='checkbox']")) return "checkbox";
  if (block.querySelector("select")) return "select";
  if (block.querySelector("[role='listbox']")) return "select";
  const input = block.querySelector("input");
  return input?.type || "text";
}

function getOptions(block) {
  return [...block.querySelectorAll("[role='radio'], [role='checkbox'], option")]
    .map((node) => node.textContent?.trim() || node.getAttribute("data-value") || node.value || "")
    .filter(Boolean);
}

function extractFields() {
  return questionBlocks()
    .map((block, index) => {
      const label = findLabel(block);
      if (!label) return null;
      const id = `fifo-${index}`;
      block.dataset.fifoId = id;
      return {
        id,
        label,
        type: getFieldType(block),
        options: getOptions(block)
      };
    })
    .filter(Boolean);
}

function setNativeValue(element, value) {
  const stringValue = String(value ?? "");
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

  if (descriptor?.set) descriptor.set.call(element, stringValue);
  else element.value = stringValue;

  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function fillText(block, value) {
  const element = block.querySelector("textarea, input:not([type='file']):not([type='radio']):not([type='checkbox'])");
  if (!element) return false;
  setNativeValue(element, value);
  return true;
}

function fillRadio(block, value) {
  const target = normalize(value);
  const radios = [...block.querySelectorAll("[role='radio']")];
  const match = radios.find((radio) => {
    const text = normalize(radio.textContent || radio.getAttribute("data-value") || "");
    return text === target || text.includes(target) || target.includes(text);
  });
  if (!match) return false;
  match.click();
  return true;
}

function fillNativeSelect(block, value) {
  const select = block.querySelector("select");
  if (!select) return false;
  const target = normalize(value);
  const option = [...select.options].find((candidate) => {
    const text = normalize(candidate.textContent || candidate.value);
    return text === target || text.includes(target) || target.includes(text);
  });
  if (!option) return false;
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function fillField(result) {
  const block = document.querySelector(`[data-fifo-id='${CSS.escape(result.id)}']`);
  if (!block || result.value === undefined || result.value === null) return false;

  const type = getFieldType(block);
  if (type === "file") return false;
  if (type === "radio" || type === "checkbox") return fillRadio(block, result.value);
  if (type === "select") return fillNativeSelect(block, result.value) || fillText(block, result.value);
  return fillText(block, result.value);
}

async function analyzeAndFill() {
  const fields = extractFields();
  if (!fields.length) {
    return { ok: false, error: "No supported form fields were detected on this page." };
  }

  const response = await chrome.runtime.sendMessage({
    type: "FIFO_API",
    method: "POST",
    path: "/match-fields",
    body: { fields }
  });

  if (!response?.ok) {
    return { ok: false, error: response?.error || "Could not reach FiFo AI API." };
  }

  const results = response.data?.results || [];
  let filled = 0;
  let review = 0;
  let missing = 0;
  let unknown = 0;

  for (const result of results) {
    if (result.status === "autofill") {
      if (fillField(result)) filled += 1;
      else review += 1;
    } else if (result.status === "review") {
      review += 1;
    } else if (result.status === "missing") {
      missing += 1;
    } else {
      unknown += 1;
    }
  }

  return {
    ok: true,
    summary: { total: fields.length, filled, review, missing, unknown },
    results
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FIFO_ANALYZE_AND_FILL") return;
  analyzeAndFill()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
