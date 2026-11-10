const chatContainer = document.getElementById("chat-container");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const historyList = document.getElementById("history-list");
const newChatBtn = document.getElementById("new-chat-btn");
const menuToggleBtn = document.getElementById("menu-toggle-btn");
const claySidebar = document.getElementById("clay-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const settingsClose = document.getElementById("settings-close");
const themeGrid = document.getElementById("theme-grid");
const endpointInput = document.getElementById("endpoint-input");
const endpointSave = document.getElementById("endpoint-save");
const searchInput = document.getElementById("search-input");
const scrollBottomBtn = document.getElementById("scroll-bottom-btn");
const modelInput = document.getElementById("model-input");
const tempInput = document.getElementById("temp-input");
const tempValue = document.getElementById("temp-value");
const instructionsInput = document.getElementById("instructions-input");
const memoryToggle = document.getElementById("memory-toggle");
const autoMemoryToggle = document.getElementById("auto-memory-toggle");
const memoryList = document.getElementById("memory-list");
const memoryInput = document.getElementById("memory-input");
const memoryAdd = document.getElementById("memory-add");
const memoryClear = document.getElementById("memory-clear");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const clearChatsBtn = document.getElementById("clear-chats-btn");

const DEFAULT_ENDPOINT = "https://freeze-him-arabia-professional.trycloudflare.com";
const GREETING = "DHT online. How can I help you?";
const BUILD_ID = "DHT build 5";
const MAX_MEMORY_ITEMS = 30;
const MAX_MEMORY_LENGTH = 140;
const CONTEXT_CHAR_BUDGET = 6000;
const PERSONAL_PATTERN = /\b(my name|call me|i am|i'm|i live|i work|i study|i use|i like|i love|i prefer|i hate|i have|my (?:\w+ ){0,2}(?:is|are))\b/i;

const DEFAULT_SETTINGS = {
  model: "gemma3:4b",
  temperature: 0.5,
  instructions: "",
  memoryEnabled: true,
  autoMemory: false,
  maxContext: 16,
};

const THEMES = [
  { id: "clay", name: "Claymorphism", colors: ["#eceef4", "#ffe3e8", "#c5b3e6"] },
  { id: "glass", name: "Glassmorphism", colors: ["#5b3df5", "#b24bf3", "#ff7eb3"] },
  { id: "midnight", name: "Midnight", colors: ["#0e1016", "#2b3250", "#7c8cff"] },
  { id: "neon", name: "Neon", colors: ["#06060c", "#ff00c8", "#00f0ff"] },
  { id: "paper", name: "Paper", colors: ["#f6f5f1", "#e6ecf7", "#2f5bea"] },
  { id: "forest", name: "Forest", colors: ["#0f1a15", "#24402f", "#4fd18b"] },
];

let currentSessionId = "";
let sessionsMemory = {};
let isStreaming = false;
let abortController = null;
let memoryAbort = null;
let settings = Object.assign({}, DEFAULT_SETTINGS);
let memoryItems = [];
let searchTerm = "";

console.log(BUILD_ID);

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {}
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadSettings() {
  const merged = Object.assign({}, DEFAULT_SETTINGS);
  const stored = readStorage("dht_settings");
  if (!stored) return merged;
  try {
    const parsed = JSON.parse(stored);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.model === "string" && parsed.model.trim()) merged.model = parsed.model.trim();
      if (typeof parsed.temperature === "number" && parsed.temperature >= 0 && parsed.temperature <= 1) merged.temperature = parsed.temperature;
      if (typeof parsed.instructions === "string") merged.instructions = parsed.instructions.slice(0, 600);
      if (typeof parsed.memoryEnabled === "boolean") merged.memoryEnabled = parsed.memoryEnabled;
      if (typeof parsed.autoMemory === "boolean") merged.autoMemory = parsed.autoMemory;
    }
  } catch (error) {}
  return merged;
}

function saveSettings() {
  writeStorage("dht_settings", JSON.stringify(settings));
}

function loadMemory() {
  const stored = readStorage("dht_memory");
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.text === "string" && item.text.trim() !== "")
      .map((item) => ({
        id: typeof item.id === "string" && item.id ? item.id : makeId(),
        text: item.text.slice(0, MAX_MEMORY_LENGTH),
      }))
      .slice(-MAX_MEMORY_ITEMS);
  } catch (error) {
    return [];
  }
}

