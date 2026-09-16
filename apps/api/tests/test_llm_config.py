from app.llm import DEFAULT_GEMINI_MODEL, configured, provider_name, provider_status


def clear_ai_env(monkeypatch):
    for key in [
        "GEMINI_API_KEY",
        "GEMINI_MODEL",
        "LLM_BASE_URL",
        "LLM_API_KEY",
        "LLM_MODEL",
    ]:
        monkeypatch.delenv(key, raising=False)


def test_local_gemini_key_enables_provider_without_env(monkeypatch):
    clear_ai_env(monkeypatch)
    assert provider_name("local-test-key") == "gemini"
    assert configured("local-test-key") is True

    status = provider_status("local-test-key", "gemini-3.8-flash")
    assert status["configured"] is True
    assert status["provider"] == "gemini"
    assert status["model"] == "gemini-3.8-flash"
    assert status["key_source"] == "extension_local"


def test_gemini_default_model_is_current_flash(monkeypatch):
    clear_ai_env(monkeypatch)
    status = provider_status("local-test-key")
    assert status["model"] == DEFAULT_GEMINI_MODEL
    assert DEFAULT_GEMINI_MODEL == "gemini-3.8-flash"


def test_no_provider_without_key_or_fallback(monkeypatch):
    clear_ai_env(monkeypatch)
    status = provider_status()
    assert configured() is False
    assert status["provider"] == "none"
