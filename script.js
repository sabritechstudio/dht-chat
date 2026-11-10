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

const DEFAULT_ENDPOINT = "https://freeze-him-arabia-professional.trycloudflare.com";
const MODEL_NAME = "openbmb/minicpm5:latest";
const GREETING = "DHT online. How can I help you?";
const MAX_CONTEXT_MESSAGES = 20;

const SYSTEM_PROMPT =
  "You are DHT, an expert computing AI built by DHT-GHOST working for Noor.";

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

function describeFault(fault) {
  const status = fault && fault.status;
  if (status === 403) {
    return "Server rejected the request (403). Start Ollama with OLLAMA_ORIGINS=* and run the tunnel with --http-host-header=localhost:11434.";
  }
  if (status === 404) {
    return "Endpoint or model not found (404). Check the URL in Settings and make sure the model is installed on the host.";
  }
  if (status === 502 || status === 503 || status === 504 || status === 524 || status === 530 || status === 1033) {
    return "The tunnel or host is offline. Restart it and paste the new URL in Settings.";
  }
  if (status) {
    return "Server error (" + status + "). Check the host and try again.";
  }
  if (fault && fault.message && fault.name !== "TypeError") {
    return fault.message;
  }
  return "Cannot reach the server. Make sure the tunnel is running, the URL in Settings is correct, and Ollama has OLLAMA_ORIGINS=* set.";
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

function openSettings() {
  endpointInput.value = getEndpointBase();
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
  output = output.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/^#{1,6}[ \t]+(.+)$/gm, "<strong>$1</strong>");

  output = output.replace(/\u0001(\d+)\u0001/g, (match, index) => {
    return (
      '<code class="inline-code">' +
      escapeHtml(inlines[Number(index)]) +
      "</code>"
    );
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

function appendChatRow(text, side) {
  const row = document.createElement("div");
  row.className = "message-wrapper " + side;

  const bubble = document.createElement("div");
  bubble.className = "card chat-bubble";
  renderBubble(bubble, side, text);

  row.appendChild(bubble);
  chatContainer.appendChild(row);
  return { row: row, bubble: bubble };
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
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
    messages: [{ sender: "ai", text: GREETING }],
  };
  saveToDisk();
  switchSession(id);
}

function switchSession(id) {
  if (!sessionsMemory[id]) return;
  if (id !== currentSessionId) abortStream();

  currentSessionId = id;
  writeStorage("dht_active_id", id);

  chatContainer.innerHTML = "";
  sessionsMemory[id].messages.forEach((message) => {
    appendChatRow(message.text, message.sender);
  });
  scrollToBottom();
  renderSidebarThreads();

  if (claySidebar.classList.contains("open")) {
    toggleMobileSidebar();
  }
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

  sortedSessionIds().forEach((id) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.dataset.id = id;
    if (id === currentSessionId) item.classList.add("active");

    const title = document.createElement("span");
    title.textContent = sessionsMemory[id].title;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-thread-btn";
    deleteBtn.title = "Delete Thread";
    deleteBtn.setAttribute("aria-label", "Delete Thread");
    deleteBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

    item.appendChild(title);
    item.appendChild(deleteBtn);

    item.addEventListener("click", () => switchSession(id));
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteSession(id);
    });

    historyList.appendChild(item);
  });
}

function buildApiMessages(session) {
  const history = session.messages
    .slice(1)
    .filter((message) => message.text && message.text.trim() !== "")
    .slice(-MAX_CONTEXT_MESSAGES)
    .map((message) => ({
      role: message.sender === "user" ? "user" : "assistant",
      content: message.text,
    }));

  return [{ role: "system", content: SYSTEM_PROMPT }].concat(history);
}