function saveMemory() {
  writeStorage("dht_memory", JSON.stringify(memoryItems));
}

function addMemoryFact(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_MEMORY_LENGTH);
  if (clean.length < 4) return false;
  const lower = clean.toLowerCase();
  if (memoryItems.some((item) => item.text.toLowerCase() === lower)) return false;
  memoryItems.push({ id: makeId(), text: clean });
  if (memoryItems.length > MAX_MEMORY_ITEMS) {
    memoryItems = memoryItems.slice(-MAX_MEMORY_ITEMS);
  }
  saveMemory();
  renderMemoryList();
  return true;
}

function removeMemoryFacts(term) {
  const needle = String(term || "").toLowerCase().trim();
  if (needle === "") return 0;
  const before = memoryItems.length;
  memoryItems = memoryItems.filter((item) => !item.text.toLowerCase().includes(needle));
  const removed = before - memoryItems.length;
  if (removed > 0) {
    saveMemory();
    renderMemoryList();
  }
  return removed;
}

function renderMemoryList() {
  memoryList.innerHTML = "";

  if (memoryItems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "memory-empty";
    empty.textContent = "No memories yet.";
    memoryList.appendChild(empty);
    return;
  }

  memoryItems.forEach((item) => {
    const row = document.createElement("div");
    row.className = "memory-item";

    const text = document.createElement("span");
    text.textContent = item.text;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-thread-btn";
    remove.setAttribute("aria-label", "Delete memory");
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      memoryItems = memoryItems.filter((entry) => entry.id !== item.id);
      saveMemory();
      renderMemoryList();
    });

    row.appendChild(text);
    row.appendChild(remove);
    memoryList.appendChild(row);
  });
}

function handleLocalCommand(text) {
  const remember = text.match(/^\s*(?:please\s+)?(?:remember|memorize)(?:\s+that)?[\s:,-]+([\s\S]+)$/i);
  if (remember) {
    const fact = remember[1].trim();
    if (!fact.endsWith("?")) {
      if (addMemoryFact(fact)) return "Saved to memory: " + fact.slice(0, MAX_MEMORY_LENGTH);
      return "That is already in memory or too short to save.";
    }
  }

  const forget = text.match(/^\s*(?:please\s+)?forget(?:\s+that)?[\s:,-]+([\s\S]+)$/i);
  if (forget) {
    const removed = removeMemoryFacts(forget[1]);
    return removed > 0
      ? "Removed " + removed + " memory item" + (removed === 1 ? "" : "s") + "."
      : "Nothing in memory matched that.";
  }

  return null;
}

function abortMemory() {
  if (memoryAbort) {
    memoryAbort.abort();
    memoryAbort = null;
  }
}

async function learnFromMessage(text) {
  if (!settings.autoMemory || text.length > 500 || !PERSONAL_PATTERN.test(text)) return;

  const controller = new AbortController();
  memoryAbort = controller;

  try {
    const messages = [
      {
        role: "system",
        content: "Extract durable personal facts the user states about themselves, such as name, job, location, tools, preferences or projects. Output one short fact per line in the third person, at most 12 words each. If there are none, output only NONE. Never invent facts.",
      },
      { role: "user", content: text },
    ];
    const response = await openChat(messages, { temperature: 0, num_predict: 80 }, controller.signal);
    let raw = "";
    await consumeStream(response, (data) => {
      const token = tokenOf(data);
      if (token) raw += token;
    });

    stripThinking(raw, true)
      .split("\n")
      .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
      .filter((line) => line !== "" && !/^none\b/i.test(line) && line.length <= MAX_MEMORY_LENGTH)
      .slice(0, 3)
      .forEach((line) => addMemoryFact(line));
  } catch (error) {
  } finally {
    if (memoryAbort === controller) memoryAbort = null;
  }
}

function buildSystemPrompt() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const parts = [
    "You are DHT, a smart AI built by DHT-GHOST for Noor, with expert knowledge of computers. Today's date is " +
      today +
      ". You have no internet access and your training data is outdated, so for news, releases, prices or recent events say you may be out of date. Never invent links, dates or facts. Answer the latest message directly and briefly, in at most 4 short sentences, unless the user asks for detail. Do not use emojis unless the user does. Do not end every reply with a question. Silently fix typos. Remember everything said in this chat. Use code blocks for code.",
  ];

  if (settings.instructions.trim() !== "") {
    parts.push("User instructions: " + settings.instructions.trim());
  }

  if (settings.memoryEnabled && memoryItems.length > 0) {
    parts.push(
      "Known facts about the user (use only when relevant):\n" +
        memoryItems.map((item) => "- " + item.text).join("\n"),
    );
  }

  return parts.join("\n\n");
}

