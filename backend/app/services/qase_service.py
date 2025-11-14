import requests
from typing import List, Dict, Any, Optional
import json
from ..models.schemas import TestCase


class QaseService:
    def __init__(self, api_token: str, project_code: str, base_url: str = "https://api.qase.io/v1"):
        self.api_token = api_token
        self.project_code = project_code
        self.base_url = base_url
        self.headers = {
            "Token": api_token,
            "Content-Type": "application/json"
        }

    def create_test_case(self, test_case: TestCase) -> Dict[str, Any]:
        """Create a test case in Qase"""
        url = f"{self.base_url}/case/{self.project_code}"

        # Convert TestCase to Qase format
        qase_case = {
            "title": test_case.title,
            "description": test_case.description,
            "preconditions": "",
            "postconditions": test_case.expected_result,
            "severity": self._map_priority_to_severity(test_case.priority),
            "priority": self._map_priority_to_qase_priority(test_case.priority),
            "type": "functional",
            "layer": "e2e",
            "is_flaky": 0,
            "behavior": "positive",
            "automation": "automated",
            "status": "actual",
            "steps": [
                {
                    "hash": f"step_{i+1}",
                    "position": i + 1,
                    "action": step.action,
                    "expected_result": step.expected,
                    "attachments": []
                }
                for i, step in enumerate(test_case.steps)
            ],
            "attachments": []
        }

        response = requests.post(url, headers=self.headers, json=qase_case)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to create test case: {response.text}")

    def get_test_cases(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get test cases from Qase"""
        url = f"{self.base_url}/case/{self.project_code}"
        params = {"limit": limit}

        response = requests.get(url, headers=self.headers, params=params)

        if response.status_code == 200:
            data = response.json()
            return data.get("result", {}).get("entities", [])
        else:
            raise Exception(f"Failed to get test cases: {response.text}")

    def update_test_case(self, case_id: int, test_case: TestCase) -> Dict[str, Any]:
        """Update an existing test case in Qase"""
        url = f"{self.base_url}/case/{self.project_code}/{case_id}"

        qase_case = {
            "title": test_case.title,
            "description": test_case.description,
            "preconditions": "",
            "postconditions": test_case.expected_result,
            "severity": self._map_priority_to_severity(test_case.priority),
            "priority": self._map_priority_to_qase_priority(test_case.priority),
            "steps": [
                {
                    "hash": f"step_{i+1}",
                    "position": i + 1,
                    "action": step.action,
                    "expected_result": step.expected,
                    "attachments": []
                }
                for i, step in enumerate(test_case.steps)
            ]
        }

        response = requests.patch(url, headers=self.headers, json=qase_case)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to update test case: {response.text}")

    def create_test_run(self, title: str, cases: List[int] = None) -> Dict[str, Any]:
        """Create a test run in Qase"""
        url = f"{self.base_url}/run/{self.project_code}"

        run_data = {
            "title": title,
            "description": "Auto-generated test run",
            "cases": cases or [],
            "is_automated": True
        }

        response = requests.post(url, headers=self.headers, json=run_data)

        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to create test run: {response.text}")

    def get_projects(self) -> List[Dict[str, Any]]:
        """Get all projects"""
        url = f"{self.base_url}/project"

        response = requests.get(url, headers=self.headers)

        if response.status_code == 200:
            data = response.json()
            return data.get("result", {}).get("entities", [])
        else:
            raise Exception(f"Failed to get projects: {response.text}")

    def _map_priority_to_severity(self, priority: str) -> int:
        """Map priority to Qase severity (1-5)"""
        mapping = {
            "high": 4,
            "medium": 3,
            "low": 2
        }
        return mapping.get(priority.lower(), 3)

    def _map_priority_to_qase_priority(self, priority: str) -> int:
        """Map priority to Qase priority (1-4)"""
        mapping = {
            "high": 4,
            "medium": 3,
            "low": 2
        }
        return mapping.get(priority.lower(), 3)