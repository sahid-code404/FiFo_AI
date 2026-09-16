from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

ALIASES: dict[str, list[str]] = {
    "name": ["name", "candidate name", "name of candidate", "full name", "student name"],
    "email": ["email", "email address", "email id", "mail id"],
    "phone": ["phone", "phone number", "mobile", "mobile number", "contact number", "contact no", "whatsapp number"],
    "college": ["college", "college name", "university", "institute", "institution"],
    "degree": ["degree", "course", "programme", "program"],
    "stream": ["stream", "branch", "department", "specialization", "specialisation"],
    "passing_year": ["passing year", "year of passing", "graduation year", "batch"],
    "cgpa": ["cgpa", "graduation cgpa", "current cgpa"],
    "class_x_percentage": ["class x percentage", "percentage class x", "10th percentage", "class 10 percentage", "secondary percentage"],
    "class_xii_percentage": ["class xii percentage", "percentage class xii", "12th percentage", "class 12 percentage", "higher secondary percentage"],
    "current_location": ["current location", "location", "current city", "city of residence"],
    "preferred_city": ["preferred city", "preferred location", "preferred city market of work", "preferred work location"],
    "github": ["github", "github profile", "github url"],
    "linkedin": ["linkedin", "linkedin profile", "linkedin url"],
    "joining_date": ["joining date", "earliest joining date", "earliest available joining date", "availability date"],
}

REVIEW_TERMS = {
    "consent", "declaration", "agree", "salary", "ctc", "backlog", "disability",
    "category", "relocation", "bond", "criminal", "why should", "why do you",
    "tell us", "describe", "short note", "essay",
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value).lower().strip()
    return re.sub(r"\s+", " ", value)


def get_value(profile: dict[str, Any], key: str) -> Any:
    if key in profile:
        return profile[key]
    for section_name in ("facts", "preferences", "links"):
        section = profile.get(section_name) or {}
        if key in section:
            return section[key]
    return None


def best_match(label: str, profile: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize(label)
    if not normalized:
        return {"status": "unknown", "confidence": 0.0}

    if any(term in normalized for term in REVIEW_TERMS):
        return {"status": "review", "confidence": 0.0, "reason": "question_requires_explicit_review"}

    best_key = None
    best_score = 0.0
    for key, aliases in ALIASES.items():
        for alias in aliases:
            alias_norm = normalize(alias)
            if normalized == alias_norm:
                score = 1.0
            elif alias_norm in normalized or normalized in alias_norm:
                score = 0.95
            else:
                score = SequenceMatcher(None, normalized, alias_norm).ratio()
            if score > best_score:
                best_score = score
                best_key = key

    if best_key is None or best_score < 0.78:
        return {"status": "unknown", "confidence": round(best_score, 3)}

    value = get_value(profile, best_key)
    if value in (None, "", []):
        return {
            "status": "missing", "field": best_key,
            "confidence": round(best_score, 3), "reason": "profile_value_missing",
        }

    return {
        "status": "autofill" if best_score >= 0.90 else "review",
        "field": best_key,
        "value": value,
        "confidence": round(best_score, 3),
    }
