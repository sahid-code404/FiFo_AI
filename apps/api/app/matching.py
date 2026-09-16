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
    "middle_name": ["middle name", "additional name"],
    "last_name": ["last name", "surname", "family name"],
    "email": [
        "email", "email address", "email id", "mail id", "personal email",
        "personal email address", "candidate email", "registered email", "primary email",
    ],
    "phone": [
        "phone", "phone number", "mobile", "mobile number", "contact number", "contact no",
        "contact number of candidate", "whatsapp number", "primary phone", "primary mobile",
        "telephone", "telephone number",
    ],
    "date_of_birth": ["date of birth", "dob", "birth date", "birthday"],
    "gender": ["gender", "sex"],
    "nationality": ["nationality", "citizenship", "country of citizenship"],
    "address": ["address", "current address", "present address", "residential address", "mailing address", "street address"],
    "city": ["city", "current city", "city of residence", "residence city", "home city"],
    "state": ["state", "state of residence", "current state", "province", "region"],
    "country": ["country", "country of residence", "current country"],
    "postal_code": ["postal code", "pin code", "pincode", "zip code", "zipcode", "postcode"],
    "college": [
        "college", "college name", "university", "university name", "institute", "institute name",
        "institution", "institution name", "college university", "college or university",
        "current college", "current university", "educational institution", "school university",
    ],
    "degree": [
        "degree", "course", "programme", "program", "qualification", "current degree",
        "degree name", "course name", "highest qualification", "academic program",
    ],
    "stream": [
        "stream", "branch", "department", "specialization", "specialisation", "major",
        "major subject", "discipline", "field of study", "course specialization", "area of study",
    ],
    "passing_year": [
        "passing year", "year of passing", "graduation year", "year of graduation",
        "expected graduation year", "expected year of graduation", "graduating year",
        "batch", "batch year", "graduation batch", "degree completion year", "completion year",
    ],
    "semester": ["semester", "current semester", "sem", "present semester"],
    "cgpa": [
        "cgpa", "graduation cgpa", "cgpa graduation", "current cgpa", "overall cgpa",
        "cumulative cgpa", "gpa", "current gpa", "cumulative gpa", "overall gpa",
        "aggregate cgpa", "college cgpa",
    ],
    "class_x_percentage": [
        "class x percentage", "percentage class x", "10th percentage", "class 10 percentage",
        "class 10 marks", "10th marks", "secondary percentage", "ssc percentage",
        "matric percentage", "matriculation percentage", "10th score", "class x marks percentage",
    ],
    "class_x_board": ["class x board", "10th board", "class 10 board", "secondary board", "ssc board"],
    "class_x_year": ["class x passing year", "10th passing year", "class 10 passing year", "ssc passing year", "10th year of passing"],
    "class_xii_percentage": [
        "class xii percentage", "percentage class xii", "12th percentage", "class 12 percentage",
        "class 12 marks", "12th marks", "higher secondary percentage", "hsc percentage",
        "senior secondary percentage", "12th score", "class xii marks percentage",
    ],
    "class_xii_board": ["class xii board", "12th board", "class 12 board", "higher secondary board", "hsc board"],
    "class_xii_year": ["class xii passing year", "12th passing year", "class 12 passing year", "hsc passing year", "12th year of passing"],
    "current_location": [
        "current location", "present location", "current place", "current city location",
        "where are you currently located", "current residence location", "present city location",
    ],
    "preferred_city": [
        "preferred city", "preferred location", "preferred city market of work", "preferred work location",
        "preferred job location", "job location preference", "location preference", "preferred posting location",
        "preferred base location",
    ],
    "joining_date": [
        "joining date", "earliest joining date", "earliest available joining date", "availability date",
        "available from", "date available", "earliest start date", "when can you join", "available start date",
    ],
    "notice_period": ["notice period", "notice period days", "current notice period", "days notice", "availability notice period"],
    "current_employer": ["current employer", "current company", "present employer", "present company", "employer name"],
    "current_job_title": ["current job title", "current designation", "present designation", "job title", "current role", "designation"],
    "years_experience": [
        "years of experience", "total years of experience", "total experience", "overall experience",
        "work experience years", "professional experience", "experience in years",
    ],
    "work_mode": ["preferred work mode", "work mode", "work arrangement", "preferred work arrangement", "remote hybrid onsite preference"],
    "github": ["github", "github profile", "github url", "github link", "github profile url"],
    "linkedin": ["linkedin", "linkedin profile", "linkedin url", "linkedin link", "linkedin profile url"],
    "portfolio": ["portfolio", "portfolio url", "portfolio link", "website", "personal website", "personal site", "website url"],
}

