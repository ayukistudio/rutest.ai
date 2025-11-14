from typing import Optional, List, Dict, Any
import json
import re
import logging
from .llm_service import LLMService
from ..models.schemas import AutoTestResponse, AutoTestCase

logger = logging.getLogger(__name__)


class AutoTestGenerator:
    def __init__(self, llm_service: LLMService):
        self.llm_service = llm_service

    def build_prompt(
        self,
        description: Optional[str],
        source_code: Optional[Dict[str, Any]],
        framework: str = "playwright",
        language: str = "javascript"
    ) -> str:
        prompt = f"""You are an expert QA automation engineer. Generate comprehensive automated test code based on the provided information.

"""

        if description:
            prompt += f"**Feature Description:**\n{description}\n\n"

        if source_code:
            source_data = json.loads(source_code) if isinstance(source_code, str) else source_code
            prompt += "**Project Structure:**\n"
            prompt += f"{source_data.get('structure', '')}\n\n"

            if source_data.get('files'):
                prompt += "**Key Source Files:**\n"
                for file in source_data['files'][:10]:  # More files for autotests
                    prompt += f"\nFile: {file['path']}\n"
                    prompt += f"```{file['language']}\n"
                    content = file['content'][:2000]  # More content for autotests
                    prompt += f"{content}\n```\n"

        prompt += f"""
Generate automated tests using {framework} framework in {language}.

Requirements:
1. Create complete, runnable test files
2. Include proper setup and teardown
3. Add comprehensive test scenarios covering:
   - Positive test cases
   - Negative test cases
   - Edge cases
   - Error handling

4. Use page object model or similar patterns where appropriate
5. Include Russian comments for code review facilitation
6. Ensure tests are maintainable and follow best practices

CRITICAL: Return output in STRICT format with NO additional text, explanations, or markdown:

For each file, use this exact format:
path/to/new/file.js -> complete_file_content_here
path/to/existing/file.js -> updated_file_content_here

Separate multiple files with newlines.
Use "->" as separator between path and content.
Content should be properly formatted code with Russian comments.

Make sure to:
- Generate at least 3 comprehensive test files
- Include proper imports and dependencies
- Add meaningful Russian comments (// комментарий)
- Create modular, reusable code
- Follow {framework} best practices
"""

        return prompt

    async def generate(
        self,
        description: Optional[str],
        source_code: Optional[str],
        framework: str = "playwright",
        language: str = "javascript",
        images: Optional[List[bytes]] = None
    ) -> AutoTestResponse:
        prompt = self.build_prompt(description, source_code, framework, language)

        response_text = await self.llm_service.generate(
            prompt=prompt,
            images=images,
            max_tokens=6000  # More tokens for code generation
        )

        return self.parse_response(response_text)

    def parse_response(self, response_text: str) -> AutoTestResponse:
        # Parse the new "path -> code" format
        lines = response_text.strip().split('\n')
        test_files = []
        support_files = []

        for line in lines:
            line = line.strip()
            if not line or '->' not in line:
                continue

            try:
                path, content = line.split('->', 1)
                path = path.strip()
                content = content.strip()

                # Determine if it's a test file or support file based on path
                filename = path.split('/')[-1] or path.split('\\')[-1]

                # Basic classification - can be improved
                if 'test' in filename.lower() or 'spec' in filename.lower():
                    test_file = AutoTestCase(
                        filename=filename,
                        content=content,
                        description=f"Test file: {filename}",
                        framework="playwright",
                        language="javascript"
                    )
                    test_files.append(test_file)
                else:
                    support_file = AutoTestCase(
                        filename=filename,
                        content=content,
                        description=f"Support file: {filename}",
                        framework="",
                        language=""
                    )
                    support_files.append(support_file)

            except ValueError as e:
                logger.warning(f"Error parsing line: {line}, error: {e}")
                continue

        # If no files were parsed, try fallback JSON parsing
        if not test_files and not support_files:
            logger.warning("No files parsed from path->code format, trying JSON fallback")
            return self._parse_json_fallback(response_text)

        readme = self.generate_default_readme(test_files)

        return AutoTestResponse(
            test_files=test_files,
            support_files=support_files,
            readme=readme
        )

    def _parse_json_fallback(self, response_text: str) -> AutoTestResponse:
        # Fallback to JSON parsing if path->code format fails
        json_patterns = [
            r'```json\s*(\{[\s\S]*?"test_files"[\s\S]*?\})\s*```',  # JSON в markdown блоке с test_files
            r'```\s*(\{[\s\S]*?"test_files"[\s\S]*?\})\s*```',     # JSON в code блоке с test_files
            r'(\{[\s\S]*?"test_files"[\s\S]*?\})',  # JSON с test_files без markdown
            r'(\{[\s\S]*?\})'  # Любой JSON объект (запасной вариант)
        ]

        for pattern in json_patterns:
            json_match = re.search(pattern, response_text, re.DOTALL)
            if json_match:
                try:
                    json_str = json_match.group(1) if json_match.groups() else json_match.group()

                    # Сначала пробуем парсить как есть
                    try:
                        data = json.loads(json_str)
                    except json.JSONDecodeError:
                        # Если не получилось, пытаемся исправить
                        json_str = self._fix_json_string(json_str)
                        data = json.loads(json_str)

                    # Проверяем обязательные поля
                    if "test_files" not in data:
                        continue

                    test_files = []
                    for tf_data in data.get("test_files", []):
                        try:
                            test_file = AutoTestCase(
                                filename=tf_data.get("filename", "test.spec.js"),
                                content=tf_data.get("content", ""),
                                description=tf_data.get("description", ""),
                                framework=tf_data.get("framework", "playwright"),
                                language=tf_data.get("language", "javascript")
                            )
                            test_files.append(test_file)
                        except (KeyError, TypeError, ValueError) as e:
                            logger.warning(f"Error parsing test file: {e}, data: {tf_data}")
                            continue

                    support_files = []
                    for sf_data in data.get("support_files", []):
                        try:
                            support_file = AutoTestCase(
                                filename=sf_data.get("filename", "helper.js"),
                                content=sf_data.get("content", ""),
                                description=sf_data.get("description", ""),
                                framework="",
                                language=""
                            )
                            support_files.append(support_file)
                        except (KeyError, TypeError, ValueError) as e:
                            logger.warning(f"Error parsing support file: {e}, data: {sf_data}")
                            continue

                    readme = data.get("readme", self.generate_default_readme(test_files))

                    return AutoTestResponse(
                        test_files=test_files,
                        support_files=support_files,
                        readme=readme
                    )
                except (json.JSONDecodeError, TypeError, ValueError) as e:
                    logger.warning(f"JSON parsing failed: {e}, json_str: {json_str[:500]}...")
                    continue

        logger.warning("No valid JSON found in response, using fallback")
        return self.generate_fallback_response(response_text)

    def generate_fallback_response(self, response_text: str) -> AutoTestResponse:
        test_file = AutoTestCase(
            filename="test_example.spec.js",
            content=f"""// Автоматически сгенерированный тест
// Automatically generated test

const {{ test, expect }} = require('@playwright/test');

test('example test', async ({{ page }}) => {{
    // Переход на страницу
    // Navigate to page
    await page.goto('https://example.com');

    // Проверка заголовка
    // Check title
    await expect(page).toHaveTitle(/Example/);
}});
""",
            description="Basic example test",
            framework="playwright",
            language="javascript"
        )

        readme = self.generate_default_readme([test_file])

        return AutoTestResponse(
            test_files=[test_file],
            support_files=[],
            readme=readme
        )

    def generate_default_readme(self, test_files: List[AutoTestCase]) -> str:
        readme = "# Автоматически сгенерированные тесты\n\n"
        readme += "## Описание\n\n"
        readme += "Этот набор тестов был автоматически сгенерирован на основе анализа кода проекта.\n\n"

        readme += "## Файлы тестов\n\n"
        for tf in test_files:
            readme += f"- `{tf.filename}`: {tf.description}\n"

        readme += "\n## Запуск тестов\n\n"
        readme += "```bash\n"
        readme += "# Установка зависимостей\n"
        readme += "npm install\n\n"
        readme += "# Запуск тестов\n"
        readme += "npx playwright test\n"
        readme += "```\n\n"

        readme += "## Структура проекта\n\n"
        readme += "Тесты организованы согласно лучшим практикам автоматизации тестирования.\n"

        return readme

    def _fix_json_string(self, json_str: str) -> str:
        """Агрессивный JSON repair"""
        import re

        # Сначала пробуем простой repair
        repaired = self._simple_json_repair(json_str)
        try:
            import json
            json.loads(repaired)
            return repaired
        except:
            pass

        # Если не получилось, пробуем извлечь все возможные JSON кандидаты
        candidates = self._extract_json_candidates(json_str)
        for candidate in candidates:
            try:
                import json
                json.loads(candidate)
                return candidate
            except:
                continue

        # Если ничего не помогло, пробуем экстремальный fallback
        return self._extreme_json_fallback(json_str)

    def _extreme_json_fallback(self, json_str: str) -> str:
        """Экстремальный fallback для очень сломанного JSON"""
        import re

        # Пытаемся найти хотя бы основные структуры
        # Ищем "test_files": [ ... ]
        test_files_match = re.search(r'"test_files"\s*:\s*\[[\s\S]*?\]', json_str, re.IGNORECASE)
        if test_files_match:
            # Создаем минимальный валидный JSON
            return f'{{"test_files": {test_files_match.group(0)}}}'

        # Если совсем ничего, возвращаем базовый JSON
        return '{"test_files": []}'

    def _simple_json_repair(self, json_str: str) -> str:
        """Простой JSON repair"""
        import re

        # Удаляем лишние пробелы
        json_str = json_str.strip()

        # Ищем корректный JSON блок
        start_brace = json_str.find('{')
        last_brace = json_str.rfind('}')

        if start_brace != -1 and last_brace != -1 and last_brace > start_brace:
            json_str = json_str[start_brace:last_brace + 1]

        # Исправляем проблемы внутри строк
        in_string = False
        escape_next = False
        result = []

        for char in json_str:
            if escape_next:
                result.append(char)
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                result.append(char)
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                result.append(char)
                continue

            if in_string and char == '\n':
                result.append('\\n')
            elif in_string and char == '\t':
                result.append(' ')
            elif in_string and char == '\r':
                continue
            else:
                result.append(char)

        json_str = ''.join(result)

        # Удаляем висячие запятые
        json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

        # Исправляем незавершенные кавычки
        quote_count = json_str.count('"')
        if quote_count % 2 != 0:
            json_str += '"'

        # Исправляем отсутствующие запятые между свойствами
        json_str = re.sub(r'}(\s*)"([^"]+)":', r'},$1"$2":', json_str)
        json_str = re.sub(r'](\s*)"([^"]+)":', r'],$1"$2":', json_str)

        return json_str

    def _extract_json_candidates(self, json_str: str) -> list:
        """Извлекает все возможные JSON кандидаты"""
        candidates = []

        # Ищем все возможные JSON объекты
        brace_count = 0
        start_pos = -1
        in_string = False
        escape_next = False

        for i, char in enumerate(json_str):
            if escape_next:
                escape_next = False
                continue

            if char == '\\':
                escape_next = True
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                continue

            if not in_string:
                if char == '{':
                    if brace_count == 0:
                        start_pos = i
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0 and start_pos != -1:
                        candidate = json_str[start_pos:i + 1]
                        candidates.append(candidate)

        # Сортируем по длине, самые длинные первыми
        return sorted(candidates, key=len, reverse=True)