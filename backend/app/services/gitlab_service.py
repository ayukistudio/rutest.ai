import requests
from typing import Dict, Any, List, Optional
import json


class GitLabService:
    def __init__(self, api_token: str, base_url: str = "https://gitlab.com/api/v4"):
        self.api_token = api_token
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Private-Token": api_token,
            "Content-Type": "application/json"
        }

    def create_merge_request_comment(self, project_id: str, mr_iid: int, comment: str) -> Dict[str, Any]:
        """Add a comment to a merge request"""
        url = f"{self.base_url}/projects/{project_id}/merge_requests/{mr_iid}/notes"

        data = {
            "body": comment
        }

        response = requests.post(url, headers=self.headers, json=data)

        if response.status_code == 201:
            return response.json()
        else:
            raise Exception(f"Failed to create MR comment: {response.text}")

    def get_merge_request_changes(self, project_id: str, mr_iid: int) -> Dict[str, Any]:
        """Get changes in a merge request"""
        url = f"{self.base_url}/projects/{project_id}/merge_requests/{mr_iid}/changes"

        response = requests.get(url, headers=self.headers)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to get MR changes: {response.text}")

    def get_project_info(self, project_id: str) -> Dict[str, Any]:
        """Get project information"""
        url = f"{self.base_url}/projects/{project_id}"

        response = requests.get(url, headers=self.headers)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to get project info: {response.text}")

    def create_pipeline_comment(self, project_id: str, pipeline_id: int, comment: str) -> Dict[str, Any]:
        """Add a comment to a pipeline (if supported)"""
        # GitLab doesn't have direct pipeline comments, so we'll create a commit comment
        # This is a workaround - in practice, you might want to use issues or MRs
        url = f"{self.base_url}/projects/{project_id}/pipelines/{pipeline_id}"

        # Get pipeline info first
        response = requests.get(url, headers=self.headers)
        if response.status_code != 200:
            raise Exception(f"Failed to get pipeline info: {response.text}")

        pipeline_data = response.json()
        commit_sha = pipeline_data.get('sha')

        if not commit_sha:
            raise Exception("No commit SHA found for pipeline")

        # Create a commit comment
        comment_url = f"{self.base_url}/projects/{project_id}/repository/commits/{commit_sha}/comments"
        comment_data = {
            "note": f"Pipeline #{pipeline_id}: {comment}",
            "path": ".gitlab-ci.yml",  # Point to CI config
            "line": 1,
            "line_type": "new"
        }

        comment_response = requests.post(comment_url, headers=self.headers, json=comment_data)

        if comment_response.status_code == 201:
            return comment_response.json()
        else:
            raise Exception(f"Failed to create pipeline comment: {comment_response.text}")

    def analyze_code_changes(self, changes: Dict[str, Any]) -> str:
        """Analyze code changes and suggest test impacts"""
        analysis = "## Анализ изменений кода\n\n"

        if 'changes' in changes:
            test_impacts = []
            for change in changes['changes']:
                file_path = change.get('new_path', change.get('old_path', ''))
                if self._is_test_related_file(file_path):
                    test_impacts.append(f"🔍 Изменен тестовый файл: `{file_path}`")
                elif self._is_source_file(file_path):
                    test_impacts.append(f"⚠️ Изменен исходный файл: `{file_path}` - требуется проверка тестов")

            if test_impacts:
                analysis += "### Возможное влияние на тесты:\n"
                analysis += "\n".join(f"- {impact}" for impact in test_impacts)
                analysis += "\n\nРекомендуется выполнить полный набор автотестов."
            else:
                analysis += "Не обнаружено критических изменений, требующих обновления тестов."

        return analysis

    def _is_test_related_file(self, file_path: str) -> bool:
        """Check if file is test-related"""
        test_patterns = [
            'test', 'spec', 'spec.js', 'test.js', 'test.ts', 'spec.ts',
            'tests/', 'specs/', '__tests__/', 'test_'
        ]
        return any(pattern in file_path.lower() for pattern in test_patterns)

    def _is_source_file(self, file_path: str) -> bool:
        """Check if file is source code"""
        source_extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.php', '.rb', '.go', '.rs', '.cpp', '.c']
        return any(file_path.lower().endswith(ext) for ext in source_extensions)