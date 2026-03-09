// ============================================================
//  JobHuntX â€” AI Creative Suite
//  Main Application JavaScript
// ============================================================

// ===== State =====
let currentConversationId = null;
let isGenerating = false;
let abortController = null;
let attachedFile = null;
let currentTab = 'chat';
let musicAbortController = null;
let selectedStyles = [];
let selectedDuration = 10;

// ===== DOM Elements =====
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const btnNewChat = document.getElementById('btn-new-chat');
const modelSelect = document.getElementById('model-select');
const conversationList = document.getElementById('conversation-list');
const welcomeScreen = document.getElementById('welcome-screen');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const btnSend = document.getElementById('btn-send');
const btnStop = document.getElementById('btn-stop');
const btnAttach = document.getElementById('btn-attach');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const fileName = document.getElementById('file-name');
const btnRemoveFile = document.getElementById('btn-remove-file');
const btnTheme = document.getElementById('btn-theme');

// ===== Initialize =====
document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadModels();
    loadConversations();
    setupEventListeners();
    configureMarked();
    setupTabs();
    setupMusic();
});

function configureMarked() {
    const renderer = new marked.Renderer();
    renderer.code = function (code, language) {
        if (typeof code === 'object') {
            language = code.lang || '';
            code = code.text || '';
        }
        const lang = language || 'plaintext';
        let highlighted;
        try {
            if (hljs.getLanguage(lang)) {
                highlighted = hljs.highlight(code, { language: lang }).value;
            } else {
                highlighted = hljs.highlightAuto(code).value;
            }
        } catch {
            highlighted = escapeHtml(code);
        }
        return `<pre><div class="code-header"><span>${lang}</span><button class="btn-copy" onclick="copyCode(this)">Copy</button></div><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    };
    marked.setOptions({ renderer, breaks: true, gfm: true });
}

// ============================================================
//  TAB SYSTEM
// ============================================================

function setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    currentTab = tabName;

    // Update nav tab active states
    document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tabName);
    });

    // Update tab content visibility
    document.querySelectorAll('.tab-content').forEach(tc => {
        tc.classList.toggle('active', tc.id === `tab-${tabName}`);
    });

    // Show/hide sidebar (only visible in chat tab)
    if (tabName === 'chat') {
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
    }

    // Tab-specific initialization
    if (tabName === 'music') {
        checkMusicStatus();
    }
}

// ============================================================
//  EVENT LISTENERS
// ============================================================

function setupEventListeners() {
    btnNewChat.addEventListener('click', () => newChat());

    btnSend.addEventListener('click', () => sendMessage());
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    messageInput.addEventListener('input', () => {
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + 'px';
        btnSend.disabled = !messageInput.value.trim() && !attachedFile;
    });

    btnStop.addEventListener('click', () => stopGenerating());

    btnAttach.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileUpload);
    btnRemoveFile.addEventListener('click', removeFile);

    btnTheme.addEventListener('click', toggleTheme);

    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    modelSelect.addEventListener('change', () => {
        window.switchModel(modelSelect.value);
    });
}

// ============================================================
//  THEME
// ============================================================

function loadTheme() {
    const theme = localStorage.getItem('jobhuntx-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton(theme);
    updateHljsTheme(theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('jobhuntx-theme', next);
    updateThemeButton(next);
    updateHljsTheme(next);
}

function updateThemeButton(theme) {
    const icon = theme === 'dark'
        ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
        : '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    document.getElementById('theme-icon').innerHTML = icon;
}

function updateHljsTheme(theme) {
    const hljsLink = document.getElementById('hljs-theme');
    hljsLink.href = theme === 'light'
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
}

// ============================================================
//  MODELS
// ============================================================

const MODEL_LABELS = {
    'llama3.2:3b':      { tag: 'Fast',     color: '#22c55e' },
    'llama3.2:1b':      { tag: 'Fastest',  color: '#22c55e' },
    'llama3.1:8b':      { tag: 'Fast',     color: '#22c55e' },
    'qwen2.5:7b':       { tag: 'Balanced', color: '#f59e0b' },
    'qwen2.5:14b':      { tag: 'Smart',    color: '#f59e0b' },
    'deepseek-r1:14b':  { tag: 'Advanced', color: '#8b5cf6' },
    'deepseek-r1:7b':   { tag: 'Reasoning',color: '#8b5cf6' },
    'deepseek-r1:32b':  { tag: 'Advanced', color: '#8b5cf6' },
    'phi3:mini':        { tag: 'Fast',     color: '#22c55e' },
    'mistral:7b':       { tag: 'Balanced', color: '#f59e0b' },
    'gemma2:9b':        { tag: 'Balanced', color: '#f59e0b' },
};

function getModelLabel(name) {
    if (MODEL_LABELS[name]) return MODEL_LABELS[name].tag;
    if (name.includes('deepseek-r1')) return 'Reasoning';
    if (name.includes(':1b') || name.includes(':3b')) return 'Fast';
    if (name.includes(':7b') || name.includes(':8b')) return 'Balanced';
    if (name.includes(':14b') || name.includes(':32b') || name.includes(':70b')) return 'Advanced';
    return '';
}

async function loadModels() {
    try {
        const resp = await fetch('/api/models');
        const data = await resp.json();
        if (data.models && data.models.length > 0) {
            modelSelect.innerHTML = data.models
                .map(m => {
                    const label = getModelLabel(m);
                    const display = label ? `${m}  [${label}]` : m;
                    return `<option value="${m}" ${m === 'qwen2.5:7b' ? 'selected' : ''}>${display}</option>`;
                })
                .join('');
            renderModelPills(data.models);
        }
    } catch (e) {
        console.error('Failed to load models:', e);
    }
}

function renderModelPills(models) {
    const toggle = document.getElementById('model-toggle');
    if (!toggle) return;

    const colorMap = {
        'Fast': '#22c55e', 'Fastest': '#22c55e',
        'Balanced': '#f59e0b', 'Smart': '#f59e0b',
        'Advanced': '#8b5cf6', 'Reasoning': '#8b5cf6',
    };

    function shortName(name) {
        return name.split(':')[0]
            .replace('deepseek-r1', 'DeepSeek R1')
            .replace('qwen2.5', 'Qwen')
            .replace('llama3.2', 'Llama')
            .replace('llama3.1', 'Llama')
            .replace('phi3', 'Phi-3')
            .replace('mistral', 'Mistral')
            .replace('gemma2', 'Gemma');
    }

    toggle.innerHTML = models.map(m => {
        const label = getModelLabel(m);
        const color = colorMap[label] || '#888';
        const isActive = modelSelect.value === m;
        const size = m.split(':')[1] || '';
        return `<button class="model-pill ${isActive ? 'active' : ''}" data-model="${m}" onclick="switchModel('${m}')" title="${m}">
            <span class="pill-dot" style="background:${color}"></span>
            <span>${shortName(m)} ${size}</span>
            <span class="pill-tag">${label}</span>
        </button>`;
    }).join('');
}

window.switchModel = function(model) {
    modelSelect.value = model;
    document.querySelectorAll('.model-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.model === model);
    });
    if (currentConversationId) {
        fetch(`/api/conversations/${currentConversationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model }),
        });
    }
};

