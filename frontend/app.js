const modelSelect = document.querySelector("#modelSelect");
const manualModelPanel = document.querySelector("#manualModelPanel");
const manualModelCurrent = document.querySelector("#manualModelCurrent");
const modelStrengthInfo = document.querySelector("#modelStrengthInfo");
const imageUrlInput = document.querySelector("#imageUrlInput");
const localImagePicker = document.querySelector("#localImagePicker");
const clearLocalImagesBtn = document.querySelector("#clearLocalImages");
const attachmentDropzone = document.querySelector("#attachmentDropzone");
const selectedUploadList = document.querySelector("#selectedUploadList");
const attachmentStatus = document.querySelector("#attachmentStatus");
const attachmentCountText = document.querySelector("#attachmentCountText");
const toggleAttachmentPanelBtn = document.querySelector("#toggleAttachmentPanel");
const attachmentPanelBody = document.querySelector("#attachmentPanelBody");
const composerModelBadge = document.querySelector("#composerModelBadge");
const systemPromptInput = document.querySelector("#systemPrompt");
const temperatureInput = document.querySelector("#temperature");
const temperatureValue = document.querySelector("#temperatureValue");
const topPInput = document.querySelector("#topP");
const topPValue = document.querySelector("#topPValue");
const maxTokensInput = document.querySelector("#maxTokens");
const maxTokensValue = document.querySelector("#maxTokensValue");
const presencePenaltyInput = document.querySelector("#presencePenalty");
const presencePenaltyValue = document.querySelector("#presencePenaltyValue");
const frequencyPenaltyInput = document.querySelector("#frequencyPenalty");
const frequencyPenaltyValue = document.querySelector("#frequencyPenaltyValue");
const memoryTurnsInput = document.querySelector("#memoryTurns");
const memoryTurnsValue = document.querySelector("#memoryTurnsValue");
const useMemoryInput = document.querySelector("#useMemory");
const useLongTermMemoryInput = document.querySelector("#useLongTermMemory");
const autoRouteInput = document.querySelector("#autoRoute");
const useToolsInput = document.querySelector("#useTools");
const clearMemoryBtn = document.querySelector("#clearMemory");
const viewLongTermMemoryBtn = document.querySelector("#viewLongTermMemory");
const clearLongTermMemoryBtn = document.querySelector("#clearLongTermMemory");
const showToolsBtn = document.querySelector("#showTools");
const newChatBtn = document.querySelector("#newChat");
const clearAllHistoryBtn = document.querySelector("#clearAllHistory");
const sessionSelect = document.querySelector("#sessionSelect");
const sessionList = document.querySelector("#sessionList");
const deleteCurrentSessionBtn = document.querySelector("#deleteCurrentSession");
const statusText = document.querySelector("#statusText");
const appRoot = document.querySelector(".app");
const settingsPanel = document.querySelector(".settings-panel");
const toggleSettingsDrawerBtn = document.querySelector("#toggleSettingsDrawer");
const settingsBackdrop = document.querySelector("#settingsBackdrop");
const toggleCompactSidebarBtn = document.querySelector("#toggleCompactSidebar");
const compactStateText = document.querySelector("#compactStateText");
const routeModeText = document.querySelector("#routeModeText");
const routeInfoText = document.querySelector("#routeInfoText");
const selectedModelText = document.querySelector("#selectedModelText");
const toggleThemeBtn = document.querySelector("#toggleTheme");
const themeStateText = document.querySelector("#themeStateText");
const toggleAdvancedParamsBtn = document.querySelector("#toggleAdvancedParams");
const toggleAdvancedParamsText = document.querySelector("#toggleAdvancedParamsText");
const advancedParamsPanel = document.querySelector("#advancedParamsPanel");
const chatMessages = document.querySelector("#chatMessages");
const chatForm = document.querySelector("#chatForm");
const userInput = document.querySelector("#userInput");
const sendBtn = document.querySelector("#sendBtn");
const memoryManagerModal = document.querySelector("#memoryManagerModal");
const memoryManagerBackdrop = document.querySelector("#memoryManagerBackdrop");
const closeMemoryManagerBtn = document.querySelector("#closeMemoryManager");
const refreshMemoryManagerBtn = document.querySelector("#refreshMemoryManager");
const selectAllMemoryFactsBtn = document.querySelector("#selectAllMemoryFacts");
const clearMemorySelectionBtn = document.querySelector("#clearMemorySelection");
const deleteSelectedMemoryFactsBtn = document.querySelector("#deleteSelectedMemoryFacts");
const memoryManagerMeta = document.querySelector("#memoryManagerMeta");
const memoryManagerList = document.querySelector("#memoryManagerList");

const SESSION_INDEX_KEY = "chat_session_index_v1";
const MEMORY_SCOPE_KEY = "long_term_memory_scope_v1";
const MAX_SAVED_SESSIONS = 30;
const DEFAULT_SESSION_TITLE = "新對話";
const MESSAGE_PLACEHOLDER = "思考中...";
const COMPACT_SIDEBAR_KEY = "compact_sidebar_mode_v1";
const THEME_KEY = "chat_theme_mode_v1";
const AUTO_ROUTE_KEY = "auto_route_v2";
const USE_TOOLS_KEY = "use_tools_v2";
const USE_LONG_MEMORY_KEY = "use_long_memory_v2";
const SETTINGS_DRAWER_KEY = "settings_drawer_open_v2";
const ATTACHMENT_PANEL_KEY = "attachment_panel_open_v2";
const MAX_IMAGE_ATTACHMENTS = 5;
const MAX_LOCAL_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PDF_ATTACHMENTS = 2;
const MAX_LOCAL_PDF_BYTES = 6 * 1024 * 1024;

let isStreaming = false;
let currentSessionId = localStorage.getItem("chat_session_id") || crypto.randomUUID();
let chatHistory = [];
let sessionIndex = [];
let memoryScopeId = "";
let latestRoutedModel = "";
let latestRouteReason = "";
let latestRouteLabel = "";
let latestRouterDefaults = {
  fast: "",
  reasoning: "",
  vision: ""
};
let memoryManagerFacts = [];
let selectedMemoryFactIds = new Set();
let isMemoryManagerBusy = false;
let localAttachments = [];
let isReadingLocalAttachments = false;

localStorage.setItem("chat_session_id", currentSessionId);

function getOrCreateMemoryScopeId() {
  const saved = String(localStorage.getItem(MEMORY_SCOPE_KEY) || "").trim();
  if (saved) {
    return saved;
  }

  const fallback = String(currentSessionId || crypto.randomUUID()).trim();
  localStorage.setItem(MEMORY_SCOPE_KEY, fallback);
  return fallback;
}

memoryScopeId = getOrCreateMemoryScopeId();

const sliderBindings = [
  {
    input: temperatureInput,
    valueElement: temperatureValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: topPInput,
    valueElement: topPValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: maxTokensInput,
    valueElement: maxTokensValue,
    format: (value) => String(Math.round(Number(value)))
  },
  {
    input: presencePenaltyInput,
    valueElement: presencePenaltyValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: frequencyPenaltyInput,
    valueElement: frequencyPenaltyValue,
    format: (value) => Number(value).toFixed(1)
  },
  {
    input: memoryTurnsInput,
    valueElement: memoryTurnsValue,
    format: (value) => String(Math.round(Number(value)))
  }
];

function setStatus(text) {
  statusText.textContent = text;
}

function setRouteInfo(text) {
  routeInfoText.textContent = text;
}

function setSelectedModelInfo(text) {
  selectedModelText.textContent = text;
  if (composerModelBadge) {
    composerModelBadge.textContent =
      String(text || "").replace(/^(Selected model|目前模型)\s*[:：]\s*/i, "") || "等待下一輪";
  }
}

