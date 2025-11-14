// media/chat.js

// --- Добавляем marked для Markdown ---
let marked = null;
(function () {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    script.onload = () => {
        marked = window.marked;
        marked.setOptions({ sanitize: true, breaks: true });
    };
    document.head.appendChild(script);
})();

const vscode = acquireVsCodeApi();
let state = { sourceCode: null, imagePaths: [], videoPaths: [], attached: [] };
let sendTimeout;
const input = document.getElementById('msgInput');
const messages = document.getElementById('chatMessages');
const activity = document.getElementById('agentActivity');
const preview = document.getElementById('attachmentsPreview');
const sendBtn = document.getElementById('sendBtn');

/* Autosize textarea */
input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
});

/* Enter to send (Shift+Enter for newline) */
input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

/* Message events from extension */
window.addEventListener('message', e => {
    const m = e.data;
    switch (m.type) {
        case 'filesSelected':
            state.sourceCode = m.data.sourceCode;
            state.attached.push(...m.data.files);
            updatePreview();
            addSystem(`Прикреплено ${m.data.count} файл(ов)`);
            break;
        case 'imagesSelected':
            state.imagePaths = m.data.paths;
            state.attached.push(...m.data.images);
            updatePreview();
            addSystem(`Прикреплено ${m.data.count} изображение(й)`);
            break;
        case 'videosSelected':
            state.videoPaths = m.data.paths;
            state.attached.push(...m.data.videos);
            updatePreview();
            addSystem(`Прикреплено ${m.data.count} видео/файл(ов)`);
            break;
        case 'agentAction':
            updateActivity(m.data.action, m.data.message);
            break;
        case 'error':
            clearActivity();
            addError(m.data.message);
            sendBtn.disabled = false;
            clearTimeout(sendTimeout);
            break;
        case 'result':
            clearActivity();
            showResult(m.data);
            sendBtn.disabled = false;
            clearTimeout(sendTimeout);
            break;
        // === НОВОЕ: обработка сообщений от агента с Markdown ===
        case 'message':
            clearActivity();
            if (m.role === 'assistant') {
                // Ждём загрузки marked
                const render = () => {
                    if (marked) {
                        const html = marked.parse(m.content);
                        appendMessage('assistant', html);
                    } else {
                        // fallback без markdown
                        appendMessage('assistant', `<p>${escape(m.content)}</p>`);
                    }
                };
                if (marked) {
                    render();
                } else {
                    setTimeout(render, 500);
                }
            } else {
                addUser(m.content);
            }
            break;
    }
});

/* Toolbar actions (posted back to extension) */
function analyzeWorkspace() {
    vscode.postMessage({ type: 'analyzeWorkspace' });
    addUser('Проанализировать рабочую область');
}
function selectFiles() { vscode.postMessage({ type: 'selectFiles' }); }
function selectImages() { vscode.postMessage({ type: 'selectImages' }); }
function selectVideos() { vscode.postMessage({ type: 'selectVideos' }); }

/* Send message */
function sendMessage() {
    if (sendBtn.disabled) return;
    const text = input.value.trim();
    if (!text && !state.attached.length) return;
    if (text) addUser(text);
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    vscode.postMessage({
        type: 'generate',
        data: {
            description: text,
            sourceCode: state.sourceCode,
            imagePaths: state.imagePaths,
            videoPaths: state.videoPaths
        }
    });
    state.attached = [];
    updatePreview();

    // safety timeout to re-enable UI if backend doesn't respond
    sendTimeout = setTimeout(() => {
        if (sendBtn.disabled) {
            sendBtn.disabled = false;
            addError('Таймаут запроса. Попробуйте ещё раз.');
        }
    }, 900000);
}

/* Preview attached files */
function updatePreview() {
    if (!state.attached.length) {
        preview.innerHTML = '';
        preview.style.display = 'none';
        return;
    }
    preview.style.display = 'flex';
    preview.innerHTML = state.attached.map((f, i) => `
        <div class="attachment-chip" title="${escape(f.name || f)}">
            <svg class="icon" viewBox="0 0 24 24"><path d="M21.44 11.05L12.95 1.56a3 3 0 0 0-4.24 4.24l7.07 7.07a1.5 1.5 0 0 1-2.12 2.12L6.59 7.92"/></svg>
            <span>${escape(f.name || f)}</span>
            <button aria-label="Удалить вложение" onclick="remove(${i})">×</button>
        </div>`).join('');
}

function remove(i) {
    state.attached.splice(i, 1);
    updatePreview();
}

/* activity icons */
function updateActivity(action, msg) {
    const icons = {
        scan: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>',
        analyze: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
        load: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
        init: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        config: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 0 2 0l.43.25a2 2 0 0 0 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 0 1-1.73l.43-.25a2 2 0 0 0 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
        health: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
        connect: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.85a10 10 0 0 1 14 0"/><path d="M8.5 16.92a5 5 0 0 1 7 0"/>',
        process: '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
        generate: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
        validate: '<polyline points="20 6 9 17 4 12"/>',
        save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
        complete: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
        error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
        progress: '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.9 4.9l2.9 2.9"/><path d="M19.1 19.1l-2.9-2.9"/>'
    };
    activity.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[action] || icons.process}</svg><span>${escape(msg)}</span>`;
}

function clearActivity() {
    activity.innerHTML = '';
}

function addUser(t) {
    appendMessage('user', `<p>${escape(t)}</p>`);
}

function addSystem(t) {
    appendMessage('assistant', `<p>${escape(t)}</p>`);
}

function addError(t) {
    const html = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>${escape(t)}`;
    appendMessage('assistant', html);
}

function appendMessage(cls, content) {
    const div = document.createElement('div');
    const baseClass = cls === 'assistant' || cls === 'error' ? 'assistant' : 'user';
    div.className = `message ${baseClass}`;
    if (cls === 'user') {
        div.innerHTML = `<div class="bubble">${content}</div>`;
    } else {
        div.innerHTML = `<div class="avatar" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><rect x="4" y="12" width="16" height="8" rx="2"/></svg></div><div class="bubble">${content}</div>`;
    }
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
}

function showResult(data) {
    window.lastData = data;
    const tests = data.testCases.map((tc, i) => `
        <div class="test-case">
            <div class="test-case-header">
                <h4>${i + 1}. ${escape(tc.title)}</h4>
                <span class="priority priority-${tc.priority}">${escape(tc.priority)}</span>
            </div>
            <p class="test-id">ID: ${escape(tc.id)}</p>
            <p class="test-desc">${escape(tc.description)}</p>
            <div class="test-steps">
                ${tc.steps.map(s => `<div class="step"><strong>${escape(s.step)}. ${escape(s.action)}</strong><p>Ожидаемо: ${escape(s.expected)}</p></div>`).join('')}
            </div>
            <div class="test-result"><strong>Ожидаемый результат:</strong><p>${escape(tc.expectedResult)}</p></div>
        </div>`).join('');

    const actions = `
        <div class="action-buttons">
            <button onclick="saveMarkdown()">Сохранить как Markdown</button>
            <button onclick="saveXlsx()">Сохранить как XLSX</button>
        </div>`;

    appendMessage('assistant', `<p>Сгенерировано ${data.testCases.length} тестового(ых) случая(ев)</p>${tests}${actions}`);
}

function saveMarkdown() {
    if (window.lastData) vscode.postMessage({ type: 'saveMarkdown', data: { content: window.lastData.markdown } });
}
function saveXlsx() {
    if (window.lastData?.testCases) vscode.postMessage({ type: 'saveXlsx', data: { testCases: window.lastData.testCases } });
}

function escape(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}