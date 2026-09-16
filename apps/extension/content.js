const FIFO_MAX_PASSES = 4;
const FIFO_INTERACTION_DELAY_MS = 220;

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function humanize(value) {
  return String(value || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function deepQuerySelectorAll(selector, root = document) {
  const results = [];
  const visit = (node) => {
    if (!node?.querySelectorAll) return;
    for (const match of node.querySelectorAll(selector)) results.push(match);
    for (const host of node.querySelectorAll("*")) if (host.shadowRoot) visit(host.shadowRoot);
  };
  visit(root);
  return [...new Set(results)];
}

function deepQuerySelector(selector, root = document) {
  return deepQuerySelectorAll(selector, root)[0] || null;
}

function rootGetById(element, id) {
  const root = element?.getRootNode?.();
  if (root?.getElementById) {
    const found = root.getElementById(id);
    if (found) return found;
  }
  return document.getElementById(id);
}

function isVisible(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
  const style = getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}

function isUsableControl(element) {
  if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
  if (element.matches("input[type='password'], input[type='hidden'], input[type='submit'], input[type='button'], input[type='reset']")) return false;
  if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") return false;
  return element.matches("input, textarea, select, [role='textbox'], [role='combobox'], [role='listbox'], [role='radiogroup'], [role='checkbox'], [role='slider'], [role='spinbutton'], [contenteditable='true']");
}

function textFromAriaLabelledBy(element) {
  const ids = (element.getAttribute?.("aria-labelledby") || "").split(/\s+/).filter(Boolean);
  return ids.map((id) => rootGetById(element, id)?.textContent?.trim()).filter(Boolean).join(" ");
}

function uniqueText(parts, limit = 5) {
  const unique = [];
  const seen = new Set();
  for (const part of parts) {
    const cleaned = String(part || "").replace(/\s*\*\s*$/, "").trim();
    const key = normalize(cleaned);
    if (cleaned && key && !seen.has(key)) { seen.add(key); unique.push(cleaned); }
  }
  return unique.slice(0, limit).join(" | ");
}

function labelForControl(element) {
  const parts = [];
  if (element.id) {
    try {
      const root = element.getRootNode?.() || document;
      const explicit = root.querySelector?.(`label[for='${CSS.escape(element.id)}']`) || document.querySelector(`label[for='${CSS.escape(element.id)}']`);
      if (explicit?.textContent?.trim()) parts.push(explicit.textContent.trim());
    } catch (_) {}
  }
  const wrappingLabel = element.closest?.("label");
  if (wrappingLabel?.textContent?.trim()) parts.push(wrappingLabel.textContent.trim());
  const labelled = textFromAriaLabelledBy(element);
  if (labelled) parts.push(labelled);
  for (const attr of ["aria-label", "placeholder"]) {
    const value = element.getAttribute?.(attr);
    if (value) parts.push(value);
  }
  const name = humanize(element.getAttribute?.("name"));
  const id = humanize(element.id);
  if (name) parts.push(name);
  if (id) parts.push(id);
  const fieldset = element.closest?.("fieldset");
  const legend = fieldset?.querySelector("legend")?.textContent?.trim();
  if (legend) parts.unshift(legend);
  const container = element.closest?.("[role='group'], [data-testid*='field'], [data-testid*='question'], .form-group, .form-field, .field, .question, .application-question, .Qr7Oae");
  const heading = container?.querySelector?.("legend, [role='heading'], .field-label, .question-label, .application-question-label, .M7eMe, h1, h2, h3, h4")?.textContent?.trim();
  if (heading) parts.unshift(heading);
  return uniqueText(parts);
}

function fieldContainer(control) {
  return control.closest?.("fieldset, [role='radiogroup'], [role='group'], [data-testid*='field'], [data-testid*='question'], .form-group, .form-field, .field, .question, .application-question, .Qr7Oae") || control.parentElement || control;
}

function labelForGroup(container, fallbackControl) {
  const parts = [];
  const legend = container.querySelector?.("legend")?.textContent?.trim();
  if (legend) parts.push(legend);
  const labelled = textFromAriaLabelledBy(container);
  if (labelled) parts.push(labelled);
  const aria = container.getAttribute?.("aria-label");
  if (aria) parts.push(aria);
  const heading = container.querySelector?.("[role='heading'], .field-label, .question-label, .application-question-label, .M7eMe, h1, h2, h3, h4")?.textContent?.trim();
  if (heading) parts.push(heading);
  const firstLabel = container.querySelector?.("label")?.textContent?.trim();
  if (firstLabel) parts.push(firstLabel);
  return uniqueText(parts) || labelForControl(fallbackControl);
}

function googleQuestionBlocks() {
  const blocks = [...document.querySelectorAll(".Qr7Oae")].filter(isVisible);
  if (blocks.length) return blocks;
  return [...document.querySelectorAll("[data-params]")].filter((node) => isVisible(node) && node.querySelector("input, textarea, [role='radiogroup'], [role='listbox'], [role='checkbox'], [role='slider']"));
}

function findGoogleLabel(block) {
  for (const selector of [".M7eMe", "[role='heading']", "label", ".freebirdFormviewerComponentsQuestionBaseTitle"]) {
    const text = block.querySelector(selector)?.textContent?.trim();
    if (text) return text.replace(/\s*\*\s*$/, "").trim();
  }
  return "";
}

function inputType(target) {
  const input = target?.matches?.("input") ? target : target?.querySelector?.("input");
  return input?.type || "";
}

function getFieldType(target) {
  const scope = target instanceof HTMLElement ? target : document;
  if (scope.matches?.("input[type='file']") || scope.querySelector?.("input[type='file']")) return "file";
  if (scope.matches?.("textarea") || scope.querySelector?.("textarea")) return "textarea";
  if (scope.matches?.("select") || scope.querySelector?.("select")) return "select";
  if (scope.matches?.("[role='slider']") || scope.querySelector?.("[role='slider']") || scope.matches?.("input[type='range']") || scope.querySelector?.("input[type='range']")) return "scale";
  if (scope.matches?.("[role='radiogroup']") || scope.querySelector?.("[role='radiogroup']")) return "radio";
  if (scope.matches?.("[role='checkbox']") || scope.querySelector?.("[role='checkbox'], input[type='checkbox']")) return "checkbox";
  if (scope.matches?.("[role='combobox'], [role='listbox']") || scope.querySelector?.("[role='combobox'], [role='listbox']")) return "select";
  if (scope.matches?.("[contenteditable='true']")) return "textarea";
  const type = inputType(scope);
  if (["date", "datetime-local", "month", "week", "time", "number", "email", "tel", "url"].includes(type)) return type;
  return type || "text";
}

function optionTextForInput(input) {
  if (!(input instanceof HTMLInputElement)) return "";
  if (input.id) {
    try {
      const root = input.getRootNode?.() || document;
      const label = root.querySelector?.(`label[for='${CSS.escape(input.id)}']`) || document.querySelector(`label[for='${CSS.escape(input.id)}']`);
      if (label?.textContent?.trim()) return label.textContent.trim();
    } catch (_) {}
  }
  return input.closest("label")?.textContent?.trim() || input.value || input.getAttribute("aria-label") || "";
}

function dedupeStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const key = normalize(text);
    if (text && key && !seen.has(key)) { seen.add(key); output.push(text); }
  }
  return output;
}

