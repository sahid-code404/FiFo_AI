# FiFo AI

FiFo AI is an AI-assisted job/application-form companion. It stores an editable personal profile once, recognizes differently worded questions across company forms, fills high-confidence verified facts, flags unknown or sensitive questions for review, and can use Gemini to draft grounded narrative answers such as 200-word short notes, project descriptions, motivation answers and other general-purpose application responses.

## Current capabilities

- Browser extension for Chrome/Edge/Brave (Manifest V3)
- Works on Google Forms and generic HTTP/HTTPS application pages, not only one fixed form layout
- Generic support for standard HTML forms and many ATS-style React/custom controls
- Embedded application-frame support
- Editable reusable profile for identity, contact, education, employment, availability, location and links
- Semantic alias matching: e.g. `Contact No.`, `Primary mobile`, `Telephone number` -> the same saved phone value
- HTML `autocomplete` semantics when forms provide them
- Optional Gemini semantic classifier for unfamiliar company wording
- Gemini-powered narrative drafting for short notes, project/experience questions, motivation, self-introductions and other open-ended application questions
- Detects common word-limit wording such as `maximum 200 words`, `up to 150 words`, etc.
- Batch AI drafting to reduce latency/API calls when a form has several narrative questions
- PDF resume import and local resume text grounding for AI answers
- Reusable custom answer bank for recurring company-specific fields
- Confidence-based autofill; factual values always come from saved verified profile data
- Sensitive, consent, declaration, salary, legal/eligibility and demographic questions remain review-only
- FastAPI + SQLite local backend
- CI tests for backend matching and extension JavaScript/manifest validation

## Important design rule

FiFo AI separates **understanding the question** from **answering the question**.

For normal factual fields, aliases, HTML metadata or Gemini may identify what a field means. The actual value still comes only from the user's saved profile. If a required personal fact is missing, FiFo reports that it needs user input instead of inventing one.

For narrative questions, Gemini may write a draft using only the saved profile, imported resume text, skills, projects, experience, achievements, career goals and reusable answers. General non-personal questions may be answered normally. Every AI-written answer remains a draft that the user must review.

## Repository layout

```text
apps/
  extension/   Browser extension
  api/         FastAPI backend
```

## Quick start

### API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --reload --port 8000
```

Using `python -m pip` and `python -m uvicorn` ensures the commands come from the active virtual environment instead of Fedora system packages.

### Fedora / Python 3.15 note

FiFo AI intentionally uses base `uvicorn` instead of `uvicorn[standard]`. The optional standard extras include native packages such as `httptools` and `uvloop`; on very new Python versions they may try to compile locally and require Python development headers. They are not required for FiFo AI development.

If an earlier installation failed, recreate the virtual environment before retrying:

```bash
cd apps/api
deactivate 2>/dev/null || true
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Do not install Fedora's `python3-uvicorn` for this project. The project should run entirely from `.venv`.

### Browser extension

Open Chrome/Edge/Brave -> Extensions -> Developer mode -> Load unpacked, then select `apps/extension`.

After pulling an update that changes the manifest or content script, press **Reload** on the FiFo AI extension card and reload the application-form tab once.

The extension expects the local API at `http://localhost:8000` by default.

## Gemini setup

The easiest setup does not require editing `.env`.

1. Create a Gemini API key in Google AI Studio.
2. Open **FiFo AI -> Edit My Profile**.
3. In **Gemini AI**, paste the key.
4. Leave the model as `gemini-3.8-flash` unless you intentionally want another supported Gemini model.
5. Click **Save AI settings**.
6. Click **Test Gemini**.

The extension stores the key with `chrome.storage.local`, not `chrome.storage.sync`. The key is not included in the profile database or Git repository. It is attached by the extension background process only when talking to the configured FiFo API.

You can alternatively configure Gemini server-side in `apps/api/.env`:

```env
GEMINI_API_KEY=your-local-secret
GEMINI_MODEL=gemini-3.8-flash
```

Never commit a real API key.

The optional OpenAI-compatible fallback remains available:

```env
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-local-secret
LLM_MODEL=your-model-name
```

Restart the API after changing `.env`. The `/health` endpoint reports the active AI provider/model, and `/ai/test` verifies that the configured provider can actually generate a response.

## AI answer flow

When **Analyze, Fill & Draft Answers** is pressed:

1. FiFo detects the application fields.
2. Deterministic matching fills verified factual fields.
3. Gemini can classify unfamiliar wording when deterministic matching is insufficient.
4. Empty narrative fields are detected.
5. The form's requested word limit is extracted when possible; otherwise FiFo defaults to 200 words.
6. Gemini drafts answers from the saved profile and resume context.
7. Drafts are inserted into the form for review, never automatically submitted.

Examples include:

- `Short note of maximum 200 words: something you built and what you learned`
- `Tell us about yourself`
- `Describe a project relevant to this role`
- `Why are you interested in this internship?`
- `What did you learn from your team experience?`
- `Summarize your technical skills`
- general non-personal questions that do not require inventing applicant facts

## Form coverage

FiFo's generic detector reads standard `input`, `textarea`, `select`, HTML labels, ARIA labels, placeholders, fieldsets, radio groups, custom combobox/listbox controls and content-editable fields. It is designed to cover different company wording and layouts rather than a single company's form.

Some sites can still require provider-specific adapters, especially forms rendered inside unusual shadow DOM components, heavily customized widgets, cross-origin flows that block extension access, or upload controls. Browsers intentionally do not allow extensions to silently choose local files for file-upload fields; those stay manual/review steps.

## Safety model

FiFo AI auto-fills only high-confidence profile facts. Generated, ambiguous, eligibility, declaration, consent, salary, demographic, legal and unknown answers are surfaced for explicit review. It does not bypass CAPTCHA or anti-bot controls and does not auto-submit forms.
