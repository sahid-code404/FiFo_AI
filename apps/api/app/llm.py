from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx
from dotenv import load_dotenv

load_dotenv()

DEFAULT_GEMINI_MODEL = "gemini-3.8-flash"
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def provider_name(gemini_api_key: str | None = None) -> str:
    if (gemini_api_key or os.getenv("GEMINI_API_KEY")):
        return "gemini"
    if os.getenv("LLM_BASE_URL") and os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL"):
        return "openai_compatible"
    return "none"


def configured(gemini_api_key: str | None = None) -> bool:
    return provider_name(gemini_api_key) != "none"


def provider_status(
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> dict[str, Any]:
    provider = provider_name(gemini_api_key)
    if provider == "gemini":
        return {
            "configured": True,
            "provider": "gemini",
            "model": (gemini_model or os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip(),
            "key_source": "extension_local" if gemini_api_key else "environment",
        }
    if provider == "openai_compatible":
        return {
            "configured": True,
            "provider": "openai_compatible",
            "model": os.getenv("LLM_MODEL", ""),
            "key_source": "environment",
        }
    return {"configured": False, "provider": "none", "model": None, "key_source": None}


def _openai_client_config() -> tuple[str, str, str]:
    if provider_name() != "openai_compatible":
        raise RuntimeError("OpenAI-compatible LLM is not configured")
    return (
        os.environ["LLM_BASE_URL"].rstrip("/"),
        os.environ["LLM_API_KEY"],
        os.environ["LLM_MODEL"],
    )


async def _openai_chat(messages: list[dict[str, str]], *, temperature: float = 0.0) -> str:
    base_url, api_key, model = _openai_client_config()
    payload = {"model": model, "messages": messages, "temperature": temperature}
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    return data["choices"][0]["message"]["content"].strip()


def _gemini_messages(messages: list[dict[str, str]]) -> tuple[str, list[dict[str, Any]]]:
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role", "user")
        text = str(message.get("content") or "").strip()
        if not text:
            continue
        if role == "system":
            system_parts.append(text)
            continue
        contents.append(
            {
                "role": "model" if role == "assistant" else "user",
                "parts": [{"text": text}],
            }
        )
    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Respond to the system instruction."}]}]
    return "\n\n".join(system_parts), contents


async def _gemini_chat(
    messages: list[dict[str, str]],
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> str:
    api_key = (gemini_api_key or os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        raise RuntimeError("Gemini is not configured")

    model = (gemini_model or os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    base_url = os.getenv("GEMINI_BASE_URL", DEFAULT_GEMINI_BASE_URL).rstrip("/")
    system_text, contents = _gemini_messages(messages)
    payload: dict[str, Any] = {"contents": contents}
    if system_text:
        payload["system_instruction"] = {"parts": [{"text": system_text}]}

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            f"{base_url}/models/{model}:generateContent",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json()

    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    parts = ((candidates[0].get("content") or {}).get("parts") or [])
    text = "".join(str(part.get("text") or "") for part in parts).strip()
    if not text:
        raise ValueError("Gemini returned an empty response")
    return text


async def _chat(
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.0,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> str:
    provider = provider_name(gemini_api_key)
    if provider == "gemini":
        return await _gemini_chat(
            messages,
            gemini_api_key=gemini_api_key,
            gemini_model=gemini_model,
        )
    if provider == "openai_compatible":
        return await _openai_chat(messages, temperature=temperature)
    raise RuntimeError("No AI provider is configured")


async def test_provider(
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> dict[str, Any]:
    status = provider_status(gemini_api_key, gemini_model)
    if not status["configured"]:
        return {**status, "ok": False, "error": "No AI provider configured"}
    text = await _chat(
        [
            {"role": "system", "content": "Return exactly the word OK and nothing else."},
            {"role": "user", "content": "Connection test"},
        ],
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
    )
    return {**status, "ok": text.strip().upper().startswith("OK")}


def _extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        value = json.loads(cleaned)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        pass

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        try:
            value = json.loads(cleaned[start : end + 1])
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _safe_profile_for_ai(profile: dict[str, Any]) -> dict[str, Any]:
    allowed = {
        "facts",
        "preferences",
        "links",
        "skills",
        "projects",
        "experience",
        "achievements",
        "career_goals",
        "answer_bank",
        "resume_text",
    }
    return {key: value for key, value in profile.items() if key in allowed and value not in (None, "", [], {})}


def _word_limited(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text.strip()
    return " ".join(words[:max_words]).rstrip(" ,;:-") + "."


async def classify_fields(
    fields: list[dict[str, Any]],
    allowed_keys: list[str],
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> dict[str, dict[str, Any]]:
    if not fields:
        return {}

    system = (
        "You classify job/application form fields. Do not answer any question and do not invent user data. "
        "For each field, map its meaning to exactly one allowed canonical key only when the meaning is clear. "
        "If it is subjective, a declaration/consent, salary/CTC, demographic/sensitive, eligibility/legal, "
        "or does not clearly correspond to an allowed key, use null. "
        "Return JSON only in this exact shape: "
        '{"matches":[{"id":"field-id","key":"allowed_key_or_null","confidence":0.0}]}. '
        "Confidence must be between 0 and 1. Do not add prose."
    )
    user_payload = {
        "allowed_keys": allowed_keys,
        "fields": [
            {
                "id": item.get("id"),
                "label": item.get("label"),
                "type": item.get("type"),
                "options": item.get("options") or [],
                "autocomplete": item.get("autocomplete") or "",
                "source": item.get("source") or "",
            }
            for item in fields
        ],
    }
    text = await _chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        temperature=0.0,
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
    )
    parsed = _extract_json_object(text)
    allowed = set(allowed_keys)
    results: dict[str, dict[str, Any]] = {}
    for item in parsed.get("matches") or []:
        if not isinstance(item, dict):
            continue
        field_id = str(item.get("id") or "")
        key = item.get("key")
        try:
            confidence = float(item.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))
        if field_id and key in allowed:
            results[field_id] = {"key": key, "confidence": confidence}
    return results


async def generate_answer(
    question: str,
    profile: dict[str, Any],
    max_words: int = 200,
    context: str = "",
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> str:
    max_words = max(20, min(int(max_words), 500))
    safe_profile = _safe_profile_for_ai(profile)
    system = (
        "You draft concise job, internship, scholarship, education, hackathon, and application-form answers. "
        "For any statement about the applicant, use only facts contained in the supplied verified profile, "
        "resume text, saved projects, skills, experience, achievements, career goals, preferences, or reusable answers. "
        "Never invent achievements, marks, dates, employers, responsibilities, skills, projects, preferences, "
        "personal circumstances, or eligibility facts. If a personal answer needs information that is missing, "
        "output exactly NEEDS_USER_INPUT. For non-personal/general-knowledge questions, you may answer normally. "
        "Do not answer legal declarations, consent, salary expectations, demographic/sensitive questions, "
        "criminal-history questions, disability/category questions, visa/work-authorization questions, or binding commitments; "
        "for those output exactly NEEDS_USER_INPUT. "
        "Write naturally in first person when the question is about the applicant. Avoid fake enthusiasm, buzzword stuffing, "
        "and unsupported claims. "
        f"Respect the requested limit and keep the answer at or below {max_words} words. Return plain text only, no markdown."
    )
    payload = {
        "question": question,
        "page_context": context[:2000],
        "verified_profile": safe_profile,
        "max_words": max_words,
    }
    answer = await _chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        temperature=0.25,
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
    )
    answer = answer.strip()
    if answer == "NEEDS_USER_INPUT":
        return answer
    return _word_limited(answer, max_words)


async def generate_answers(
    fields: list[dict[str, Any]],
    profile: dict[str, Any],
    context: str = "",
    *,
    gemini_api_key: str | None = None,
    gemini_model: str | None = None,
) -> list[dict[str, Any]]:
    if not fields:
        return []

    safe_profile = _safe_profile_for_ai(profile)
    normalized_fields = []
    for field in fields[:12]:
        normalized_fields.append(
            {
                "id": str(field.get("id") or ""),
                "question": str(field.get("question") or field.get("label") or "")[:1200],
                "max_words": max(20, min(int(field.get("max_words") or 200), 500)),
            }
        )

    system = (
        "Draft answers for job, internship, scholarship, education, hackathon, and application-form narrative questions. "
        "Applicant-specific claims must come only from the verified profile/resume supplied. Never fabricate. "
        "If a personal answer cannot be supported, or the question asks for legal consent/declaration, salary/CTC, "
        "demographic/sensitive data, criminal history, disability/category, visa/work authorization, or a binding commitment, "
        "set status to needs_user_input and answer to null. General-knowledge questions may be answered normally. "
        "Use first person for applicant-specific responses, keep the tone professional and natural, and obey each max_words limit. "
        "Return JSON only: "
        '{"answers":[{"id":"...","status":"draft|needs_user_input","answer":"text or null"}]}. '
        "Do not add markdown or commentary."
    )
    user_payload = {
        "page_context": context[:2000],
        "verified_profile": safe_profile,
        "questions": normalized_fields,
    }
    raw = await _chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        temperature=0.25,
        gemini_api_key=gemini_api_key,
        gemini_model=gemini_model,
    )
    parsed = _extract_json_object(raw)
    limits = {item["id"]: item["max_words"] for item in normalized_fields}
    results: list[dict[str, Any]] = []
    for item in parsed.get("answers") or []:
        if not isinstance(item, dict):
            continue
        field_id = str(item.get("id") or "")
        if field_id not in limits:
            continue
        status = str(item.get("status") or "needs_user_input")
        answer = item.get("answer")
        if status == "draft" and isinstance(answer, str) and answer.strip():
            results.append(
                {
                    "id": field_id,
                    "status": "draft",
                    "answer": _word_limited(answer.strip(), limits[field_id]),
                }
            )
        else:
            results.append({"id": field_id, "status": "needs_user_input", "answer": None})
    return results
