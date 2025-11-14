import * as vscode from 'vscode';

export class RuTestViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('RuTestViewProvider received message:', data.type);
            switch (data.type) {
                case 'generateTestCases':
                    console.log('Opening chat view');
                    vscode.commands.executeCommand('rutest-ai.openChat');
                    break;
                case 'openSettings':
                    console.log('Opening settings');
                    vscode.commands.executeCommand('rutest-ai.openSettings');
                    break;
                case 'generateAutotests':
                    console.log('Opening autotests chat');
                    vscode.commands.executeCommand('rutest-ai.openAutotests');
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'styles.css')
        );
        const iconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png')
        );

        return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RuTest.AI</title>
    <link href="${styleUri}" rel="stylesheet">
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
        }
        .container {
            padding: 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            width: 48px;
            height: 48px;
            margin-bottom: 10px;
        }
        h1 {
            font-size: 24px;
            margin: 10px 0;
            color: var(--vscode-foreground);
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
        }
        .menu {
            display: flex;
            flex-direction: column;
            gap: 15px;
            margin-top: 20px;
        }
        .menu-item {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 15px 20px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
            transition: background-color 0.2s;
        }
        .menu-item:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .menu-item-icon {
            font-size: 20px;
        }
        .menu-item-content {
            flex: 1;
            text-align: left;
        }
        .menu-item-title {
            font-weight: 600;
            margin-bottom: 4px;
        }
        .menu-item-description {
            font-size: 12px;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${iconUri}" alt="RuTest.AI" class="logo">
            <h1>RuTest.AI</h1>
            <p class="subtitle">Автоматизация тестирования на базе ИИ</p>
        </div>

        <div class="menu">
            <button class="menu-item" onclick="generateTestCases()">
                <div class="menu-item-content">
                    <div class="menu-item-title">Генерировать тестовые случаи</div>
                    <div class="menu-item-description">Создавать тестовые случаи из описаний, скриншотов или кода</div>
                </div>
            </button>

            <button class="menu-item" onclick="generateAutotests()">
                <div class="menu-item-content">
                    <div class="menu-item-title">Автотесты</div>
                    <div class="menu-item-description">Генерировать готовые автотесты на базе Playwright для популярных фреймворков</div>
                </div>
            </button>

            <button class="menu-item" onclick="openSettings()">
                <div class="menu-item-content">
                    <div class="menu-item-title">Настройки</div>
                    <div class="menu-item-description">Настроить провайдера LLM и ключи API</div>
                </div>
            </button>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function generateTestCases() {
            vscode.postMessage({ type: 'generateTestCases' });
        }

        function generateAutotests() {
            vscode.postMessage({ type: 'generateAutotests' });
        }

        function openSettings() {
            vscode.postMessage({ type: 'openSettings' });
        }
    </script>
</body>
</html>`;
    }
}