// 简单的前端聊天逻辑，支持本地 mock 或调用自定义 API（POST）

const LS_KEY = 'home_assistant_config_v1';

function $(sel){return document.querySelector(sel)}

const state = {
  config: {
    apiUrl: '',
    apiKey: '',
    model: '',
    useMock: true,
  },
  sessions: [],
  currentSessionId: null
};

function loadConfig(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(raw) state.config = Object.assign(state.config, JSON.parse(raw));
    const sessionsRaw = localStorage.getItem('sessions_v1');
    if(sessionsRaw) state.sessions = JSON.parse(sessionsRaw);
    const currentId = localStorage.getItem('currentSessionId');
    if(currentId) state.currentSessionId = currentId;
  }catch(e){console.warn('loadConfig',e)}
}

function saveConfig(){
  localStorage.setItem(LS_KEY, JSON.stringify(state.config));
}

// 会话管理
function createSession(){
  const id = Date.now().toString();
  const session = { id, title: '新对话', messages: [], createdAt: new Date().toLocaleString() };
  state.sessions.unshift(session);
  state.currentSessionId = id;
  saveSessions();
  return session;
}

function saveSessions(){
  localStorage.setItem('sessions_v1', JSON.stringify(state.sessions));
  localStorage.setItem('currentSessionId', state.currentSessionId || '');
}

function saveCurrentSession(){
  const session = state.sessions.find(s => s.id === state.currentSessionId);
  if(!session) return;
  // 从 DOM 读取当前消息
  const msgs = [...$('#messages').querySelectorAll('.message')].map(li => ({
    who: li.classList.contains('from-user') ? 'user' : 'assistant',
    html: li.querySelector('.content').innerHTML,
    text: li.querySelector('.content').textContent,
    meta: li.querySelector('.meta')?.textContent || ''
  }));
  session.messages = msgs;
  if(msgs.length > 0 && msgs[0].who === 'user'){
    session.title = msgs[0].text.slice(0,20) || '新对话';
  }
  saveSessions();
  renderChatList();
}

function loadSession(sessionId){
  const session = state.sessions.find(s => s.id === sessionId);
  if(!session) return;
  state.currentSessionId = sessionId;
  localStorage.setItem('currentSessionId', sessionId);
  const ul = $('#messages');
  ul.innerHTML = '';
  session.messages.forEach(msg => {
    const li = document.createElement('li');
    li.className = 'message ' + (msg.who==='user' ? 'from-user' : 'from-assistant');
    const content = document.createElement('div');
    content.className = 'content';
    content.innerHTML = msg.html;
    li.appendChild(content);
    if(msg.meta){
      const m = document.createElement('span'); m.className='meta'; m.textContent=msg.meta; li.appendChild(m);
    }
    ul.appendChild(li);
  });
  ul.scrollTop = ul.scrollHeight;
  renderChatList();
}

function renderChatList(){
  const list = $('#chat-list');
  list.innerHTML = '';
  state.sessions.forEach(session => {
    const li = document.createElement('li');
    li.className = 'chat-item' + (session.id === state.currentSessionId ? ' active' : '');
    li.innerHTML = `<span class="chat-title">${session.title}</span><span class="chat-time">${session.createdAt}</span>`;
    li.addEventListener('click', () => {
      loadSession(session.id);
      // 移动端自动关闭侧边栏
      if(window.innerWidth <= 600) toggleSidebar(false);
    });
    list.appendChild(li);
  });
}

function showToast(text, timeout=3000){
  const t = $('#toast');
  t.textContent = text; t.classList.add('show'); t.setAttribute('aria-hidden','false');
  clearTimeout(t._h);
  t._h = setTimeout(()=>{t.classList.remove('show'); t.setAttribute('aria-hidden','true')}, timeout);
}

function toggleSidebar(show){
  const sidebar = $('#sidebar');
  if(show === undefined) show = sidebar.style.transform === 'translateX(-100%)';
  sidebar.style.transform = show ? 'translateX(0)' : 'translateX(-100%)';
}

function renderMessage(text, who='assistant', meta=''){
  const ul = $('#messages');
  const li = document.createElement('li');
  li.className = 'message ' + (who==='user' ? 'from-user' : 'from-assistant');
  const content = document.createElement('div');
  content.className = 'content';
  if(who==='assistant' && typeof marked !== 'undefined'){
    content.innerHTML = marked.parse(text);
    content.querySelectorAll('pre code').forEach(block => {
      if(typeof hljs !== 'undefined') hljs.highlightElement(block);
    });
  } else {
    content.textContent = text;
  }
  li.appendChild(content);
  if(meta){
    const m = document.createElement('span'); m.className='meta'; m.textContent = meta; li.appendChild(m);
  }
  ul.appendChild(li);
  requestAnimationFrame(()=>ul.scrollTop = ul.scrollHeight);
  saveCurrentSession();
}

