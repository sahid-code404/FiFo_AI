from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

# Canonical profile fields and common ways companies/ATS products ask for them.
# This stays deterministic: unknown wording is never allowed to invent a value.
ALIASES: dict[str, list[str]] = {
    "name": [
        "name", "full name", "candidate name", "name of candidate", "applicant name",
        "student name", "legal name", "name as per records", "name as per government id",
    ],
    "first_name": ["first name", "given name", "forename"],
    "middle_name": ["middle name"],
    "last_name": ["last name", "surname", "family name"],
    "email": [
        "email", "email address", "email id", "mail id", "personal email",
        "personal email address", "candidate email", "registered email",
    ],
    "phone": [
        "phone", "phone number", "mobile", "mobile number", "contact number", "contact no",
        "contact number of candidate", "whatsapp number", "primary phone", "primary mobile",
    ],
    "date_of_birth": ["date of birth", "dob", "birth date", "birthday"],
    "gender": ["gender", "sex"],
    "nationality": ["nationality", "citizenship", "country of citizenship"],
    "address": ["address", "current address", "present address", "residential address", "mailing address"],
    "city": ["city", "current city", "city of residence", "residence city", "home city"],
    "state": ["state", "state of residence", "current state", "province", "region"],
    "country": ["country", "country of residence", "current country"],
    "postal_code": ["postal code", "pin code", "pincode", "zip code", "zipcode", "postcode"],
    "college": [
        "college", "college name", "university", "university name", "institute", "institute name",
        "institution", "institution name", "college university", "college or university",
        "current college", "current university", "educational institution",
    ],
    "degree": [
        "degree", "course", "programme", "program", "qualification", "current degree",
        "degree name", "course name", "highest qualification", "academic program",
    ],
    "stream": [
        "stream", "branch", "department", "specialization", "specialisation", "major",
        "major subject", "discipline", "field of study", "course specialization",
    ],
    "passing_year": [
        "passing year", "year of passing", "graduation year", "year of graduation",
        "expected graduation year", "expected year of graduation", "graduating year",
        "batch", "batch year", "graduation batch", "degree completion year",
    ],
    "semester": ["semester", "current semester", "sem"],
    "cgpa": [
        "cgpa", "graduation cgpa", "cgpa graduation", "current cgpa", "overall cgpa",
        "cumulative cgpa", "gpa", "current gpa", "cumulative gpa", "overall gpa",
    ],
    "class_x_percentage": [
        "class x percentage", "percentage class x", "10th percentage", "class 10 percentage",
        "class 10 marks", "10th marks", "secondary percentage", "ssc percentage",
        "matric percentage", "matriculation percentage",
    ],
    "class_x_board": ["class x board", "10th board", "class 10 board", "secondary board", "ssc board"],
    "class_x_year": ["class x passing year", "10th passing year", "class 10 passing year", "ssc passing year"],
    "class_xii_percentage": [
        "class xii percentage", "percentage class xii", "12th percentage", "class 12 percentage",
        "class 12 marks", "12th marks", "higher secondary percentage", "hsc percentage",
        "senior secondary percentage",
    ],
    "class_xii_board": ["class xii board", "12th board", "class 12 board", "higher secondary board", "hsc board"],
    "class_xii_year": ["class xii passing year", "12th passing year", "class 12 passing year", "hsc passing year"],
    "current_location": [
        "current location", "present location", "current place", "current city location",
        "where are you currently located", "current residence location",
    ],
    "preferred_city": [
        "preferred city", "preferred location", "preferred city market of work", "preferred work location",
        "preferred job location", "job location preference", "location preference", "preferred posting location",
    ],
    "joining_date": [
        "joining date", "earliest joining date", "earliest available joining date", "availability date",
        "available from", "date available", "earliest start date", "when can you join",
    ],
    "notice_period": ["notice period", "notice period days", "current notice period"],
    "github": ["github", "github profile", "github url", "github link", "github profile url"],
    "linkedin": ["linkedin", "linkedin profile", "linkedin url", "linkedin link", "linkedin profile url"],
    "portfolio": ["portfolio", "portfolio url", "portfolio link", "website", "personal website"],
}

# Terms that indicate the form is asking for a different entity/context than the
# candidate's corresponding value. They prevent false matches such as company
# name -> candidate name or office location -> current location.
NEGATIVE_TERMS: dict[str, set[str]] = {
    "name": {"company", "employer", "organization", "organisation", "college", "university", "manager", "referrer"},
    "email": {"company", "manager", "referrer", "reference", "employer"},
    "phone": {"company", "manager", "referrer", "reference", "employer"},
    "city": {"preferred", "job", "office", "posting"},
    "state": {"preferred", "job", "office", "posting"},
    "country": {"preferred", "job", "office", "posting"},
    "current_location": {"preferred", "job", "office", "posting"},
    "preferred_city": {"current", "present", "residence", "home"},
    "cgpa": {"10th", "12th", "class x", "class xii", "ssc", "hsc"},
}