AUTOCOMPLETE_MAP: dict[str, str] = {
    "name": "name",
    "given-name": "first_name",
    "additional-name": "middle_name",
    "family-name": "last_name",
    "email": "email",
    "tel": "phone",
    "tel-national": "phone",
    "bday": "date_of_birth",
    "street-address": "address",
    "address-line1": "address",
    "address-level2": "city",
    "address-level1": "state",
    "country-name": "country",
    "postal-code": "postal_code",
    "url": "portfolio",
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
    "current_employer": {"desired", "preferred", "target"},
    "current_job_title": {"desired", "preferred", "target"},
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
    "veteran", "race", "ethnicity", "sexual orientation", "pronoun", "demographic",
}


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^a-zA-Z0-9]+", " ", value).lower().strip()
    return re.sub(r"\s+", " ", value)


def tokens(value: str) -> set[str]:
    stop = {"the", "a", "an", "of", "your", "candidate", "applicant", "please", "enter", "provide", "select", "choose"}
    return {part for part in normalize(value).split() if part not in stop and len(part) > 1}


def canonical_fields() -> list[str]:
    return sorted(ALIASES)


def is_review_question(label: str) -> bool:
    normalized = normalize(label)
    return any(term in normalized for term in REVIEW_TERMS)


def _raw_value(profile: dict[str, Any], key: str) -> Any:
    if key in profile:
        return profile[key]
    for section_name in ("facts", "preferences", "links"):
        section = profile.get(section_name) or {}
        if key in section:
            return section[key]
    return None


def get_value(profile: dict[str, Any], key: str) -> Any:
    value = _raw_value(profile, key)

    # Safe deterministic derivations: they transform an already verified fact;
    # they do not introduce new claims.
    if value in (None, "") and key in {"first_name", "middle_name", "last_name"}:
        full_name = str(_raw_value(profile, "name") or "").strip()
        parts = [part for part in full_name.split() if part]
        if parts:
            if key == "first_name":
                value = parts[0]
            elif key == "last_name" and len(parts) > 1:
                value = parts[-1]
            elif key == "middle_name" and len(parts) > 2:
                value = " ".join(parts[1:-1])

    if value in (None, "") and key == "city":
        value = _raw_value(profile, "current_location")
    if value in (None, "") and key == "current_location":
        value = _raw_value(profile, "city")

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


def result_for_key(
    key: str,
    profile: dict[str, Any],
    confidence: float,
    *,
    reason: str | None = None,
    allow_autofill: bool = True,
) -> dict[str, Any]:
    if key not in ALIASES:
        return {"status": "unknown", "confidence": round(confidence, 3)}

    value = get_value(profile, key)
    if value in (None, "", []):
        return {
            "status": "missing",
            "field": key,
            "confidence": round(confidence, 3),
            "reason": "profile_value_missing",
        }

    result: dict[str, Any] = {
        "status": "autofill" if allow_autofill and confidence >= 0.90 else "review",
        "field": key,
        "value": value,
        "confidence": round(confidence, 3),
    }
    if reason:
        result["reason"] = reason
    return result


def best_match(label: str, profile: dict[str, Any], autocomplete: str = "") -> dict[str, Any]:
    normalized = normalize(label)
    if not normalized and not autocomplete:
        return {"status": "unknown", "confidence": 0.0}

    if is_review_question(label):
        return {"status": "review", "confidence": 0.0, "reason": "question_requires_explicit_review"}

    custom = custom_answer_match(label, profile)
    if custom:
        return custom

    auto_key = AUTOCOMPLETE_MAP.get((autocomplete or "").strip().lower())
    if auto_key and not has_negative_context(auto_key, normalized):
        return result_for_key(auto_key, profile, 0.99, reason="html_autocomplete_semantics")

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

    return result_for_key(best_key, profile, best_score)
