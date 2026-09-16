# FiFo AI

FiFo AI is an AI-assisted application-form companion for students. It stores an editable personal profile once, understands application forms, fills high-confidence facts automatically, flags unknown or sensitive questions for review, generates context-aware written answers from the user's CV/profile, and tracks application deadlines.

## MVP goals

- Browser extension for Chrome/Edge/Brave (Manifest V3)
- Editable student profile with verified facts and preferences
- Google Forms field detection and semantic matching
- Confidence-based autofill; never invent factual data
- Review-before-submit workflow
- Deadline/application tracker
- FastAPI backend with SQLite for local development, designed to move to PostgreSQL
- Optional LLM integration through environment variables

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

The extension expects the local API at `http://localhost:8000` by default.

## Safety model

FiFo AI auto-fills only high-confidence profile facts. Generated, ambiguous, eligibility, declaration, consent and unknown answers are surfaced for explicit review. It does not bypass CAPTCHA or anti-bot controls and does not auto-submit forms.
