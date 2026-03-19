// 家庭亲子助手聊天应用 — 支持多轮对话、系统提示词、可配置快捷提示
const LS_KEY = 'home_assistant_config_v1';
const SESSIONS_KEY = 'sessions_v1';
const MAX_HISTORY = 20;
const $ = sel => document.querySelector(sel);

const DEFAULT_PROMPTS = [
  { emoji: '📖', label: '讲故事', prompt: '给我讲一个有趣的故事吧' },
  { emoji: '✏️', label: '作业辅导', prompt: '帮我辅导作业' },
  { emoji: '🎮', label: '亲子游戏', prompt: '推荐一个适合全家的亲子游戏' },
  { emoji: '💚', label: '健康建议', prompt: '给我一些健康生活的建议' },
  { emoji: '🔬', label: '科学实验', prompt: '教我一个简单的科学小实验' },
  { emoji: '📚', label: '推荐书籍', prompt: '推荐一些适合孩子的书籍' },
];

const DEFAULT_SYSTEM_PROMPT = '你是一个温暖友善的家庭亲子助手，名叫"焕分小六"。你擅长讲故事、辅导作业、推荐亲子活动和提供生活建议。请用简洁、亲切的语言回答问题，适当使用emoji让对话更生动。';

const MOCK_RESPONSES = [
  '这是个好问题！让我想想...\n\n作为家庭助手，我建议你可以试试和孩子一起做手工，既能锻炼动手能力，又能增进亲子关系。🎨',
  '好的，我来帮你！\n\n每天保持30分钟的亲子阅读时间，对孩子的语言发展和想象力培养都非常有帮助。📖',
  '这个问题很有意思！\n\n推荐一个简单的科学小实验：用醋和小苏打制作"火山喷发"，孩子们都很喜欢！🌋',
  '让我为你推荐几个活动：\n\n1. 🚴 户外骑行\n2. 🍳 一起做饭\n3. 🧩 拼图游戏\n4. 🌱 种植小盆栽\n\n这些都是很好的亲子活动！',
];

const state = {
  config: {
    apiUrl: '', apiKey: '', model: '', useMock: true,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    customPrompts: [...DEFAULT_PROMPTS],
  },
  sessions: [],
  currentSessionId: null,
  sending: false,
};

// --- 持久化 ---
function loadConfig() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) Object.assign(state.config, JSON.parse(raw));
    if (!state.config.systemPrompt) state.config.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    if (!state.config.customPrompts?.length) state.config.customPrompts = [...DEFAULT_PROMPTS];
    const sr = localStorage.getItem(SESSIONS_KEY);
    if (sr) state.sessions = JSON.parse(sr);
    state.currentSessionId = localStorage.getItem('currentSessionId') || null;
  } catch (e) { console.warn('loadConfig', e); }
}
function saveConfig() { localStorage.setItem(LS_KEY, JSON.stringify(state.config)); }
function saveSessions() {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(state.sessions));
  localStorage.setItem('currentSessionId', state.currentSessionId || '');
}

// --- 会话管理 ---
function currentSession() { return state.sessions.find(s => s.id === state.currentSessionId); }

function createSession() {
  const id = Date.now().toString();
  const session = { id, title: '新对话', messages: [], createdAt: new Date().toLocaleString() };
  state.sessions.unshift(session);
  state.currentSessionId = id;
  saveSessions();
  return session;
}

function deleteSession(sessionId) {
  state.sessions = state.sessions.filter(s => s.id !== sessionId);
  if (state.currentSessionId === sessionId) {
    if (state.sessions.length) {
      state.currentSessionId = state.sessions[0].id;
      loadSessionUI(state.currentSessionId);
    } else {
      createSession();
      $('#messages').innerHTML = '';
      addWelcomeMessage();
    }
  }
  saveSessions();
  renderChatList();
}

function addWelcomeMessage() {
  const session = currentSession();
  if (session) {
    session.messages.push({ role: 'assistant', content: '你好！我是焕分小六，你的家庭亲子助手 🏠\n\n你可以问我任何关于育儿、学习、健康的问题，也可以点击上方的快捷按钮开始对话。' });
    saveSessions();
  }
  renderMessages();
}
// --- 渲染 ---
function renderMessages() {
  const session = currentSession();
  const ul = $('#messages');
  ul.innerHTML = '';
  if (!session) return;
  session.messages.forEach(msg => {
    if (msg.role === 'system') return;
    const li = document.createElement('li');
    li.className = 'message ' + (msg.role === 'user' ? 'from-user' : 'from-assistant');
    const content = document.createElement('div');
    content.className = 'content';
    if (msg.role === 'assistant' && typeof marked !== 'undefined') {
      content.innerHTML = marked.parse(msg.content);
      content.querySelectorAll('pre code').forEach(b => { if (typeof hljs !== 'undefined') hljs.highlightElement(b); });
    } else {
      content.textContent = msg.content;
    }
    li.appendChild(content);
    if (msg.time) {
      const m = document.createElement('span'); m.className = 'meta'; m.textContent = msg.time; li.appendChild(m);
    }
    ul.appendChild(li);
  });
  requestAnimationFrame(() => { const chat = $('#chat'); chat.scrollTop = chat.scrollHeight; });
}

