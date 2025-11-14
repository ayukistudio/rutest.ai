import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { LLMConfig, GenerateRequest, GenerateResponse, JiraConfig } from '../types';
import { ConfigService } from './ConfigService';

export class ApiService {
    private backendUrl: string;
    private hostname: string;
    private port: number;
    private protocol: 'http:' | 'https:';

    constructor(backendUrl: string = 'https://ayukidev.ru') {
        this.backendUrl = backendUrl.trim().replace(/\/+$/, '');
        
        try {
            const url = new URL(this.backendUrl);
            this.hostname = url.hostname;
            this.port = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
            this.protocol = url.protocol as 'http:' | 'https:';
        } catch (error: any) {
            throw new Error(`Invalid backend URL: ${this.backendUrl}`);
        }
    }

    private makeRequest<T>(
        method: string,
        path: string,
        data?: any,
        headers?: Record<string, string>,
        isFormData: boolean = false
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const requestModule = this.protocol === 'https:' ? https : http;
            
            let body: Buffer | string = '';
            let contentType = 'application/json';

            if (isFormData && data) {
                contentType = `multipart/form-data; boundary=${data.boundary}`;
                body = data.body;
            } else if (data) {
                body = JSON.stringify(data);
            }

            const options: https.RequestOptions = {
                hostname: this.hostname,
                port: this.port,
                path: path,
                method: method.toUpperCase(),
                headers: {
                    'User-Agent': 'RuTest.AI-Extension/1.0',
                    'Accept': 'application/json',
                    'Content-Type': contentType,
                    ...(body ? { 'Content-Length': Buffer.byteLength(typeof body === 'string' ? body : body.toString()) } : {}),
                    ...headers
                },
                rejectUnauthorized: false,
                timeout: 900000
            };

            const req = requestModule.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            const parsed = responseData.trim() ? JSON.parse(responseData) : {};
                            resolve(parsed as T);
                        } catch {
                            resolve(responseData as any);
                        }
                    } else {
                        const errorMsg = `HTTP ${res.statusCode}: ${responseData || res.statusMessage}`;
                        reject(new Error(errorMsg));
                    }
                });
            });

            req.on('error', (error) => reject(new Error(error.message || 'Network error')));
            req.on('timeout', () => req.destroy() || reject(new Error('Request timeout')));

            if (body) req.write(body);
            req.end();
        });
    }

    private ollamaRequest(baseUrl: string, payload: any): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                const url = new URL(baseUrl);
                url.pathname = '/api/generate';

                const postData = JSON.stringify(payload);
                const options: https.RequestOptions = {
                    hostname: url.hostname,
                    port: url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80),
                    path: '/api/generate',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    rejectUnauthorized: false
                };

                const protocol = url.protocol === 'https:' ? https : http;
                const req = protocol.request(options, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const json = JSON.parse(body);
                                resolve(json);
                            } catch {
                                resolve({ response: body });
                            }
                        } else {
                            reject(new Error(`Ollama error ${res.statusCode}: ${body}`));
                        }
                    });
                });

                req.on('error', reject);
                req.write(postData);
                req.end();
            } catch (err: any) {
                reject(err);
            }
        });
    }

    async healthCheck(): Promise<boolean> {
        try {
            await this.makeRequest('GET', '/health');
            return true;
        } catch {
            return false;
        }
    }

    private createMultipartFormData(llmConfig: LLMConfig, request: GenerateRequest): { body: Buffer, boundary: string } {
        const boundary = `----FormBoundary${Date.now()}`;
        const parts: Buffer[] = [];

        const addField = (name: string, value: string) => {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        };

        const addFile = (name: string, filename: string, data: Buffer, contentType: string) => {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
            parts.push(data);
            parts.push(Buffer.from('\r\n'));
        };

        addField('provider', llmConfig.provider);
        addField('api_key', llmConfig.apiKey || '');
        addField('model', llmConfig.model);
        
        const enhancedDescription = this.enhanceDescription(request.description || '');
        addField('description', enhancedDescription);
        
        if (request.sourceCode) addField('source_code', JSON.stringify(request.sourceCode));

        const mimeType = (filePath: string) => {
            const ext = path.extname(filePath).toLowerCase();
            const map: Record<string, string> = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
                '.webm': 'video/webm', '.mov': 'video/quicktime'
            };
            return map[ext] || 'application/octet-stream';
        };

        request.screenshots?.forEach(p => {
            try {
                const data = fs.readFileSync(p);
                addFile('screenshots', path.basename(p), data, mimeType(p));
            } catch {}
        });

        request.videos?.forEach(p => {
            try {
                const data = fs.readFileSync(p);
                addFile('videos', path.basename(p), data, mimeType(p));
            } catch {}
        });

        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return {
            body: Buffer.concat(parts.map(p => Uint8Array.from(p))),
            boundary
        };
    }

    private enhanceDescription(description: string): string {
        const enhancedPrompt = `
Ты — опытный ручной тестировщик интерфейсов. Твоя задача — создавать понятные тест-кейсы для проверки приложения обычным пользователем.

📋 ВАЖНО: Пиши тест-кейсы простым языком, как будто объясняешь коллеге, который впервые открыл приложение.

### 🎯 ФОРМАТ КАЖДОГО ТЕСТ-КЕЙСА:
{
  "id": "TC-001",
  "title": "Простое название того, что проверяем",
  "priority": "high|medium|low",
  "description": "Что проверяется и зачем это нужно пользователю",
  "preconditions": "Что должно быть готово перед началом теста",
  "steps": [
    {
      "step": 1,
      "action": "Что нажать/ввести/выбрать",
      "expected": "Что должно произойти на экране"
    }
  ],
  "expectedResult": "Итоговый результат всей проверки",
  "testData": "Конкретные данные для проверки (если нужны)"
}

### ✅ КАК ПИСАТЬ ШАГИ (очень важно!):

✓ ПРАВИЛЬНО:
- "Нажать на кнопку 'Войти'"
- "Ввести в поле 'Email' значение: test@mail.ru"
- "Выбрать из выпадающего списка 'Москва'"
- "Нажать на иконку корзины рядом с товаром"
- "Прокрутить страницу вниз до кнопки 'Показать ещё'"

✗ НЕПРАВИЛЬНО (технический жаргон):
- "Вызвать метод login()"
- "Отправить POST-запрос"
- "Проверить валидацию формы"
- "Триггернуть событие onClick"
- "Проверить наличие класса active"

### 🎨 ФОКУС НА UI/UX:
Описывай только то, что видит пользователь:
- Кнопки, поля, картинки, текст
- Цвета, сообщения, всплывающие окна
- Переходы между страницами
- Загрузки, анимации, ошибки

НЕ упоминай:
- Базы данных, API, серверы
- Код, классы, функции
- Токены, сессии, куки (если это не влияет на UI)

### 📱 ЧТО ТЕСТИРУЕМ:

1. **Позитивные сценарии** (всё работает правильно):
   - Пользователь вводит корректные данные
   - Все кнопки работают
   - Переходы между страницами успешны

2. **Негативные сценарии** (что-то идёт не так):
   - Пустые поля
   - Неправильный формат email/телефона
   - Слишком длинный текст
   - Специальные символы в полях

3. **Граничные значения**:
   - Минимальная и максимальная длина
   - Нулевые значения
   - Очень большие числа

4. **UX-проверки**:
   - Понятны ли сообщения об ошибках
   - Видны ли все элементы на экране
   - Удобно ли нажимать на кнопки
   - Есть ли подсказки для пользователя

5. **Разные устройства** (если актуально):
   - Компьютер
   - Планшет
   - Телефон (вертикальная/горизонтальная ориентация)

### 🎯 ПРИОРИТЕТЫ:

**HIGH (высокий)** — без этого приложение не работает:
- Вход/регистрация
- Оплата
- Создание/удаление важных данных
- Критичные ошибки

**MEDIUM (средний)** — основные функции:
- Поиск
- Фильтры
- Редактирование профиля
- Просмотр контента

**LOW (низкий)** — дополнительные возможности:
- Смена темы оформления
- Второстепенные настройки
- Косметические недочёты

### 💬 ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
${description}

### 📝 ПРИМЕР ХОРОШЕГО ТЕСТ-КЕЙСА:

{
  "id": "TC-001",
  "title": "Успешный вход в приложение",
  "priority": "high",
  "description": "Проверяем, что зарегистрированный пользователь может войти в свой аккаунт с правильным логином и паролем",
  "preconditions": "Пользователь зарегистрирован в системе",
  "steps": [
    {
      "step": 1,
      "action": "Открыть главную страницу приложения",
      "expected": "Отображается кнопка 'Войти' в правом верхнем углу"
    },
    {
      "step": 2,
      "action": "Нажать на кнопку 'Войти'",
      "expected": "Открывается форма входа с полями 'Email' и 'Пароль'"
    },
    {
      "step": 3,
      "action": "Ввести в поле 'Email' значение: user@example.com",
      "expected": "В поле отображается введённый email"
    },
    {
      "step": 4,
      "action": "Ввести в поле 'Пароль' значение: Test123!",
      "expected": "В поле отображаются точки (пароль скрыт)"
    },
    {
      "step": 5,
      "action": "Нажать на кнопку 'Войти'",
      "expected": "Появляется индикатор загрузки, затем происходит переход на главную страницу личного кабинета"
    }
  ],
  "expectedResult": "Пользователь успешно вошёл в систему, видит своё имя в правом верхнем углу и имеет доступ к функциям личного кабинета",
  "testData": "Email: user@example.com, Пароль: Test123!"
}

### ⚠️ СТРОГИЕ ПРАВИЛА:

1. Используй ТОЛЬКО простые глаголы: нажать, ввести, выбрать, открыть, закрыть, прокрутить
2. Указывай ТОЧНЫЕ названия кнопок/полей в кавычках: 'Отправить', 'Имя пользователя'
3. Описывай то, что ВИДНО на экране, а не что происходит в коде
4. Каждый шаг — это ОДНО действие пользователя
5. Ожидаемый результат — это ИЗМЕНЕНИЕ на экране (новая страница, сообщение, изменение цвета и т.д.)

Верни ТОЛЬКО валидный JSON-массив с тест-кейсами. НИКАКИХ пояснений, комментариев или дополнительного текста вне JSON.
`;

        return enhancedPrompt;
    }

    async generateTestCases(
        llmConfig: LLMConfig,
        request: GenerateRequest,
        onProgress?: (message: string) => void
    ): Promise<GenerateResponse> {
        const configService = new ConfigService();
        const debugEnabled = configService.getDebugEnabled();

        try {
            if (llmConfig.provider === 'ollama' || llmConfig.provider === 'llmstudio') {
                const baseUrl = (llmConfig.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
                onProgress?.('Подключение к локальной LLM...');

                try {
                    await this.ollamaRequest(baseUrl, { model: llmConfig.model, prompt: 'ping', stream: false });
                } catch {
                    throw new Error(`Ollama недоступен: ${baseUrl}\nЗапустите: ollama serve`);
                }

                onProgress?.('Анализ требований...');

                const systemPrompt = `Ты опытный ручной тестировщик UI. Создавай простые и понятные тест-кейсы на русском языке.

СТРОГИЙ ФОРМАТ - верни ТОЛЬКО JSON-массив, без markdown и пояснений:
[
  {
    "id": "TC-001",
    "title": "Краткое название проверки",
    "priority": "high|medium|low",
    "description": "Что проверяется простыми словами",
    "steps": [
      {
        "step": 1,
        "action": "Что нажать/ввести (простым языком)",
        "expected": "Что увидит пользователь на экране"
      }
    ],
    "expectedResult": "Итоговый результат для пользователя",
    "preconditions": "Что должно быть готово (опционально)",
    "testData": "Конкретные данные для теста (опционально)"
  }
]

ПРАВИЛА:
- Пиши как для человека, не знающего программирование
- Описывай только UI: кнопки, поля, текст, переходы
- Используй простые глаголы: нажать, ввести, выбрать, открыть
- Никаких технических терминов: API, валидация, триггер, метод
- Включай позитивные, негативные сценарии и граничные случаи
- Указывай точные названия элементов в кавычках: 'Войти', 'Email'`;

                let userPrompt = request.description || 'Сгенерируй тестовые кейсы для UI.';
                if (request.sourceCode?.files?.length) {
                    userPrompt += `\n\nКод приложения (для понимания функций):\n${request.sourceCode.files.map(f => `// ${f.path}\n${f.content}`).join('\n\n')}`;
                }
                if (request.sourceCode?.structure) {
                    userPrompt += `\n\nСтруктура проекта:\n${request.sourceCode.structure}`;
                }

                onProgress?.('Генерация тест-кейсов...');

                const response1 = await this.ollamaRequest(baseUrl, {
                    model: llmConfig.model,
                    prompt: userPrompt,
                    system: systemPrompt,
                    stream: false,
                    options: { temperature: 0.3, num_ctx: 32768 }
                });

                const raw1 = (response1.response || response1).trim();

                if (debugEnabled) {
                    onProgress?.(`DEBUG: LLM Response:\n${raw1}`);
                }

                const jsonMatch = raw1.match(/\[[\s\S]*\]/);
                if (!jsonMatch) throw new Error('Ollama не вернул корректный JSON-массив');

                let jsonStr = jsonMatch[0];

                let testCases;
                try {
                    testCases = JSON.parse(jsonStr);
                } catch (parseError) {
                    jsonStr = this.fixJsonString(jsonStr.replace('[', '{ "test_cases": ').replace(']', ' }'));
                    const data = JSON.parse(jsonStr);
                    testCases = data.test_cases;
                }
                if (!Array.isArray(testCases)) throw new Error('Некорректный формат тест-кейсов');

                onProgress?.('Готово!');
                return { testCases, markdown: '' };
            }

            // Backend
            onProgress?.('Отправка запроса на бэкенд...');
            const formData = this.createMultipartFormData(llmConfig, request);

            const response = await this.makeRequest<GenerateResponse>(
                'POST',
                '/generate',
                formData,
                {},
                true
            );

            onProgress?.('Готово!');
            return response;

        } catch (error: any) {
            onProgress?.(`Error: ${error.message}`);
            throw error;
        }
    }

    async generateAutotests(
        llmConfig: LLMConfig,
        request: any,
        onProgress?: (message: string) => void
    ): Promise<any> {
        const configService = new ConfigService();
        const debugEnabled = configService.getDebugEnabled();

        try {
            if (llmConfig.provider === 'ollama' || llmConfig.provider === 'llmstudio') {
                const baseUrl = (llmConfig.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
                onProgress?.('Подключение к локальной LLM...');

                try {
                    await this.ollamaRequest(baseUrl, { model: llmConfig.model, prompt: 'ping', stream: false });
                } catch {
                    throw new Error(`Ollama недоступен: ${baseUrl}\nЗапустите: ollama serve`);
                }

                onProgress?.('Анализ требований...');

                const systemPrompt = `You are an expert QA automation engineer. Generate comprehensive automated test code based on the provided information.

Generate automated tests using playwright framework in javascript.

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

Return ONLY raw JSON (no markdown formatting, no code blocks, no additional text):

{
  "test_files": [
    {
      "filename": "test_example.spec.js",
      "content": "// Complete test file content here\\n// With Russian comments\\n// Комментарии на русском для облегчения ревью",
      "description": "Test file description",
      "framework": "playwright",
      "language": "javascript"
    }
  ],
  "support_files": [
    {
      "filename": "page_objects/LoginPage.js",
      "content": "// Page object or helper file content",
      "description": "Support file description"
    }
  ],
  "readme": "# Auto-generated Tests\\n\\n## Setup Instructions\\n...\\n\\n## Running Tests\\n..."
}

JSON VALIDATION REQUIREMENTS:
- All property values must be properly quoted
- No trailing commas after the last element
- Proper nesting with correct braces and brackets

Make sure to:
- Generate at least 3 comprehensive test files
- Include proper imports and dependencies
- Add meaningful Russian comments (// комментарий)
- Create modular, reusable code
- Follow playwright best practices
- Use proper JSON syntax (no syntax errors)
`;

                let userPrompt = request.description || 'Сгенерируй автоматические тесты.';
                if (request.sourceCode?.files?.length) {
                    userPrompt += `\n\nИсходный код:\n${request.sourceCode.files.map((f: any) => `// ${f.path}\n${f.content}`).join('\n\n')}`;
                }
                if (request.sourceCode?.structure) {
                    userPrompt += `\n\nСтруктура проекта:\n${request.sourceCode.structure}`;
                }

                onProgress?.('Генерация автотестов...');

                const response = await this.ollamaRequest(baseUrl, {
                    model: llmConfig.model,
                    prompt: userPrompt,
                    system: systemPrompt,
                    stream: false,
                    options: { temperature: 0.3, num_ctx: 32768 }
                });

                const raw = (response.response || response).trim();

                if (debugEnabled) {
                    onProgress?.(`DEBUG: LLM Response:\n${raw}`);
                }

                const jsonMatch = raw.match(/\{[\s\S]*?\}/);
                if (!jsonMatch) throw new Error('Ollama не вернул корректный JSON');

                let jsonStr = jsonMatch[0];

                let data;
                try {
                    data = JSON.parse(jsonStr);
                } catch (parseError) {
                    jsonStr = this.fixJsonString(jsonStr);
                    data = JSON.parse(jsonStr);
                }
                if (!data.test_files) throw new Error('Некорректный формат автотестов');

                onProgress?.('Готово!');
                return data;
            }

            // Backend
            onProgress?.('Отправка запроса на бэкенд...');
            const formData = this.createAutotestMultipartFormData(llmConfig, request);

            const response = await this.makeRequest<any>(
                'POST',
                '/generate-autotests',
                formData,
                {},
                true
            );

            onProgress?.('Готово!');
            return response;

        } catch (error: any) {
            onProgress?.(`Error: ${error.message}`);
            throw error;
        }
    }

    private createAutotestMultipartFormData(llmConfig: LLMConfig, request: any): { body: Buffer, boundary: string } {
        const boundary = `----FormBoundary${Date.now()}`;
        const parts: Buffer[] = [];

        const addField = (name: string, value: string) => {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        };

        const addFile = (name: string, filename: string, data: Buffer, contentType: string) => {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
            parts.push(data);
            parts.push(Buffer.from('\r\n'));
        };

        addField('provider', llmConfig.provider);
        addField('api_key', llmConfig.apiKey || '');
        addField('model', llmConfig.model);

        if (request.description) addField('description', request.description);
        if (request.sourceCode) addField('source_code', JSON.stringify(request.sourceCode));
        if (request.framework) addField('framework', request.framework);
        if (request.language) addField('language', request.language);

        const mimeType = (filePath: string) => {
            const ext = path.extname(filePath).toLowerCase();
            const map: Record<string, string> = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
                '.webm': 'video/webm', '.mov': 'video/quicktime'
            };
            return map[ext] || 'application/octet-stream';
        };

        request.screenshots?.forEach((p: string) => {
            try {
                const data = fs.readFileSync(p);
                addFile('screenshots', path.basename(p), data, mimeType(p));
            } catch {}
        });

        request.videos?.forEach((p: string) => {
            try {
                const data = fs.readFileSync(p);
                addFile('videos', path.basename(p), data, mimeType(p));
            } catch {}
        });

        parts.push(Buffer.from(`--${boundary}--\r\n`));
        return {
            body: Buffer.concat(parts.map(p => Uint8Array.from(p))),
            boundary
        };
    }

    async uploadToJira(jiraConfig: JiraConfig, testCase: any): Promise<void> {
        const auth = Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString('base64');
        const issueData = {
            fields: {
                project: { key: jiraConfig.projectKey },
                summary: testCase.title,
                description: this.formatJiraDescription(testCase),
                issuetype: { name: 'Test' }
            }
        };

        const jiraUrl = new URL('/rest/api/3/issue', jiraConfig.url);
        const jiraService = new ApiService(jiraConfig.url);
        
        await jiraService.makeRequest('POST', jiraUrl.pathname, issueData, {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/json'
        });
    }

    private formatJiraDescription(testCase: any): string {
        let desc = `*${testCase.description}*\n\nh3. Шаги:\n`;
        testCase.steps.forEach((step: any, i: number) => {
            desc += `${i + 1}. ${step.action}\n   Ожидается: ${step.expected}\n`;
        });
        desc += `\nh3. Ожидаемый результат:\n${testCase.expectedResult}`;
        return desc;
    }

    async generateXlsxBuffer(testCases: any[]): Promise<Buffer> {
        if (!Array.isArray(testCases) || testCases.length === 0) {
            throw new Error('No test cases provided for XLSX generation');
        }

        const sanitize = (value: any): string => {
            if (value == null) return '';
            if (typeof value !== 'string') value = String(value);
            return value
                .replace(/\u0000/g, '')
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n');
        };

        const cleanTestCases = testCases.map(tc => {
            const steps = Array.isArray(tc.steps)
                ? tc.steps.map((step: any, idx: number) => ({
                    step: step.step != null ? Number(step.step) : idx + 1,
                    action: sanitize(step.action || step.description || ''),
                    expected: sanitize(step.expected || step.expected_result || '')
                }))
                : [];

            return {
                title: sanitize(tc.title || tc.name || ''),
                preconditions: sanitize(tc.preconditions || tc.setup || ''),
                steps,
                expectedResult: sanitize(tc.expectedResult || tc.expected_outcome || tc.expected || ''),
                context: sanitize(tc.context || tc.description || ''),
                result: sanitize(tc.result || ''),
                priority: sanitize(tc.priority || 'medium'),
                description: sanitize(tc.description || tc.desc || '')
            };
        });

        const payload = { test_cases: cleanTestCases };
        let jsonStr: string;

        try {
            jsonStr = JSON.stringify(payload);
            JSON.parse(jsonStr);
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown JSON error';
            console.error('[generateXlsxBuffer] Invalid JSON:', msg);
            throw new Error(`Invalid test case data: ${msg}`);
        }

        return new Promise((resolve, reject) => {
            const url = new URL(`${this.backendUrl}/generate-xlsx`);
            const byteLength = Buffer.byteLength(jsonStr, 'utf-8');

            const options: https.RequestOptions = {
                hostname: url.hostname,
                port: url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': byteLength,
                    'User-Agent': 'RuTest.AI-Extension/1.0'
                },
                rejectUnauthorized: false,
                timeout: 900_000
            };

            const protocol = url.protocol === 'https:' ? https : http;
            const req = protocol.request(options, (res) => {
                const chunks: Uint8Array[] = [];

                res.on('data', (chunk: Uint8Array) => {
                    chunks.push(chunk);
                });

                res.on('end', () => {
                    const fullBuffer = Buffer.concat(Array.from(chunks));

                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(fullBuffer);
                    } else {
                        let errorMsg = `HTTP ${res.statusCode}`;
                        if (res.statusMessage) errorMsg += `: ${res.statusMessage}`;

                        try {
                            const bodyText = fullBuffer.toString('utf-8');
                            if (bodyText) errorMsg += `\nResponse: ${bodyText}`;
                        } catch (_) {}

                        reject(new Error(errorMsg));
                    }
                });
            });

            req.on('error', (err) => {
                reject(new Error(`Network error: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout after 15 minutes.'));
            });

            req.write(jsonStr, 'utf-8');
            req.end();
        });
    }

    private fixJsonString(jsonStr: string): string {
        let repaired = this.simpleJsonRepair(jsonStr);
        try {
            JSON.parse(repaired);
            return repaired;
        } catch {
            // Продолжаем repair
        }

        const candidates = this.extractJsonCandidates(jsonStr);
        for (const candidate of candidates) {
            try {
                JSON.parse(candidate);
                return candidate;
            } catch {
                continue;
            }
        }

        return this.extremeJsonFallback(jsonStr);
    }

    private extremeJsonFallback(jsonStr: string): string {
        const testFilesMatch = jsonStr.match(/"test_files"\s*:\s*\[[\s\S]*?\]/i);
        if (testFilesMatch) {
            return `{"test_files": ${testFilesMatch[0]}}`;
        }

        const testCasesMatch = jsonStr.match(/"test_cases"\s*:\s*\[[\s\S]*?\]/i);
        if (testCasesMatch) {
            return `{"test_cases": ${testCasesMatch[0]}}`;
        }

        return '{"test_files": []}';
    }

    private simpleJsonRepair(jsonStr: string): string {
        jsonStr = jsonStr.trim();

        const startBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (startBrace !== -1 && lastBrace !== -1 && lastBrace > startBrace) {
            jsonStr = jsonStr.substring(startBrace, lastBrace + 1);
        }

        let inString = false;
        let escapeNext = false;
        const result: string[] = [];

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                result.push(char);
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                result.push(char);
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                result.push(char);
                continue;
            }

            if (inString && char === '\n') {
                result.push('\\n');
            } else if (inString && char === '\t') {
                result.push(' ');
            } else if (inString && char === '\r') {
                continue;
            } else {
                result.push(char);
            }
        }

        jsonStr = result.join('');
        jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

        const quoteCount = (jsonStr.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
            jsonStr += '"';
        }

        jsonStr = jsonStr.replace(/}(\s*)"([^"]+)":/g, '},$1"$2":');
        jsonStr = jsonStr.replace(/](\s*)"([^"]+)":/g, '],$1"$2":');

        return jsonStr;
    }

    private extractJsonCandidates(jsonStr: string): string[] {
        const candidates: string[] = [];

        let braceCount = 0;
        let startPos = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = 0; i < jsonStr.length; i++) {
            const char = jsonStr[i];

            if (escapeNext) {
                escapeNext = false;
                continue;
            }

            if (char === '\\') {
                escapeNext = true;
                continue;
            }

            if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
            }

            if (!inString) {
                if (char === '{') {
                    if (braceCount === 0) {
                        startPos = i;
                    }
                    braceCount++;
                } else if (char === '}') {
                    braceCount--;
                    if (braceCount === 0 && startPos !== -1) {
                        const candidate = jsonStr.substring(startPos, i + 1);
                        candidates.push(candidate);
                    }
                }
            }
        }

        return candidates.sort((a, b) => b.length - a.length);
    }
}