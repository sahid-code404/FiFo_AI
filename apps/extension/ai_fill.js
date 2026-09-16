function fifoAiNormalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fifoAiHumanize(value) {
  return String(value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fifoAiLabelFor(element) {
  const parts = [];

  if (element.id) {
    try {
      const explicit = document.querySelector(`label[for='${CSS.escape(element.id)}']`);
      if (explicit?.textContent?.trim()) parts.push(explicit.textContent.trim());
    } catch (_) {}
  }

  const wrapping = element.closest("label");
  if (wrapping?.textContent?.trim()) parts.push(wrapping.textContent.trim());

  const labelledBy = (element.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter(Boolean)
    .join(" ");
  if (labelledBy) parts.push(labelledBy);

  for (const attr of ["aria-label", "placeholder"]) {
    const value = element.getAttribute(attr);
    if (value) parts.push(value);
  }

  const name = fifoAiHumanize(element.getAttribute("name"));
  const id = fifoAiHumanize(element.id);
  if (name) parts.push(name);
  if (id) parts.push(id);

  const container = element.closest(
    "fieldset, [role='group'], [data-testid*='field'], [data-testid*='question'], .form-group, .form-field, .field, .question, .application-question, .Qr7Oae"
  );
  if (container) {
    const prompt = container.querySelector(
      "legend, [role='heading'], .field-label, .question-label, .application-question-label, .M7eMe, h1, h2, h3, h4"
    )?.textContent?.trim();
    if (prompt) parts.unshift(prompt);
  }

  const seen = new Set();
  const unique = [];
  for (const part of parts) {
    const cleaned = String(part || "").replace(/\s*\*\s*$/, "").trim();
    const key = fifoAiNormalize(cleaned);
    if (cleaned && key && !seen.has(key)) {
      seen.add(key);
      unique.push(cleaned);
    }
  }
  return unique.slice(0, 4).join(" | ");
}

const FIFO_AI_NARRATIVE_TERMS = [
  "short note", "write a note", "describe", "explain", "tell us", "tell me", "about yourself",
  "why do you", "why should", "why are you", "why this", "motivation", "cover letter", "statement",
  "project", "experience", "achievement", "accomplishment", "strength", "weakness", "what did you learn",
  "what have you learned", "example of", "give an example", "how would you", "how do you", "summary",
  "career objective", "objective", "responsibilities", "role and responsibility", "essay", "additional information",
  "anything else", "skills relevant", "interest in", "reason for applying", "introduce yourself"
];

const FIFO_AI_BLOCKED_TERMS = [
  "consent", "declaration", "declare", "agree", "terms and conditions", "privacy policy",
  "salary", "ctc", "compensation", "expected pay", "backlog", "arrear", "disability",
  "category", "caste", "religion", "criminal", "visa", "work authorization", "sponsorship",
  "relocation", "relocate", "bond", "conflict of interest", "legal", "background check",
  "willing to", "comfortable with", "notice buyout"
];

function fifoAiIsSensitive(label) {
  const normalized = fifoAiNormalize(label);
  return FIFO_AI_BLOCKED_TERMS.some((term) => normalized.includes(fifoAiNormalize(term)));
}

function fifoAiIsNarrative(element, label) {
  const normalized = fifoAiNormalize(label);
  if (element instanceof HTMLTextAreaElement || element.getAttribute("contenteditable") === "true") return true;
  return FIFO_AI_NARRATIVE_TERMS.some((term) => normalized.includes(fifoAiNormalize(term)));
}

function fifoAiValue(element) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value.trim();
  if (element.getAttribute("contenteditable") === "true") return (element.textContent || "").trim();
  return "";
}

function fifoAiWordLimit(label) {
  const text = String(label || "");
  const patterns = [
    /(?:maximum|max|up\s*to|not\s+more\s+than|within)\s*(?:of\s*)?(\d{1,3})\s*words?/i,
    /(\d{1,3})\s*words?\s*(?:maximum|max|limit)?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.max(20, Math.min(Number(match[1]) || 200, 500));
  }
  return 200;
}

function fifoAiCandidates() {
  const controls = [...document.querySelectorAll(
    "textarea, input[type='text'], input:not([type]), [role='textbox'], [contenteditable='true']"
  )];

  const fields = [];
  let index = 0;
  for (const element of controls) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true") continue;
    if (fifoAiValue(element)) continue;

    const label = fifoAiLabelFor(element);
    if (!label || fifoAiIsSensitive(label) || !fifoAiIsNarrative(element, label)) continue;

    const id = `fifo-ai-${index++}`;
    element.dataset.fifoAiId = id;
    fields.push({ id, question: label, max_words: fifoAiWordLimit(label) });
    if (fields.length >= 12) break;
  }
  return fields;
}

function fifoAiSetValue(element, value) {
  const text = String(value || "");
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) descriptor.set.call(element, text);
    else element.value = text;
  } else if (element.getAttribute("contenteditable") === "true") {
    element.textContent = text;
  } else {
    return false;
  }

  element.dataset.fifoAiDraft = "true";
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function fifoAiPageContext() {
  const headings = [...document.querySelectorAll("h1, h2, [role='heading']")]
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");
  return [document.title, location.hostname, headings].filter(Boolean).join(" | ").slice(0, 1500);
}

async function fifoGenerateAiDrafts() {
  const fields = fifoAiCandidates();
  if (!fields.length) {
    return { ok: true, attempted: 0, drafted: 0, needs_input: 0, answers: [] };
  }

  const response = await chrome.runtime.sendMessage({
    type: "FIFO_API",
    method: "POST",
    path: "/generate-answers",
    body: { fields, context: fifoAiPageContext() }
  });

  if (!response?.ok) {
    return { ok: false, error: response?.error || "AI answer generation failed." };
  }
  if (response.data?.status === "not_configured") {
    return { ok: true, attempted: fields.length, drafted: 0, needs_input: 0, not_configured: true, answers: [] };
  }

  const answers = response.data?.answers || [];
  let drafted = 0;
  let needsInput = 0;

  for (const answer of answers) {
    if (answer.status === "needs_user_input") {
      needsInput += 1;
      continue;
    }
    if (answer.status !== "draft" || !answer.answer) continue;
    const target = document.querySelector(`[data-fifo-ai-id='${CSS.escape(answer.id)}']`);
    if (target && fifoAiSetValue(target, answer.answer)) drafted += 1;
  }

  return {
    ok: true,
    attempted: fields.length,
    drafted,
    needs_input: needsInput,
    provider: response.data?.provider || null,
    answers,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FIFO_GENERATE_AI_DRAFTS") return;
  fifoGenerateAiDrafts()
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: String(error) }));
  return true;
});