function renderChatList() {
  const list = $('#chat-list');
  list.innerHTML = '';
  state.sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'chat-item' + (session.id === state.currentSessionId ? ' active' : '');
    li.innerHTML = `<div class="chat-item-info"><span class="chat-title">${session.title}</span><span class="chat-time">${session.createdAt}</span></div><button class="chat-delete-btn" title="删除会话">✕</button>`;
    li.querySelector('.chat-item-info').addEventListener('click', () => {
      loadSessionUI(session.id);
      if (window.innerWidth <= 600) toggleSidebar(false);
    });
    li.querySelector('.chat-delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确定删除这个会话吗？')) deleteSession(session.id);
    });
    list.appendChild(li);
  });
}
function renderPrompts() {
  const panel = $('#prompts-panel');
  panel.innerHTML = '';
  state.config.customPrompts.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'prompt-btn';
    btn.textContent = `${p.emoji} ${p.label}`;
    btn.addEventListener('click', () => {
      $('#input').value = p.prompt;
      $('#composer').dispatchEvent(new Event('submit', { cancelable: true }));
    });
    panel.appendChild(btn);
  });
}

function loadSessionUI(sessionId) {
  const session = state.sessions.find(s => s.id === sessionId);
  if (!session) return;
  state.currentSessionId = sessionId;
  localStorage.setItem('currentSessionId', sessionId);
  renderMessages();
  renderChatList();
}

function showToast(text, timeout = 3000) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show'); t.setAttribute('aria-hidden', 'false');
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.classList.remove('show'); t.setAttribute('aria-hidden', 'true'); }, timeout);
}

function toggleSidebar(show) {
  const sidebar = $('#sidebar');
  const overlay = $('#sidebar-overlay');
  if (show === undefined) show = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', show);
  if (overlay) overlay.classList.toggle('show', show);
}
// --- API 调用（多轮对话） ---
function buildMessages() {
  const session = currentSession();
  const msgs = [];
  if (state.config.systemPrompt) {
    msgs.push({ role: 'system', content: state.config.systemPrompt });
  }
  if (session) {
    // 排除占位消息，取最近 MAX_HISTORY 条
    const history = session.messages
      .filter(m => m.role !== 'system' && m.content !== '正在思考...')
      .slice(-MAX_HISTORY);
    history.forEach(m => msgs.push({ role: m.role, content: m.content }));
  }
  return msgs;
}

async function sendToApi(prompt, apiMessages) {
  const cfg = state.config;
  if (cfg.useMock || !cfg.apiUrl) {
    await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    return { ok: true, text: MOCK_RESPONSES[Math.floor(Math.random() * MOCK_RESPONSES.length)] };
  }
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    const body = JSON.stringify({
      model: cfg.model || 'deepseek-chat',
      messages: apiMessages || buildMessages(),
    });
    const resp = await fetch(cfg.apiUrl, { method: 'POST', headers, body });
    if (!resp.ok) {
      const text = await resp.text();
      if (resp.status === 401) return { ok: false, text: 'API Key 无效，请检查设置' };
      if (resp.status === 429) return { ok: false, text: '请求过于频繁，请稍后再试' };
      if (resp.status >= 500) return { ok: false, text: '服务器错误，请稍后再试' };
      return { ok: false, text: `API 错误 ${resp.status}: ${text}` };
    }
    const data = await resp.json().catch(() => null);
    let out = null;
    if (!data) out = await resp.text();
    else if (data.choices?.[0]?.message?.content) out = data.choices[0].message.content;
    else if (data.output) out = data.output;
    else if (data.text) out = data.text;
    else if (data.message) out = data.message;
    else out = JSON.stringify(data);
    return { ok: true, text: out };
  } catch (e) {
    if (e.name === 'TypeError' && e.message.includes('fetch')) {
      return { ok: false, text: '网络连接失败，请检查网络或 API 地址' };
    }
    return { ok: false, text: e.message || String(e) };
  }
}
// --- 发送消息 ---
async function handleSend(raw) {
  const txt = raw.trim();
  if (!txt || state.sending) return;
  state.sending = true;
  const sendBtn = $('#send-btn');
  sendBtn.disabled = true;
  sendBtn.classList.add('loading');

  const session = currentSession();
  // 添加用户消息
  session.messages.push({ role: 'user', content: txt, time: new Date().toLocaleTimeString() });
  if (session.messages.filter(m => m.role === 'user').length === 1) {
    session.title = txt.slice(0, 20) || '新对话';
  }
  saveSessions();
  renderMessages();

  // 先构建 API 消息（包含用户消息，不含占位）
  const apiMessages = buildMessages();

  // 添加占位消息
  session.messages.push({ role: 'assistant', content: '正在思考...' });
  saveSessions();
  renderMessages();

  const res = await sendToApi(txt, apiMessages);
  // 替换占位消息
  const lastMsg = session.messages[session.messages.length - 1];
  if (res.ok) {
    lastMsg.content = res.text;
    lastMsg.time = new Date().toLocaleTimeString();
  } else {
    lastMsg.content = '出错了：' + res.text;
    showToast('请求失败，请检查设置');
  }
  saveSessions();
  renderMessages();
  renderChatList();

  sendBtn.disabled = false;
  sendBtn.classList.remove('loading');
  state.sending = false;
}
// --- textarea 自适应高度 ---
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// --- 设置面板：提示词管理 ---
function renderPromptManager() {
  const container = $('#prompt-manager-list');
  if (!container) return;
  container.innerHTML = '';
  state.config.customPrompts.forEach((p, i) => {
    const row = document.createElement('div');
    row.className = 'prompt-manager-row';
    row.innerHTML = `<span>${p.emoji} ${p.label}</span><button class="prompt-remove-btn" data-index="${i}">✕</button>`;
    row.querySelector('.prompt-remove-btn').addEventListener('click', () => {
      state.config.customPrompts.splice(i, 1);
      saveConfig();
      renderPromptManager();
      renderPrompts();
    });
    container.appendChild(row);
  });
}

