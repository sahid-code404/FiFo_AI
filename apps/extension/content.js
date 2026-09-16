function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function humanize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableControl(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.matches("input[type='password'], input[type='hidden'], input[type='submit'], input[type='button'], input[type='reset']")) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  return element.matches(
    "input, textarea, select, [role='textbox'], [role='combobox'], [role='radiogroup'], [contenteditable='true']"
  );
}

function textFromAriaLabelledBy(element) {
  const ids = (element.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
}

function uniqueText(parts, limit = 4) {
  const unique = [];
  const seen = new Set();
  for (const part of parts) {
    const cleaned = String(part || "").replace(/\s*\*\s*$/, "").trim();
    const key = normalize(cleaned);
    if (cleaned && key && !seen.has(key)) {
      seen.add(key);
      unique.push(cleaned);
    }
  }
  return unique.slice(0, limit).join(" | ");
}

function labelForControl(element) {
  const parts = [];

  if (element.id) {
    try {
      const explicit = document.querySelector(`label[for='${CSS.escape(element.id)}']`);
      if (explicit?.textContent?.trim()) parts.push(explicit.textContent.trim());
    } catch (_) {}
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel?.textContent?.trim()) parts.push(wrappingLabel.textContent.trim());

  const ariaLabelledBy = textFromAriaLabelledBy(element);
  if (ariaLabelledBy) parts.push(ariaLabelledBy);

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) parts.push(placeholder);

  const name = humanize(element.getAttribute("name"));
  if (name) parts.push(name);

  const id = humanize(element.id);
  if (id) parts.push(id);

  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend")?.textContent?.trim();
  if (legend) parts.unshift(legend);

  return uniqueText(parts);
}

function fieldContainer(control) {
  return control.closest(
    "fieldset, [role='radiogroup'], [role='group'], [data-testid*='field'], [data-testid*='question'], .form-group, .form-field, .field, .question, .application-question"
  ) || control.parentElement || control;
}

function labelForGroup(container, fallbackControl) {
  const parts = [];
  const legend = container.querySelector?.("legend")?.textContent?.trim();
  if (legend) parts.push(legend);

  const labelled = textFromAriaLabelledBy(container);
  if (labelled) parts.push(labelled);

  const aria = container.getAttribute?.("aria-label");
  if (aria) parts.push(aria);

  const heading = container.querySelector?.(
    "[role='heading'], .field-label, .question-label, .application-question-label, h1, h2, h3, h4"
  )?.textContent?.trim();
  if (heading) parts.push(heading);

  const firstLabel = container.querySelector?.("label")?.textContent?.trim();
  if (firstLabel) parts.push(firstLabel);

  const result = uniqueText(parts);
  return result || labelForControl(fallbackControl);
}

function googleQuestionBlocks() {
  const blocks = [...document.querySelectorAll(".Qr7Oae")];
  if (blocks.length) return blocks;
  return [...document.querySelectorAll("[data-params]")].filter((node) =>
    node.querySelector("input, textarea, [role='radiogroup'], [role='listbox']")
  );
}

