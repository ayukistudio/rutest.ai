import { TestCase } from '../types';

export class TestCaseService {
    formatMarkdown(testCases: TestCase[]): string {
        const timestamp = new Date().toISOString();
        let markdown = `# Test Cases\n\n`;
        markdown += `**Generated:** ${timestamp}\n\n`;
        markdown += `---\n\n`;

        testCases.forEach((testCase, index) => {
            markdown += `## ${index + 1}. ${testCase.title}\n\n`;
            markdown += `**ID:** ${testCase.id}\n\n`;
            markdown += `**Priority:** ${testCase.priority.toUpperCase()}\n\n`;
            markdown += `**Description:**\n${testCase.description}\n\n`;
            
            markdown += `### Steps:\n\n`;
            testCase.steps.forEach((step) => {
                markdown += `${step.step}. **${step.action}**\n`;
                markdown += `   - *Expected:* ${step.expected}\n\n`;
            });

            markdown += `### Expected Result:\n${testCase.expectedResult}\n\n`;
            markdown += `---\n\n`;
        });

        return markdown;
    }

    formatHtml(testCases: TestCase[]): string {
        const timestamp = new Date().toISOString();
        let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Cases</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #007acc;
            padding-bottom: 10px;
        }
        .meta {
            color: #666;
            margin-bottom: 30px;
        }
        .test-case {
            background: #fafafa;
            border-left: 4px solid #007acc;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .test-case h2 {
            margin-top: 0;
            color: #007acc;
        }
        .priority {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .priority-high { background: #ff4444; color: white; }
        .priority-medium { background: #ffaa00; color: white; }
        .priority-low { background: #00cc44; color: white; }
        .steps {
            margin: 15px 0;
        }
        .step {
            background: white;
            padding: 12px;
            margin: 8px 0;
            border-radius: 4px;
            border-left: 3px solid #ddd;
        }
        .step-action {
            font-weight: 600;
            color: #333;
        }
        .step-expected {
            color: #666;
            font-style: italic;
            margin-top: 5px;
        }
        .expected-result {
            background: #e8f5e9;
            padding: 15px;
            border-radius: 4px;
            margin-top: 15px;
        }
        pre {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            border-radius: 4px;
            overflow-x: auto;
        }
        code {
            font-family: 'Courier New', monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Test Cases</h1>
        <div class="meta">Generated: ${timestamp}</div>
`;

        testCases.forEach((testCase, index) => {
            html += `
        <div class="test-case">
            <h2>${index + 1}. ${testCase.title}</h2>
            <p><strong>ID:</strong> ${testCase.id}</p>
            <span class="priority priority-${testCase.priority}">${testCase.priority}</span>
            <p><strong>Description:</strong><br>${testCase.description}</p>
            
            <div class="steps">
                <h3>Steps:</h3>
`;
            testCase.steps.forEach((step) => {
                html += `
                <div class="step">
                    <div class="step-action">${step.step}. ${step.action}</div>
                    <div class="step-expected">Expected: ${step.expected}</div>
                </div>
`;
            });
            html += `
            </div>
            
            <div class="expected-result">
                <strong>Expected Result:</strong><br>
                ${testCase.expectedResult}
            </div>
        </div>
`;
        });

        html += `
    </div>
</body>
</html>`;

        return html;
    }

    private escapeHtml(text: string): string {
        const map: { [key: string]: string } = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }

    validateTestCase(testCase: TestCase): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!testCase.id || testCase.id.trim() === '') {
            errors.push('Test case ID is required');
        }

        if (!testCase.title || testCase.title.trim() === '') {
            errors.push('Test case title is required');
        }

        if (!testCase.description || testCase.description.trim() === '') {
            errors.push('Test case description is required');
        }

        if (!testCase.steps || testCase.steps.length === 0) {
            errors.push('Test case must have at least one step');
        }

        if (!testCase.expectedResult || testCase.expectedResult.trim() === '') {
            errors.push('Expected result is required');
        }

        if (!['high', 'medium', 'low'].includes(testCase.priority)) {
            errors.push('Invalid priority value');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}