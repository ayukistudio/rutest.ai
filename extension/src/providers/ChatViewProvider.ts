// src/providers/ChatViewProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { ConfigService } from '../services/ConfigService';
import { ApiService } from '../services/ApiService';
import { FileService } from '../services/FileService';
import { TestCaseService } from '../services/TestCaseService';
import { GenerateRequest } from '../types';

export class ChatViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private configService: ConfigService;
    private apiService: ApiService;
    private fileService: FileService;
    private testCaseService: TestCaseService;
    private mode: 'testcases' | 'autotests' = 'testcases';

    constructor(private readonly extensionUri: vscode.Uri, apiService?: ApiService, mode: 'testcases' | 'autotests' = 'testcases') {
        this.configService = new ConfigService();
        this.apiService = apiService || new ApiService(this.configService.getBackendUrl());
        this.fileService = new FileService();
        this.testCaseService = new TestCaseService();
        this.mode = mode;
    }

    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        const title = this.mode === 'autotests'
            ? 'RuTest.AI — Генератор автотестов'
            : 'RuTest.AI — Генератор тест-кейсов';

        this.panel = vscode.window.createWebviewPanel(
            'rutestChat',
            title,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    this.extensionUri,
                    vscode.Uri.joinPath(this.extensionUri, 'media')
                ],
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);
        this.panel.webview.onDidReceiveMessage(m => this.handleMessage(m));
        this.panel.onDidDispose(() => this.panel = undefined);
    }

    private async handleMessage(message: any) {
        switch (message.type) {
            case 'selectFiles': await this.handleSelectFiles(); break;
            case 'selectImages': await this.handleSelectImages(); break;
            case 'selectVideos': await this.handleSelectVideos(); break;
            case 'analyzeWorkspace': await this.handleAnalyzeWorkspace(); break;
            case 'generate': await this.handleGenerate(message.data); break;
            case 'saveMarkdown': await this.handleSaveMarkdown(message.data); break;
            case 'saveXlsx': await this.handleSaveXlsx(message.data.testCases); break;
            case 'uploadToJira': await this.handleUploadToJira(message.data); break;
            case 'saveAutotests': await this.handleSaveAutotests(message.data); break;
            case 'uploadToQase': await this.handleUploadToQase(message.data); break;
        }
    }

    private async handleAnalyzeWorkspace() {
        try {
            this.sendAgentAction('scan', 'Сканирование рабочей области...');
            const folders = vscode.workspace.workspaceFolders;
            if (!folders) throw new Error('Нет открытой рабочей области');

            const structure = await this.fileService.getWorkspaceStructure();
            this.sendAgentAction('analyze', 'Анализ структуры проекта...');
            await this.delay(600);
            this.sendAgentAction('complete', 'Анализ завершён');

            this.sendMessage({ type: 'workspaceAnalyzed', data: { structure } });
        } catch (e: any) {
            this.sendMessage({ type: 'error', data: { message: e.message } });
        }
    }

    private async handleSelectFiles() {
        try {
            this.sendAgentAction('file', 'Открытие выбора файлов...');
            const files = await this.fileService.selectFiles();
            if (!files.length) return;

            this.sendAgentAction('load', `Загрузка ${files.length} файла(ов)...`);
            const sourceCode = await this.fileService.getSelectedFiles(files);
            this.sendAgentAction('complete', 'Файлы загружены');

            this.sendMessage({
                type: 'filesSelected',
                data: {
                    count: files.length,
                    files: files.map(f => ({ name: path.basename(f), path: f, type: path.extname(f).slice(1) })),
                    sourceCode
                }
            });
        } catch (e: any) {
            this.sendMessage({ type: 'error', data: { message: e.message } });
        }
    }

    private async handleSelectImages() {
        try {
            this.sendAgentAction('file', 'Открытие выбора изображений...');
            const images = await this.fileService.selectImages();
            if (!images.length) return;

            this.sendAgentAction('load', `Загрузка ${images.length} изображения(й)...`);
            this.sendMessage({
                type: 'imagesSelected',
                data: {
                    count: images.length,
                    images: images.map(i => ({ name: path.basename(i), path: i })),
                    paths: images
                }
            });
            this.sendAgentAction('complete', 'Изображения загружены');
        } catch (e: any) {
            this.sendMessage({ type: 'error', data: { message: e.message } });
        }
    }

    private async handleSelectVideos() {
        try {
            this.sendAgentAction('file', 'Открытие выбора видео...');
            const videos = await this.fileService.selectVideos();
            if (!videos.length) return;

            this.sendAgentAction('load', `Загрузка ${videos.length} видео/файлов...`);
            this.sendMessage({
                type: 'videosSelected',
                data: {
                    count: videos.length,
                    videos: videos.map(v => ({ name: path.basename(v), path: v })),
                    paths: videos
                }
            });
            this.sendAgentAction('complete', 'Видео загружены');
        } catch (e: any) {
            this.sendMessage({ type: 'error', data: { message: e.message } });
        }
    }

    private async handleGenerate(data: any) {
        try {
            this.sendAgentAction('init', 'Инициализация генерации...');
            await this.delay(300);

            this.configService.refresh();
            const v = this.configService.isConfigValid();
            if (!v.valid) throw new Error(v.message);

            const llm = this.configService.getLLMConfig();
            const url = this.configService.getBackendUrl();

            this.sendAgentAction('config', 'Проверка конфигурации...');
            await this.delay(200);

            this.sendAgentAction('health', 'Подключение к бэкенду...');
            const healthy = await this.apiService.healthCheck();
            if (!healthy) throw new Error(`Бэкенд недоступен по адресу ${url}`);
            this.sendAgentAction('connect', 'Подключено');

            // Проверяем, были ли прикреплены файлы/изображения/видео
            const hasManualAttachments = 
                (data.sourceCode?.files && data.sourceCode.files.length > 0) ||
                (data.imagePaths && data.imagePaths.length > 0) ||
                (data.videoPaths && data.videoPaths.length > 0);

            let finalSourceCode = data.sourceCode;

            // Если ничего не прикреплено — анализируем проект автоматически
            if (!hasManualAttachments) {
                this.sendAgentAction('scan', 'Автоанализ проекта...');
                try {
                    finalSourceCode = await this.fileService.autoDiscoverRelevantFiles();
                    this.sendAgentAction('analyze', 'Проект изучен автоматически');

                    // ✅ Отображаем структуру ТОЛЬКО ПОСЛЕ получения данных
                    if (finalSourceCode?.structure) {
                        this.sendAgentAction('analyze', 'Визуализация структуры проекта...');
                        await this.delay(300);
                        this.displayProjectStructure(
                            finalSourceCode.structure,
                            finalSourceCode.files || []
                        );
                        await this.delay(500);
                    }
                } catch (e: any) {
                    console.warn('Auto-discovery failed:', e.message);
                    // Продолжаем без файлов
                }
            }

            const request: GenerateRequest = {
                description: data.description,
                screenshots: data.imagePaths,
                videos: data.videoPaths,
                sourceCode: finalSourceCode
            };

            this.sendAgentAction('process', 'Подготовка запроса...');
            await this.delay(400);
            this.sendAgentAction('generate', 'Генерация тест-кейсов...');

            if (this.mode === 'autotests') {
                // Generate autotests
                const autotestRequest = {
                    ...request,
                    framework: 'playwright',
                    language: 'javascript'
                };

                const res = await this.apiService.generateAutotests(llm, autotestRequest, msg => {
                    this.sendAgentAction('progress', msg);
                });

                this.sendAgentAction('validate', 'Проверка результата...');
                await this.delay(300);

                this.sendAgentAction('complete', 'Готово');
                this.sendMessage({ type: 'autotestResult', data: res });
            } else {
                // Generate regular test cases
                const res = await this.apiService.generateTestCases(llm, request, msg => {
                    this.sendAgentAction('progress', msg);
                });

                this.sendAgentAction('validate', 'Проверка результата...');
                await this.delay(300);

                const markdown = this.testCaseService.formatMarkdown(res.testCases);
                this.sendAgentAction('complete', 'Готово');
                this.sendMessage({ type: 'result', data: { testCases: res.testCases, markdown } });
            }
        } catch (e: any) {
            this.sendAgentAction('error', e.message);
            this.sendMessage({ type: 'error', data: { message: e.message } });
        }
    }

    
    private async handleSaveXlsx(testCases: any[]) {
        try {
            this.sendAgentAction('prepare', 'Подготовка данных для XLSX...');
            await this.delay(200);
            if (!testCases || !Array.isArray(testCases) || testCases.length === 0) {
                throw new Error('Нет тест-кейсов для экспорта');
            }
            this.sendAgentAction('export', 'Экспорт в XLSX формат...');
            const buffer: Buffer = await this.apiService.generateXlsxBuffer(testCases);
            const folders = vscode.workspace.workspaceFolders;
            if (!folders) throw new Error('Нет открытой рабочей области');
            const rootPath = folders[0].uri.fsPath;
            const testCasesDir = path.join(rootPath, 'test-cases');

            if (!fs.existsSync(testCasesDir)) {
                fs.mkdirSync(testCasesDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const xlsxPath = path.join(testCasesDir, `test-cases-${timestamp}.xlsx`);
            fs.writeFileSync(xlsxPath, new Uint8Array(buffer));
            this.sendAgentAction('complete', `✨ XLSX файл готов! Сохранён как: ${path.basename(xlsxPath)}`);
            vscode.window.showInformationMessage(`XLSX сохранён: ${xlsxPath}`);
        } catch (e: any) {
            this.sendAgentAction('error', `Ошибка генерации XLSX: ${e.message}`);
            vscode.window.showErrorMessage(`Ошибка генерации XLSX: ${e.message}`);
        }
    }


    private async handleSaveMarkdown(d: any) {
        try {
            const p = await this.fileService.saveMarkdown(d.content);
            const doc = await vscode.workspace.openTextDocument(p);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`Сохранено: ${p}`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Ошибка при сохранении: ${e.message}`);
        }
    }

    private async displayProjectStructure(structure: string, files: any[] = []) {
        // Форматируем структуру для лучшей читаемости в чате
        const formattedStructure = structure
            .replace(/├── /g, '┣━━ ')
            .replace(/└── /g, '┗━━ ')
            .replace(/│   /g, '┃   ')
            .replace(/    /g, '    ');

        // Формируем сообщение с полезной информацией
        let messageContent = `**Автоанализ проекта**\n\n`;
        messageContent += `📊 **Структура проекта:**\n\`\`\`\n${formattedStructure}\n\`\`\`\n\n`;
        
        if (files.length > 0) {
            messageContent += `🔍 **Анализируемые файлы (${files.length}):**\n`;
            files.slice(0, 10).forEach((file, index) => {
                messageContent += `${index + 1}. \`${file.path}\`\n`;
            });
            if (files.length > 10) {
                messageContent += `... и ещё ${files.length - 10} файлов\n`;
            }
        } else {
            messageContent += `ℹ️ Не найдено подходящих файлов для анализа. Будут сгенерированы универсальные тест-кейсы.\n`;
        }

        // Отправляем сообщение в чат
        this.sendMessage({
            type: 'message',
            role: 'assistant',
            content: messageContent
        });
    }

    private async handleUploadToJira(d: any) {
        try {
            const cfg = this.configService.getJiraConfig();
            if (!cfg.enabled) throw new Error('Jira отключён');
            if (!cfg.url || !cfg.email || !cfg.apiToken || !cfg.projectKey) throw new Error('Неполная конфигурация Jira');

            for (const tc of d.testCases) await this.apiService.uploadToJira(cfg, tc);
            vscode.window.showInformationMessage(`Загружено ${d.testCases.length} тест-кейса(ов) в Jira`);
        } catch (e: any) {
            vscode.window.showErrorMessage(`Ошибка загрузки в Jira: ${e.message}`);
        }
    }

    private async handleSaveAutotests(data: any) {
        try {
            this.sendAgentAction('prepare', 'Подготовка автотестов для сохранения...');
            await this.delay(200);

            const folders = vscode.workspace.workspaceFolders;
            if (!folders) throw new Error('Нет открытой рабочей области');

            const rootPath = folders[0].uri.fsPath;
            const testsDir = path.join(rootPath, 'tests', 'autotests');

            if (!fs.existsSync(testsDir)) {
                fs.mkdirSync(testsDir, { recursive: true });
            }

            // Save test files
            for (const testFile of data.testFiles || []) {
                const filePath = path.join(testsDir, testFile.filename);
                fs.writeFileSync(filePath, testFile.content, 'utf-8');

                // Open the file in VSCode
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc, { preview: false });
            }

            // Save support files
            for (const supportFile of data.supportFiles || []) {
                const filePath = path.join(testsDir, supportFile.filename);
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, supportFile.content, 'utf-8');
            }

            // Save README
            if (data.readme) {
                const readmePath = path.join(testsDir, 'README.md');
                fs.writeFileSync(readmePath, data.readme, 'utf-8');
            }

            this.sendAgentAction('complete', `✅ Автотесты сохранены в папку: ${path.relative(rootPath, testsDir)}`);
            vscode.window.showInformationMessage(`Автотесты сохранены: ${testsDir}`);
        } catch (e: any) {
            this.sendAgentAction('error', `Ошибка сохранения автотестов: ${e.message}`);
            vscode.window.showErrorMessage(`Ошибка сохранения автотестов: ${e.message}`);
        }
    }

    private async handleUploadToQase(data: any) {
        try {
            this.sendAgentAction('prepare', 'Подготовка к загрузке в Qase...');
            await this.delay(200);

            // This would need to be implemented with proper Qase API integration
            // For now, just show a placeholder
            this.sendAgentAction('complete', 'Загрузка в Qase будет реализована в следующей версии');
            vscode.window.showInformationMessage('Загрузка в Qase: функция в разработке');
        } catch (e: any) {
            this.sendAgentAction('error', `Ошибка загрузки в Qase: ${e.message}`);
            vscode.window.showErrorMessage(`Ошибка загрузки в Qase: ${e.message}`);
        }
    }

    private sendAgentAction(action: string, message: string) {
        this.sendMessage({ type: 'agentAction', data: { action, message } });
    }

    private sendMessage(msg: any) {
        this.panel?.webview.postMessage(msg);
    }

    private delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

    private getHtmlContent(webview: vscode.Webview): string {
        const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.css'));
        const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'chat.js'));
        const headerTitle = this.mode === 'autotests' ? 'Генератор автотестов' : 'Генератор тест-кейсов';

        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RuTest.AI — Генератор</title>
    <link href="${style}" rel="stylesheet">
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <div class="header-title" aria-hidden="true">
                <svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
                <span>${headerTitle}</span>
            </div>
            <button class="header-btn" onclick="analyzeWorkspace()" title="Проанализировать рабочую область" aria-label="Проанализировать рабочую область">
                <svg class="icon" viewBox="0 0 24 24"><path d="M15 15l5.5 5.5"/><circle cx="10.5" cy="10.5" r="7.5"/><path d="M3 10.5h2"/><path d="M10.5 3v2"/></svg>
            </button>
        </div>

        <div class="chat-messages" id="chatMessages" role="log" aria-live="polite">
            <div class="message assistant" aria-hidden="false">
                <div class="avatar" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24"><rect width="18" height="10" x="3" y="11" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v2"/><rect width="16" height="18" x="4" y="3" rx="2"/><path d="M8 21v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M9 9h.01"/><path d="M15 9h.01"/></svg>
                </div>
                <div class="bubble">
                    <p>Привет! Я ваш QA-ассистент. Опишите фичу, приложите файлы, скриншоты или видео — и я сгенерирую тест-кейсы.</p>
                </div>
            </div>
        </div>

        <div class="agent-activity" id="agentActivity" aria-hidden="true"></div>
        <div class="attachments-preview" id="attachmentsPreview" aria-hidden="true"></div>

        <div class="chat-input">
            <div class="toolbar" role="toolbar" aria-label="Инструменты">
                <button class="tool-btn" onclick="selectFiles()" title="Добавить файлы" aria-label="Добавить файлы">
                    <svg class="icon" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                </button>
                <button class="tool-btn" onclick="selectImages()" title="Добавить изображения" aria-label="Добавить изображения">
                    <svg class="icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </button>
                <button class="tool-btn" onclick="selectVideos()" title="Добавить видео" aria-label="Добавить видео">
                    <svg class="icon" viewBox="0 0 24 24"><path d="m15 10 4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14v-4Z"/><rect width="18" height="14" x="3" y="5" rx="2"/></svg>
                </button>
            </div>
            <div class="input-wrapper">
                <textarea id="msgInput" placeholder="Опишите фичу (Enter — отправить, Shift+Enter — новая строка)" rows="1" aria-label="Сообщение"></textarea>
                <button class="send-btn" onclick="sendMessage()" id="sendBtn" title="Отправить" aria-label="Отправить">
                    <!-- Исправленная иконка: бумажный самолётик -->
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M22 2L11 13" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M22 2l-7 20  -3-9-9-3 19-8z" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </div>
    </div>
    <script src="${script}"></script>
</body>
</html>`;
    }
}