function getShortRouteReason(routeReason, routeLabel = "", autoRoute = autoRouteInput.checked) {
  switch (String(routeReason || "").trim().toLowerCase()) {
    case "manual":
      return "手動選擇";
    case "vision":
      return "圖片輸入";
    case "document":
      return "PDF 文件";
    case "reasoning":
      return "複雜問題";
    case "fast":
      return "快速回覆";
    default:
      if (routeLabel) return String(routeLabel).trim();
      return autoRoute ? "自動判斷" : "手動選擇";
  }
}

function refreshRouteInfo(options = {}) {
  const autoRoute = typeof options.autoRoute === "boolean" ? options.autoRoute : autoRouteInput.checked;
  const routeReason =
    typeof options.routeReason === "string" ? options.routeReason : autoRoute ? latestRouteReason : "";
  const routeLabel =
    typeof options.routeLabel === "string" ? options.routeLabel : autoRoute ? latestRouteLabel : "";

  if (routeReason || routeLabel) {
    setRouteInfo(`選擇理由：${getShortRouteReason(routeReason, routeLabel, autoRoute)}`);
    return;
  }

  if (!autoRoute) {
    setRouteInfo("選擇理由：手動選擇");
    return;
  }

  setRouteInfo("選擇理由：尚未送出");
}

function refreshSelectedModelInfo(options = {}) {
  const routedModel =
    typeof options.routedModel === "string" ? options.routedModel : autoRouteInput.checked ? latestRoutedModel : "";

  if (routedModel) {
    setSelectedModelInfo(`目前模型：${routedModel}`);
    return;
  }

  if (modelSelect.value) {
    setSelectedModelInfo(`目前模型：${modelSelect.value}`);
    return;
  }

  setSelectedModelInfo("目前模型：等待下一輪");
}

function getModelStrengthSummary(modelName) {
  const normalized = String(modelName || "").trim();
  if (!normalized) {
    return "一般問答、文字整理";
  }

  const lower = normalized.toLowerCase();
  const strengths = [];
  const pushStrength = (text) => {
    if (text && !strengths.includes(text)) {
      strengths.push(text);
    }
  };

  if (normalized === latestRouterDefaults.vision || /vision|scout|omni|4o|llama-4/i.test(lower)) {
    pushStrength("圖片理解、多模態輸入");
  }

  if (
    normalized === latestRouterDefaults.reasoning ||
    /70b|120b|reason|o3|o4|gpt-5|grok-4|qwen3/i.test(lower)
  ) {
    pushStrength("複雜推理、長文分析");
  }

  if (normalized === latestRouterDefaults.fast || /mini|instant|8b|20b|nano|fast/i.test(lower)) {
    pushStrength("速度快、日常問答");
  }

  if (/code|coder|dev|program/i.test(lower)) {
    pushStrength("程式碼生成、除錯");
  }

  if (/versatile|general|chat/i.test(lower)) {
    pushStrength("通用聊天、整理說明");
  }

  if (!strengths.length) {
    pushStrength("一般問答、文字整理");
  }

  return strengths.slice(0, 2).join("、");
}

function refreshManualModelPanel() {
  const selectedModel = String(modelSelect.value || "").trim();
  const isAutoRoute = autoRouteInput.checked;

  if (manualModelPanel) {
    manualModelPanel.classList.toggle("is-auto", isAutoRoute);
  }

  if (manualModelCurrent) {
    manualModelCurrent.textContent = `目前手動模型：${selectedModel || "尚未選擇"}`;
  }

  if (modelStrengthInfo) {
    const prefix = isAutoRoute ? "手動選這個模型時，較適合：" : "擅長：";
    modelStrengthInfo.textContent = `${prefix}${getModelStrengthSummary(selectedModel)}`;
  }
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatFullTimestamp(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return "未知時間";

  return new Date(value).toLocaleString("zh-TW", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseImageUrls(rawInput) {
  const raw = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!raw) return [];

  const lineSeparated = raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  const items =
    lineSeparated.length > 1
      ? lineSeparated
      : raw
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

  return [...new Set(items)].slice(0, MAX_IMAGE_ATTACHMENTS);
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function setAttachmentStatus(text, tone = "") {
  attachmentStatus.textContent = text;

  if (tone) {
    attachmentStatus.dataset.tone = tone;
    return;
  }

  delete attachmentStatus.dataset.tone;
}

function countLocalAttachments(kind) {
  if (!kind) return localAttachments.length;
  return localAttachments.filter((item) => item.kind === kind).length;
}

function refreshAttachmentCountText() {
  const total = localAttachments.length + parseImageUrls(imageUrlInput.value).length;
  attachmentCountText.textContent = total > 0 ? `${total} 個附件` : "0 個附件";
}

function setAttachmentPanelOpen(isOpen) {
  attachmentPanelBody.hidden = !isOpen;
  toggleAttachmentPanelBtn.textContent = isOpen ? "−" : "+";
  toggleAttachmentPanelBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  localStorage.setItem(ATTACHMENT_PANEL_KEY, isOpen ? "1" : "0");
}

function initAttachmentPanel() {
  const saved = localStorage.getItem(ATTACHMENT_PANEL_KEY);
  setAttachmentPanelOpen(saved === "1");
}

function buildDefaultAttachmentStatusText() {
  const urlCount = parseImageUrls(imageUrlInput.value).length;
  const localImageCount = countLocalAttachments("image");
  const pdfCount = countLocalAttachments("pdf");
  const totalImageCount = urlCount + localImageCount;

  if (totalImageCount > MAX_IMAGE_ATTACHMENTS) {
    return `目前共準備 ${totalImageCount} 張圖片，送出時只會帶前 ${MAX_IMAGE_ATTACHMENTS} 張。`;
  }

  if (pdfCount > 0 || localImageCount > 0) {
    return `已選 ${localImageCount} 張圖片、${pdfCount} 份 PDF，也可以再貼圖片網址。`;
  }

  return `可從電腦選圖片 / PDF 或貼圖片網址。`;
}

function refreshAttachmentStatus(message = "", tone = "") {
  setAttachmentStatus(message || buildDefaultAttachmentStatusText(), tone);
  refreshAttachmentCountText();
}

function renderLocalAttachments() {
  if (!localAttachments.length) {
    selectedUploadList.innerHTML = '<p class="selected-upload-empty">尚未選擇本機附件</p>';
    refreshAttachmentCountText();
    return;
  }

  selectedUploadList.innerHTML = localAttachments
    .map(
      (item, index) => `
        <div class="upload-pill">
          <div class="upload-pill-body">
            <span class="upload-pill-kind">${item.kind === "pdf" ? "PDF" : "圖片"}</span>
            <span class="upload-pill-name">${escapeHtml(item.name)}</span>
            <span class="upload-pill-meta">${escapeHtml(formatFileSize(item.size))}</span>
          </div>
          <button type="button" class="upload-remove" data-upload-index="${index}" aria-label="移除 ${escapeHtml(item.name)}">移除</button>
        </div>
      `
    )
    .join("");
  refreshAttachmentCountText();
}

function clearLocalAttachments(options = {}) {
  const { message = "", tone = "" } = options;
  localAttachments = [];
  renderLocalAttachments();
  refreshAttachmentStatus(message, tone);
}

function resetComposer(options = {}) {
  userInput.value = "";
  imageUrlInput.value = "";
  localImagePicker.value = "";
  clearLocalAttachments(options);
  setAttachmentPanelOpen(false);
}

function summarizeImageUrlForPreview(url) {
  return /^data:image\//i.test(url) ? "本機圖片" : url;
}

function buildCombinedAttachmentInputs() {
  const urlAttachments = parseImageUrls(imageUrlInput.value).map((url) => ({
    url,
    label: url
  }));
  const localImageInputs = localAttachments
    .filter((item) => item.kind === "image")
    .map((item) => ({
      url: item.dataUrl,
      label: `本機圖片：${item.name}`
    }));
  const merged = [...localImageInputs, ...urlAttachments];
  const deduped = [];
  const seen = new Set();

  for (const item of merged) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    deduped.push(item);
  }

  const imageLimited = deduped.slice(0, MAX_IMAGE_ATTACHMENTS);
  const documents = localAttachments
    .filter((item) => item.kind === "pdf")
    .slice(0, MAX_PDF_ATTACHMENTS)
    .map((item) => ({
      name: item.name,
      mimeType: item.type,
      dataUrl: item.dataUrl
    }));

  return {
    imageUrls: imageLimited.map((item) => item.url),
    imageLabels: imageLimited.map((item) => item.label),
    documents,
    documentLabels: documents.map((item) => item.name),
    truncatedImages: deduped.length > MAX_IMAGE_ATTACHMENTS,
    truncatedDocuments: countLocalAttachments("pdf") > MAX_PDF_ATTACHMENTS
  };
}

function readFileAsDataUrl(file, expectedPrefix) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (expectedPrefix && !result.startsWith(expectedPrefix)) {
        reject(new Error(`${file.name} 不是可用的附件格式。`));
        return;
      }

      resolve(result);
    };

    reader.onerror = () => {
      reject(new Error(`讀取 ${file.name} 失敗。`));
    };

    reader.readAsDataURL(file);
  });
}