// ============================================================
//  CONVERSATIONS
// ============================================================

async function loadConversations() {
    try {
        const resp = await fetch('/api/conversations');
        const data = await resp.json();
        renderConversationList(data.conversations);
    } catch (e) {
        console.error('Failed to load conversations:', e);
    }
}

function renderConversationList(conversations) {
    conversationList.innerHTML = conversations.map(c => `
        <div class="conv-item ${c.id === currentConversationId ? 'active' : ''}"
             data-id="${c.id}" onclick="selectConversation(${c.id})">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="conv-title">${escapeHtml(c.title)}</span>
            <button class="conv-delete" onclick="event.stopPropagation(); deleteConversation(${c.id})" title="Delete">
                &#10005;
            </button>
        </div>
    `).join('');
}

async function selectConversation(convId) {
    currentConversationId = convId;
    welcomeScreen.style.display = 'none';
    messagesContainer.classList.add('active');

    try {
        const resp = await fetch(`/api/conversations/${convId}`);
        const data = await resp.json();
        if (data.conversation && data.conversation.model) {
            modelSelect.value = data.conversation.model;
        }
        messagesContainer.innerHTML = '';
        data.messages.forEach(msg => {
            appendMessage(msg.role, msg.content, false);
        });
        scrollToBottom();
    } catch (e) {
        console.error('Failed to load conversation:', e);
    }

    document.querySelectorAll('.conv-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.id) === convId);
    });
    sidebar.classList.remove('open');
}