async function sendToApi(prompt){
  const cfg = state.config;
  if(cfg.useMock || !cfg.apiUrl){
    // 本地 mock：简单回显并加上示例动作
    await new Promise(r=>setTimeout(r, 700));
    return {ok:true, text:`（Mock）已收到：${prompt}\n建议：你可以试试让我设置闹钟、查询天气或写购物清单。`};
  }

  // 真实请求：POST JSON -> OpenAI/DeepSeek 格式
  try{
    const headers = {'Content-Type':'application/json'};
    if(cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey;
    const body = JSON.stringify({
      model: cfg.model || 'deepseek-chat',
      messages: [{role: 'user', content: prompt}]
    });
    const resp = await fetch(cfg.apiUrl, {method:'POST', headers, body});
    if(!resp.ok){
      const text = await resp.text();
      return {ok:false, status:resp.status, text: `API 错误 ${resp.status}: ${text}`};
    }
    const data = await resp.json().catch(()=>null);
    // 尝试从常见字段提取响应
    let out = null;
    if(data === null) out = await resp.text();
    else if(data.choices && data.choices[0]?.message?.content) out = data.choices[0].message.content;
    else if(data.output) out = data.output;
    else if(data.text) out = data.text;
    else if(data.message) out = data.message;
    else out = JSON.stringify(data);
    return {ok:true, text: out};
  }catch(e){
    return {ok:false, text: e.message || String(e)};
  }
}

async function handleSend(raw){
  const txt = raw.trim();
  if(!txt) return;
  renderMessage(txt, 'user', new Date().toLocaleTimeString());
  const sendBtn = $('#send-btn'); sendBtn.disabled = true;
  renderMessage('正在思考...', 'assistant');
  // keep last assistant placeholder
  const ul = $('#messages');
  const placeholder = ul.lastElementChild;
  const res = await sendToApi(txt);
  if(res.ok){
    placeholder.querySelector('.content').textContent = res.text;
  }else{
    placeholder.querySelector('.content').textContent = '出错：' + (res.text || '未知错误');
    showToast('请求失败：' + (res.status || '') );
  }
  sendBtn.disabled = false;
}

function wireUp(){
  // load config into UI
  $('#api-url').value = state.config.apiUrl || '';
  $('#api-key').value = state.config.apiKey || '';
  $('#model').value = state.config.model || '';
  $('#use-mock').checked = !!state.config.useMock;

  // 初始化会话
  if(state.sessions.length === 0){
    createSession();
    renderMessage('你好！我是家庭助手，你可以问我天气、设置备忘或询问生活小贴士。点击右上角配置 API（可选）。', 'assistant');
  } else if(state.currentSessionId){
    loadSession(state.currentSessionId);
  }
  renderChatList();

  // 侧边栏切换
  $('#toggle-sidebar-btn').addEventListener('click', () => toggleSidebar());

  // 新建对话
  $('#new-chat-btn').addEventListener('click', () => {
    createSession();
    $('#messages').innerHTML = '';
    renderMessage('你好！我是家庭助手，你可以问我天气、设置备忘或询问生活小贴士。', 'assistant');
    if(window.innerWidth <= 600) toggleSidebar(false);
  });

  // 预设提示词
  document.querySelectorAll('.prompt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      $('#input').value = prompt;
      $('#composer').dispatchEvent(new Event('submit', {cancelable:true}));
    });
  });

  // 语音输入
  $('#voice-btn').addEventListener('click', () => {
    if(!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)){
      showToast('浏览器不支持语音识别');
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript;
      $('#input').value = text;
    };
    recognition.onerror = () => showToast('语音识别失败');
    recognition.start();
    showToast('请说话...');
  });

  // open/close settings
  $('#settings-btn').addEventListener('click', ()=>{
    $('#settings').setAttribute('aria-hidden','false');
  });
  $('#close-settings').addEventListener('click', ()=>{
    $('#settings').setAttribute('aria-hidden','true');
  });
  $('#save-settings').addEventListener('click', ()=>{
    state.config.apiUrl = $('#api-url').value.trim();
    state.config.apiKey = $('#api-key').value.trim();
    state.config.model = $('#model').value.trim();
    state.config.useMock = !!$('#use-mock').checked;
    saveConfig();
    $('#settings').setAttribute('aria-hidden','true');
    showToast('设置已保存');
  });

  // compose submit
  const composer = $('#composer');
  const input = $('#input');
  composer.addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = input.value;
    input.value = '';
    handleSend(text);
  });

  // Enter = send; Shift+Enter = newline
  input.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' && !e.shiftKey){
      e.preventDefault();
      composer.dispatchEvent(new Event('submit', {cancelable:true}));
    }
  });
}

// init
loadConfig();
document.addEventListener('DOMContentLoaded', wireUp);
