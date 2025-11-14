import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { FileContext, SourceCodeContext } from '../types';

export class FileService {
    async getWorkspaceStructure(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        return this.buildTree(rootPath, '', 0);
    }

    private buildTree(dirPath: string, prefix: string, depth: number): string {
        if (depth > 3) {
            return '';
        }

        let result = '';
        const ignorePatterns = [
            'node_modules',
            '.git',
            'dist',
            'build',
            'out',
            '.vscode',
            'coverage',
            '.next',
            '.nuxt'
        ];

        try {
            const items = fs.readdirSync(dirPath);
            
            items.forEach((item, index) => {
                if (ignorePatterns.includes(item)) {
                    return;
                }

                const itemPath = path.join(dirPath, item);
                const stats = fs.statSync(itemPath);
                const isLast = index === items.length - 1;
                const connector = isLast ? '└── ' : '├── ';

                result += `${prefix}${connector}${item}\n`;

                if (stats.isDirectory()) {
                    const newPrefix = prefix + (isLast ? '    ' : '│   ');
                    result += this.buildTree(itemPath, newPrefix, depth + 1);
                }
            });
        } catch (err) {
            console.error('Error reading directory:', err);
        }

        return result;
    }

    async getFileContent(filePath: string): Promise<FileContext> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath).substring(1);
            const languageMap: { [key: string]: string } = {
                // Web development
                'ts': 'typescript',
                'js': 'javascript',
                'tsx': 'typescriptreact',
                'jsx': 'javascriptreact',
                'vue': 'vue',
                'svelte': 'svelte',
                'html': 'html',
                'css': 'css',
                'scss': 'scss',
                'sass': 'sass',
                'less': 'less',
                // Python
                'py': 'python',
                'pyx': 'python',
                // Java
                'java': 'java',
                // C#
                'cs': 'csharp',
                // PHP
                'php': 'php',
                // Ruby
                'rb': 'ruby',
                // Go
                'go': 'go',
                // Rust
                'rs': 'rust',
                // C/C++
                'cpp': 'cpp',
                'c': 'c',
                'hpp': 'cpp',
                'h': 'c',
                // Kotlin
                'kt': 'kotlin',
                // Scala
                'scala': 'scala',
                // Dart
                'dart': 'dart',
                // Swift
                'swift': 'swift',
                // Configuration
                'json': 'json',
                'xml': 'xml',
                'yaml': 'yaml',
                'yml': 'yaml',
                'md': 'markdown',
                'txt': 'text'
            };

            return {
                path: filePath,
                content,
                language: languageMap[ext] || ext
            };
        } catch (err) {
            throw new Error(`Failed to read file: ${filePath}`);
        }
    }

    async getSelectedFiles(filePaths: string[]): Promise<SourceCodeContext> {
        const files: FileContext[] = [];
        
        for (const filePath of filePaths) {
            try {
                const fileContext = await this.getFileContent(filePath);
                files.push(fileContext);
            } catch (err) {
                console.error(`Error reading file ${filePath}:`, err);
            }
        }

        const structure = await this.getWorkspaceStructure();

        return {
            files,
            structure
        };
    }

    async saveMarkdown(content: string, filename?: string): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const testCasesDir = path.join(rootPath, 'test-cases');

        if (!fs.existsSync(testCasesDir)) {
            fs.mkdirSync(testCasesDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = filename || `test-cases-${timestamp}.md`;
        const filePath = path.join(testCasesDir, fileName);

        fs.writeFileSync(filePath, content, 'utf-8');

        return filePath;
    }


    async encodeImageToBase64(imagePath: string): Promise<string> {
        const imageBuffer = fs.readFileSync(imagePath);
        return imageBuffer.toString('base64');
    }

    async selectFiles(): Promise<string[]> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'Source Files': [
                    // Web
                    'ts', 'js', 'tsx', 'jsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
                    // Python
                    'py', 'pyx',
                    // Java
                    'java',
                    // C#
                    'cs',
                    // PHP
                    'php',
                    // Ruby
                    'rb',
                    // Go
                    'go',
                    // Rust
                    'rs',
                    // C/C++
                    'cpp', 'c', 'hpp', 'h',
                    // Kotlin
                    'kt',
                    // Scala
                    'scala',
                    // Dart
                    'dart',
                    // Swift
                    'swift',
                    // Config
                    'json', 'xml', 'yaml', 'yml', 'md'
                ]
            }
        });

        if (result && result.length > 0) {
            return result.map(uri => uri.fsPath);
        }

        return [];
    }

    async selectImages(): Promise<string[]> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']
            }
        });

        if (result && result.length > 0) {
            return result.map(uri => uri.fsPath);
        }

        return [];
    }

    async selectVideos(): Promise<string[]> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'Videos': ['mp4', 'webm', 'mov', 'avi']
            }
        });

        if (result && result.length > 0) {
            return result.map(uri => uri.fsPath);
        }

        return [];
    }
    
    async autoDiscoverRelevantFiles(): Promise<SourceCodeContext> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const structure = await this.getWorkspaceStructure();
    const files: FileContext[] = [];

    // Определяем ключевые директории для анализа по языкам
    const importantDirs = [
        'src', 'app', 'pages', 'components', 'lib', 'utils', 'tests', '__tests__',
        'Controllers', 'Models', 'Views', 'config', 'conf',
        // Python
        'django_app', 'flask_app', 'fastapi_app',
        // Java
        'src/main/java', 'src/test/java',
        // C#
        'src/', 'tests/',
        // PHP
        'src/', 'tests/', 'app/',
        // Ruby
        'app/', 'lib/', 'spec/',
        // Go
        'cmd/', 'pkg/', 'internal/',
        // Rust
        'src/', 'tests/',
        // C/C++
        'src/', 'include/', 'tests/',
        // Kotlin
        'src/main/kotlin', 'src/test/kotlin',
        // Scala
        'src/main/scala', 'src/test/scala',
        // Dart
        'lib/', 'test/',
        // Swift
        'Sources/', 'Tests/'
    ];
    const importantFiles = [
        // JavaScript/TypeScript
        'package.json', 'tsconfig.json', 'jest.config.js', 'webpack.config.js', 'babel.config.js',
        // Java
        'pom.xml', 'build.gradle', 'build.gradle.kts',
        // C#
        '.csproj', '.sln',
        // PHP
        'composer.json', 'artisan',
        // Ruby
        'Gemfile', 'Rakefile',
        // Go
        'go.mod', 'go.sum',
        // Rust
        'Cargo.toml', 'Cargo.lock',
        // Python
        'requirements.txt', 'setup.py', 'Pipfile', 'pyproject.toml',
        // C/C++
        'Makefile', 'CMakeLists.txt',
        // Kotlin
        'build.gradle.kts',
        // Scala
        'build.sbt',
        // Dart
        'pubspec.yaml',
        // Swift
        'Package.swift',
        // General
        'Dockerfile', 'docker-compose.yml', '.env', 'README.md'
    ];

    // Собираем файлы из важных директорий (глубина 2–3)
    const collectFiles = (dir: string, depth = 0) => {
        if (depth > 2) return;
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'coverage'].includes(item)) continue;
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    collectFiles(fullPath, depth + 1);
                } else if (
                    // Web development
                    item.endsWith('.ts') || item.endsWith('.tsx') ||
                    item.endsWith('.js') || item.endsWith('.jsx') ||
                    item.endsWith('.vue') || item.endsWith('.svelte') ||
                    item.endsWith('.html') || item.endsWith('.css') ||
                    // Python
                    item.endsWith('.py') || item.endsWith('.pyx') ||
                    // Java
                    item.endsWith('.java') ||
                    // C#
                    item.endsWith('.cs') ||
                    // PHP
                    item.endsWith('.php') ||
                    // Ruby
                    item.endsWith('.rb') ||
                    // Go
                    item.endsWith('.go') ||
                    // Rust
                    item.endsWith('.rs') ||
                    // C/C++
                    item.endsWith('.cpp') || item.endsWith('.c') ||
                    item.endsWith('.hpp') || item.endsWith('.h') ||
                    // Kotlin
                    item.endsWith('.kt') ||
                    // Scala
                    item.endsWith('.scala') ||
                    // Dart
                    item.endsWith('.dart') ||
                    // Swift
                    item.endsWith('.swift') ||
                    // Configuration and documentation
                    item.endsWith('.json') || item.endsWith('.xml') ||
                    item.endsWith('.yaml') || item.endsWith('.yml') ||
                    item.endsWith('.md') || item.endsWith('.txt') ||
                    // Important files
                    importantFiles.includes(item)
                ) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        if (content.length > 100_000) return; // пропускаем слишком большие файлы
                        files.push({
                            path: path.relative(rootPath, fullPath),
                            content,
                            language: this.detectLanguage(item)
                        });
                    } catch (e) {
                        console.warn(`Skipped file ${fullPath}: ${e}`);
                    }
                }
            }
        } catch (e) {
            console.warn(`Cannot read directory ${dir}: ${e}`);
        }
    };

    // Сканируем корень и важные директории
    collectFiles(rootPath);
    for (const dir of importantDirs) {
        const dirPath = path.join(rootPath, dir);
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
            collectFiles(dirPath);
        }
    }

    // Убираем дубликаты по пути
    const uniqueFiles = files.filter((file, index, self) =>
        index === self.findIndex(f => f.path === file.path)
    );

    // Ограничиваем объём (например, до 20 файлов или 500 КБ)
    let totalSize = 0;
    const limitedFiles = [];
    for (const file of uniqueFiles) {
        if (totalSize + file.content.length > 500_000) break;
        limitedFiles.push(file);
        totalSize += file.content.length;
    }

    return { files: limitedFiles, structure };
}

private detectLanguage(filename: string): string {
    const ext = path.extname(filename).substring(1);
    const map: Record<string, string> = {
        // Web development
        'ts': 'typescript',
        'js': 'javascript',
        'tsx': 'typescriptreact',
        'jsx': 'javascriptreact',
        'vue': 'vue',
        'svelte': 'svelte',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'sass',
        'less': 'less',
        // Python
        'py': 'python',
        'pyx': 'python',
        // Java
        'java': 'java',
        // C#
        'cs': 'csharp',
        // PHP
        'php': 'php',
        // Ruby
        'rb': 'ruby',
        // Go
        'go': 'go',
        // Rust
        'rs': 'rust',
        // C/C++
        'cpp': 'cpp',
        'c': 'c',
        'hpp': 'cpp',
        'h': 'c',
        // Kotlin
        'kt': 'kotlin',
        // Scala
        'scala': 'scala',
        // Dart
        'dart': 'dart',
        // Swift
        'swift': 'swift',
        // Configuration
        'json': 'json',
        'xml': 'xml',
        'yaml': 'yaml',
        'yml': 'yaml',
        'md': 'markdown',
        'txt': 'text'
    };
    return map[ext] || ext;
}
}