async function newChat() {
    currentConversationId = null;
    welcomeScreen.style.display = 'flex';
    messagesContainer.classList.remove('active');
    messagesContainer.innerHTML = '';
    messageInput.value = '';
    messageInput.style.height = 'auto';
    btnSend.disabled = true;
    document.querySelectorAll('.conv-item').forEach(el => el.classList.remove('active'));
    sidebar.classList.remove('open');
}

async function deleteConversation(convId) {
    try {
        await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
        if (currentConversationId === convId) newChat();
        loadConversations();
    } catch (e) {
        console.error('Failed to delete conversation:', e);
    }
}

// ============================================================
//  CHAT â€” SEND MESSAGE
// ============================================================

async function sendMessage() {
    const text = messageInput.value.trim();
    if ((!text && !attachedFile) || isGenerating) return;

    if (!currentConversationId) {
        try {
            const resp = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelSelect.value }),
            });
            const data = await resp.json();
            currentConversationId = data.id;
            welcomeScreen.style.display = 'none';
            messagesContainer.classList.add('active');
        } catch (e) {
            console.error('Failed to create conversation:', e);
            return;
        }
    }

    let displayText = text;
    if (attachedFile && attachedFile.type === 'image') {
        displayText = `![${attachedFile.filename}](${attachedFile.imageDataUrl})\n\n${text}`;
    } else if (attachedFile && attachedFile.type === 'text') {
        displayText = `[Attached: ${attachedFile.filename}]\n\n${text}`;
    }
    appendMessage('user', displayText, false);

    messageInput.value = '';
    messageInput.style.height = 'auto';
    btnSend.disabled = true;

    const payload = {
        conversation_id: currentConversationId,
        message: text,
        model: modelSelect.value,
    };
    if (attachedFile && attachedFile.type === 'text') {
        payload.file_content = attachedFile.content;
    }
    if (attachedFile && attachedFile.type === 'image') {
        payload.images = [attachedFile.imageBase64];
    }

    removeFile();
    await streamResponse(payload);
    loadConversations();
}

window.sendHint = function(text) {
    messageInput.value = text;
    btnSend.disabled = false;
    sendMessage();
};

// ============================================================
//  CHAT â€” STREAMING
// ============================================================

async function streamResponse(payload) {
    isGenerating = true;
    btnSend.style.display = 'none';
    btnStop.style.display = 'flex';

    const msgEl = appendMessage('assistant', '', true);
    const contentEl = msgEl.querySelector('.message-content');

    abortController = new AbortController();
    let fullText = '';
    let thinkingText = '';
    let isThinking = false;

    try {
        const resp = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: abortController.signal,
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.thinking_start) {
                            isThinking = true;
                            thinkingText = '';
                        }

                        if (data.thinking) {
                            thinkingText += data.thinking;
                            renderWithThinking(contentEl, thinkingText, fullText, true);
                            scrollToBottom();
                        }

                        if (data.thinking_end) {
                            isThinking = false;
                            renderWithThinking(contentEl, thinkingText, fullText, false);
                            scrollToBottom();
                        }

                        if (data.token) {
                            fullText += data.token;
                            renderWithThinking(contentEl, thinkingText, fullText, false);
                            scrollToBottom();
                        }

                        if (data.done) break;
                    } catch {}
                }
            }
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            fullText += '\n\n**Error:** Connection failed. Is Ollama running?';
            renderWithThinking(contentEl, thinkingText, fullText, false);
        }
    }

    isGenerating = false;
    btnSend.style.display = 'flex';
    btnStop.style.display = 'none';
    abortController = null;
}

