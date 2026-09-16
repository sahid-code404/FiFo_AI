from app.matching import best_match


def test_exact_fact_autofills():
    profile = {"facts": {"email": "student@example.com"}}
    result = best_match("Email address *", profile)
    assert result["status"] == "autofill"
    assert result["field"] == "email"
    assert result["value"] == "student@example.com"


def test_missing_value_is_not_invented():
    result = best_match("CGPA Graduation", {"facts": {}})
    assert result["status"] == "missing"
    assert result["field"] == "cgpa"
    assert "value" not in result


def test_subjective_question_requires_review():
    result = best_match("Why should we hire you?", {"facts": {"name": "A"}})
    assert result["status"] == "review"
    assert result["reason"] == "question_requires_explicit_review"