function getOptions(target) {
  const scope = target instanceof HTMLElement ? target : document;
  if (scope.matches?.("select")) return dedupeStrings([...scope.options].map((option) => option.textContent?.trim() || option.value || ""));
  const nodes = [...(scope.matches?.("[role='radio'], [role='checkbox'], option") ? [scope] : []), ...scope.querySelectorAll?.("[role='radio'], [role='checkbox'], option, input[type='radio'], input[type='checkbox']") || []];
  return dedupeStrings(nodes.map((node) => node instanceof HTMLInputElement ? optionTextForInput(node) : node.textContent?.trim() || node.getAttribute("data-value") || node.getAttribute("aria-label") || node.value || ""));
}

function rowLabelForGoogleGroup(questionLabel, group, index) {
  const parts = [questionLabel];
  const labelled = textFromAriaLabelledBy(group);
  if (labelled) parts.push(labelled);
  const aria = group.getAttribute?.("aria-label");
  if (aria) parts.push(aria);
  const parent = group.parentElement;
  if (parent) {
    const candidates = [...parent.children].filter((child) => child !== group && !child.querySelector?.("[role='radio'], [role='checkbox']")).map((child) => child.textContent?.trim()).filter(Boolean);
    if (candidates.length) parts.push(candidates[0]);
  }
  return uniqueText(parts) || `${questionLabel} | row ${index + 1}`;
}

