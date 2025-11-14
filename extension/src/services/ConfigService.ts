import * as vscode from 'vscode';
import { LLMConfig, JiraConfig } from '../types';

export class ConfigService {
    private config: vscode.WorkspaceConfiguration;

    constructor() {
        this.config = vscode.workspace.getConfiguration('rutest-ai');
    }

    refresh() {
        this.config = vscode.workspace.getConfiguration('rutest-ai');
    }

    getLLMConfig(): LLMConfig {
        const provider = this.config.get<string>('provider', 'openai') as LLMConfig['provider'];
        
        switch (provider) {
            case 'openai':
                return {
                    provider: 'openai',
                    apiKey: this.config.get<string>('openai.apiKey', ''),
                    model: this.config.get<string>('openai.model', 'gpt-4')
                };
            case 'openrouter':
                return {
                    provider: 'openrouter',
                    apiKey: this.config.get<string>('openrouter.apiKey', ''),
                    model: this.config.get<string>('openrouter.model', 'anthropic/claude-3-opus'),
                    baseUrl: this.config.get<string>('openrouter.baseUrl', 'https://openrouter.ai/api/v1')
                };
            case 'anthropic':
                return {
                    provider: 'anthropic',
                    apiKey: this.config.get<string>('anthropic.apiKey', ''),
                    model: this.config.get<string>('anthropic.model', 'claude-3-opus-20240229')
                };
            case 'ollama':
                return {
                    provider: 'ollama',
                    baseUrl: this.config.get<string>('ollama.baseUrl', 'http://localhost:11434'),
                    model: this.config.get<string>('ollama.model', 'llama2')
                };
            case 'llmstudio':
                return {
                    provider: 'llmstudio',
                    baseUrl: this.config.get<string>('llmstudio.baseUrl', 'http://localhost:1234'),
                    model: this.config.get<string>('llmstudio.model', 'local-model')
                };
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    getBackendUrl(): string {
        return this.config.get<string>('backend.url', 'https://ayukidev.ru').replace(/\/+$/, '');
    }

    getJiraConfig(): JiraConfig {
        return {
            enabled: this.config.get<boolean>('jira.enabled', false),
            url: this.config.get<string>('jira.url', ''),
            email: this.config.get<string>('jira.email', ''),
            apiToken: this.config.get<string>('jira.apiToken', ''),
            projectKey: this.config.get<string>('jira.projectKey', '')
        };
    }

    getDebugEnabled(): boolean {
        return this.config.get<boolean>('debug.enabled', false);
    }

    isConfigValid(): { valid: boolean; message?: string } {
        const llmConfig = this.getLLMConfig();

        if (llmConfig.provider === 'ollama' || llmConfig.provider === 'llmstudio') {
            if (!llmConfig.baseUrl) {
                return { valid: false, message: `${llmConfig.provider} base URL is required` };
            }
            return { valid: true };
        }

        if (!llmConfig.apiKey) {
            return { valid: false, message: `API key for ${llmConfig.provider} is required` };
        }

        return { valid: true };
    }
}