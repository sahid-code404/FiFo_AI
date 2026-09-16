from __future__ import annotations

import io
import re
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pypdf import PdfReader

from .llm import generate_answer
from .matching import best_match
from .storage import create_application, get_profile, init_db, list_applications, save_profile


class FieldInfo(BaseModel):
    id: str
    label: str
    type: str = "text"
    options: list[str] = Field(default_factory=list)


class MatchRequest(BaseModel):
    fields: list[FieldInfo]


class GenerateRequest(BaseModel):
    question: str
    max_words: int = Field(default=200, ge=20, le=500)


class ApplicationCreate(BaseModel):
    title: str
    organization: str | None = None
    role: str | None = None
    url: str | None = None
    deadline: str | None = None
    status: str = "new"
    payload: dict[str, Any] = Field(default_factory=dict)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="FiFo AI API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/profile")
def profile_get() -> dict[str, Any]:
    return get_profile()


@app.put("/profile")
def profile_put(payload: dict[str, Any]) -> dict[str, Any]:
    return save_profile(payload)


@app.post("/profile/import-resume")
async def import_resume(file: UploadFile = File(...)) -> dict[str, Any]:
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="MVP currently accepts PDF resumes only")

    raw = await file.read()
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume exceeds 10 MB")

    try:
        reader = PdfReader(io.BytesIO(raw))
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not parse PDF") from exc

    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, re.I)
    compact = re.sub(r"[()]+", "", text)
    phone_match = re.search(r"(?:\+?91[-\s]?)?[6-9](?:[\s-]?\d){9}", compact)

    suggestions: dict[str, Any] = {}
    if email_match:
        suggestions["email"] = email_match.group(0)
    if phone_match:
        suggestions["phone"] = re.sub(r"\s|-", "", phone_match.group(0))

    return {
        "filename": file.filename,
        "characters": len(text),
        "suggestions": suggestions,
        "note": "The MVP extracts contact fields conservatively. Review suggestions before saving.",
    }


@app.post("/match-fields")
def match_fields(request: MatchRequest) -> dict[str, Any]:
    profile = get_profile()
    results = []
    for field in request.fields:
        result = best_match(field.label, profile)
        results.append({"id": field.id, "label": field.label, **result})
    return {"results": results}


@app.post("/generate-answer")
async def answer_generate(request: GenerateRequest) -> dict[str, Any]:
    try:
        answer = await generate_answer(request.question, get_profile(), request.max_words)
    except RuntimeError:
        return {"status": "not_configured", "answer": None}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="LLM provider request failed") from exc

    if answer == "NEEDS_USER_INPUT":
        return {"status": "needs_user_input", "answer": None}
    return {"status": "review", "answer": answer}


@app.get("/applications")
def applications_get() -> list[dict[str, Any]]:
    return list_applications()


@app.post("/applications")
def applications_post(payload: ApplicationCreate) -> dict[str, Any]:
    return create_application(payload.model_dump())
