from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import List, Optional
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from ..services import LLMService, TestGenerator, AutoTestGenerator, QaseService, GitLabService, GitHubService
from ..models.schemas import GenerateResponse, AutoTestResponse
import tempfile
import os
import logging
import json
import openpyxl
from openpyxl.styles import Font, Alignment
from io import BytesIO
from datetime import datetime

import openpyxl
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, Border, Side, PatternFill
from fastapi.responses import StreamingResponse
from fastapi import HTTPException

from app.utils.xlsx_generator import generate_xlsx_bytes


logger = logging.getLogger(__name__)
router = APIRouter()


class TestCaseStep(BaseModel):
    step: Optional[int] = None
    action: Optional[str] = ""
    expected: Optional[str] = ""

class TestCaseForXlsx(BaseModel):
    title: Optional[str] = ""
    preconditions: Optional[str] = ""
    steps: Optional[List[TestCaseStep]] = None
    expectedResult: Optional[str] = ""
    context: Optional[str] = ""
    result: Optional[str] = ""
    priority: Optional[str] = ""
    description: Optional[str] = ""

class XlsxRequest(BaseModel):
    test_cases: List[TestCaseForXlsx]


@router.post("/generate", response_model=GenerateResponse)
async def generate_test_cases(
    provider: str = Form(...),
    api_key: Optional[str] = Form(None),
    model: str = Form(...),
    description: Optional[str] = Form(None),
    source_code: Optional[str] = Form(None),
    screenshots: List[UploadFile] = File(None),
    videos: List[UploadFile] = File(None),
    recordings: Optional[str] = Form(None)
):
    logger.info(f"Generate request received - provider: {provider}, model: {model}")
    try:
        llm_service = LLMService(provider=provider, api_key=api_key, model=model)
        test_generator = TestGenerator(llm_service)
        images_data = []
        if screenshots:
            for screenshot in screenshots:
                content = await screenshot.read()
                images_data.append(content)
        if videos:
            for video in videos:
                content = await video.read()
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
                temp_file.write(content)
                temp_file.close()
                try:
                    pass
                finally:
                    os.unlink(temp_file.name)

        response = await test_generator.generate(
            description=description,
            source_code=source_code,
            images=images_data if images_data else None
        )
        logger.info(f"Generate request completed successfully for provider: {provider}")
        return response
    except ValueError as e:
        logger.error(f"Validation error in generate request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.get("/providers")
async def list_providers():
    logger.info("Providers list requested")
    return {
        "providers": [
            {
                "id": "openai",
                "name": "OpenAI",
                "models": ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"]
            },
            {
                "id": "anthropic",
                "name": "Anthropic",
                "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229", "claude-3-haiku-20240307"]
            },
            {
                "id": "openrouter",
                "name": "OpenRouter",
                "models": ["anthropic/claude-3-opus", "openai/gpt-4", "meta-llama/llama-2-70b-chat"]
            }
        ]
    }


@router.post("/generate-autotests", response_model=AutoTestResponse)
async def generate_autotests(
    provider: str = Form(...),
    api_key: Optional[str] = Form(None),
    model: str = Form(...),
    description: Optional[str] = Form(None),
    source_code: Optional[str] = Form(None),
    framework: str = Form("playwright"),
    language: str = Form("javascript"),
    screenshots: List[UploadFile] = File(None),
    videos: List[UploadFile] = File(None)
):
    logger.info(f"Autotest generation request received - provider: {provider}, framework: {framework}, language: {language}")
    try:
        llm_service = LLMService(provider=provider, api_key=api_key, model=model)
        auto_test_generator = AutoTestGenerator(llm_service)
        images_data = []
        if screenshots:
            for screenshot in screenshots:
                content = await screenshot.read()
                images_data.append(content)
        if videos:
            for video in videos:
                content = await video.read()
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp4')
                temp_file.write(content)
                temp_file.close()
                try:
                    pass
                finally:
                    os.unlink(temp_file.name)

        response = await auto_test_generator.generate(
            description=description,
            source_code=source_code,
            framework=framework,
            language=language,
            images=images_data if images_data else None
        )
        logger.info(f"Autotest generation completed successfully for provider: {provider}")
        return response
    except ValueError as e:
        logger.error(f"Validation error in autotest generation request: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Autotest generation failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Autotest generation failed: {str(e)}")


