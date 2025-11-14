import requests
from typing import Dict, Any, List, Optional
import json


class GitHubService:
    def __init__(self, api_token: str, base_url: str = "https://api.github.com"):
        self.api_token = api_token
        self.base_url = base_url.rstrip('/')
        self.headers = {
            "Authorization": f"token {api_token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }

    def create_pull_request_comment(self, owner: str, repo: str, pr_number: int, comment: str) -> Dict[str, Any]:
        """Add a comment to a pull request"""
        url = f"{self.base_url}/repos/{owner}/{repo}/issues/{pr_number}/comments"

        data = {
            "body": comment
        }

        response = requests.post(url, headers=self.headers, json=data)

        if response.status_code == 201:
            return response.json()
        else:
            raise Exception(f"Failed to create PR comment: {response.text}")

    def get_pull_request_changes(self, owner: str, repo: str, pr_number: int) -> Dict[str, Any]:
        """Get changes in a pull request"""
        # Get PR details
        pr_url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}"
        pr_response = requests.get(pr_url, headers=self.headers)

        if pr_response.status_code != 200:
            raise Exception(f"Failed to get PR details: {pr_response.text}")

        pr_data = pr_response.json()

        # Get files changed in PR
        files_url = f"{self.base_url}/repos/{owner}/{repo}/pulls/{pr_number}/files"
        files_response = requests.get(files_url, headers=self.headers)

        if files_response.status_code == 200:
            files_data = files_response.json()
            return {
                "pull_request": pr_data,
                "files": files_data
            }
        else:
            raise Exception(f"Failed to get PR files: {files_response.text}")

    def get_repository_info(self, owner: str, repo: str) -> Dict[str, Any]:
        """Get repository information"""
        url = f"{self.base_url}/repos/{owner}/{repo}"

        response = requests.get(url, headers=self.headers)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to get repository info: {response.text}")

    def create_check_run(self, owner: str, repo: str, sha: str, name: str, status: str, conclusion: str = None, output: Dict = None) -> Dict[str, Any]:
        """Create a check run (for GitHub Actions integration)"""
        url = f"{self.base_url}/repos/{owner}/{repo}/check-runs"

        data = {
            "name": name,
            "head_sha": sha,
            "status": status
        }

        if conclusion:
            data["conclusion"] = conclusion

        if output:
            data["output"] = output

        response = requests.post(url, headers=self.headers, json=data)

        if response.status_code == 201:
            return response.json()
        else:
            raise Exception(f"Failed to create check run: {response.text}")

    def analyze_code_changes(self, changes: Dict[str, Any]) -> str:
        """Analyze code changes and suggest test impacts"""
        analysis = "## Анализ изменений кода\n\n"

        if 'files' in changes:
            test_impacts = []
            for file in changes['files']:
                file_path = file.get('filename', '')
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