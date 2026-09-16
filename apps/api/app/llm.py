from __future__ import annotations

import json
import os
from typing import Any

import httpx


def configured() -> bool:
    return bool(os.getenv("LLM_BASE_URL") and os.getenv("LLM_API_KEY") and os.getenv("LLM_MODEL"))


async def generate_answer(question: str, profile: dict[str, Any], max_words: int = 200) -> str:
    if not configured():
        raise RuntimeError("LLM is not configured")

    base_url = os.environ["LLM_BASE_URL"].rstrip("/")
    api_key = os.environ["LLM_API_KEY"]
    model = os.environ["LLM_MODEL"]

    system = (
        "Write application-form answers using only facts supplied in the verified user profile. "
        "Never invent achievements, marks, dates, employers, skills, preferences or personal facts. "
        "If the profile lacks information needed to answer accurately, output exactly NEEDS_USER_INPUT. "
        f"Keep the answer under {max_words} words and return plain text only."
    )
    user = f"Question:\n{question}\n\nVerified profile JSON:\n{json.dumps(profile, ensure_ascii=False)}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
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