@router.post("/qase/upload-test-cases")
async def upload_test_cases_to_qase(
    api_token: str = Form(...),
    project_code: str = Form(...),
    test_cases: str = Form(...)  # JSON string of test cases
):
    logger.info(f"Uploading test cases to Qase project: {project_code}")
    try:
        qase_service = QaseService(api_token=api_token, project_code=project_code)

        # Parse test cases JSON
        test_cases_data = json.loads(test_cases)
        uploaded_cases = []

        for tc_data in test_cases_data:
            # Convert dict to TestCase object
            steps = [
                TestStep(
                    step=step["step"],
                    action=step["action"],
                    expected=step["expected"]
                )
                for step in tc_data.get("steps", [])
            ]

            test_case = TestCase(
                id=tc_data.get("id", "TC001"),
                title=tc_data.get("title", "Generated Test"),
                description=tc_data.get("description", ""),
                steps=steps,
                expected_result=tc_data.get("expected_result", ""),
                priority=tc_data.get("priority", "medium")
            )

            result = qase_service.create_test_case(test_case)
            uploaded_cases.append(result)

        logger.info(f"Successfully uploaded {len(uploaded_cases)} test cases to Qase")
        return {"uploaded": len(uploaded_cases), "cases": uploaded_cases}

    except Exception as e:
        logger.error(f"Failed to upload test cases to Qase: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Qase upload failed: {str(e)}")


@router.get("/qase/projects")
async def get_qase_projects(api_token: str):
    logger.info("Fetching Qase projects")
    try:
        qase_service = QaseService(api_token=api_token, project_code="")  # project_code not needed for this call
        projects = qase_service.get_projects()
        return {"projects": projects}
    except Exception as e:
        logger.error(f"Failed to fetch Qase projects: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch projects: {str(e)}")


@router.post("/gitlab/comment-mr")
async def comment_gitlab_merge_request(
    api_token: str = Form(...),
    project_id: str = Form(...),
    mr_iid: int = Form(...),
    comment: str = Form(...)
):
    logger.info(f"Adding comment to GitLab MR {mr_iid} in project {project_id}")
    try:
        gitlab_service = GitLabService(api_token=api_token)
        result = gitlab_service.create_merge_request_comment(project_id, mr_iid, comment)
        return {"success": True, "comment": result}
    except Exception as e:
        logger.error(f"Failed to comment on GitLab MR: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"GitLab comment failed: {str(e)}")


@router.post("/github/comment-pr")
async def comment_github_pull_request(
    api_token: str = Form(...),
    owner: str = Form(...),
    repo: str = Form(...),
    pr_number: int = Form(...),
    comment: str = Form(...)
):
    logger.info(f"Adding comment to GitHub PR {pr_number} in {owner}/{repo}")
    try:
        github_service = GitHubService(api_token=api_token)
        result = github_service.create_pull_request_comment(owner, repo, pr_number, comment)
        return {"success": True, "comment": result}
    except Exception as e:
        logger.error(f"Failed to comment on GitHub PR: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"GitHub comment failed: {str(e)}")


@router.post("/analyze-changes")
async def analyze_code_changes(
    platform: str = Form(...),  # "gitlab" or "github"
    api_token: str = Form(...),
    project_id: str = Form(...),  # for GitLab: project_id, for GitHub: "owner/repo"
    mr_pr_id: int = Form(...)  # MR IID or PR number
):
    logger.info(f"Analyzing code changes for {platform} item {mr_pr_id}")
    try:
        if platform.lower() == "gitlab":
            gitlab_service = GitLabService(api_token=api_token)
            changes = gitlab_service.get_merge_request_changes(project_id, mr_pr_id)
            analysis = gitlab_service.analyze_code_changes(changes)
        elif platform.lower() == "github":
            owner, repo = project_id.split("/")
            github_service = GitHubService(api_token=api_token)
            changes = github_service.get_pull_request_changes(owner, repo, mr_pr_id)
            analysis = github_service.analyze_code_changes(changes)
        else:
            raise HTTPException(status_code=400, detail="Unsupported platform")

        return {"analysis": analysis, "platform": platform}
    except Exception as e:
        logger.error(f"Failed to analyze code changes: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/generate-xlsx")
async def generate_test_cases_xlsx(request: XlsxRequest):
    """
    Принимает JSON { test_cases: [...] } в теле (XlsxRequest).
    Возвращает XLSX файл.
    """
    try:
        # Предполагается, что XlsxRequest.test_cases уже валидированы Pydantic'ом
        raw_test_cases = getattr(request, "test_cases", None)
        if not raw_test_cases:
            raise HTTPException(status_code=400, detail="Нет тест-кейсов для генерации")

        # Convert Pydantic models to dicts for the generator
        test_cases_dicts = [tc.dict() for tc in raw_test_cases]
        xlsx_bytes = generate_xlsx_bytes(test_cases_dicts)
        stream = BytesIO(xlsx_bytes)
        filename = f"test_cases_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.xlsx"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
        return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating XLSX: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ошибка генерации XLSX: {str(e)}")