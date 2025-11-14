from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum


class ProviderEnum(str, Enum):
    openai = "openai"
    openrouter = "openrouter"
    anthropic = "anthropic"


class PriorityEnum(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"


class FileContext(BaseModel):
    path: str
    content: str
    language: str


class SourceCodeContext(BaseModel):
    files: List[FileContext]
    structure: str


class GenerateRequest(BaseModel):
    provider: ProviderEnum
    api_key: str
    model: str
    description: Optional[str] = None
    source_code: Optional[str] = None


class TestStep(BaseModel):
    step: int
    action: str
    expected: str


class TestCase(BaseModel):
    id: str
    title: str
    description: str
    steps: List[TestStep]
    expectedResult: str = Field(alias="expected_result")
    priority: PriorityEnum

    class Config:
        populate_by_name = True


class GenerateResponse(BaseModel):
    testCases: List[TestCase] = Field(alias="test_cases")
    markdown: str

    class Config:
        populate_by_name = True


class AutoTestCase(BaseModel):
    filename: str
    content: str
    description: str
    framework: str = ""
    language: str = ""


class AutoTestResponse(BaseModel):
    test_files: List[AutoTestCase]
    support_files: List[AutoTestCase]
    readme: str