function renderWithThinking(element, thinkingText, responseText, isThinkingActive) {
    let html = '';

    if (thinkingText) {
        if (isThinkingActive) {
            html += `<div class="thinking-block thinking-active">
                <div class="thinking-header">
                    <div class="thinking-spinner"></div>
                    Thinking...
                </div>
                <div class="thinking-content">${marked.parse(thinkingText)}</div>
            </div>`;
        } else {
            html += `<div class="thinking-block">
                <div class="thinking-header" onclick="toggleThinking(this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    Thought process
                </div>
                <div class="thinking-content collapsed">${marked.parse(thinkingText)}</div>
            </div>`;
        }
    }

    if (responseText) {
        html += marked.parse(responseText);
    } else if (!thinkingText) {
        html = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    }

    element.innerHTML = html;

    element.querySelectorAll('pre code:not(.hljs)').forEach(block => {
        hljs.highlightElement(block);
    });

    element.querySelectorAll('pre').forEach(pre => {
        if (!pre.querySelector('.code-header')) {
            const code = pre.querySelector('code');
            const lang = (code?.className?.match(/language-(\w+)/) || [])[1] || 'code';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `<span>${lang}</span><button class="btn-copy" onclick="copyCode(this)">Copy</button>`;
            pre.insertBefore(header, pre.firstChild);
        }
    });
}

function stopGenerating() {
    if (abortController) abortController.abort();
}

// ============================================================
//  CHAT â€” MESSAGES
// ============================================================

function appendMessage(role, content, isStreaming) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;
    const avatar = role === 'user' ? 'U' : 'X';
    msgEl.innerHTML = `
        <div class="message-inner">
            <div class="message-avatar">${avatar}</div>
            <div class="message-content"></div>
        </div>
    `;

    const contentEl = msgEl.querySelector('.message-content');
    if (isStreaming) {
        contentEl.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    } else {
        renderMarkdown(contentEl, content);
    }

    messagesContainer.appendChild(msgEl);
    scrollToBottom();
    return msgEl;
}

function renderMarkdown(element, text) {
    let processed = text;
    const thinkingBlocks = [];
    let thinkIndex = 0;

    processed = processed.replace(/<think>([\s\S]*?)<\/think>/g, (match, content) => {
        const id = `__THINK_BLOCK_${thinkIndex++}__`;
        thinkingBlocks.push({
            id,
            html: `<div class="thinking-block">
                <div class="thinking-header" onclick="toggleThinking(this)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                    Thinking
                </div>
                <div class="thinking-content collapsed">${marked.parse(content.trim())}</div>
            </div>`
        });
        return `\n\n${id}\n\n`;
    });

    if (processed.includes('<think>') && !processed.includes('</think>')) {
        const parts = processed.split('<think>');
        const thinkContent = parts[1] || '';
        const id = `__THINK_BLOCK_${thinkIndex++}__`;
        thinkingBlocks.push({
            id,
            html: `<div class="thinking-block thinking-active">
                <div class="thinking-header">
                    <div class="thinking-spinner"></div>
                    Thinking...
                </div>
                <div class="thinking-content">${marked.parse(thinkContent.trim())}</div>
            </div>`
        });
        processed = parts[0] + `\n\n${id}\n\n`;
    }

    let html = marked.parse(processed);
    thinkingBlocks.forEach(block => {
        html = html.replace(`<p>${block.id}</p>`, block.html);
        html = html.replace(block.id, block.html);
    });
    element.innerHTML = html;

    element.querySelectorAll('pre code:not(.hljs)').forEach(block => {
        hljs.highlightElement(block);
    });
    element.querySelectorAll('pre').forEach(pre => {
        if (!pre.querySelector('.code-header')) {
            const code = pre.querySelector('code');
            const lang = (code?.className?.match(/language-(\w+)/) || [])[1] || 'code';
            const header = document.createElement('div');
            header.className = 'code-header';
            header.innerHTML = `<span>${lang}</span><button class="btn-copy" onclick="copyCode(this)">Copy</button>`;
            pre.insertBefore(header, pre.firstChild);
        }
    });
}