function buildUploadRecord(file, dataUrl, kind) {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    kind,
    dataUrl
  };
}

async function addLocalFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  const notes = [];
  const acceptedImages = [];
  const acceptedPdfs = [];

  for (const file of files) {
    if (String(file.type || "").startsWith("image/")) {
      if (file.size > MAX_LOCAL_IMAGE_BYTES) {
        notes.push(`${file.name} 超過 4 MB，請換小一點的圖片。`);
        continue;
      }
      acceptedImages.push(file);
      continue;
    }

    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      if (file.size > MAX_LOCAL_PDF_BYTES) {
        notes.push(`${file.name} 超過 6 MB，請先壓縮 PDF。`);
        continue;
      }
      acceptedPdfs.push(file);
      continue;
    }

    notes.push(`${file.name} 不是支援的圖片或 PDF。`);
  }

  const remainingImageSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - countLocalAttachments("image"));
  const remainingPdfSlots = Math.max(0, MAX_PDF_ATTACHMENTS - countLocalAttachments("pdf"));
  const imagesToRead = acceptedImages.slice(0, remainingImageSlots);
  const pdfsToRead = acceptedPdfs.slice(0, remainingPdfSlots);

  if (acceptedImages.length > remainingImageSlots) {
    notes.push(`圖片附件最多 ${MAX_IMAGE_ATTACHMENTS} 張，多出的已略過。`);
  }
  if (acceptedPdfs.length > remainingPdfSlots) {
    notes.push(`PDF 附件最多 ${MAX_PDF_ATTACHMENTS} 份，多出的已略過。`);
  }

  if (!imagesToRead.length && !pdfsToRead.length) {
    refreshAttachmentStatus(notes.slice(0, 2).join("；") || "沒有可加入的附件。", "error");
    return;
  }

  isReadingLocalAttachments = true;
  refreshAttachmentStatus(`正在讀取 ${imagesToRead.length + pdfsToRead.length} 個附件...`, "info");

  const loadedAttachments = [];

  for (const file of imagesToRead) {
    try {
      const dataUrl = await readFileAsDataUrl(file, "data:image/");
      loadedAttachments.push(buildUploadRecord(file, dataUrl, "image"));
    } catch (error) {
      notes.push(error.message || `讀取 ${file.name} 失敗。`);
    }
  }

  for (const file of pdfsToRead) {
    try {
      const dataUrl = await readFileAsDataUrl(file, "data:application/pdf");
      loadedAttachments.push(buildUploadRecord(file, dataUrl, "pdf"));
    } catch (error) {
      notes.push(error.message || `讀取 ${file.name} 失敗。`);
    }
  }

  isReadingLocalAttachments = false;

  if (loadedAttachments.length) {
    localAttachments = [...localAttachments, ...loadedAttachments];
  }

  renderLocalAttachments();

  const noteText = notes.slice(0, 2).join("；");
  if (loadedAttachments.length) {
    const imageCount = loadedAttachments.filter((item) => item.kind === "image").length;
    const pdfCount = loadedAttachments.filter((item) => item.kind === "pdf").length;
    refreshAttachmentStatus(
      `已加入 ${imageCount} 張圖片、${pdfCount} 份 PDF${noteText ? `；${noteText}` : ""}`,
      noteText ? "warning" : "success"
    );
    return;
  }

  refreshAttachmentStatus(noteText || "沒有成功加入附件。", "error");
}

function summarizeDocumentPreview(document) {
  return document?.name ? document.name : "PDF 文件";
}

function summarizeAttachmentForHistory(urlOrDoc, type = "image") {
  if (type === "pdf") {
    return summarizeDocumentPreview(urlOrDoc);
  }

  return summarizeImageUrlForPreview(urlOrDoc);
}

function buildTurnAttachmentPreview(imageUrls, imageLabels, documents) {
  const imagePreview = imageUrls.length
    ? imageUrls.map((url, index) => `[Image] ${imageLabels[index] || summarizeAttachmentForHistory(url, "image")}`).join("\n")
    : "";
  const documentPreview = documents.length
    ? documents.map((item) => `[PDF] ${summarizeAttachmentForHistory(item, "pdf")}`).join("\n")
    : "";

  return [imagePreview, documentPreview].filter(Boolean).join("\n");
}

function toReadableHackMdText(input) {
  const raw = typeof input === "string" ? input : String(input ?? "");
  const looksLikeHackMd = /\\\(|\\\[|\\[a-zA-Z]+|[*_#`]{2,}|^\s*[-*]\s+/m.test(raw);

  if (!looksLikeHackMd) {
    return raw;
  }

  let text = raw.replace(/\r\n?/g, "\n");

  // 常見 escape 還原（避免破壞 \times、\neq 這類 LaTeX 指令）
  text = text.replace(/\\n(?![a-zA-Z])/g, "\n");
  text = text.replace(/\\t(?![a-zA-Z])/g, "\t");
  text = text.replace(/\\r(?![a-zA-Z])/g, "");

  // 常見 LaTeX 轉成可讀文字
  text = text.replace(/\\(?:mathbf|boldsymbol|mathrm|mathit|operatorname)\s*\{([^{}]+)\}/g, "$1");
  text = text.replace(/\\(?:text|textbf|emph)\s*\{([^{}]+)\}/g, "$1");
  text = text.replace(/\\vec\s*\{([^{}]+)\}/g, "$1");
  text = text.replace(/\\left|\\right/g, "");
  text = text.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  text = text.replace(/\\sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
  text = text.replace(/\\cdot/g, "·");
  text = text.replace(/\\cdots|\\ldots/g, "...");
  text = text.replace(/\\times/g, "×");
  text = text.replace(/\\pm/g, "±");
  text = text.replace(/\\div/g, "÷");
  text = text.replace(/\\neq|\\ne/g, "≠");
  text = text.replace(/\\leq|\\le/g, "≤");
  text = text.replace(/\\geq|\\ge/g, "≥");
  text = text.replace(/\\mathbb\{R\}/g, "R");
  text = text.replace(/\\mathbb\{N\}/g, "N");
  text = text.replace(/\\mathbb\{Z\}/g, "Z");

  // 去掉行內/區塊公式包裝符號
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, "$1");
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, "$1");

  // Markdown 基本可讀化
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*]\s+/gm, "• ");
  text = text.replace(/\*\*(.*?)\*\*/g, "$1");
  text = text.replace(/__(.*?)__/g, "$1");
  text = text.replace(/`([^`]+)`/g, "$1");

  // 解除常見跳脫符號（例如 \_ \- \*）
  text = text.replace(/\\([\\`*_{}\[\]()#+\-.!])/g, "$1");

  // 清理殘留 LaTeX 空白控制字元
  text = text.replace(/\\[,;!]/g, " ");

  // 收斂過多底線/多餘空白
  text = text.replace(/_{2,}/g, "_");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/[ \t]+\n/g, "\n");

  return text.trimEnd();
}

