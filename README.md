# FiFo AI

FiFo AI is an AI-assisted job/application-form companion. It stores an editable personal profile once, recognizes differently worded questions across company forms, fills high-confidence verified facts, flags unknown or sensitive questions for review, and can optionally use an LLM to understand unfamiliar field wording without allowing the model to invent factual answers.

## Current capabilities

- Browser extension for Chrome/Edge/Brave (Manifest V3)
- Works on Google Forms and generic HTTP/HTTPS application pages, not only one fixed form layout
- Generic support for standard HTML forms and many ATS-style React/custom controls
- Embedded application-frame support
- Editable reusable profile for identity, contact, education, employment, availability, location and links
- Semantic alias matching: e.g. `Contact No.`, `Primary mobile`, `Telephone number` -> the same saved phone value
- HTML `autocomplete` semantics when forms provide them
- Optional AI semantic classifier for unfamiliar company wording
- Reusable custom answer bank for recurring company-specific fields
- Confidence-based autofill; factual values always come from saved verified profile data
- Sensitive, subjective, consent, declaration, salary, legal/eligibility and demographic questions remain review-only
- PDF resume inspection with conservative contact extraction
- FastAPI + SQLite local backend
- CI tests for backend matching and extension JavaScript/manifest validation

## Important design rule

FiFo AI separates **understanding the question** from **answering the question**.

For normal factual fields, the system may use aliases, HTML metadata or an optional LLM to identify what a field means. The value itself is still taken only from the user's saved profile. If that value is missing, FiFo reports it as missing instead of generating one.

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

## Optional AI semantic matching

Deterministic aliases work without any AI key. To enable semantic interpretation of unfamiliar field wording, configure any OpenAI-compatible chat-completions provider in `apps/api/.env`:

```env
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=your-local-secret
LLM_MODEL=your-model-name
```

Restart the API after changing `.env`. The `/health` endpoint reports whether semantic AI is configured.

The classifier receives field labels/options and the list of allowed profile keys, but not the user's actual profile values. Its output is treated as a field classification only. High confidence is required before autofill; medium-confidence matches remain review-only.

## Form coverage

FiFo's generic detector reads standard `input`, `textarea`, `select`, HTML labels, ARIA labels, placeholders, fieldsets, radio groups, custom combobox/listbox controls and content-editable fields. It is designed to cover different company wording and layouts rather than a single company's form.

Some sites can still require provider-specific adapters, especially forms rendered inside unusual shadow DOM components, heavily customized widgets, cross-origin flows that block extension access, or upload controls. Browsers intentionally do not allow extensions to silently choose local files for file-upload fields; those stay manual/review steps.

## Safety model

FiFo AI auto-fills only high-confidence profile facts. Generated, ambiguous, eligibility, declaration, consent, salary, demographic, legal and unknown answers are surfaced for explicit review. It does not bypass CAPTCHA or anti-bot controls and does not auto-submit forms.