window.toggleThinking = function(header) {
    const content = header.nextElementSibling;
    content.classList.toggle('collapsed');
    const arrow = header.querySelector('svg');
    if (content.classList.contains('collapsed')) {
        arrow.style.transform = 'rotate(0deg)';
    } else {
        arrow.style.transform = 'rotate(90deg)';
    }
};

// ============================================================
//  FILE UPLOAD (Chat)
// ============================================================

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const imageThumb = document.getElementById('image-thumb');

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            const base64 = ev.target.result.split(',')[1];
            attachedFile = {
                filename: file.name,
                content: null,
                type: 'image',
                imageBase64: base64,
                imageDataUrl: ev.target.result,
            };
            imageThumb.src = ev.target.result;
            imageThumb.style.display = 'block';
            fileName.textContent = `${file.name} (${formatSize(file.size)})`;
            filePreview.style.display = 'flex';
            btnSend.disabled = false;
        };
        reader.readAsDataURL(file);
    } else {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const resp = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await resp.json();
            if (data.error) {
                alert('Failed to read file: ' + data.error);
                return;
            }
            attachedFile = { filename: data.filename, content: data.content, type: 'text' };
            imageThumb.style.display = 'none';
            fileName.textContent = `${data.filename} (${formatSize(data.size)})`;
            filePreview.style.display = 'flex';
            btnSend.disabled = !messageInput.value.trim() && !attachedFile;
        } catch (e) {
            alert('Upload failed: ' + e.message);
        }
    }
    fileInput.value = '';
}

function removeFile() {
    attachedFile = null;
    filePreview.style.display = 'none';
    fileName.textContent = '';
    document.getElementById('image-thumb').style.display = 'none';
    fileInput.value = '';
    btnSend.disabled = !messageInput.value.trim();
}

// ============================================================
//  MUSIC STUDIO
// ============================================================

function setupMusic() {
    // Style pills
    document.querySelectorAll('.style-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            pill.classList.toggle('active');
            const style = pill.dataset.style;
            if (pill.classList.contains('active')) {
                selectedStyles.push(style);
            } else {
                selectedStyles = selectedStyles.filter(s => s !== style);
            }
        });
    });

    // Duration pills
    document.querySelectorAll('.duration-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            document.querySelectorAll('.duration-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            selectedDuration = parseInt(pill.dataset.duration);
        });
    });

    // Generate button
    const btnGenerate = document.getElementById('btn-generate');
    if (btnGenerate) {
        btnGenerate.addEventListener('click', generateMusic);
    }

    // Setup button
    const btnSetup = document.getElementById('btn-music-setup');
    if (btnSetup) {
        btnSetup.addEventListener('click', installMusicDeps);
    }

    // Cancel button
    const btnCancel = document.getElementById('btn-cancel-gen');
    if (btnCancel) {
        btnCancel.addEventListener('click', cancelMusicGeneration);
    }
}