function extractGoogleFields() {
  const results = [];
  let seq = 0;
  for (const block of googleQuestionBlocks()) {
    const questionLabel = findGoogleLabel(block);
    if (!questionLabel) continue;
    const radioGroups = [...block.querySelectorAll("[role='radiogroup']")].filter(isVisible);
    if (radioGroups.length > 1) {
      radioGroups.forEach((group, index) => {
        const id = `fifo-google-${seq++}`;
        group.dataset.fifoId = id;
        results.push({ id, label: rowLabelForGoogleGroup(questionLabel, group, index), type: "radio", options: getOptions(group), source: "Google Forms", autocomplete: "" });
      });
      continue;
    }
    const checkboxGroups = [...block.querySelectorAll("[role='group']")].filter((group) => isVisible(group) && group.querySelectorAll("[role='checkbox'], input[type='checkbox']").length > 0);
    if (checkboxGroups.length > 1) {
      checkboxGroups.forEach((group, index) => {
        const id = `fifo-google-${seq++}`;
        group.dataset.fifoId = id;
        results.push({ id, label: rowLabelForGoogleGroup(questionLabel, group, index), type: "checkbox", options: getOptions(group), source: "Google Forms", autocomplete: "" });
      });
      continue;
    }
    const id = `fifo-google-${seq++}`;
    block.dataset.fifoId = id;
    results.push({ id, label: questionLabel, type: getFieldType(block), options: getOptions(block), source: "Google Forms", autocomplete: block.querySelector("input, textarea")?.getAttribute("autocomplete") || "" });
  }
  return results;
}

function formKeyFor(control) {
  const forms = [...document.forms];
  const form = control.closest?.("form");
  return form ? `form-${Math.max(0, forms.indexOf(form))}` : "page";
}

function groupKeyForControl(control, index) {
  if (control instanceof HTMLInputElement && ["radio", "checkbox"].includes(control.type) && control.name) return `${formKeyFor(control)}:${control.type}:${control.name}`;
  if (["radiogroup", "group"].includes(control.getAttribute?.("role"))) return `${formKeyFor(control)}:${control.getAttribute("role")}:${control.getAttribute("aria-labelledby") || control.id || index}`;
  return `single:${index}`;
}

function extractGenericFields() {
  const controls = deepQuerySelectorAll("input, textarea, select, [role='textbox'], [role='combobox'], [role='listbox'], [role='radiogroup'], [role='checkbox'], [role='slider'], [role='spinbutton'], [contenteditable='true']").filter(isUsableControl);
  const groups = new Map();
  controls.forEach((control, index) => {
    if (control.getAttribute?.("role") === "checkbox" && control.closest?.("[role='group']")) return;
    const key = groupKeyForControl(control, index);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(control);
  });
  const results = [];
  let seq = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const isNativeChoiceGroup = group.length > 1 && first instanceof HTMLInputElement && ["radio", "checkbox"].includes(first.type);
    const isAriaGroup = ["radiogroup", "group"].includes(first.getAttribute?.("role"));
    const target = isNativeChoiceGroup || isAriaGroup ? fieldContainer(first) : first;
    const label = isNativeChoiceGroup || isAriaGroup ? labelForGroup(target, first) : labelForControl(first);
    if (!label) continue;
    const id = `fifo-generic-${seq++}`;
    target.dataset.fifoId = id;
    const options = isNativeChoiceGroup ? dedupeStrings(group.map((node) => optionTextForInput(node))) : getOptions(target);
    results.push({ id, label, type: isNativeChoiceGroup ? first.type : getFieldType(first), options, source: "Web/ATS form", autocomplete: first.getAttribute?.("autocomplete") || "" });
  }
  return results;
}