function setSendingState(isSending) {
  isStreaming = isSending;
  sendBtn.disabled = isSending;
  sendBtn.innerHTML = `<span aria-hidden="true">${isSending ? "…" : "↑"}</span>`;
}

function getHistoryStorageKey(sessionId) {
  return `chat_history_${sessionId}`;
}

function normalizeSessionMeta(item) {
  if (!item || typeof item.id !== "string" || !item.id.trim()) {
    return null;
  }

  const createdAt = Number(item.createdAt) || Date.now();
  const updatedAt = Number(item.updatedAt) || createdAt;
  const title =
    typeof item.title === "string" && item.title.trim() ? item.title.trim().slice(0, 40) : DEFAULT_SESSION_TITLE;

  return {
    id: item.id.trim(),
    title,
    customTitle: Boolean(item.customTitle),
    createdAt,
    updatedAt
  };
}

function loadSessionIndex() {
  const raw = localStorage.getItem(SESSION_INDEX_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeSessionMeta).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveSessionIndex() {
  localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(sessionIndex));
}

function getSessionMeta(sessionId) {
  return sessionIndex.find((item) => item.id === sessionId) || null;
}

function loadChatHistory(sessionId) {
  const raw = localStorage.getItem(getHistoryStorageKey(sessionId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item) => item && typeof item.role === "string" && typeof item.text === "string");
  } catch {
    return [];
  }
}

function saveChatHistory() {
  localStorage.setItem(getHistoryStorageKey(currentSessionId), JSON.stringify(chatHistory));
}

function deriveSessionTitle(history) {
  const latestUser = [...history].reverse().find((item) => item.role === "user" && item.text.trim());
  const latestAssistant = [...history]
    .reverse()
    .find((item) => item.role === "assistant" && !item.isError && item.text.trim());
  const rawTitle = latestUser?.text || latestAssistant?.text || DEFAULT_SESSION_TITLE;

  return rawTitle.replace(/\s+/g, " ").trim().slice(0, 24) || DEFAULT_SESSION_TITLE;
}

function upsertSessionMeta(sessionId, patch = {}) {
  const now = Date.now();
  const currentIndex = sessionIndex.findIndex((item) => item.id === sessionId);

  const merged = {
    id: sessionId,
    title: DEFAULT_SESSION_TITLE,
    createdAt: now,
    updatedAt: now,
    ...(currentIndex >= 0 ? sessionIndex[currentIndex] : {}),
    ...patch
  };

  const normalized = normalizeSessionMeta(merged);
  if (!normalized) return;

  if (currentIndex >= 0) {
    sessionIndex[currentIndex] = normalized;
  } else {
    sessionIndex.push(normalized);
  }

  sessionIndex.sort((a, b) => b.updatedAt - a.updatedAt);

  if (sessionIndex.length > MAX_SAVED_SESSIONS) {
    const removed = sessionIndex.splice(MAX_SAVED_SESSIONS);
    for (const item of removed) {
      localStorage.removeItem(getHistoryStorageKey(item.id));
    }
  }

  saveSessionIndex();
}

function deleteSessionMeta(sessionId) {
  sessionIndex = sessionIndex.filter((item) => item.id !== sessionId);
  saveSessionIndex();
}