async function checkMusicStatus() {
    const setupCard = document.getElementById('music-setup');
    const studioEl = document.getElementById('music-studio');

    try {
        const resp = await fetch('/api/music/status');
        const data = await resp.json();

        if (data.ready) {
            setupCard.style.display = 'none';
            studioEl.style.display = 'block';
            loadMusicTracks();
        } else {
            setupCard.style.display = 'block';
            studioEl.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to check music status:', e);
        setupCard.style.display = 'block';
        studioEl.style.display = 'none';
    }
}

async function installMusicDeps() {
    const btnSetup = document.getElementById('btn-music-setup');
    const progressEl = document.getElementById('setup-progress');
    const progressFill = document.getElementById('setup-progress-fill');
    const progressText = document.getElementById('setup-progress-text');
    const logEl = document.getElementById('setup-log');

    btnSetup.disabled = true;
    btnSetup.textContent = 'Installing...';
    progressEl.style.display = 'block';
    logEl.textContent = '';

    try {
        const resp = await fetch('/api/music/setup', { method: 'POST' });
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.progress !== undefined) {
                            progressFill.style.width = data.progress + '%';
                        }
                        if (data.status) {
                            progressText.textContent = data.status;
                        }
                        if (data.log) {
                            logEl.textContent += data.log + '\n';
                            logEl.scrollTop = logEl.scrollHeight;
                        }
                        if (data.error) {
                            progressText.textContent = 'Error: ' + data.error;
                            progressFill.style.background = 'var(--danger)';
                            btnSetup.disabled = false;
                            btnSetup.textContent = 'Retry Installation';
                            return;
                        }
                        if (data.done) {
                            // Success! Switch to studio view
                            setTimeout(() => {
                                checkMusicStatus();
                            }, 1000);
                            return;
                        }
                    } catch {}
                }
            }
        }
    } catch (e) {
        progressText.textContent = 'Installation failed: ' + e.message;
        btnSetup.disabled = false;
        btnSetup.textContent = 'Retry Installation';
    }
}

async function generateMusic() {
    const promptEl = document.getElementById('music-prompt');
    const prompt = promptEl.value.trim();

    if (!prompt) {
        promptEl.focus();
        promptEl.style.borderColor = 'var(--danger)';
        setTimeout(() => { promptEl.style.borderColor = ''; }, 2000);
        return;
    }

    const btnGenerate = document.getElementById('btn-generate');
    const genProgress = document.getElementById('gen-progress');
    const genStatus = document.getElementById('gen-status');

    // Build full prompt with styles
    let fullPrompt = prompt;
    if (selectedStyles.length > 0) {
        fullPrompt = selectedStyles.join(', ') + ' ' + prompt;
    }

    btnGenerate.disabled = true;
    genProgress.style.display = 'block';
    genStatus.textContent = 'Initializing...';

    musicAbortController = new AbortController();

    try {
        const resp = await fetch('/api/music/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: fullPrompt,
                duration: selectedDuration,
                style: selectedStyles.join(', '),
            }),
            signal: musicAbortController.signal,
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));

                        if (data.status === 'downloading_model') {
                            genStatus.textContent = 'Downloading MusicGen model (first time only, ~500MB)...';
                        } else if (data.status === 'loading_model') {
                            genStatus.textContent = 'Loading model into memory...';
                        } else if (data.status === 'generating') {
                            genStatus.textContent = 'Generating audio...';
                        } else if (data.status === 'saving') {
                            genStatus.textContent = 'Saving audio file...';
                        } else if (data.status === 'complete') {
                            // Track generated!
                            genProgress.style.display = 'none';
                            btnGenerate.disabled = false;
                            addTrackToList({
                                url: data.url,
                                filename: data.filename,
                                prompt: prompt,
                                style: selectedStyles.join(', '),
                                duration: data.duration,
                                size: data.size,
                            });
                            // Clear prompt
                            promptEl.value = '';
                            return;
                        }

                        if (data.error) {
                            genStatus.textContent = 'Error: ' + data.error;
                            genProgress.querySelector('.gen-visualizer').style.display = 'none';
                            setTimeout(() => {
                                genProgress.style.display = 'none';
                                genProgress.querySelector('.gen-visualizer').style.display = 'flex';
                                btnGenerate.disabled = false;
                            }, 3000);
                            return;
                        }

                        if (data.heartbeat) {
                            // Keep connection alive indicator
                        }

                        if (data.done) return;
                    } catch {}
                }
            }
        }
    } catch (e) {
        if (e.name === 'AbortError') {
            genStatus.textContent = 'Generation cancelled.';
        } else {
            genStatus.textContent = 'Error: ' + e.message;
        }
        setTimeout(() => {
            genProgress.style.display = 'none';
            btnGenerate.disabled = false;
        }, 2000);
    }

    musicAbortController = null;
}