function extractFields() {
  const google = extractGoogleFields();
  return google.length ? google : extractGenericFields();
}

function findFifoTarget(id) {
  try { return deepQuerySelector(`[data-fifo-id='${CSS.escape(id)}']`); } catch (_) { return null; }
}

function dispatchFrameworkEvents(element) {
  for (const type of ["input", "change", "keyup", "blur"]) {
    try { element.dispatchEvent(new Event(type, { bubbles: true, composed: true })); } catch (_) {}
  }
}

function setNativeValue(element, value) {
  const stringValue = String(value ?? "");
  if (element instanceof HTMLSelectElement) element.value = stringValue;
  else if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, stringValue); else element.value = stringValue;
  } else if (element.getAttribute?.("contenteditable") === "true") element.textContent = stringValue;
  else return false;
  dispatchFrameworkEvents(element);
  return true;
}

function fillText(block, value) {
  const selector = "textarea, input:not([type='file']):not([type='radio']):not([type='checkbox']):not([type='range']), [role='textbox'], [role='spinbutton'], [contenteditable='true']";
  const element = block.matches?.(selector) ? block : deepQuerySelector(selector, block);
  if (!element || element.getAttribute?.("type") === "password") return false;
  element.scrollIntoView?.({ block: "center", inline: "nearest" });
  return setNativeValue(element, value);
}

const CHOICE_TOKEN_EXPANSIONS = {
  cse: "computer science engineering", cs: "computer science", it: "information technology",
  aiml: "artificial intelligence machine learning", ai: "artificial intelligence", ml: "machine learning",
  ece: "electronics communication engineering", ee: "electrical engineering", eee: "electrical electronics engineering",
  me: "mechanical engineering", mech: "mechanical engineering", btech: "bachelor technology", bsc: "bachelor science",
  mtech: "master technology", msc: "master science", final: "final senior", senior: "final senior", fresher: "zero experience"
};
const CHOICE_STOP_WORDS = new Set(["and", "or", "of", "in", "the", "a", "an", "for", "with", "year"]);

function expandedChoice(value) {
  const expanded = [];
  for (const part of normalize(value).split(" ").filter(Boolean)) {
    const replacement = CHOICE_TOKEN_EXPANSIONS[part];
    if (replacement) expanded.push(...replacement.split(" ")); else expanded.push(part);
  }
  return normalize(expanded.join(" "));
}

function choiceTokenSet(value) { return new Set(expandedChoice(value).split(" ").filter((token) => token && !CHOICE_STOP_WORDS.has(token))); }
function choiceAcronym(value) { return expandedChoice(value).split(" ").filter((token) => token && !CHOICE_STOP_WORDS.has(token)).map((token) => token[0]).join(""); }

function choiceScore(option, value) {
  const a = normalize(option), b = normalize(value);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const yesSet = new Set(["yes", "true", "y", "1"]), noSet = new Set(["no", "false", "n", "0"]);
  if ((yesSet.has(a) && yesSet.has(b)) || (noSet.has(a) && noSet.has(b))) return 1;
  if (a.includes(b) || b.includes(a)) return 0.97;
  if (a.replace(/\s+/g, "") === b.replace(/\s+/g, "")) return 0.96;
  const expandedA = expandedChoice(option), expandedB = expandedChoice(value);
  if (expandedA === expandedB) return 0.96;
  if (expandedA.includes(expandedB) || expandedB.includes(expandedA)) return 0.92;
  const aTokens = choiceTokenSet(option), bTokens = choiceTokenSet(value);
  if (aTokens.size && bTokens.size) {
    let common = 0;
    for (const token of aTokens) if (bTokens.has(token)) common += 1;
    const shorter = common / Math.min(aTokens.size, bTokens.size), longer = common / Math.max(aTokens.size, bTokens.size);
    if (shorter === 1 && longer >= 0.5) return 0.90;
    if (shorter >= 0.75 && longer >= 0.5) return 0.82;
  }
  const acronymA = choiceAcronym(option), acronymB = choiceAcronym(value), compactA = a.replace(/\s+/g, ""), compactB = b.replace(/\s+/g, "");
  if (acronymA && (acronymA === compactB || acronymA === acronymB)) return 0.86;
  if (acronymB && acronymB === compactA) return 0.86;
  return 0;
}