function findGoogleLabel(block) {
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

function getFieldType(target) {
  const scope = target instanceof HTMLElement ? target : document;
  if (scope.matches?.("input[type='file']") || scope.querySelector?.("input[type='file']")) return "file";
  if (scope.matches?.("textarea") || scope.querySelector?.("textarea")) return "textarea";
  if (scope.matches?.("select") || scope.querySelector?.("select")) return "select";
  if (scope.matches?.("[role='radiogroup']") || scope.querySelector?.("[role='radiogroup']")) return "radio";
  if (scope.matches?.("[role='combobox']") || scope.querySelector?.("[role='combobox'], [role='listbox']")) return "select";
  if (scope.matches?.("[contenteditable='true']")) return "textarea";
  const input = scope.matches?.("input") ? scope : scope.querySelector?.("input");
  return input?.type || "text";
}

function getOptions(target) {
  const scope = target instanceof HTMLElement ? target : document;
  if (scope.matches?.("select")) {
    return [...scope.options].map((option) => option.textContent?.trim() || option.value || "").filter(Boolean);
  }
  return [...scope.querySelectorAll?.("[role='radio'], [role='checkbox'], option, input[type='radio'], input[type='checkbox']") || []]
    .map((node) => {
      if (node instanceof HTMLInputElement) {
        const label = node.id ? document.querySelector(`label[for='${CSS.escape(node.id)}']`) : null;
        return label?.textContent?.trim() || node.closest("label")?.textContent?.trim() || node.value || "";
      }
      return node.textContent?.trim() || node.getAttribute("data-value") || node.getAttribute("aria-label") || node.value || "";
    })
    .filter(Boolean);
}

function extractGoogleFields() {
  return googleQuestionBlocks()
    .map((block, index) => {
      const label = findGoogleLabel(block);
      if (!label) return null;
      const id = `fifo-google-${index}`;
      block.dataset.fifoId = id;
      return {
        id,
        label,
        type: getFieldType(block),
        options: getOptions(block),
        source: "Google Forms",
        autocomplete: block.querySelector("input, textarea")?.getAttribute("autocomplete") || ""
      };
    })
    .filter(Boolean);
}

function formKeyFor(control) {
  const forms = [...document.forms];
  const form = control.closest("form");
  return form ? `form-${Math.max(0, forms.indexOf(form))}` : "page";
}

function groupKeyForControl(control, index) {
  if (control instanceof HTMLInputElement && ["radio", "checkbox"].includes(control.type) && control.name) {
    return `${formKeyFor(control)}:${control.type}:${control.name}`;
  }
  if (control.getAttribute("role") === "radiogroup") {
    return `${formKeyFor(control)}:radiogroup:${index}`;
  }
  return `single:${index}`;
}

function extractGenericFields() {
  const controls = [...document.querySelectorAll(
    "input, textarea, select, [role='textbox'], [role='combobox'], [role='radiogroup'], [contenteditable='true']"
  )].filter(isUsableControl);

  const groups = new Map();
  controls.forEach((control, index) => {
    const key = groupKeyForControl(control, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(control);
  });

  const results = [];
  let seq = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const isNativeChoiceGroup = group.length > 1 && first instanceof HTMLInputElement && ["radio", "checkbox"].includes(first.type);
    const target = isNativeChoiceGroup || first.getAttribute("role") === "radiogroup"
      ? fieldContainer(first)
      : first;

    const label = isNativeChoiceGroup || first.getAttribute("role") === "radiogroup"
      ? labelForGroup(target, first)
      : labelForControl(first);
    if (!label) continue;

    const id = `fifo-generic-${seq++}`;
    target.dataset.fifoId = id;

    const options = isNativeChoiceGroup
      ? group.map((node) => {
          if (node instanceof HTMLInputElement) {
            const explicit = node.id ? document.querySelector(`label[for='${CSS.escape(node.id)}']`) : null;
            return explicit?.textContent?.trim() || node.closest("label")?.textContent?.trim() || node.value || "";
          }
          return node.textContent?.trim() || "";
        }).filter(Boolean)
      : getOptions(target);

    results.push({
      id,
      label,
      type: getFieldType(first),
      options,
      source: "Web/ATS form",
      autocomplete: first.getAttribute("autocomplete") || ""
    });
  }
  return results;
}

function extractFields() {
  const google = extractGoogleFields();
  if (google.length) return google;
  return extractGenericFields();
}

function setNativeValue(element, value) {
  const stringValue = String(value ?? "");
  if (element instanceof HTMLSelectElement) {
    element.value = stringValue;
  } else if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, stringValue);
    else element.value = stringValue;
  } else if (element.getAttribute("contenteditable") === "true") {
    element.textContent = stringValue;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fillText(block, value) {
  const selector = "textarea, input:not([type='file']):not([type='radio']):not([type='checkbox']), [role='textbox'], [contenteditable='true']";
  const element = block.matches?.(selector) ? block : block.querySelector(selector);
  if (!element) return false;
  if (element.getAttribute("type") === "password") return false;
  setNativeValue(element, value);
  return true;
}

function optionTextForInput(input) {
  if (!(input instanceof HTMLInputElement)) return "";
  if (input.id) {
    const label = document.querySelector(`label[for='${CSS.escape(input.id)}']`);
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  return input.closest("label")?.textContent?.trim() || input.value || "";
}

const CHOICE_TOKEN_EXPANSIONS = {
  cse: "computer science engineering",
  cs: "computer science",
  it: "information technology",
  aiml: "artificial intelligence machine learning",
  ai: "artificial intelligence",
  ml: "machine learning",
  ece: "electronics communication engineering",
  ee: "electrical engineering",
  eee: "electrical electronics engineering",
  me: "mechanical engineering",
  mech: "mechanical engineering",
  btech: "bachelor technology",
  bsc: "bachelor science",
  mtech: "master technology",
  msc: "master science"
};

const CHOICE_STOP_WORDS = new Set(["and", "or", "of", "in", "the", "a", "an", "for", "with"]);

function expandedChoice(value) {
  const parts = normalize(value).split(" ").filter(Boolean);
  const expanded = [];
  for (const part of parts) {
    const replacement = CHOICE_TOKEN_EXPANSIONS[part];
    if (replacement) expanded.push(...replacement.split(" "));
    else expanded.push(part);
  }
  return normalize(expanded.join(" "));
}

function choiceTokenSet(value) {
  return new Set(expandedChoice(value).split(" ").filter((token) => token && !CHOICE_STOP_WORDS.has(token)));
}

function choiceAcronym(value) {
  return expandedChoice(value)
    .split(" ")
    .filter((token) => token && !CHOICE_STOP_WORDS.has(token))
    .map((token) => token[0])
    .join("");
}

function choiceScore(option, value) {
  const a = normalize(option);
  const b = normalize(value);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.97;
  if (a.replace(/\s+/g, "") === b.replace(/\s+/g, "")) return 0.96;

  const expandedA = expandedChoice(option);
  const expandedB = expandedChoice(value);
  if (expandedA === expandedB) return 0.96;
  if (expandedA.includes(expandedB) || expandedB.includes(expandedA)) return 0.92;

  const aTokens = choiceTokenSet(option);
  const bTokens = choiceTokenSet(value);
  if (aTokens.size && bTokens.size) {
    let common = 0;
    for (const token of aTokens) if (bTokens.has(token)) common += 1;
    const shorterCoverage = common / Math.min(aTokens.size, bTokens.size);
    const longerCoverage = common / Math.max(aTokens.size, bTokens.size);
    if (shorterCoverage === 1 && longerCoverage >= 0.5) return 0.90;
    if (shorterCoverage >= 0.75 && longerCoverage >= 0.5) return 0.82;
  }

  const acronymA = choiceAcronym(option);
  const acronymB = choiceAcronym(value);
  const compactA = a.replace(/\s+/g, "");
  const compactB = b.replace(/\s+/g, "");
  if (acronymA && (acronymA === compactB || acronymA === acronymB)) return 0.86;
  if (acronymB && acronymB === compactA) return 0.86;

  return 0;
}

function choiceEquals(option, value) {
  return choiceScore(option, value) >= 0.80;
}

function bestMatchingNode(nodes, textForNode, value) {
  let best = null;
  let bestScore = 0;
  for (const node of nodes) {
    const score = choiceScore(textForNode(node), value);
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return bestScore >= 0.80 ? best : null;
}

function fillChoice(block, value) {
  const ariaChoices = [...block.querySelectorAll?.("[role='radio'], [role='checkbox']") || []];
  const nativeChoices = [...block.querySelectorAll?.("input[type='radio'], input[type='checkbox']") || []];

  const ariaMatch = bestMatchingNode(
    ariaChoices,
    (choice) => choice.textContent || choice.getAttribute("data-value") || choice.getAttribute("aria-label") || "",
    value
  );
  if (ariaMatch) {
    ariaMatch.click();
    return true;
  }

  const nativeMatch = bestMatchingNode(nativeChoices, optionTextForInput, value);
  if (nativeMatch) {
    nativeMatch.click();
    return true;
  }
  return false;
}

function fillNativeSelect(block, value) {
  const select = block.matches?.("select") ? block : block.querySelector?.("select");
  if (!select) return false;
  const option = bestMatchingNode(
    [...select.options],
    (candidate) => candidate.textContent || candidate.value,
    value
  );
  if (!option) return false;
  select.value = option.value;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

async function fillAriaSelect(block, value) {
  const trigger = block.matches?.("[role='combobox'], [role='listbox']")
    ? block
    : block.querySelector?.("[role='combobox'], [role='listbox']");
  if (!trigger) return false;

  trigger.click();
  await new Promise((resolve) => setTimeout(resolve, 180));

  const options = [...document.querySelectorAll("[role='option']")]
    .filter((option) => option.getAttribute("aria-disabled") !== "true");
  const match = bestMatchingNode(
    options,
    (option) => option.textContent || option.getAttribute("data-value") || option.getAttribute("aria-label") || "",
    value
  );
  if (!match) {
    document.body.click();
    return false;
  }
  match.click();
  return true;
}

async function fillField(result) {
  const block = document.querySelector(`[data-fifo-id='${CSS.escape(result.id)}']`);
  if (!block || result.value === undefined || result.value === null) return false;
  const type = getFieldType(block);
  if (type === "file" || type === "password") return false;
  if (type === "radio" || type === "checkbox") return fillChoice(block, result.value);
  if (type === "select") {
    return fillNativeSelect(block, result.value) || await fillAriaSelect(block, result.value) || fillText(block, result.value);
  }
  return fillText(block, result.value);
}

async function analyzeAndFill() {
  const fields = extractFields();
  if (!fields.length) {
    return { ok: false, error: "No supported application fields were detected on this page." };
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
      if (await fillField(result)) filled += 1;
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
    source: fields[0]?.source || "web form",
    summary: { total: fields.length, filled, review, missing, unknown },
    semantic_ai: response.data?.semantic_ai || { configured: false, used: false },
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