function cancelMusicGeneration() {
    if (musicAbortController) {
        musicAbortController.abort();
        musicAbortController = null;
    }
}

async function loadMusicTracks() {
    try {
        const resp = await fetch('/api/music/tracks');
        const data = await resp.json();

        const tracksList = document.getElementById('tracks-list');
        const tracksEmpty = document.getElementById('tracks-empty');
        const trackCount = document.getElementById('track-count');

        if (data.tracks && data.tracks.length > 0) {
            if (tracksEmpty) tracksEmpty.style.display = 'none';
            trackCount.textContent = data.tracks.length + ' track' + (data.tracks.length !== 1 ? 's' : '');

            // Clear and re-render
            tracksList.innerHTML = '';
            data.tracks.forEach(track => {
                addTrackToList(track, false);
            });
        } else {
            trackCount.textContent = '';
        }
    } catch (e) {
        console.error('Failed to load tracks:', e);
    }
}

function addTrackToList(track, prepend = true) {
    const tracksList = document.getElementById('tracks-list');
    const tracksEmpty = document.getElementById('tracks-empty');
    const trackCount = document.getElementById('track-count');

    if (tracksEmpty) tracksEmpty.style.display = 'none';

    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.filename = track.filename;

    const styleTag = track.style ? `<span>${track.style}</span>` : '';
    const sizeTag = track.size ? `<span>${formatSize(track.size)}</span>` : '';
    const durationTag = track.duration ? `<span>${track.duration}s</span>` : '';

    card.innerHTML = `
        <div class="track-info">
            <div class="track-prompt">"${escapeHtml(track.prompt || track.filename)}"</div>
            <div class="track-meta">
                ${durationTag}
                ${styleTag}
                ${sizeTag}
            </div>
        </div>
        <audio class="track-audio" controls src="${track.url}" preload="metadata"></audio>
        <div class="track-actions">
            <a class="btn-download" href="${track.url}" download="${track.filename}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 15V3m0 12l-4-4m4 4l4-4"/>
                    <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17"/>
                </svg>
                Download
            </a>
            <button class="btn-delete-track" onclick="deleteTrack('${track.filename}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete
            </button>
        </div>
    `;

    if (prepend) {
        tracksList.insertBefore(card, tracksList.firstChild);
    } else {
        tracksList.appendChild(card);
    }

    // Update count
    const count = tracksList.querySelectorAll('.track-card').length;
    trackCount.textContent = count + ' track' + (count !== 1 ? 's' : '');
}

window.deleteTrack = async function(filename) {
    try {
        await fetch(`/api/music/tracks/${filename}`, { method: 'DELETE' });
        const card = document.querySelector(`.track-card[data-filename="${filename}"]`);
        if (card) {
            card.style.animation = 'fadeIn 0.3s ease reverse';
            setTimeout(() => card.remove(), 300);
        }

        // Update count
        setTimeout(() => {
            const tracksList = document.getElementById('tracks-list');
            const count = tracksList.querySelectorAll('.track-card').length;
            const trackCount = document.getElementById('track-count');
            const tracksEmpty = document.getElementById('tracks-empty');
            if (count === 0) {
                trackCount.textContent = '';
                if (tracksEmpty) tracksEmpty.style.display = 'block';
            } else {
                trackCount.textContent = count + ' track' + (count !== 1 ? 's' : '');
            }
        }, 350);
    } catch (e) {
        console.error('Failed to delete track:', e);
    }
};

// ============================================================
//  UTILITIES
// ============================================================

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

window.copyCode = function(btn) {
    const pre = btn.closest('pre');
    const code = pre.querySelector('code');
    navigator.clipboard.writeText(code.textContent).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 2000);
    });
};