function isLocalPage() {
  const host = window.location.hostname;
  return window.location.protocol === "file:" || host === "" || host === "localhost" || host === "127.0.0.1";
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
  }

  return direct();
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

  appendChatRow(promptString, "user");
  userInput.value = "";
  autoResizeInput();

  session.messages.push({ sender: "user", text: promptString });

  if (session.title === "New Thread") {
    session.title =
      promptString.length > 40 ? promptString.slice(0, 40) + "…" : promptString;
  }

  saveToDisk();
  renderSidebarThreads();

  const apiMessages = buildApiMessages(session);

  const response = appendChatRow("", "ai");
  const displayCard = response.bubble;
  displayCard.innerHTML = '<span class="typing-state">Thinking</span>';
  scrollToBottom();

  abortController = new AbortController();
  setStreaming(true);

  let rawAccumulator = "";
  let visibleText = "";
  let failed = false;

  const handleLine = (line) => {
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

    let token = "";
    if (parsed.message && typeof parsed.message.content === "string") {
      token = parsed.message.content;
    } else if (typeof parsed.response === "string") {
      token = parsed.response;
    }

    if (token === "") return;

    rawAccumulator += token;
    visibleText = stripThinking(rawAccumulator, false);

    if (visibleText !== "") {
      renderBubble(displayCard, "ai", visibleText);
      scrollToBottom();
    }
  };

  try {
        const streamConnection = await openStream(
      JSON.stringify({
        model: MODEL_NAME,
        messages: apiMessages,
        stream: true,
      }),
      abortController.signal,
    );

    if (!streamConnection.ok) {
      const httpFault = new Error("HTTP " + streamConnection.status);
      httpFault.status = streamConnection.status;
      throw httpFault;
    }

    if (!streamConnection.body) {
      throw new Error("Server returned an empty stream.");
    }

    const packetReader = streamConnection.body.getReader();
    const characterDecoder = new TextDecoder();
    let lineBuffer = "";

    while (true) {
      const { done, value } = await packetReader.read();
      if (done) break;

      lineBuffer += characterDecoder.decode(value, { stream: true });
      const lines = lineBuffer.split("\n");
      lineBuffer = lines.pop();

      for (const line of lines) {
        handleLine(line);
      }
    }

    lineBuffer += characterDecoder.decode();
    if (lineBuffer.trim() !== "") {
      handleLine(lineBuffer);
    }
  } catch (networkFault) {
    if (networkFault.name !== "AbortError") {
      failed = true;
      displayCard.classList.add("error");
      displayCard.textContent = describeFault(networkFault);
      console.error(networkFault);
    }
  } finally {
    setStreaming(false);
    abortController = null;
  }

  if (failed) return;

  const finalText = stripThinking(rawAccumulator, true).trim();

  if (finalText === "") {
    if (displayCard.isConnected) {
      displayCard.textContent = "No response received.";
    }
    return;
  }

  if (displayCard.isConnected) {
    renderBubble(displayCard, "ai", finalText);
  }

  if (sessionsMemory[sessionId]) {
    sessionsMemory[sessionId].messages.push({ sender: "ai", text: finalText });
    saveToDisk();
  }
}

function copyCodeFromButton(button) {
  const block = button.closest(".code-block");
  if (!block) return;
  const code = block.querySelector("code").textContent;

  const finish = () => {
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(code)
      .then(finish)
      .catch(() => {});
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = code;
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

function initializeApplication() {
  buildThemeGrid();
  applyTheme(readStorage("dht_theme") || "clay");
  endpointInput.value = getEndpointBase();

  const stored =
    readStorage("dht_sessions") || readStorage("sabri_one_sessions");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach((id) => {
          const entry = parsed[id];
          if (
            entry &&
            Array.isArray(entry.messages) &&
            entry.messages.length > 0
          ) {
            sessionsMemory[id] = {
              title:
                typeof entry.title === "string" ? entry.title : "New Thread",
              messages: entry.messages.filter(
                (message) =>
                  message &&
                  typeof message.text === "string" &&
                  (message.sender === "user" || message.sender === "ai"),
              ),
            };
            if (sessionsMemory[id].messages.length === 0) {
              sessionsMemory[id].messages = [{ sender: "ai", text: GREETING }];
            }
          }
        });
      }
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

settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettings();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeSettings();
});

userInput.addEventListener("input", autoResizeInput);
userInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    transmitUserPrompt();
  }
});

chatContainer.addEventListener("click", (event) => {
  const button = event.target.closest(".copy-btn");
  if (button) copyCodeFromButton(button);
});

document.addEventListener("DOMContentLoaded", initializeApplication);
