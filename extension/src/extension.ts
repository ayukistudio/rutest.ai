import * as vscode from 'vscode';
import { RuTestViewProvider } from './providers/RuTestViewProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { SettingsViewProvider } from './providers/SettingsViewProvider';
import { ApiService } from './services/ApiService';
import { ConfigService } from './services/ConfigService';

export function activate(context: vscode.ExtensionContext) {
    console.log('='.repeat(80));
    console.log('🚀 RuTest.AI EXTENSION ACTIVATING');
    console.log('='.repeat(80));

    try {
        // 1. Создаём сервисы
        console.log('📋 Creating ConfigService...');
        const configService = new ConfigService();
        
        console.log('🔍 Loading backend URL...');
        const backendUrl = configService.getBackendUrl();
        console.log('✅ Backend URL:', backendUrl);
        
        console.log('🌐 Creating ApiService...');
        const apiClient = new ApiService(backendUrl);
        console.log('✅ ApiService created');

        // 2. Health check при активации
        const checkHealth = async () => {
            console.log('🏥 Running health check...');
            try {
                const isHealthy = await apiClient.healthCheck();
                if (isHealthy) {
                    console.log('✅ Backend is healthy');
                    vscode.window.showInformationMessage('RuTest.AI: Backend is accessible ✓');
                } else {
                    console.error('❌ Backend health check failed');
                    vscode.window.showWarningMessage(`RuTest.AI: Backend at ${backendUrl} is not accessible`);
                }
            } catch (error: any) {
                console.error('❌ Health check error:', error.message);
                vscode.window.showErrorMessage(`RuTest.AI: Health check failed - ${error.message}`);
            }
        };

        // Запуск health check
        checkHealth();

        // Периодический health check каждые 60 секунд
        const healthCheckInterval = setInterval(checkHealth, 60000);
        context.subscriptions.push({
            dispose: () => {
                console.log('🛑 Stopping health check interval');
                clearInterval(healthCheckInterval);
            }
        });

        // 3. Создаём провайдеры
        console.log('🎨 Creating UI providers...');
        const mainViewProvider = new RuTestViewProvider(context.extensionUri);
        const settingsViewProvider = new SettingsViewProvider(context.extensionUri);
        
        // ВАЖНО: Передаём apiClient в ChatViewProvider
        const chatViewProvider = new ChatViewProvider(context.extensionUri, apiClient, 'testcases');
        const autotestsChatViewProvider = new ChatViewProvider(context.extensionUri, apiClient, 'autotests');
        console.log('✅ All providers created');

        // 4. Регистрируем webview
        console.log('📝 Registering webview provider...');
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                'rutest-ai.mainView',
                mainViewProvider
            )
        );
        console.log('✅ Webview provider registered');

        // 5. Регистрируем команды
        console.log('⚙️ Registering commands...');
        
        context.subscriptions.push(
            vscode.commands.registerCommand('rutest-ai.generateTestCases', () => {
                console.log('🎯 Command: rutest-ai.generateTestCases');
                chatViewProvider.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('rutest-ai.openSettings', () => {
                console.log('⚙️ Command: rutest-ai.openSettings');
                settingsViewProvider.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('rutest-ai.openChat', () => {
                console.log('💬 Command: rutest-ai.openChat');
                chatViewProvider.show();
            })
        );

        context.subscriptions.push(
            vscode.commands.registerCommand('rutest-ai.openAutotests', () => {
                console.log('🤖 Command: rutest-ai.openAutotests');
                autotestsChatViewProvider.show();
            })
        );

        console.log('✅ All commands registered');

        console.log('='.repeat(80));
        console.log('✅ RuTest.AI EXTENSION ACTIVATED SUCCESSFULLY');
        console.log('='.repeat(80));

        // Экспорт API для тестирования
        return {
            apiClient,
            configService,
            chatViewProvider,
            autotestsChatViewProvider
        };
    } catch (error: any) {
        console.error('='.repeat(80));
        console.error('❌ EXTENSION ACTIVATION FAILED');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(80));
        
        vscode.window.showErrorMessage(`RuTest.AI activation failed: ${error.message}`);
        throw error;
    }
}

export function deactivate() {
    console.log('🛑 RuTest.AI extension deactivating');
}