function buildApiMessages(session) {
  const usable = session.messages.filter(
    (message) => !message.greeting && !message.local && message.text && message.text.trim() !== "",
  );

  const picked = [];
  let used = 0;

  for (let index = usable.length - 1; index >= 0; index--) {
    const message = usable[index];
    if (picked.length >= settings.maxContext) break;
    if (used + message.text.length > CONTEXT_CHAR_BUDGET && picked.length > 0) break;
    picked.unshift({
      role: message.sender === "user" ? "user" : "assistant",
      content: message.text,
    });
    used += message.text.length;
  }

  return [{ role: "system", content: buildSystemPrompt() }].concat(picked);
}

function normalizeEndpoint(value) {
  let base = String(value || "").trim().replace(/\/+$/, "");
  base = base.replace(/\/api\/(chat|generate)$/i, "");
  if (base === "") return "";
  if (!/^https?:\/\//i.test(base)) {
    base = (window.location.protocol === "https:" ? "https://" : "http://") + base;
  }
  if (window.location.protocol === "https:" && /^http:\/\//i.test(base)) {
    base = "https://" + base.slice(7);
  }
  return base;
}

function getEndpointBase() {
  return normalizeEndpoint(readStorage("dht_endpoint") || DEFAULT_ENDPOINT);
}

function saveEndpoint() {
  const normalized = normalizeEndpoint(endpointInput.value);
  if (normalized === "") {
    endpointInput.value = getEndpointBase();
    return;
  }
  writeStorage("dht_endpoint", normalized);
  endpointInput.value = normalized;
  endpointSave.textContent = "Saved";
  setTimeout(() => {
    endpointSave.textContent = "Save";
  }, 1500);
}

function isLocalPage() {
  const host = window.location.hostname;
  return (
    window.location.protocol === "file:" ||
    host === "" ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

async function openStream(payload, signal) {
  const base = getEndpointBase();

  const direct = () =>
    fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: signal,
    });

  if (isLocalPage()) return direct();

  try {
    const proxied = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dht-target": base },
      body: payload,
      signal: signal,
    });

    if (proxied.headers.get("x-dht-proxy") === "1") return proxied;
    if (proxied.status !== 404 && proxied.status !== 405) return proxied;
  } catch (error) {
    if (error.name === "AbortError") throw error;
    console.error("Proxy request failed", error);
  }

  return direct();
}

async function openChat(messages, overrides, signal) {
  const payload = JSON.stringify({
    model: settings.model,
    messages: messages,
    stream: true,
    keep_alive: "24h",
    options: Object.assign(
      {
        temperature: settings.temperature,
        top_p: 0.9,
        repeat_penalty: 1.1,
        num_ctx: 4096,
        num_predict: 400,
      },
      overrides || {},
    ),
  });

  const response = await openStream(payload, signal);

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.text();
      const data = JSON.parse(body);
      detail = typeof data.error === "string" ? data.error : "";
    } catch (error) {}
    const fault = new Error(detail || "HTTP " + response.status);
    fault.status = response.status;
    fault.detail = detail;
    throw fault;
  }

  if (!response.body) {
    throw new Error("Server returned an empty stream.");
  }

  return response;
}

async function consumeStream(response, onData) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const feed = (line) => {
    const trimmed = line.trim();
    if (trimmed === "") return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return;
    }
    if (parsed.error) {
      throw new Error(String(parsed.error));
    }
    onData(parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();
    lines.forEach(feed);
  }

  buffer += decoder.decode();
  if (buffer.trim() !== "") feed(buffer);
}

function tokenOf(data) {
  if (data.message && typeof data.message.content === "string") return data.message.content;
  if (typeof data.response === "string") return data.response;
  return "";
}

function describeFault(fault) {
  const status = fault && fault.status;
  const suffix = fault && fault.detail ? " (" + fault.detail + ")" : "";

  if (status === 403) {
    return "Server rejected the request (403)." + suffix + " Restart the tunnel with --http-host-header set to your Ollama host and port.";
  }
  if (status === 404) {
    return "Endpoint or model not found (404)." + suffix + " Check the URL and the model name in Settings.";
  }
  if (status === 502 || status === 503 || status === 504 || status === 524 || status === 530 || status === 1033) {
    return "The tunnel or host is offline." + suffix + " Restart it and paste the new URL in Settings.";
  }
  if (status) {
    return "Server error (" + status + ")." + suffix;
  }
  if (fault && fault.message && fault.name !== "TypeError") {
    return fault.message;
  }
  return "Cannot reach the server (" + BUILD_ID + "). Open the console (F12) and check the red error.";
}