function formatSessionTime(timestamp) {
  const diff = Date.now() - timestamp;

  if (diff < 60 * 1000) return "剛剛";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderSessionDropdown() {
  sessionSelect.innerHTML = "";
  sessionList.innerHTML = "";

  if (!sessionIndex.length) {
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "目前沒有已儲存的對話";
    empty.selected = true;
    sessionSelect.appendChild(empty);
    sessionSelect.disabled = true;
    deleteCurrentSessionBtn.disabled = true;
    sessionList.innerHTML = '<div class="session-empty">目前沒有已儲存的對話，先開一個新對話吧。</div>';
    return;
  }

  sessionSelect.disabled = false;

  for (const meta of sessionIndex) {
    const option = document.createElement("option");
    option.value = meta.id;
    option.textContent = `${meta.title} | ${formatSessionTime(meta.updatedAt)}`;
    sessionSelect.appendChild(option);

    const item = document.createElement("div");
    item.className = `session-item${meta.id === currentSessionId ? " active" : ""}`;

    const mainButton = document.createElement("button");
    mainButton.type = "button";
    mainButton.className = "session-item-main";
    mainButton.innerHTML = `
      <div class="session-item-title">${escapeHtml(meta.title)}</div>
      <div class="session-item-meta">${escapeHtml(formatSessionTime(meta.updatedAt))}</div>
    `;
    mainButton.addEventListener("click", () => {
      if (meta.id === currentSessionId) return;
      switchSession(meta.id);
    });

    const actions = document.createElement("div");
    actions.className = "session-actions";

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.className = "session-rename";
    renameButton.textContent = "改名";
    renameButton.title = `修改「${meta.title}」名稱`;
    renameButton.setAttribute("aria-label", `修改「${meta.title}」名稱`);
    renameButton.addEventListener("click", () => {
      renameSession(meta.id);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "session-delete";
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => {
      const confirmed = window.confirm(`確定要刪除「${meta.title}」嗎？`);
      if (!confirmed) return;
      deleteSession(meta.id);
    });

    actions.append(renameButton, deleteButton);
    item.append(mainButton, actions);
    sessionList.appendChild(item);
  }

  const hasCurrent = sessionIndex.some((meta) => meta.id === currentSessionId);
  sessionSelect.value = hasCurrent ? currentSessionId : sessionIndex[0].id;
  deleteCurrentSessionBtn.disabled = false;
}

function syncCurrentSessionMeta() {
  const currentMeta = getSessionMeta(currentSessionId);
  const nextTitle = currentMeta?.customTitle ? currentMeta.title : deriveSessionTitle(chatHistory);

  upsertSessionMeta(currentSessionId, {
    title: nextTitle,
    customTitle: Boolean(currentMeta?.customTitle),
    updatedAt: Date.now()
  });
  renderSessionDropdown();
}

function renameSession(sessionId) {
  if (isStreaming) {
    setStatus("串流中，請稍後再改名");
    return;
  }

  const targetSession = getSessionMeta(sessionId);
  if (!targetSession) return;

  const input = window.prompt("輸入新的聊天室名稱", targetSession.title || DEFAULT_SESSION_TITLE);
  if (input === null) return;

  const title = input.replace(/\s+/g, " ").trim().slice(0, 40);
  if (!title) {
    setStatus("聊天室名稱不能為空");
    renderSessionDropdown();
    return;
  }

  upsertSessionMeta(sessionId, {
    title,
    customTitle: true
  });
  renderSessionDropdown();
  setStatus("聊天室名稱已更新");
}

function addMessage(role, text, options = {}) {
  const { isError = false, persist = true } = options;

  const div = document.createElement("div");
  div.classList.add("msg");
  div.classList.add(role);

  if (isError) {
    div.classList.add("error");
  }

  const displayText = role === "assistant" && !isError ? toReadableHackMdText(text) : text;
  div.textContent = displayText;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  let messageIndex = -1;
  if (persist) {
    chatHistory.push({
      role,
      text,
      isError: Boolean(isError)
    });
    messageIndex = chatHistory.length - 1;
    saveChatHistory();
    syncCurrentSessionMeta();
  }

  return { div, messageIndex };
}

function updateMessage(messageIndex, node, text, options = {}) {
  const { isError = false, persist = true } = options;

  const role = chatHistory[messageIndex]?.role || "assistant";
  const displayText = role === "assistant" && !isError ? toReadableHackMdText(text) : text;
  node.textContent = displayText;
  node.classList.toggle("error", Boolean(isError));

  if (!persist || messageIndex < 0 || !chatHistory[messageIndex]) {
    return;
  }

  chatHistory[messageIndex].text = text;
  chatHistory[messageIndex].isError = Boolean(isError);
  saveChatHistory();
  syncCurrentSessionMeta();
}

function clearChatView() {
  chatMessages.innerHTML = "";
}

function renderSavedHistory() {
  clearChatView();
  for (const item of chatHistory) {
    addMessage(item.role, item.text, {
      isError: Boolean(item.isError),
      persist: false
    });
  }
}

function switchSession(sessionId) {
  if (isStreaming) {
    setStatus("串流中，請稍後再切換");
    renderSessionDropdown();
    return;
  }

  if (sessionId === currentSessionId) return;

  currentSessionId = sessionId;
  localStorage.setItem("chat_session_id", currentSessionId);
  resetComposer();

  chatHistory = loadChatHistory(currentSessionId);
  if (chatHistory.length > 0) {
    renderSavedHistory();
  } else {
    clearChatView();
    addMessage("assistant", "這個對話目前沒有訊息，直接開始聊聊吧。", {
      isError: false
    });
  }

  syncCurrentSessionMeta();
  setStatus("Session Switched");
  if (!memoryManagerModal.hidden) {
    selectedMemoryFactIds.clear();
    loadMemoryManager();
  }
}

function deleteSession(sessionId) {
  if (isStreaming) {
    setStatus("串流中，請稍後再刪除");
    return;
  }

  localStorage.removeItem(getHistoryStorageKey(sessionId));
  deleteSessionMeta(sessionId);

  if (sessionId !== currentSessionId) {
    renderSessionDropdown();
    return;
  }

  const next = sessionIndex[0];
  if (next) {
    switchSession(next.id);
    return;
  }

  createNewSessionLocal({
    welcomeText: "已刪除目前對話，並建立新的空白對話。"
  });
}

function clearAllLocalHistory() {
  for (const item of sessionIndex) {
    localStorage.removeItem(getHistoryStorageKey(item.id));
  }

  sessionIndex = [];
  saveSessionIndex();

  createNewSessionLocal({
    welcomeText: "已清空所有歷史對話，並建立新的空白對話。"
  });
}

function createNewSessionLocal(options = {}) {
  const { welcomeText = "已建立新對話。這個對話會自動保存在本機瀏覽器。" } = options;

  currentSessionId = crypto.randomUUID();
  localStorage.setItem("chat_session_id", currentSessionId);
  resetComposer();

  chatHistory = [];
  clearChatView();

  upsertSessionMeta(currentSessionId, {
    title: DEFAULT_SESSION_TITLE,
    customTitle: false,
    updatedAt: Date.now()
  });

  addMessage("assistant", welcomeText, {
    isError: false
  });

  setStatus("New Session");
  if (!memoryManagerModal.hidden) {
    selectedMemoryFactIds.clear();
    loadMemoryManager();
  }
}

function bindSliders() {
  for (const { input, valueElement, format } of sliderBindings) {
    const update = () => {
      valueElement.textContent = format(input.value);
    };

    input.addEventListener("input", update);
    update();
  }
}

function setCompactSidebar(isCompact) {
  settingsPanel.classList.toggle("compact-mode", isCompact);
  compactStateText.textContent = isCompact ? "ON" : "OFF";
  toggleCompactSidebarBtn.textContent = isCompact ? "展開介面" : "濃縮介面";
  localStorage.setItem(COMPACT_SIDEBAR_KEY, isCompact ? "1" : "0");
}

function setTheme(mode) {
  const theme = mode === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  toggleThemeBtn.textContent = theme === "dark" ? "切到淺色" : "切到黑夜";
  themeStateText.textContent = theme === "dark" ? "DARK" : "LIGHT";
  localStorage.setItem(THEME_KEY, theme);
}

function initThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = saved === "dark" || saved === "light" ? saved : prefersDark ? "dark" : "light";
  setTheme(initialTheme);

  toggleThemeBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "dark" ? "light" : "dark");
  });
}

function readBooleanSetting(key, fallback = true) {
  const saved = localStorage.getItem(key);
  if (saved === null) return fallback;
  return saved === "1";
}

function saveBooleanSetting(key, value) {
  localStorage.setItem(key, value ? "1" : "0");
}

function refreshRouteModeText() {
  routeModeText.textContent = autoRouteInput.checked ? "AUTO" : "MANUAL";
}

function refreshLongTermMemoryUi() {
  const enabled = useLongTermMemoryInput.checked;
  viewLongTermMemoryBtn.classList.toggle("is-hidden", !enabled);
  clearLongTermMemoryBtn.classList.toggle("is-hidden", !enabled);
  viewLongTermMemoryBtn.disabled = !enabled;
  clearLongTermMemoryBtn.disabled = !enabled;

  if (!enabled && !memoryManagerModal.hidden) {
    setMemoryManagerOpen(false);
  }
}

function initV2FeatureToggles() {
  autoRouteInput.checked = readBooleanSetting(AUTO_ROUTE_KEY, true);
  useToolsInput.checked = readBooleanSetting(USE_TOOLS_KEY, true);
  useLongTermMemoryInput.checked = readBooleanSetting(USE_LONG_MEMORY_KEY, true);
  refreshRouteModeText();
  refreshLongTermMemoryUi();

  autoRouteInput.addEventListener("change", () => {
    saveBooleanSetting(AUTO_ROUTE_KEY, autoRouteInput.checked);
    refreshRouteModeText();
    refreshRouteInfo();
    refreshSelectedModelInfo();
    refreshManualModelPanel();
  });

  useToolsInput.addEventListener("change", () => {
    saveBooleanSetting(USE_TOOLS_KEY, useToolsInput.checked);
  });

  useLongTermMemoryInput.addEventListener("change", () => {
    saveBooleanSetting(USE_LONG_MEMORY_KEY, useLongTermMemoryInput.checked);
    refreshLongTermMemoryUi();
  });
}

function initCompactSidebarToggle() {
  const saved = localStorage.getItem(COMPACT_SIDEBAR_KEY);
  const isCompact = saved === null ? true : saved === "1";
  setCompactSidebar(isCompact);

  toggleCompactSidebarBtn.addEventListener("click", () => {
    const next = !settingsPanel.classList.contains("compact-mode");
    setCompactSidebar(next);
  });
}