function addCustomPrompt() {
  const emoji = $('#new-prompt-emoji').value.trim() || '💬';
  const label = $('#new-prompt-label').value.trim();
  const prompt = $('#new-prompt-text').value.trim();
  if (!label || !prompt) { showToast('请填写标签和提示词内容'); return; }
  state.config.customPrompts.push({ emoji, label, prompt });
  saveConfig();
  renderPromptManager();
  renderPrompts();
  $('#new-prompt-emoji').value = '';
  $('#new-prompt-label').value = '';
  $('#new-prompt-text').value = '';
  showToast('已添加快捷提示');
}

// --- 初始化 ---
function wireUp() {
  // 加载配置到 UI
  $('#api-url').value = state.config.apiUrl || '';
  $('#api-key').value = state.config.apiKey || '';
  $('#model').value = state.config.model || '';
  $('#use-mock').checked = !!state.config.useMock;
  $('#system-prompt').value = state.config.systemPrompt || '';
  renderPromptManager();
  renderPrompts();

  // 初始化会话
  if (state.sessions.length === 0) {
    createSession();
    addWelcomeMessage();
  } else if (state.currentSessionId) {
    loadSessionUI(state.currentSessionId);
  } else {
    loadSessionUI(state.sessions[0].id);
  }
  renderChatList();

  // 侧边栏
  $('#toggle-sidebar-btn').addEventListener('click', () => toggleSidebar());
  const overlay = $('#sidebar-overlay');
  if (overlay) overlay.addEventListener('click', () => toggleSidebar(false));

  // 新建对话
  $('#new-chat-btn').addEventListener('click', () => {
    createSession();
    addWelcomeMessage();
    renderChatList();
    if (window.innerWidth <= 600) toggleSidebar(false);
  });

  // 语音输入
  $('#voice-btn').addEventListener('click', () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      showToast('浏览器不支持语音识别'); return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.onresult = (e) => { $('#input').value = e.results[0][0].transcript; };
    recognition.onerror = () => showToast('语音识别失败');
    recognition.start();
    showToast('请说话...');
  });

  // 设置面板
  $('#settings-btn').addEventListener('click', () => {
    $('#settings').setAttribute('aria-hidden', 'false');
  });
  $('#close-settings').addEventListener('click', () => {
    $('#settings').setAttribute('aria-hidden', 'true');
  });
  $('#save-settings').addEventListener('click', () => {
    state.config.apiUrl = $('#api-url').value.trim();
    state.config.apiKey = $('#api-key').value.trim();
    state.config.model = $('#model').value.trim();
    state.config.useMock = !!$('#use-mock').checked;
    state.config.systemPrompt = $('#system-prompt').value.trim();
    saveConfig();
    $('#settings').setAttribute('aria-hidden', 'true');
    showToast('设置已保存');
  });

  // 添加快捷提示
  const addPromptBtn = $('#add-prompt-btn');
  if (addPromptBtn) addPromptBtn.addEventListener('click', addCustomPrompt);

  // 表单提交
  const composer = $('#composer');
  const input = $('#input');
  input.addEventListener('input', () => autoResize(input));
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value;
    input.value = '';
    input.style.height = 'auto';
    handleSend(text);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      composer.dispatchEvent(new Event('submit', { cancelable: true }));
    }
  });
}

// 启动
loadConfig();
document.addEventListener('DOMContentLoaded', wireUp);