function applyTheme(id) {
  const valid = THEMES.some((theme) => theme.id === id) ? id : "clay";
  document.documentElement.setAttribute("data-theme", valid);
  writeStorage("dht_theme", valid);
  themeGrid.querySelectorAll(".theme-option").forEach((option) => {
    const active = option.dataset.theme === valid;
    option.classList.toggle("active", active);
    option.setAttribute("aria-pressed", String(active));
  });
}

function buildThemeGrid() {
  themeGrid.innerHTML = "";
  THEMES.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "theme-option";
    option.dataset.theme = theme.id;

    const swatch = document.createElement("div");
    swatch.className = "theme-swatch";
    theme.colors.forEach((color) => {
      const part = document.createElement("span");
      part.style.background = color;
      swatch.appendChild(part);
    });

    const label = document.createElement("span");
    label.textContent = theme.name;

    option.appendChild(swatch);
    option.appendChild(label);
    option.addEventListener("click", () => applyTheme(theme.id));
    themeGrid.appendChild(option);
  });
}

function syncSettingsUI() {
  endpointInput.value = getEndpointBase();
  modelInput.value = settings.model;
  tempInput.value = String(settings.temperature);
  tempValue.textContent = settings.temperature.toFixed(1);
  instructionsInput.value = settings.instructions;
  memoryToggle.checked = settings.memoryEnabled;
  autoMemoryToggle.checked = settings.autoMemory;
}

function openSettings() {
  syncSettingsUI();
  renderMemoryList();
  settingsModal.classList.add("open");
  if (claySidebar.classList.contains("open")) toggleMobileSidebar();
}