function setSettingsDrawerOpen(isOpen, options = {}) {
  const { persist = true } = options;
  const buttonLabel = isOpen ? "收起設定" : "打開設定";
  appRoot.classList.toggle("settings-open", isOpen);
  toggleSettingsDrawerBtn.classList.toggle("is-open", isOpen);
  toggleSettingsDrawerBtn.setAttribute("aria-expanded", String(isOpen));
  toggleSettingsDrawerBtn.setAttribute("aria-label", buttonLabel);
  toggleSettingsDrawerBtn.setAttribute("title", buttonLabel);

  if (persist) {
    localStorage.setItem(SETTINGS_DRAWER_KEY, isOpen ? "1" : "0");
  }
}

function initSettingsDrawer() {
  const saved = localStorage.getItem(SETTINGS_DRAWER_KEY);
  const isOpen = saved === "1";
  setSettingsDrawerOpen(isOpen, { persist: false });

  toggleSettingsDrawerBtn.addEventListener("click", () => {
    const currentlyOpen = appRoot.classList.contains("settings-open");
    setSettingsDrawerOpen(!currentlyOpen);
  });

  settingsBackdrop.addEventListener("click", () => {
    setSettingsDrawerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!appRoot.classList.contains("settings-open")) return;
    setSettingsDrawerOpen(false);
  });
}

function setAdvancedParamsOpen(isOpen) {
  advancedParamsPanel.classList.toggle("is-collapsed", !isOpen);
  toggleAdvancedParamsBtn.classList.toggle("is-open", isOpen);
  toggleAdvancedParamsBtn.setAttribute("aria-expanded", String(isOpen));
  toggleAdvancedParamsText.textContent = isOpen ? "收起" : "展開";
  localStorage.setItem("advanced_params_open", isOpen ? "1" : "0");
}

function initAdvancedParamsToggle() {
  const isOpen = localStorage.getItem("advanced_params_open") === "1";
  setAdvancedParamsOpen(isOpen);

  toggleAdvancedParamsBtn.addEventListener("click", () => {
    const currentlyOpen = toggleAdvancedParamsBtn.getAttribute("aria-expanded") === "true";
    setAdvancedParamsOpen(!currentlyOpen);
  });
}

async function loadModels() {
  try {
    const response = await fetch("/api/models");
    if (!response.ok) throw new Error("無法取得模型清單");

    const { models = [], defaultModel, routerDefaults, routeDiagnostics, capabilities } = await response.json();
    modelSelect.innerHTML = "";

    if (!models.length) {
      const option = document.createElement("option");
      option.value = "gpt-4o-mini";
      option.textContent = "gpt-4o-mini";
      modelSelect.appendChild(option);
      refreshSelectedModelInfo();
      refreshManualModelPanel();
      return;
    }

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    modelSelect.value = models.includes(defaultModel) ? defaultModel : models[0];
    latestRouterDefaults = {
      fast: String(routerDefaults?.fast || ""),
      reasoning: String(routerDefaults?.reasoning || ""),
      vision: String(routerDefaults?.vision || "")
    };
    latestRoutedModel = "";
    refreshSelectedModelInfo();
    refreshManualModelPanel();

    if (routerDefaults || routeDiagnostics || capabilities) {
      refreshRouteInfo();
    }
  } catch (error) {
    addMessage("assistant", `模型載入失敗：${error.message}`, { isError: true });
  }
}

function parseSseChunk(rawChunk) {
  const lines = rawChunk.split("\n");
  let event = "message";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }

    if (line.startsWith("data:")) {
      data += line.slice(5).trim();
    }
  }

  if (!data) {
    return null;
  }

  try {
    return { event, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

async function clearServerMemory() {
  await fetch("/api/memory/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, memoryScopeId })
  });
}

async function fetchLongTermMemory() {
  const response = await fetch(
    `/api/memory/long-term?sessionId=${encodeURIComponent(currentSessionId)}&memoryScopeId=${encodeURIComponent(memoryScopeId)}`
  );
  if (!response.ok) {
    throw new Error(`讀取長期記憶失敗 (${response.status})`);
  }
  return response.json();
}

async function clearLongTermMemory() {
  const response = await fetch("/api/memory/long-term/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, memoryScopeId })
  });

  if (!response.ok) {
    throw new Error(`清除長期記憶失敗 (${response.status})`);
  }

  return response.json();
}

async function deleteSelectedLongTermMemory(ids) {
  const response = await fetch("/api/memory/long-term/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: currentSessionId, memoryScopeId, ids })
  });

  if (!response.ok) {
    throw new Error(`刪除指定長期記憶失敗 (${response.status})`);
  }

  return response.json();
}

async function fetchTools() {
  const response = await fetch("/api/tools");
  if (!response.ok) {
    throw new Error(`讀取工具列表失敗 (${response.status})`);
  }
  return response.json();
}

function setMemoryManagerOpen(isOpen) {
  memoryManagerModal.hidden = !isOpen;
  document.body.classList.toggle("memory-modal-open", isOpen);
}

function syncSelectedMemoryIds() {
  const validIds = new Set(memoryManagerFacts.map((item) => item.id));
  selectedMemoryFactIds = new Set([...selectedMemoryFactIds].filter((id) => validIds.has(id)));
}

function updateMemoryManagerActionState() {
  const hasFacts = memoryManagerFacts.length > 0;
  const selectedCount = selectedMemoryFactIds.size;
  const disabled = isMemoryManagerBusy;

  refreshMemoryManagerBtn.disabled = disabled;
  selectAllMemoryFactsBtn.disabled = disabled || !hasFacts;
  clearMemorySelectionBtn.disabled = disabled || selectedCount === 0;
  deleteSelectedMemoryFactsBtn.disabled = disabled || selectedCount === 0 || isStreaming;
}

function renderMemoryManager() {
  syncSelectedMemoryIds();

  const selectedCount = selectedMemoryFactIds.size;
  const factCount = memoryManagerFacts.length;

  if (isMemoryManagerBusy) {
    memoryManagerMeta.textContent = "長期記憶讀取中...";
    memoryManagerList.innerHTML = '<div class="memory-empty-state">正在讀取長期記憶...</div>';
    updateMemoryManagerActionState();
    return;
  }

  memoryManagerMeta.textContent = `目前跨聊天室共 ${factCount} 筆長期記憶，已選 ${selectedCount} 筆。`;

  if (!factCount) {
    memoryManagerList.innerHTML = '<div class="memory-empty-state">目前還沒有跨聊天室長期記憶。</div>';
    updateMemoryManagerActionState();
    return;
  }

  memoryManagerList.innerHTML = memoryManagerFacts
    .map((item, index) => {
      const checked = selectedMemoryFactIds.has(item.id) ? "checked" : "";
      return `
        <label class="memory-fact-item">
          <input type="checkbox" class="memory-fact-checkbox" data-fact-id="${escapeHtml(item.id)}" ${checked} />
          <div>
            <div class="memory-fact-text">${index + 1}. ${escapeHtml(item.text)}</div>
            <div class="memory-fact-meta">
              <span>ID: ${escapeHtml(item.id)}</span>
              <span>建立: ${escapeHtml(formatFullTimestamp(item.createdAt))}</span>
              <span>最近更新: ${escapeHtml(formatFullTimestamp(item.lastSeenAt))}</span>
            </div>
          </div>
        </label>
      `;
    })
    .join("");

  memoryManagerList.querySelectorAll(".memory-fact-checkbox").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const factId = checkbox.dataset.factId;
      if (!factId) return;

      if (checkbox.checked) {
        selectedMemoryFactIds.add(factId);
      } else {
        selectedMemoryFactIds.delete(factId);
      }

      renderMemoryManager();
    });
  });

  updateMemoryManagerActionState();
}

