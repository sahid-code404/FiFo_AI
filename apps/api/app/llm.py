from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx


def configured() -> bool:
    return bool(os.getenv("LLM_BASE_URL") and os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL"))


def _client_config() -> tuple[str, str, str]:
    if not configured():
        raise RuntimeError("LLM is not configured")
    return (
        os.environ["LLM_BASE_URL"].rstrip("/"),
        os.environ["LLM_API_KEY"],
        os.environ["LLM_MODEL"],
    )


async def _chat(messages: list[dict[str, str]], *, temperature: float = 0.0) -> str:
    base_url, api_key, model = _client_config()
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
    return data["choices"][0]["message"]["content"].strip()


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


async def classify_fields(fields: list[dict[str, Any]], allowed_keys: list[str]) -> dict[str, dict[str, Any]]:
    """Classify unfamiliar field wording to canonical profile keys.

    The model only classifies semantics; it never receives or generates the user's
    actual profile values. That keeps factual autofill controlled by verified local
    data after classification.
    """
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


async def generate_answer(question: str, profile: dict[str, Any], max_words: int = 200) -> str:
    system = (
        "Write application-form answers using only facts supplied in the verified user profile. "
        "Never invent achievements, marks, dates, employers, skills, preferences or personal facts. "
        "If the profile lacks information needed to answer accurately, output exactly NEEDS_USER_INPUT. "
        f"Keep the answer under {max_words} words and return plain text only."
    )
    user = f"Question:\n{question}\n\nVerified profile JSON:\n{json.dumps(profile, ensure_ascii=False)}"
    return await _chat(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
    )