function closeSettings() {
  settingsModal.classList.remove("open");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildCodeBlock(block) {
  const language = block.lang ? escapeHtml(block.lang) : "code";
  return (
    '<div class="code-block"><div class="code-head"><span>' +
    language +
    '</span><button class="copy-btn" type="button">Copy</button></div><pre><code>' +
    escapeHtml(block.code) +
    "</code></pre></div>"
  );
}

function formatText(text) {
  const blocks = [];
  const inlines = [];

  let output = text.replace(
    /```([\w+#.-]*)[ \t]*\n?([\s\S]*?)(```|$)/g,
    (match, lang, code) => {
      blocks.push({ lang: lang, code: code.replace(/\n$/, "") });
      return "\u0000" + (blocks.length - 1) + "\u0000";
    },
  );

  output = output.replace(/`([^`\n]+)`/g, (match, code) => {
    inlines.push(code);
    return "\u0001" + (inlines.length - 1) + "\u0001";
  });

  output = escapeHtml(output);
  output = output.replace(/^[ \t]*[-*][ \t]+/gm, "• ");
  output = output.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/gm, "$1<em>$2</em>");
  output = output.replace(/^#{1,6}[ \t]+(.+)$/gm, "<strong>$1</strong>");
  output = output.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  output = output.replace(/\u0001(\d+)\u0001/g, (match, index) => {
    return '<code class="inline-code">' + escapeHtml(inlines[Number(index)]) + "</code>";
  });

  output = output.replace(/\u0000(\d+)\u0000/g, (match, index) =>
    buildCodeBlock(blocks[Number(index)]),
  );
  output = output.replace(/\n+(<div class="code-block">)/g, "$1");
  output = output.replace(/(<\/pre><\/div>)\n+/g, "$1");

  return output;
}

function stripThinking(raw, isFinal) {
  let text = raw;

  const firstClose = text.indexOf("</think>");
  const firstOpen = text.indexOf("<think>");
  if (firstClose !== -1 && (firstOpen === -1 || firstClose < firstOpen)) {
    text = text.slice(firstClose + 8);
  }

  text = text.replace(/<think>[\s\S]*?<\/think>/g, "");

  const danglingOpen = text.indexOf("<think>");
  if (danglingOpen !== -1) {
    text = text.slice(0, danglingOpen);
  }

  if (!isFinal) {
    text = text.replace(/<\/?t?h?i?n?k?$/, "");
  }

  return text.replace(/^\s+/, "");
}

function renderBubble(bubble, side, text) {
  if (side === "ai") {
    bubble.innerHTML = formatText(text);
  } else {
    bubble.textContent = text;
  }
}

function addAction(bar, action, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "act-btn";
  button.dataset.action = action;
  button.textContent = label;
  bar.appendChild(button);
}

function buildActions(message, isLast) {
  const bar = document.createElement("div");
  bar.className = "msg-actions";

  addAction(bar, "copy", "Copy");
  if (message.sender === "user") addAction(bar, "edit", "Edit");
  if (isLast && message.sender === "ai" && !message.local) addAction(bar, "regen", "Regenerate");
  if (isLast && message.sender === "ai" && message.truncated) addAction(bar, "continue", "Continue");
  if (isLast && message.sender === "user" && !message.local) addAction(bar, "regen", "Retry");
  addAction(bar, "delete", "Delete");

  if (message.tps) {
    const meta = document.createElement("span");
    meta.className = "msg-meta";
    meta.textContent = message.tps.toFixed(1) + " tok/s";
    bar.appendChild(meta);
  }

  return bar;
}

function buildMessageRow(message, isLast) {
  const row = document.createElement("div");
  row.className = "message-wrapper static " + message.sender;
  row.dataset.id = message.id;

  const column = document.createElement("div");
  column.className = "message-col";

  const bubble = document.createElement("div");
  bubble.className = "card chat-bubble";
  renderBubble(bubble, message.sender, message.text);
  column.appendChild(bubble);

  if (!message.greeting) {
    column.appendChild(buildActions(message, isLast));
  }

  row.appendChild(column);
  return row;
}

function appendStreamingRow() {
  const row = document.createElement("div");
  row.className = "message-wrapper ai";

  const column = document.createElement("div");
  column.className = "message-col";

  const bubble = document.createElement("div");
  bubble.className = "card chat-bubble";
  bubble.innerHTML = '<span class="typing-state">Thinking</span>';

  column.appendChild(bubble);
  row.appendChild(column);
  chatContainer.appendChild(row);
  return bubble;
}

function isNearBottom() {
  return chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 140;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateScrollButton() {
  scrollBottomBtn.classList.toggle("show", !isNearBottom());
}

function renderChat() {
  chatContainer.innerHTML = "";
  const session = sessionsMemory[currentSessionId];
  if (!session) return;

  const total = session.messages.length;
  const fragment = document.createDocumentFragment();
  session.messages.forEach((message, index) => {
    fragment.appendChild(buildMessageRow(message, index === total - 1));
  });
  chatContainer.appendChild(fragment);
  updateScrollButton();
}

function saveToDisk() {
  writeStorage("dht_sessions", JSON.stringify(sessionsMemory));
}

function sortedSessionIds() {
  return Object.keys(sessionsMemory).sort().reverse();
}

function toggleMobileSidebar() {
  claySidebar.classList.toggle("open");
  sidebarOverlay.classList.toggle("open");
}

function setStreaming(state) {
  isStreaming = state;
  sendBtn.classList.toggle("stop", state);
  sendBtn.setAttribute("aria-label", state ? "Stop Generating" : "Send Message");
}

function abortStream() {
  if (isStreaming && abortController) {
    abortController.abort();
  }
}

function autoResizeInput() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 160) + "px";
}

function makeGreeting() {
  return { id: makeId(), sender: "ai", text: GREETING, greeting: true, ts: Date.now() };
}

function normalizeSessions(source) {
  const result = {};
  if (!source || typeof source !== "object") return result;

  Object.keys(source).forEach((id) => {
    const entry = source[id];
    if (!entry || !Array.isArray(entry.messages)) return;

    const messages = entry.messages
      .filter(
        (message) =>
          message &&
          typeof message.text === "string" &&
          (message.sender === "user" || message.sender === "ai"),
      )
      .map((message, index) => {
        const clean = {
          id: typeof message.id === "string" && message.id ? message.id : makeId(),
          sender: message.sender,
          text: message.text,
          ts: typeof message.ts === "number" ? message.ts : Date.now(),
        };
        if (message.local) clean.local = true;
        if (message.truncated) clean.truncated = true;
        if (message.greeting || (index === 0 && message.sender === "ai")) clean.greeting = true;
        if (typeof message.tps === "number") clean.tps = message.tps;
        return clean;
      });

    if (messages.length === 0) messages.push(makeGreeting());

    result[id] = {
      title: typeof entry.title === "string" && entry.title ? entry.title : "New Thread",
      messages: messages,
    };
  });

  return result;
}

function createNewSession() {
  abortStream();

  const existingId = sortedSessionIds().find((id) => {
    const session = sessionsMemory[id];
    return session.messages.length <= 1 && session.title === "New Thread";
  });

  if (existingId) {
    switchSession(existingId);
    return;
  }

  const id = "session_" + Date.now();
  sessionsMemory[id] = {
    title: "New Thread",
    messages: [makeGreeting()],
  };
  saveToDisk();
  switchSession(id);
}

function switchSession(id) {
  if (!sessionsMemory[id]) return;
  if (id !== currentSessionId) abortStream();

  currentSessionId = id;
  writeStorage("dht_active_id", id);

  renderChat();
  scrollToBottom();
  renderSidebarThreads();

  if (claySidebar.classList.contains("open")) {
    toggleMobileSidebar();
  }
}

function renameSession(id) {
  const session = sessionsMemory[id];
  if (!session) return;
  const next = window.prompt("Rename thread", session.title);
  if (next === null) return;
  const clean = next.trim().slice(0, 60);
  if (clean === "") return;
  session.title = clean;
  saveToDisk();
  renderSidebarThreads();
}

function deleteSession(id) {
  if (id === currentSessionId) abortStream();

  delete sessionsMemory[id];
  saveToDisk();

  if (id === currentSessionId) {
    const remaining = sortedSessionIds();
    if (remaining.length > 0) {
      switchSession(remaining[0]);
    } else {
      createNewSession();
    }
    return;
  }

  renderSidebarThreads();
}

function renderSidebarThreads() {
  historyList.innerHTML = "";
  const term = searchTerm.trim().toLowerCase();

  const ids = sortedSessionIds().filter((id) => {
    if (term === "") return true;
    const session = sessionsMemory[id];
    return (
      session.title.toLowerCase().includes(term) ||
      session.messages.some((message) => message.text.toLowerCase().includes(term))
    );
  });

  if (ids.length === 0) {
    const empty = document.createElement("div");
    empty.className = "memory-empty";
    empty.textContent = "No chats found.";
    historyList.appendChild(empty);
    return;
  }

  ids.forEach((id) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.dataset.id = id;
    if (id === currentSessionId) item.classList.add("active");

    const title = document.createElement("span");
    title.textContent = sessionsMemory[id].title;

    const renameBtn = document.createElement("button");
    renameBtn.className = "delete-thread-btn";
    renameBtn.title = "Rename Thread";
    renameBtn.setAttribute("aria-label", "Rename Thread");
    renameBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-thread-btn";
    deleteBtn.title = "Delete Thread";
    deleteBtn.setAttribute("aria-label", "Delete Thread");
    deleteBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    item.appendChild(title);
    item.appendChild(renameBtn);
    item.appendChild(deleteBtn);

    item.addEventListener("click", () => switchSession(id));
    renameBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      renameSession(id);
    });
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSession(id);
    });

    historyList.appendChild(item);
  });
}

async function generateReply(sessionId) {
  const session = sessionsMemory[sessionId];
  if (!session) return;

  abortMemory();

  const apiMessages = buildApiMessages(session);
  const displayCard = appendStreamingRow();
  scrollToBottom();

  abortController = new AbortController();
  setStreaming(true);

  let raw = "";
  let failed = false;
  let aborted = false;
  let truncated = false;
  let tps = 0;

  try {
    const response = await openChat(apiMessages, null, abortController.signal);

    await consumeStream(response, (data) => {
      if (data.done) {
        if (data.eval_count && data.eval_duration) {
          tps = data.eval_count / (data.eval_duration / 1e9);
        }
        if (data.done_reason === "length") truncated = true;
      }

      const token = tokenOf(data);
      if (token === "") return;

      raw += token;
      const visible = stripThinking(raw, false);

      if (visible !== "") {
        const stick = isNearBottom();
        renderBubble(displayCard, "ai", visible);
        if (stick) scrollToBottom();
      }
    });
  } catch (fault) {
    if (fault.name === "AbortError") {
      aborted = true;
    } else {
      failed = true;
      displayCard.classList.add("error");
      displayCard.textContent = describeFault(fault);
      console.error(fault);
    }
  } finally {
    setStreaming(false);
    abortController = null;
  }

  if (failed) return;

  const finalText = stripThinking(raw, true).trim();

  if (finalText === "") {
    const wrapper = displayCard.closest(".message-wrapper");
    if (wrapper && wrapper.isConnected) {
      if (aborted) {
        wrapper.remove();
      } else {
        displayCard.textContent = "No response received.";
      }
    }
    return;
  }

  const aiMessage = { id: makeId(), sender: "ai", text: finalText, ts: Date.now() };
  if (tps > 0) aiMessage.tps = tps;
  if (truncated) aiMessage.truncated = true;

  if (sessionsMemory[sessionId]) {
    sessionsMemory[sessionId].messages.push(aiMessage);
    saveToDisk();
  }

  if (sessionId === currentSessionId) {
    const stick = isNearBottom();
    const keep = chatContainer.scrollTop;
    renderChat();
    if (stick) {
      scrollToBottom();
    } else {
      chatContainer.scrollTop = keep;
    }
    updateScrollButton();
  }
}

async function transmitUserPrompt() {
  if (isStreaming) {
    abortStream();
    return;
  }

  const promptString = userInput.value.trim();
  if (!promptString) return;

  const sessionId = currentSessionId;
  const session = sessionsMemory[sessionId];
  if (!session) return;

  abortMemory();

  userInput.value = "";
  autoResizeInput();

  const userMessage = { id: makeId(), sender: "user", text: promptString, ts: Date.now() };
  session.messages.push(userMessage);

  if (session.title === "New Thread") {
    session.title =
      promptString.length > 40 ? promptString.slice(0, 40) + "…" : promptString;
  }

  const commandReply = handleLocalCommand(promptString);

  if (commandReply !== null) {
    userMessage.local = true;
    session.messages.push({
      id: makeId(),
      sender: "ai",
      text: commandReply,
      local: true,
      ts: Date.now(),
    });
    saveToDisk();
    renderSidebarThreads();
    renderChat();
    scrollToBottom();
    return;
  }

  saveToDisk();
  renderSidebarThreads();
  renderChat();
  scrollToBottom();

  await generateReply(sessionId);
  learnFromMessage(promptString);
}

function copyText(text, button) {
  const finish = () => {
    if (!button) return;
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(finish)
      .catch(() => {});
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  try {
    document.execCommand("copy");
    finish();
  } catch (error) {}
  document.body.removeChild(helper);
}

function copyCodeFromButton(button) {
  const block = button.closest(".code-block");
  if (!block) return;
  copyText(block.querySelector("code").textContent, button);
}

function handleMessageAction(action, messageId, button) {
  const session = sessionsMemory[currentSessionId];
  if (!session) return;

  const index = session.messages.findIndex((message) => message.id === messageId);
  if (index === -1) return;
  const message = session.messages[index];

  if (action === "copy") {
    copyText(message.text, button);
    return;
  }

  if (isStreaming) return;

  if (action === "delete") {
    session.messages.splice(index, 1);
    saveToDisk();
    renderChat();
    return;
  }

  if (action === "edit") {
    session.messages.splice(index);
    saveToDisk();
    renderChat();
    userInput.value = message.text;
    autoResizeInput();
    userInput.focus();
    return;
  }

  if (index !== session.messages.length - 1) return;

  if (action === "regen") {
    if (message.sender === "ai") session.messages.splice(index, 1);
    saveToDisk();
    renderChat();
    scrollToBottom();
    generateReply(currentSessionId);
    return;
  }

  if (action === "continue") {
    session.messages.push({ id: makeId(), sender: "user", text: "Continue.", ts: Date.now() });
    saveToDisk();
    renderChat();
    scrollToBottom();
    generateReply(currentSessionId);
  }
}

function exportData() {
  const payload = {
    app: "DHT",
    version: 5,
    exportedAt: new Date().toISOString(),
    sessions: sessionsMemory,
    memory: memoryItems,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dht-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(data) {
  if (!data || typeof data !== "object") throw new Error("Invalid backup");

  const incoming = normalizeSessions(data.sessions);
  let added = 0;

  Object.keys(incoming).forEach((id) => {
    let targetId = id;
    if (sessionsMemory[targetId]) targetId = "session_" + (Date.now() + added);
    sessionsMemory[targetId] = incoming[id];
    added++;
  });

  if (Array.isArray(data.memory)) {
    data.memory.forEach((item) => {
      if (item && typeof item.text === "string") addMemoryFact(item.text);
    });
  }

  saveToDisk();
  renderSidebarThreads();
  window.alert("Imported " + added + " chat(s).");
}

function clearAllChats() {
  if (!window.confirm("Delete all chats? This cannot be undone.")) return;
  abortStream();
  sessionsMemory = {};
  currentSessionId = "";
  saveToDisk();
  createNewSession();
  closeSettings();
}

function initializeApplication() {
  settings = loadSettings();
  memoryItems = loadMemory();

  buildThemeGrid();
  applyTheme(readStorage("dht_theme") || "clay");
  syncSettingsUI();
  renderMemoryList();

  const stored = readStorage("dht_sessions") || readStorage("sabri_one_sessions");
  if (stored) {
    try {
      sessionsMemory = normalizeSessions(JSON.parse(stored));
    } catch (error) {
      sessionsMemory = {};
    }
  }

  const activeSessionId =
    readStorage("dht_active_id") || readStorage("sabri_one_active_id");

  if (activeSessionId && sessionsMemory[activeSessionId]) {
    switchSession(activeSessionId);
  } else if (sortedSessionIds().length > 0) {
    switchSession(sortedSessionIds()[0]);
  } else {
    createNewSession();
  }
}

menuToggleBtn.addEventListener("click", toggleMobileSidebar);
sidebarOverlay.addEventListener("click", toggleMobileSidebar);
newChatBtn.addEventListener("click", createNewSession);
sendBtn.addEventListener("click", transmitUserPrompt);
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
endpointSave.addEventListener("click", saveEndpoint);

endpointInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveEndpoint();
  }
});

modelInput.addEventListener("change", () => {
  settings.model = modelInput.value.trim() || DEFAULT_SETTINGS.model;
  modelInput.value = settings.model;
  saveSettings();
});

tempInput.addEventListener("input", () => {
  const value = parseFloat(tempInput.value);
  settings.temperature = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_SETTINGS.temperature;
  tempValue.textContent = settings.temperature.toFixed(1);
  saveSettings();
});

instructionsInput.addEventListener("change", () => {
  settings.instructions = instructionsInput.value.trim().slice(0, 600);
  saveSettings();
});

memoryToggle.addEventListener("change", () => {
  settings.memoryEnabled = memoryToggle.checked;
  saveSettings();
});

autoMemoryToggle.addEventListener("change", () => {
  settings.autoMemory = autoMemoryToggle.checked;
  saveSettings();
});

const submitMemoryInput = () => {
  if (addMemoryFact(memoryInput.value)) {
    memoryInput.value = "";
  }
};

memoryAdd.addEventListener("click", submitMemoryInput);
memoryInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitMemoryInput();
  }
});

memoryClear.addEventListener("click", () => {
  if (!window.confirm("Clear all memory?")) return;
  memoryItems = [];
  saveMemory();
  renderMemoryList();
});

exportBtn.addEventListener("click", exportData);
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", async () => {
  const file = importFile.files && importFile.files[0];
  importFile.value = "";
  if (!file) return;
  try {
    importData(JSON.parse(await file.text()));
  } catch (error) {
    window.alert("That file is not a valid DHT backup.");
  }
});
clearChatsBtn.addEventListener("click", clearAllChats);

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value;
  renderSidebarThreads();
});

scrollBottomBtn.addEventListener("click", () => {
  chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: "smooth" });
});

chatContainer.addEventListener("scroll", updateScrollButton);

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettings();

  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      createNewSession();
    } else if (key === "k") {
      event.preventDefault();
      if (window.innerWidth <= 768 && !claySidebar.classList.contains("open")) toggleMobileSidebar();
      searchInput.focus();
    } else if (key === "s") {
      event.preventDefault();
      openSettings();
    }
  }
});

userInput.addEventListener("input", autoResizeInput);
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    transmitUserPrompt();
  }
});

chatContainer.addEventListener("click", (event) => {
  const codeButton = event.target.closest(".copy-btn");
  if (codeButton) {
    copyCodeFromButton(codeButton);
    return;
  }

  const actionButton = event.target.closest(".act-btn");
  if (!actionButton) return;

  const row = actionButton.closest(".message-wrapper");
  if (!row) return;

  handleMessageAction(actionButton.dataset.action, row.dataset.id, actionButton);
});

document.addEventListener("DOMContentLoaded", initializeApplication);