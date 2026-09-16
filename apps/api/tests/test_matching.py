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


def test_different_company_wording_maps_to_same_phone():
    profile = {"facts": {"phone": "9876543210"}}
    for label in ["Mobile Number", "Contact No.", "Primary mobile", "Telephone number"]:
        result = best_match(label, profile)
        assert result["status"] == "autofill", label
        assert result["field"] == "phone", label
        assert result["value"] == "9876543210", label


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


def test_html_autocomplete_can_disambiguate_generic_label():
    profile = {"facts": {"email": "student@example.com"}}
    result = best_match("Your details", profile, autocomplete="email")
    assert result["status"] == "autofill"
    assert result["field"] == "email"
    assert result["reason"] == "html_autocomplete_semantics"


def test_first_and_last_name_can_be_derived_from_verified_full_name():
    profile = {"facts": {"name": "Sahidul Haque"}}
    first = best_match("Given name", profile)
    last = best_match("Surname", profile)
    assert first["value"] == "Sahidul"
    assert last["value"] == "Haque"


def test_company_name_does_not_use_candidate_name():
    profile = {"facts": {"name": "Student Name"}}
    result = best_match("Current company name", profile)
    assert result.get("field") != "name"


def test_employment_wording_maps_to_employment_fact():
    profile = {"facts": {"current_job_title": "QA Engineer"}}
    result = best_match("Present designation", profile)
    assert result["status"] == "autofill"
    assert result["field"] == "current_job_title"
    assert result["value"] == "QA Engineer"


def test_missing_value_is_not_invented():
    result = best_match("CGPA Graduation", {"facts": {}})
    assert result["status"] == "missing"
    assert result["field"] == "cgpa"
    assert "value" not in result


def test_subjective_question_requires_review():
    result = best_match("Why should we hire you?", {"facts": {"name": "A"}})
    assert result["status"] == "review"
    assert result["reason"] == "question_requires_explicit_review"


def test_sensitive_demographic_question_requires_review():
    result = best_match("Please select your ethnicity", {"facts": {}})
    assert result["status"] == "review"


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


def test_saved_reusable_answer_handles_company_specific_question():
    profile = {
        "answer_bank": [
            {
                "aliases": ["How did you hear about us", "Source of application"],
                "value": "University placement cell",
                "auto_fill": True,
            }
        ]
    }
    result = best_match("Source of application", profile)
    assert result["status"] == "autofill"
    assert result["value"] == "University placement cell"


def test_sensitive_answer_bank_still_requires_review():
    profile = {
        "answer_bank": [
            {"aliases": ["active backlogs"], "value": "No", "auto_fill": True}
        ]
    }
    result = best_match("Do you have any active backlog?", profile)
    assert result["status"] == "review"
    assert result["reason"] == "question_requires_explicit_review"
