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
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### Browser extension

Open Chrome/Edge/Brave -> Extensions -> Developer mode -> Load unpacked, then select `apps/extension`.

The extension expects the local API at `http://localhost:8000` by default.

## Safety model

FiFo AI auto-fills only high-confidence profile facts. Generated, ambiguous, eligibility, declaration, consent and unknown answers are surfaced for explicit review. It does not bypass CAPTCHA or anti-bot controls and does not auto-submit forms.