function bestMatchingNode(nodes, textForNode, value, minimum = 0.80) {
  let best = null, bestScore = 0;
  for (const node of nodes) {
    const score = choiceScore(textForNode(node), value);
    if (score > bestScore) { best = node; bestScore = score; }
  }
  return bestScore >= minimum ? best : null;
}

function normalizeValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "boolean") return [value ? "Yes" : "No"];
  const text = String(value ?? "").trim();
  return text ? text.split(/\s*(?:,|;|\||\n)\s*/).filter(Boolean) : [];
}

function fillRadio(block, value) {
  const targetValue = normalizeValues(value)[0];
  if (!targetValue) return false;
  const aria = deepQuerySelectorAll("[role='radio']", block).filter(isVisible);
  const native = deepQuerySelectorAll("input[type='radio']", block).filter(isVisible);
  const ariaMatch = bestMatchingNode(aria, (choice) => choice.textContent || choice.getAttribute("data-value") || choice.getAttribute("aria-label") || "", targetValue);
  if (ariaMatch) { ariaMatch.scrollIntoView?.({ block: "center" }); ariaMatch.click(); return true; }
  const nativeMatch = bestMatchingNode(native, optionTextForInput, targetValue);
  if (nativeMatch) { nativeMatch.scrollIntoView?.({ block: "center" }); nativeMatch.click(); return true; }
  return false;
}

function fillCheckboxes(block, value) {
  const values = normalizeValues(value);
  if (!values.length) return false;
  const aria = deepQuerySelectorAll("[role='checkbox']", block).filter(isVisible);
  const native = deepQuerySelectorAll("input[type='checkbox']", block).filter(isVisible);
  let changed = 0;
  for (const targetValue of values) {
    const ariaMatch = bestMatchingNode(aria, (choice) => choice.textContent || choice.getAttribute("data-value") || choice.getAttribute("aria-label") || "", targetValue);
    if (ariaMatch) { if (ariaMatch.getAttribute("aria-checked") !== "true") ariaMatch.click(); changed += 1; continue; }
    const nativeMatch = bestMatchingNode(native, optionTextForInput, targetValue);
    if (nativeMatch) { if (!nativeMatch.checked) nativeMatch.click(); changed += 1; }
  }
  return changed > 0;
}

function fillNativeSelect(block, value) {
  const select = block.matches?.("select") ? block : deepQuerySelector("select", block);
  if (!select) return false;
  const values = normalizeValues(value);
  if (!values.length) return false;
  if (select.multiple) {
    let changed = false;
    for (const option of select.options) option.selected = false;
    for (const targetValue of values) {
      const option = bestMatchingNode([...select.options], (candidate) => candidate.textContent || candidate.value, targetValue);
      if (option) { option.selected = true; changed = true; }
    }
    if (changed) dispatchFrameworkEvents(select);
    return changed;
  }
  const option = bestMatchingNode([...select.options], (candidate) => candidate.textContent || candidate.value, values[0]);
  if (!option) return false;
  select.value = option.value;
  dispatchFrameworkEvents(select);
  return true;
}

async function waitForAriaOptions(timeoutMs = 1600) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const options = deepQuerySelectorAll("[role='option']").filter((option) => isVisible(option) && option.getAttribute("aria-disabled") !== "true");
    if (options.length) return options;
    await sleep(80);
  }
  return [];
}

async function fillAriaSelect(block, value) {
  const trigger = block.matches?.("[role='combobox'], [role='listbox']") ? block : deepQuerySelector("[role='combobox'], [role='listbox']", block);
  if (!trigger) return false;
  const values = normalizeValues(value);
  if (!values.length) return false;
  let selected = 0;
  for (const targetValue of values) {
    trigger.scrollIntoView?.({ block: "center" });
    trigger.click();
    const options = await waitForAriaOptions();
    const match = bestMatchingNode(options, (option) => option.textContent || option.getAttribute("data-value") || option.getAttribute("aria-label") || "", targetValue);
    if (!match) { try { document.body.click(); } catch (_) {} if (values.length === 1) return false; continue; }
    match.scrollIntoView?.({ block: "nearest" });
    match.click(); selected += 1; await sleep(120);
  }
  return selected > 0;
}

