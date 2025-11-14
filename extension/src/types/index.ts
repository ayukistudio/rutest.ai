export interface LLMConfig {
    provider: 'openai' | 'openrouter' | 'anthropic' | 'ollama' | 'llmstudio';
    apiKey?: string;
    model: string;
    baseUrl?: string;
}

export interface GenerateRequest {
    description?: string;
    screenshots?: string[];
    videos?: string[];
    recordings?: any[];
    sourceCode?: SourceCodeContext;
}

export interface SourceCodeContext {
    files: FileContext[];
    structure: string;
}

export interface FileContext {
    path: string;
    content: string;
    language: string;
}

export interface TestCase {
    id: string;
    title: string;
    description: string;
    steps: TestStep[];
    expectedResult: string;
    priority: 'high' | 'medium' | 'low';
}

export interface TestStep {
    step: number;
    action: string;
    expected: string;
}

export interface GenerateResponse {
    testCases: TestCase[];
    markdown: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface JiraConfig {
    enabled: boolean;
    url: string;
    email: string;
    apiToken: string;
    projectKey: string;
}

export interface LLMConfig {
    provider: 'openai' | 'openrouter' | 'anthropic' | 'ollama' | 'llmstudio';
    apiKey?: string;
    model: string;
    baseUrl?: string;
}