async function loadMemoryManager() {
  isMemoryManagerBusy = true;
  renderMemoryManager();
  let errorText = "";

  try {
    const { facts = [] } = await fetchLongTermMemory();
    memoryManagerFacts = Array.isArray(facts) ? facts : [];
    syncSelectedMemoryIds();
  } catch (error) {
    errorText = `讀取長期記憶失敗：${error.message}`;
    memoryManagerFacts = [];
    selectedMemoryFactIds.clear();
  } finally {
    isMemoryManagerBusy = false;

    if (errorText) {
      memoryManagerMeta.textContent = errorText;
      memoryManagerList.innerHTML = `<div class="memory-empty-state">${escapeHtml(errorText)}</div>`;
      updateMemoryManagerActionState();
      return;
    }

    renderMemoryManager();
  }
}

async function handleSendMessage(text, options = {}) {
  const { imageUrls = [], imageLabels = [], documents = [] } = options;
  if (isStreaming) return;
  if (!text.trim() && !imageUrls.length && !documents.length) return;

  const userText = text.trim() || (documents.length ? "請整理這份 PDF 的重點。" : "請分析附圖。");
  const attachmentPreview = buildTurnAttachmentPreview(imageUrls, imageLabels, documents);
  const userPreview = attachmentPreview ? `${userText}\n${attachmentPreview}` : userText;

  addMessage("user", userPreview);
  const assistantMessage = addMessage("assistant", MESSAGE_PLACEHOLDER);
  const assistantNode = assistantMessage.div;

  const payload = {
    sessionId: currentSessionId,
    memoryScopeId,
    model: modelSelect.value,
    message: userText,
    imageUrl: imageUrls[0] || "",
    imageUrls,
    documents,
    systemPrompt: systemPromptInput.value,
    useMemory: useMemoryInput.checked,
    useLongTermMemory: useLongTermMemoryInput.checked,
    autoRoute: autoRouteInput.checked,
    useTools: useToolsInput.checked,
    memoryTurns: Number(memoryTurnsInput.value),
    temperature: Number(temperatureInput.value),
    topP: Number(topPInput.value),
    maxTokens: Number(maxTokensInput.value),
    presencePenalty: Number(presencePenaltyInput.value),
    frequencyPenalty: Number(frequencyPenaltyInput.value)
  };

  setSendingState(true);
  setStatus("Streaming...");

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok || !response.body) {
      throw new Error(`API error (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let assistantText = "";
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const eventText of events) {
        if (!eventText.trim()) continue;
        const parsed = parseSseChunk(eventText);
        if (!parsed) continue;

        const { event, payload: eventPayload } = parsed;

        if (event === "delta") {
          assistantText += eventPayload.content || "";
          assistantNode.textContent = assistantText || MESSAGE_PLACEHOLDER;
        }

        if (event === "route") {
          latestRoutedModel = eventPayload.routedModel || "";
          latestRouteReason = eventPayload.reason || "";
          latestRouteLabel = eventPayload.label || "";
          refreshRouteInfo({
            routeReason: latestRouteReason,
            routeLabel: latestRouteLabel,
            autoRoute: eventPayload.autoRoute
          });
          setSelectedModelInfo(`目前模型：${eventPayload.routedModel || "未知模型"}`);
        }

        if (event === "tool_mode" && eventPayload.mode) {
          setStatus(`Tool mode: ${eventPayload.mode}`);
        }

        if (event === "tool") {
          if (eventPayload.ok && eventPayload.tool === "memory_recall") {
            continue;
          }

          const sourceTag = eventPayload.source ? `/${eventPayload.source}` : "";
          if (eventPayload.ok) {
            addMessage("assistant", `[Tool${sourceTag}] ${eventPayload.tool}: ${eventPayload.output}`, { persist: false });
          } else {
            addMessage("assistant", `[Tool${sourceTag}] ${eventPayload.tool}: ${eventPayload.error}`, {
              persist: false,
              isError: true
            });
          }
        }

        if (event === "memory_update" && useLongTermMemoryInput.checked && eventPayload.count > 0) {
          const addedCount = Number(eventPayload.addedCount || 0);
          const updatedCount = Number(eventPayload.updatedCount || 0);
          const parts = [];

          if (addedCount > 0) {
            parts.push(`新增 ${addedCount} 筆`);
          }

          if (updatedCount > 0) {
            parts.push(`更新 ${updatedCount} 筆`);
          }

          addMessage("assistant", `[Long Memory] ${parts.join("，") || `同步 ${eventPayload.count} 筆`}長期記憶`, { persist: false });
        }

        if (event === "document" && eventPayload.count > 0) {
          const names = Array.isArray(eventPayload.documents) ? eventPayload.documents.join("、") : "";
          const warningText =
            Array.isArray(eventPayload.warnings) && eventPayload.warnings.length
              ? `\n${eventPayload.warnings.join("\n")}`
              : "";
          addMessage(
            "assistant",
            `[PDF] 已載入 ${eventPayload.count} 份文件${names ? `：${names}` : ""}${warningText}`,
            { persist: false }
          );
        }

        if (event === "error") {
          throw new Error(eventPayload.message || "串流發生錯誤");
        }

        if (event === "done") {
          updateMessage(
            assistantMessage.messageIndex,
            assistantNode,
            assistantText || eventPayload.content || "(空回覆)"
          );
        }
      }

      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    setStatus("Ready");
  } catch (error) {
    updateMessage(assistantMessage.messageIndex, assistantNode, `錯誤：${error.message}`, {
      isError: true
    });
    setStatus("Error");
  } finally {
    setSendingState(false);
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isReadingLocalAttachments) {
    refreshAttachmentStatus("附件還在讀取中，請稍候再送出。", "warning");
    return;
  }

  const text = userInput.value;
  const { imageUrls, imageLabels, documents, truncatedImages, truncatedDocuments } = buildCombinedAttachmentInputs();
  if (!text.trim() && !imageUrls.length && !documents.length) return;

  resetComposer({
    message:
      truncatedImages || truncatedDocuments
        ? `附件超過上限，這次只送出前 ${MAX_IMAGE_ATTACHMENTS} 張圖片與 ${MAX_PDF_ATTACHMENTS} 份 PDF。`
        : "",
    tone: truncatedImages || truncatedDocuments ? "warning" : ""
  });
  await handleSendMessage(text, { imageUrls, imageLabels, documents });
  userInput.focus();
});

userInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (isStreaming) return;
    if (isReadingLocalAttachments) {
      refreshAttachmentStatus("附件還在讀取中，請稍候再送出。", "warning");
      return;
    }

    const text = userInput.value;
    const { imageUrls, imageLabels, documents, truncatedImages, truncatedDocuments } = buildCombinedAttachmentInputs();
    if (!text.trim() && !imageUrls.length && !documents.length) return;

    resetComposer({
      message:
        truncatedImages || truncatedDocuments
          ? `附件超過上限，這次只送出前 ${MAX_IMAGE_ATTACHMENTS} 張圖片與 ${MAX_PDF_ATTACHMENTS} 份 PDF。`
          : "",
      tone: truncatedImages || truncatedDocuments ? "warning" : ""
    });
    await handleSendMessage(text, { imageUrls, imageLabels, documents });
    userInput.focus();
  }
});

imageUrlInput.addEventListener("input", () => {
  refreshAttachmentStatus();
});

toggleAttachmentPanelBtn.addEventListener("click", () => {
  setAttachmentPanelOpen(attachmentPanelBody.hidden);
});

document.addEventListener("pointerdown", (event) => {
  if (attachmentPanelBody.hidden) return;

  const target = event.target;
  if (!(target instanceof Node)) return;
  if (attachmentPanelBody.contains(target) || toggleAttachmentPanelBtn.contains(target)) {
    return;
  }

  setAttachmentPanelOpen(false);
});

localImagePicker.addEventListener("change", async (event) => {
  await addLocalFiles(event.target.files);
  localImagePicker.value = "";
});

clearLocalImagesBtn.addEventListener("click", () => {
  if (!localAttachments.length) {
    refreshAttachmentStatus("目前沒有本機附件可清除。", "info");
    return;
  }

  clearLocalAttachments({
    message: "已清空本機附件。",
    tone: "success"
  });
});

selectedUploadList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-upload-index]");
  if (!button) return;

  const index = Number(button.dataset.uploadIndex);
  if (!Number.isInteger(index) || index < 0 || index >= localAttachments.length) {
    return;
  }

  const [removed] = localAttachments.splice(index, 1);
  renderLocalAttachments();
  refreshAttachmentStatus(`已移除附件：${removed?.name || "未知附件"}。`, "success");
});

attachmentDropzone.addEventListener("click", () => {
  localImagePicker.click();
});

attachmentDropzone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  localImagePicker.click();
});

for (const eventName of ["dragenter", "dragover"]) {
  attachmentDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    attachmentDropzone.classList.add("is-dragover");
  });
}

for (const eventName of ["dragleave", "dragend"]) {
  attachmentDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    attachmentDropzone.classList.remove("is-dragover");
  });
}

attachmentDropzone.addEventListener("drop", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  attachmentDropzone.classList.remove("is-dragover");
  await addLocalFiles(event.dataTransfer?.files);
});

clearMemoryBtn.addEventListener("click", async () => {
  try {
    await clearServerMemory();
    addMessage("assistant", "已清除伺服器端短期記憶。", { isError: false });
    setStatus("Memory Cleared");
  } catch {
    addMessage("assistant", "清除記憶失敗。", { isError: true });
    setStatus("Error");
  }
});

newChatBtn.addEventListener("click", async () => {
  try {
    await clearServerMemory();
  } catch {
    // ignore cleanup error on new chat
  }

  createNewSessionLocal();
});

clearAllHistoryBtn.addEventListener("click", () => {
  if (isStreaming) {
    setStatus("串流中，請稍後再清空");
    return;
  }

  const confirmed = window.confirm("確定要清空所有本機歷史對話嗎？");
  if (!confirmed) return;

  clearAllLocalHistory();
});

viewLongTermMemoryBtn.addEventListener("click", async () => {
  selectedMemoryFactIds.clear();
  setMemoryManagerOpen(true);
  await loadMemoryManager();
});

clearLongTermMemoryBtn.addEventListener("click", async () => {
  if (isStreaming) {
    setStatus("串流中，請稍後再清除");
    return;
  }

  const confirmed = window.confirm("確定要清除這個對話的長期記憶嗎？");
  if (!confirmed) return;

  try {
    const result = await clearLongTermMemory();
    addMessage("assistant", `已清除長期記憶 ${result.removed || 0} 筆。`, { persist: false });
    setStatus("Long Memory Cleared");
    selectedMemoryFactIds.clear();
    if (!memoryManagerModal.hidden) {
      await loadMemoryManager();
    }
  } catch (error) {
    addMessage("assistant", `清除長期記憶失敗：${error.message}`, { persist: false, isError: true });
    setStatus("Error");
  }
});

closeMemoryManagerBtn.addEventListener("click", () => {
  setMemoryManagerOpen(false);
});

memoryManagerBackdrop.addEventListener("click", () => {
  setMemoryManagerOpen(false);
});

refreshMemoryManagerBtn.addEventListener("click", async () => {
  selectedMemoryFactIds.clear();
  await loadMemoryManager();
});

selectAllMemoryFactsBtn.addEventListener("click", () => {
  selectedMemoryFactIds = new Set(memoryManagerFacts.map((item) => item.id));
  renderMemoryManager();
});

clearMemorySelectionBtn.addEventListener("click", () => {
  selectedMemoryFactIds.clear();
  renderMemoryManager();
});

deleteSelectedMemoryFactsBtn.addEventListener("click", async () => {
  const ids = [...selectedMemoryFactIds];
  if (!ids.length) return;

  if (isStreaming) {
    setStatus("串流中，請稍後再刪除");
    return;
  }

  const confirmed = window.confirm(`確定要刪除選取的 ${ids.length} 筆長期記憶嗎？`);
  if (!confirmed) return;

  try {
    isMemoryManagerBusy = true;
    renderMemoryManager();
    const result = await deleteSelectedLongTermMemory(ids);
    addMessage("assistant", `已刪除選取長期記憶 ${result.removed || 0} 筆。`, { persist: false });
    setStatus("Partial Memory Deleted");
    selectedMemoryFactIds.clear();
    await loadMemoryManager();
  } catch (error) {
    addMessage("assistant", `刪除指定長期記憶失敗：${error.message}`, { persist: false, isError: true });
    setStatus("Error");
  } finally {
    isMemoryManagerBusy = false;
    renderMemoryManager();
  }
});

showToolsBtn.addEventListener("click", async () => {
  try {
    const { tools = [] } = await fetchTools();
    const text = tools.length
      ? tools.map((tool, index) => `${index + 1}. ${tool.name} - ${tool.description}`).join("\n")
      : "目前沒有可用工具。";
    addMessage("assistant", `[Tools]\n${text}\n\nNative tool calling: enabled\nFormal MCP endpoint: POST /mcp`, {
      persist: false
    });
  } catch (error) {
    addMessage("assistant", `讀取工具列表失敗：${error.message}`, { persist: false, isError: true });
  }
});

sessionSelect.addEventListener("change", () => {
  const nextSessionId = sessionSelect.value;
  if (!nextSessionId || nextSessionId === currentSessionId) {
    return;
  }
  switchSession(nextSessionId);
});

deleteCurrentSessionBtn.addEventListener("click", () => {
  const targetSessionId = sessionSelect.value || currentSessionId;
  if (!targetSessionId) return;

  const targetSession = sessionIndex.find((item) => item.id === targetSessionId);
  const targetTitle = targetSession?.title || DEFAULT_SESSION_TITLE;
  const confirmed = window.confirm(`確定要刪除「${targetTitle}」嗎？`);
  if (!confirmed) {
    renderSessionDropdown();
    return;
  }

  deleteSession(targetSessionId);
});

useMemoryInput.addEventListener("change", () => {
  memoryTurnsInput.disabled = !useMemoryInput.checked;
});

modelSelect.addEventListener("change", () => {
  latestRoutedModel = "";
  refreshRouteInfo();
  refreshSelectedModelInfo();
  refreshManualModelPanel();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !memoryManagerModal.hidden) {
    setMemoryManagerOpen(false);
    return;
  }

  if (event.key === "Escape" && !attachmentPanelBody.hidden) {
    setAttachmentPanelOpen(false);
  }
});

memoryTurnsInput.disabled = !useMemoryInput.checked;
bindSliders();
initThemeToggle();
initV2FeatureToggles();
initCompactSidebarToggle();
initSettingsDrawer();
initAdvancedParamsToggle();
initAttachmentPanel();

sessionIndex = loadSessionIndex();
upsertSessionMeta(currentSessionId, {
  updatedAt: Date.now()
});

chatHistory = loadChatHistory(currentSessionId);
if (chatHistory.length > 0) {
  renderSavedHistory();
} else {
  addMessage("assistant", "你好，我是你的 HW02 v2 Chatbot。你可以開啟自動路由、工具與長期記憶，再開始聊天。", {
    isError: false
  });
}

renderSessionDropdown();
renderLocalAttachments();
refreshRouteInfo();
refreshSelectedModelInfo();
refreshAttachmentStatus();
setStatus("Ready");
loadModels();