function fillScale(block, value) {
  const numeric = Number(String(value ?? "").match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(numeric)) return false;
  const range = block.matches?.("input[type='range']") ? block : deepQuerySelector("input[type='range']", block);
  if (range) {
    const min = Number(range.min || 0), max = Number(range.max || 100);
    return setNativeValue(range, Math.max(min, Math.min(max, numeric)));
  }
  return fillRadio(block, String(numeric));
}

async function fillField(result, field) {
  const block = findFifoTarget(result.id);
  if (!block || result.value === undefined || result.value === null) return false;
  const type = field?.type || getFieldType(block);
  if (type === "file" || type === "password") return false;
  if (type === "radio") return fillRadio(block, result.value);
  if (type === "checkbox") return fillCheckboxes(block, result.value);
  if (type === "scale" || type === "range") return fillScale(block, result.value);
  if (type === "select") return fillNativeSelect(block, result.value) || await fillAriaSelect(block, result.value) || fillText(block, result.value);
  return fillText(block, result.value);
}

function fieldSignature(field) {
  return [field.source, normalize(field.label), field.type, ...(field.options || []).map(normalize)].join("|");
}

async function analyzeOnePass() {
  const fields = extractFields();
  if (!fields.length) return { fields: [], results: [], semantic_ai: { configured: false, used: false } };
  const response = await chrome.runtime.sendMessage({ type: "FIFO_API", method: "POST", path: "/match-fields", body: { fields } });
  if (!response?.ok) throw new Error(response?.error || "Could not reach FiFo AI API.");
  return { fields, results: response.data?.results || [], semantic_ai: response.data?.semantic_ai || { configured: false, used: false } };
}

async function analyzeAndFill() {
  const statusBySignature = new Map();
  const filledSignatures = new Set();
  let semanticAi = { configured: false, used: false }, source = "web form", everDetected = false;

  for (let pass = 0; pass < FIFO_MAX_PASSES; pass += 1) {
    const { fields, results, semantic_ai } = await analyzeOnePass();
    if (!fields.length) break;
    everDetected = true;
    source = fields[0]?.source || source;
    semanticAi = semantic_ai;
    const fieldById = new Map(fields.map((field) => [field.id, field]));
    let changedThisPass = 0;

    for (const field of fields) {
      const sig = fieldSignature(field);
      if (field.type === "file") statusBySignature.set(sig, "manual");
    }

    for (const result of results) {
      const field = fieldById.get(result.id);
      if (!field) continue;
      const sig = fieldSignature(field);
      if (field.type === "file") { statusBySignature.set(sig, "manual"); continue; }
      if (result.status === "autofill") {
        if (filledSignatures.has(sig)) { statusBySignature.set(sig, "filled"); continue; }
        if (await fillField(result, field)) {
          filledSignatures.add(sig); statusBySignature.set(sig, "filled"); changedThisPass += 1;
        } else statusBySignature.set(sig, "review");
      } else statusBySignature.set(sig, result.status || "unknown");
    }

    if (!changedThisPass) break;
    await sleep(FIFO_INTERACTION_DELAY_MS);
  }

  if (!everDetected) return { ok: false, error: "No supported application fields were detected on this page." };

  const summary = { total: statusBySignature.size, filled: 0, review: 0, missing: 0, unknown: 0, manual: 0 };
  for (const status of statusBySignature.values()) {
    if (status === "filled") summary.filled += 1;
    else if (status === "review") summary.review += 1;
    else if (status === "missing") summary.missing += 1;
    else if (status === "manual") summary.manual += 1;
    else summary.unknown += 1;
  }

  return {
    ok: true, source, summary, semantic_ai: semanticAi,
    interactions: { text: true, textarea: true, dropdown: true, radio: true, checkbox: true, linear_scale: true, date_time: true, grids: true, dynamic_questions: true, shadow_dom: true, iframe: true, file_upload: "manual" }
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FIFO_ANALYZE_AND_FILL") return;
  analyzeAndFill().then(sendResponse).catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});