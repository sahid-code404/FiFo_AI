from app.matching import best_match


def test_exact_fact_autofills():
    profile = {"facts": {"email": "student@example.com"}}
    result = best_match("Email address *", profile)
    assert result["status"] == "autofill"
    assert result["field"] == "email"
    assert result["value"] == "student@example.com"


def test_different_company_wording_maps_to_same_email():
    profile = {"facts": {"email": "student@example.com"}}
    for label in [
        "Personal Email Address",
        "Candidate email id",
        "Please provide your registered email",
    ]:
        result = best_match(label, profile)
        assert result["status"] == "autofill", label
        assert result["field"] == "email"


def test_branch_major_and_field_of_study_map_to_stream():
    profile = {"facts": {"stream": "CSE AIML"}}
    for label in ["Branch", "Major", "Field of Study", "Course specialization"]:
        result = best_match(label, profile)
        assert result["status"] == "autofill", label
        assert result["field"] == "stream"
        assert result["value"] == "CSE AIML"


def test_graduation_year_variants_map_to_passing_year():
    profile = {"facts": {"passing_year": "2027"}}
    for label in ["Expected graduation year", "Year of Graduation", "Graduation batch"]:
        result = best_match(label, profile)
        assert result["status"] == "autofill", label
        assert result["field"] == "passing_year"


def test_school_marks_variants_are_distinct():
    profile = {"facts": {"class_x_percentage": "75", "class_xii_percentage": "92"}}
    ten = best_match("SSC Percentage", profile)
    twelve = best_match("Higher Secondary Percentage", profile)
    assert ten["field"] == "class_x_percentage"
    assert ten["value"] == "75"
    assert twelve["field"] == "class_xii_percentage"
    assert twelve["value"] == "92"


def test_company_name_does_not_use_candidate_name():
    profile = {"facts": {"name": "Student Name"}}
    result = best_match("Current company name", profile)
    assert result["status"] == "unknown"


def test_missing_value_is_not_invented():
    result = best_match("CGPA Graduation", {"facts": {}})
    assert result["status"] == "missing"
    assert result["field"] == "cgpa"
    assert "value" not in result


def test_subjective_question_requires_review():
    result = best_match("Why should we hire you?", {"facts": {"name": "A"}})
    assert result["status"] == "review"
    assert result["reason"] == "question_requires_explicit_review"


def test_saved_answer_bank_supports_uncommon_repeated_field():
    profile = {
        "answer_bank": [
            {
                "aliases": ["university roll number", "enrollment number", "student roll no"],
                "value": "ABC123",
                "auto_fill": True,
            }
        ]
    }
    result = best_match("Enrollment Number", profile)
    assert result["status"] == "autofill"
    assert result["field"] == "answer_bank"
    assert result["value"] == "ABC123"


def test_sensitive_answer_bank_still_requires_review():
    profile = {
        "answer_bank": [
            {"aliases": ["active backlogs"], "value": "No", "auto_fill": True}
        ]
    }
    result = best_match("Do you have any active backlog?", profile)
    assert result["status"] == "review"
    assert result["reason"] == "question_requires_explicit_review"