# These categories must always be reviewed even if the profile later contains a
# related value. They can be application-specific, legal, sensitive or subjective.
REVIEW_TERMS = {
    "consent", "declaration", "declare", "agree", "terms and conditions", "privacy policy",
    "salary", "ctc", "compensation", "expected pay", "backlog", "arrear", "disability",
    "category", "caste", "religion", "relocation", "relocate", "bond", "criminal",
    "visa sponsorship", "work authorization", "notice buyout", "why should", "why do you",
    "tell us", "describe", "short note", "essay", "cover letter", "motivation",
    "strength", "weakness", "comfortable with", "willing to", "conflict of interest",
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value).lower().strip()
    return re.sub(r"\s+", " ", value)


def tokens(value: str) -> set[str]:
    stop = {"the", "a", "an", "of", "your", "candidate", "applicant", "please", "enter", "provide", "select"}
    return {part for part in normalize(value).split() if part not in stop and len(part) > 1}


def get_value(profile: dict[str, Any], key: str) -> Any:
    if key in profile:
        value = profile[key]
    else:
        value = None
        for section_name in ("facts", "preferences", "links"):
            section = profile.get(section_name) or {}
            if key in section:
                value = section[key]
                break

    if isinstance(value, list):
        return ", ".join(str(item) for item in value if str(item).strip())
    return value


def has_negative_context(field: str, normalized_label: str) -> bool:
    return any(term in normalized_label for term in NEGATIVE_TERMS.get(field, set()))


def alias_score(label: str, alias: str) -> float:
    label_norm = normalize(label)
    alias_norm = normalize(alias)
    if not label_norm or not alias_norm:
        return 0.0
    if label_norm == alias_norm:
        return 1.0

    # Labels collected from browser forms may combine several hints with pipes;
    # containment is a strong signal when the alias is at least two characters.
    if alias_norm in label_norm:
        return 0.96 if len(alias_norm.split()) >= 2 else 0.91
    if label_norm in alias_norm and len(label_norm.split()) >= 2:
        return 0.94

    label_tokens = tokens(label_norm)
    alias_tokens = tokens(alias_norm)
    if label_tokens and alias_tokens:
        overlap = len(label_tokens & alias_tokens) / len(alias_tokens)
        if overlap == 1.0:
            return 0.91
        if overlap >= 0.67:
            return 0.84 + (0.05 * overlap)

    ratio = SequenceMatcher(None, label_norm, alias_norm).ratio()
    return min(0.83, ratio)


def custom_answer_match(label: str, profile: dict[str, Any]) -> dict[str, Any] | None:
    # Optional extensibility for fields a user sees repeatedly. Structure:
    # answer_bank: [{"aliases": ["..."], "value": "...", "auto_fill": true}]
    bank = profile.get("answer_bank") or []
    best: tuple[float, dict[str, Any]] | None = None
    for item in bank:
        if not isinstance(item, dict) or not item.get("value"):
            continue
        for alias in item.get("aliases") or []:
            score = alias_score(label, str(alias))
            if best is None or score > best[0]:
                best = (score, item)
    if not best or best[0] < 0.90:
        return None
    score, item = best
    return {
        "status": "autofill" if item.get("auto_fill") is True else "review",
        "field": "answer_bank",
        "value": item["value"],
        "confidence": round(score, 3),
        "reason": "saved_reusable_answer",
    }


def best_match(label: str, profile: dict[str, Any]) -> dict[str, Any]:
    normalized = normalize(label)
    if not normalized:
        return {"status": "unknown", "confidence": 0.0}

    if any(term in normalized for term in REVIEW_TERMS):
        return {"status": "review", "confidence": 0.0, "reason": "question_requires_explicit_review"}

    custom = custom_answer_match(label, profile)
    if custom:
        return custom

    best_key = None
    best_score = 0.0
    for key, aliases in ALIASES.items():
        if has_negative_context(key, normalized):
            continue
        for alias in aliases:
            score = alias_score(label, alias)
            if score > best_score:
                best_score = score
                best_key = key

    if best_key is None or best_score < 0.82:
        return {"status": "unknown", "confidence": round(best_score, 3)}

    value = get_value(profile, best_key)
    if value in (None, "", []):
        return {
            "status": "missing",
            "field": best_key,
            "confidence": round(best_score, 3),
            "reason": "profile_value_missing",
        }

    return {
        "status": "autofill" if best_score >= 0.90 else "review",
        "field": best_key,
        "value": value,
        "confidence": round(best_score, 3),
    }
