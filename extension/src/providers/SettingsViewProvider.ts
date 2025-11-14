import * as vscode from 'vscode';
import { ConfigService } from '../services/ConfigService';

export class SettingsViewProvider {
    private panel: vscode.WebviewPanel | undefined;
    private configService: ConfigService;

    constructor(private readonly extensionUri: vscode.Uri) {
        this.configService = new ConfigService();
    }

    public show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'rutestSettings',
            'RuTest.AI - Settings',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [this.extensionUri],
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message);
        });

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }

    private async handleMessage(message: any) {
        switch (message.type) {
            case 'loadConfig':
                await this.handleLoadConfig();
                break;
            case 'saveConfig':
                await this.handleSaveConfig(message.data);
                break;
        }
    }

    private async handleLoadConfig() {
        try {
            // Create a temporary config service instance to access private config
            const tempConfigService = new ConfigService();
            tempConfigService.refresh();

            const config = {
                provider: tempConfigService['config'].get<string>('provider', 'openai'),
                openai: {
                    apiKey: tempConfigService['config'].get<string>('openai.apiKey', ''),
                    model: tempConfigService['config'].get<string>('openai.model', 'gpt-4')
                },
                openrouter: {
                    apiKey: tempConfigService['config'].get<string>('openrouter.apiKey', ''),
                    model: tempConfigService['config'].get<string>('openrouter.model', 'anthropic/claude-3-opus'),
                    baseUrl: tempConfigService['config'].get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1')
                },
                anthropic: {
                    apiKey: tempConfigService['config'].get<string>('anthropic.apiKey', ''),
                    model: tempConfigService['config'].get<string>('anthropic.model', 'claude-3-opus-20240229')
                },
                ollama: {
                    baseUrl: tempConfigService['config'].get<string>('ollama.baseUrl', 'http://localhost:11434'),
                    model: tempConfigService['config'].get<string>('ollama.model', 'llama2')
                },
                llmstudio: {
                    baseUrl: tempConfigService['config'].get<string>('llmstudio.baseUrl', 'http://localhost:1234'),
                    model: tempConfigService['config'].get<string>('llmstudio.model', 'local-model')
                },
                backend: {
                    url: tempConfigService['config'].get<string>('backend.url', 'https://ayukidev.ru/')
                },
                jira: {
                    enabled: tempConfigService['config'].get<boolean>('jira.enabled', false),
                    url: tempConfigService['config'].get<string>('jira.url', ''),
                    email: tempConfigService['config'].get<string>('jira.email', ''),
                    apiToken: tempConfigService['config'].get<string>('jira.apiToken', ''),
                    projectKey: tempConfigService['config'].get<string>('jira.projectKey', '')
                },
                debug: {
                    enabled: tempConfigService['config'].get<boolean>('debug.enabled', false)
                }
            };

            this.sendMessage({
                type: 'configLoaded',
                data: config
            });
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                data: { message: error.message }
            });
        }
    }

    private async handleSaveConfig(data: any) {
        try {
            const config = vscode.workspace.getConfiguration('rutest-ai');

            await config.update('provider', data.provider, vscode.ConfigurationTarget.Global);

            // Update provider-specific settings
            if (data.provider === 'openai') {
                await config.update('openai.apiKey', data.openai.apiKey, vscode.ConfigurationTarget.Global);
                await config.update('openai.model', data.openai.model, vscode.ConfigurationTarget.Global);
            } else if (data.provider === 'openrouter') {
                await config.update('openrouter.apiKey', data.openrouter.apiKey, vscode.ConfigurationTarget.Global);
                await config.update('openrouter.model', data.openrouter.model, vscode.ConfigurationTarget.Global);
                await config.update('openrouter.baseUrl', data.openrouter.baseUrl, vscode.ConfigurationTarget.Global);
            } else if (data.provider === 'anthropic') {
                await config.update('anthropic.apiKey', data.anthropic.apiKey, vscode.ConfigurationTarget.Global);
                await config.update('anthropic.model', data.anthropic.model, vscode.ConfigurationTarget.Global);
            } else if (data.provider === 'ollama') {
                await config.update('ollama.baseUrl', data.ollama.baseUrl, vscode.ConfigurationTarget.Global);
                await config.update('ollama.model', data.ollama.model, vscode.ConfigurationTarget.Global);
            } else if (data.provider === 'llmstudio') {
                await config.update('llmstudio.baseUrl', data.llmstudio.baseUrl, vscode.ConfigurationTarget.Global);
                await config.update('llmstudio.model', data.llmstudio.model, vscode.ConfigurationTarget.Global);
            }

            await config.update('backend.url', data.backend.url, vscode.ConfigurationTarget.Global);

            await config.update('jira.enabled', data.jira.enabled, vscode.ConfigurationTarget.Global);
            await config.update('jira.url', data.jira.url, vscode.ConfigurationTarget.Global);
            await config.update('jira.email', data.jira.email, vscode.ConfigurationTarget.Global);
            await config.update('jira.apiToken', data.jira.apiToken, vscode.ConfigurationTarget.Global);
            await config.update('jira.projectKey', data.jira.projectKey, vscode.ConfigurationTarget.Global);

            await config.update('debug.enabled', data.debug.enabled, vscode.ConfigurationTarget.Global);

            this.sendMessage({
                type: 'configSaved',
                data: { message: 'Settings saved successfully!' }
            });
        } catch (error: any) {
            this.sendMessage({
                type: 'error',
                data: { message: error.message }
            });
        }
    }

    private sendMessage(message: any) {
        if (this.panel) {
            this.panel.webview.postMessage(message);
        }
    }

    private getHtmlContent(webview: vscode.Webview): string {
        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Настройки RuTest.AI</title>
    <style>
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            padding: 20px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h2 {
            margin-top: 0;
        }
        .section {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .input-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
        }
        select, input[type="text"], input[type="password"] {
            width: 100%;
            padding: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .success {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-inputValidation-infoBackground);
            border-left: 3px solid var(--vscode-inputValidation-infoBorder);
            border-radius: 4px;
            display: none;
        }
        .success.visible {
            display: block;
        }
        .error {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            display: none;
        }
        .error.visible {
            display: block;
        }
        .provider-settings {
            display: none;
        }
        .provider-settings.visible {
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h2>Настройки RuTest.AI</h2>

        <div class="section">
            <div class="input-group">
                <label>Провайдер LLM:</label>
                <select id="provider">
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama</option>
                    <option value="llmstudio">LLM Studio</option>
                </select>
            </div>
        </div>

        <div id="openai-settings" class="section provider-settings">
            <h3>OpenAI</h3>
            <div class="input-group">
                <label>API Key:</label>
                <input type="password" id="openai-apiKey" placeholder="sk-...">
            </div>
            <div class="input-group">
                <label>Модель:</label>
                <input type="text" id="openai-model" placeholder="gpt-4">
            </div>
        </div>

        <div id="openrouter-settings" class="section provider-settings">
            <h3>OpenRouter</h3>
            <div class="input-group">
                <label>API Key:</label>
                <input type="password" id="openrouter-apiKey" placeholder="sk-or-v1-...">
            </div>
            <div class="input-group">
                <label>Модель:</label>
                <input type="text" id="openrouter-model" placeholder="anthropic/claude-3-opus">
            </div>
            <div class="input-group">
                <label>Base URL:</label>
                <input type="text" id="openrouter-baseUrl" placeholder="https://openrouter.ai/api/v1">
            </div>
        </div>

        <div id="anthropic-settings" class="section provider-settings">
            <h3>Anthropic</h3>
            <div class="input-group">
                <label>API Key:</label>
                <input type="password" id="anthropic-apiKey" placeholder="sk-ant-...">
            </div>
            <div class="input-group">
                <label>Модель:</label>
                <input type="text" id="anthropic-model" placeholder="claude-3-opus-20240229">
            </div>
        </div>

        <div id="ollama-settings" class="section provider-settings">
            <h3>Ollama</h3>
            <div class="input-group">
                <label>Base URL:</label>
                <input type="text" id="ollama-baseUrl" placeholder="http://localhost:11434">
            </div>
            <div class="input-group">
                <label>Модель:</label>
                <input type="text" id="ollama-model" placeholder="llama2">
            </div>
        </div>

        <div id="llmstudio-settings" class="section provider-settings">
            <h3>LLM Studio</h3>
            <div class="input-group">
                <label>Base URL:</label>
                <input type="text" id="llmstudio-baseUrl" placeholder="http://localhost:1234">
            </div>
            <div class="input-group">
                <label>Модель:</label>
                <input type="text" id="llmstudio-model" placeholder="local-model">
            </div>
        </div>

        <div class="section">
            <h3>Backend</h3>
            <div class="input-group">
                <label>API URL:</label>
                <input type="text" id="backend-url" placeholder="https://ayukidev.ru/">
            </div>
        </div>

        <div class="section">
            <h3>Debug Mode</h3>
            <div class="input-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="debug-enabled">
                    <label for="debug-enabled">Включить debug режим (показывать ответы LLM)</label>
                </div>
            </div>
        </div>

        <div class="section">
            <h3>Jira Integration</h3>
            <div class="input-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="jira-enabled">
                    <label for="jira-enabled">Включить интеграцию с Jira</label>
                </div>
            </div>
            <div id="jira-fields" style="display: none;">
                <div class="input-group">
                    <label>Jira URL:</label>
                    <input type="text" id="jira-url" placeholder="https://yourcompany.atlassian.net">
                </div>
                <div class="input-group">
                    <label>Email:</label>
                    <input type="text" id="jira-email" placeholder="your.email@company.com">
                </div>
                <div class="input-group">
                    <label>API Token:</label>
                    <input type="password" id="jira-apiToken" placeholder="ATATT3xFfGF0...">
                </div>
                <div class="input-group">
                    <label>Project Key:</label>
                    <input type="text" id="jira-projectKey" placeholder="PROJ">
                </div>
            </div>
        </div>

        <button onclick="saveSettings()">Сохранить настройки</button>

        <div id="success" class="success"></div>
        <div id="error" class="error"></div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        let currentConfig = {};

        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'loadConfig' });
        });

        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'configLoaded':
                    loadConfig(message.data);
                    break;
                case 'configSaved':
                    showSuccess(message.data.message);
                    break;
                case 'error':
                    showError(message.data.message);
                    break;
            }
        });

        function loadConfig(config) {
            currentConfig = config;

            document.getElementById('provider').value = config.provider;

            // Load provider-specific settings
            document.getElementById('openai-apiKey').value = config.openai.apiKey;
            document.getElementById('openai-model').value = config.openai.model;

            document.getElementById('openrouter-apiKey').value = config.openrouter.apiKey;
            document.getElementById('openrouter-model').value = config.openrouter.model;
            document.getElementById('openrouter-baseUrl').value = config.openrouter.baseUrl;

            document.getElementById('anthropic-apiKey').value = config.anthropic.apiKey;
            document.getElementById('anthropic-model').value = config.anthropic.model;

            document.getElementById('ollama-baseUrl').value = config.ollama.baseUrl;
            document.getElementById('ollama-model').value = config.ollama.model;

            document.getElementById('llmstudio-baseUrl').value = config.llmstudio.baseUrl;
            document.getElementById('llmstudio-model').value = config.llmstudio.model;

            document.getElementById('backend-url').value = config.backend.url;

            document.getElementById('jira-enabled').checked = config.jira.enabled;
            document.getElementById('jira-url').value = config.jira.url;
            document.getElementById('jira-email').value = config.jira.email;
            document.getElementById('jira-apiToken').value = config.jira.apiToken;
            document.getElementById('jira-projectKey').value = config.jira.projectKey;

            document.getElementById('debug-enabled').checked = config.debug.enabled;

            updateProviderVisibility();
            updateJiraFieldsVisibility();
        }

        function updateProviderVisibility() {
            const provider = document.getElementById('provider').value;
            const settings = ['openai', 'openrouter', 'anthropic', 'ollama', 'llmstudio'];

            settings.forEach(setting => {
                const element = document.getElementById(setting + '-settings');
                if (setting === provider) {
                    element.classList.add('visible');
                } else {
                    element.classList.remove('visible');
                }
            });
        }

        function updateJiraFieldsVisibility() {
            const enabled = document.getElementById('jira-enabled').checked;
            document.getElementById('jira-fields').style.display = enabled ? 'block' : 'none';
        }

        document.getElementById('provider').addEventListener('change', updateProviderVisibility);
        document.getElementById('jira-enabled').addEventListener('change', updateJiraFieldsVisibility);

        function saveSettings() {
            const config = {
                provider: document.getElementById('provider').value,
                openai: {
                    apiKey: document.getElementById('openai-apiKey').value,
                    model: document.getElementById('openai-model').value
                },
                openrouter: {
                    apiKey: document.getElementById('openrouter-apiKey').value,
                    model: document.getElementById('openrouter-model').value,
                    baseUrl: document.getElementById('openrouter-baseUrl').value
                },
                anthropic: {
                    apiKey: document.getElementById('anthropic-apiKey').value,
                    model: document.getElementById('anthropic-model').value
                },
                ollama: {
                    baseUrl: document.getElementById('ollama-baseUrl').value,
                    model: document.getElementById('ollama-model').value
                },
                llmstudio: {
                    baseUrl: document.getElementById('llmstudio-baseUrl').value,
                    model: document.getElementById('llmstudio-model').value
                },
                backend: {
                    url: document.getElementById('backend-url').value
                },
                jira: {
                    enabled: document.getElementById('jira-enabled').checked,
                    url: document.getElementById('jira-url').value,
                    email: document.getElementById('jira-email').value,
                    apiToken: document.getElementById('jira-apiToken').value,
                    projectKey: document.getElementById('jira-projectKey').value
                },
                debug: {
                    enabled: document.getElementById('debug-enabled').checked
                }
            };

            hideSuccess();
            hideError();

            vscode.postMessage({
                type: 'saveConfig',
                data: config
            });
        }

        function showSuccess(message) {
            const success = document.getElementById('success');
            success.textContent = message;
            success.classList.add('visible');
        }

        function hideSuccess() {
            document.getElementById('success').classList.remove('visible');
        }

        function showError(message) {
            const error = document.getElementById('error');
            error.textContent = message;
            error.classList.add('visible');
        }

        function hideError() {
            document.getElementById('error').classList.remove('visible');
        }
    </script>
</body>
</html>`;
    }
}