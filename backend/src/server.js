import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import OpenAI from "openai";
import path from "path";
import { PDFParse } from "pdf-parse";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../../frontend");
const dataDir = path.resolve(__dirname, "../data");
const longTermMemoryPath = path.join(dataDir, "long_term_memory.json");

fs.mkdirSync(dataDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: "16mb" }));

const port = Number(process.env.PORT || 3000);
const appInfo = {
  name: "genai-hw2-v2",
  version: "2.2.0"
};
const MCP_PROTOCOL_VERSION = "2025-06-18";
const preferredProvider = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
const hasOpenAiKey = Boolean((process.env.OPENAI_API_KEY || "").trim());
const hasXaiKey = Boolean((process.env.XAI_API_KEY || "").trim());
const hasGroqKey = Boolean((process.env.GROQ_API_KEY || "").trim());
const maxLongTermFacts = Number.parseInt(process.env.LONG_MEMORY_MAX_FACTS || "120", 10) || 120;
const MAX_IMAGE_ATTACHMENTS = 5;
const MAX_DOCUMENT_ATTACHMENTS = 2;
const MAX_DOCUMENT_BYTES = 6 * 1024 * 1024;
const MAX_DOCUMENT_TEXT_PER_FILE = 6000;
const MAX_DOCUMENT_TEXT_TOTAL = 12000;

function resolveProvider() {
  if (["openai", "xai", "groq"].includes(preferredProvider)) {
    return preferredProvider;
  }

  if (hasOpenAiKey) return "openai";
  if (hasXaiKey) return "xai";
  if (hasGroqKey) return "groq";
  return "openai";
}

const activeProvider = resolveProvider();

const providerConfig = {
  openai: {
    apiKey: (process.env.OPENAI_API_KEY || "").trim(),
    baseURL: (process.env.OPENAI_BASE_URL || "").trim() || undefined,
    defaultModel: "gpt-4o-mini"
  },
  xai: {
    apiKey: (process.env.XAI_API_KEY || "").trim(),
    baseURL: (process.env.XAI_BASE_URL || "").trim() || "https://api.x.ai/v1",
    defaultModel: "grok-3-mini"
  },
  groq: {
    apiKey: (process.env.GROQ_API_KEY || "").trim(),
    baseURL: (process.env.GROQ_BASE_URL || "").trim() || "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.1-8b-instant"
  }
};

const apiKey = providerConfig[activeProvider].apiKey;
const resolvedBaseUrl = providerConfig[activeProvider].baseURL;

function parseCsvList(rawValue) {
  return String(rawValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(items) {
  return [...new Set(items.map((item) => String(item || "").trim()).filter(Boolean))];
}

const defaultModel = (process.env.DEFAULT_MODEL || providerConfig[activeProvider].defaultModel).trim();
const modelOptions = uniqueStrings(parseCsvList(process.env.MODEL_OPTIONS || defaultModel));

function findFirstConfiguredModel(patterns = []) {
  return modelOptions.find((item) => patterns.some((pattern) => pattern.test(item))) || "";
}

function resolveManualModelName(requestedModel, fallback = defaultModel) {
  const preferred = String(requestedModel || "").trim();
  if (preferred) {
    return preferred;
  }

  return String(fallback || modelOptions[0] || defaultModel).trim();
}

function resolveRouteModelName(preferred, fallbackCandidates = []) {
  const candidates = [preferred, ...fallbackCandidates, defaultModel, modelOptions[0]];
  return candidates.map((item) => String(item || "").trim()).find(Boolean) || defaultModel;
}

function supportsImageInput(modelName) {
  const normalized = String(modelName || "").trim().toLowerCase();
  if (!normalized) return false;

  if (activeProvider === "groq") {
    return /llama-4-scout|vision|vl|llava|qwen.*vl|gpt-4o/.test(normalized);
  }

  if (activeProvider === "xai") {
    return /grok/.test(normalized);
  }

  return /gpt-4o|gpt-4\.1|vision|omni|o4/.test(normalized);
}

function getProviderRouteDefaults(provider) {
  if (provider === "groq") {
    return {
      fast: findFirstConfiguredModel([/8b|instant|20b|mini/i]) || defaultModel,
      reasoning: findFirstConfiguredModel([/70b|120b|reason|qwen3|grok-4/i]) || modelOptions[0] || defaultModel,
      vision:
        findFirstConfiguredModel([/llama-4-scout|vision|vl|llava|qwen.*vl/i]) ||
        "meta-llama/llama-4-scout-17b-16e-instruct"
    };
  }

  if (provider === "xai") {
    return {
      fast: findFirstConfiguredModel([/mini|fast|20b|8b/i]) || defaultModel,
      reasoning: findFirstConfiguredModel([/grok-4|reason/i]) || defaultModel,
      vision: findFirstConfiguredModel([/grok/i]) || defaultModel
    };
  }

  return {
    fast: findFirstConfiguredModel([/mini|4o-mini|nano|20b|8b/i]) || defaultModel,
    reasoning: findFirstConfiguredModel([/gpt-5|gpt-4\.1|o3|o4|reason/i]) || defaultModel,
    vision: findFirstConfiguredModel([/gpt-4o|gpt-4\.1|vision|omni/i]) || defaultModel
  };
}

const providerRouteDefaults = getProviderRouteDefaults(activeProvider);
const routerFastModel = resolveRouteModelName(process.env.ROUTER_FAST_MODEL, [providerRouteDefaults.fast]);
const routerReasoningModel = resolveRouteModelName(process.env.ROUTER_REASONING_MODEL, [providerRouteDefaults.reasoning]);
const routerVisionModel = resolveRouteModelName(process.env.ROUTER_VISION_MODEL, [providerRouteDefaults.vision]);

function buildRouteDiagnostics() {
  const routeOnly = {
    fast: !modelOptions.includes(routerFastModel),
    reasoning: !modelOptions.includes(routerReasoningModel),
    vision: !modelOptions.includes(routerVisionModel)
  };

  const warnings = [];
  if (!supportsImageInput(routerVisionModel)) {
    warnings.push("目前配置的 vision route model 看起來不像支援圖片輸入的模型。");
  }

  if (routeOnly.vision) {
    warnings.push("vision route model 採 route-only 設定，不會出現在前端下拉選單。");
  }

  return {
    routeOnly,
    warnings,
    visionReady: supportsImageInput(routerVisionModel)
  };
}

const routeDiagnostics = buildRouteDiagnostics();

function getRouteWarningsForReason(routeReason) {
  const warnings = [];

  if (routeReason === "vision") {
    if (routeDiagnostics.routeOnly.vision) {
      warnings.push("vision route model 採 route-only 設定，不會出現在前端下拉選單。");
    }
    if (!routeDiagnostics.visionReady) {
      warnings.push("目前配置的 vision route model 看起來不像支援圖片輸入的模型。");
    }
  }

  if (routeReason === "reasoning" && routeDiagnostics.routeOnly.reasoning) {
    warnings.push("reasoning route model 採 route-only 設定。");
  }

  if (routeReason === "fast" && routeDiagnostics.routeOnly.fast) {
    warnings.push("fast route model 採 route-only 設定。");
  }

  return warnings;
}

if (!apiKey) {
  console.warn("[WARN] API key missing. Set OPENAI_API_KEY, XAI_API_KEY, or GROQ_API_KEY.");
}

const client = new OpenAI({
  apiKey,
  baseURL: resolvedBaseUrl
});

const sessions = new Map();
const mcpSessions = new Map();
const MAX_SESSIONS = 500;
const MAX_SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
const MAX_MCP_SESSIONS = 200;

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, state] of sessions.entries()) {
    if (now - state.updatedAt > MAX_SESSION_IDLE_MS) {
      sessions.delete(sessionId);
    }
  }

  for (const [sessionId, state] of mcpSessions.entries()) {
    if (now - state.updatedAt > MAX_SESSION_IDLE_MS) {
      mcpSessions.delete(sessionId);
    }
  }
}, 10 * 60 * 1000);

function clampNumber(value, fallback, options = {}) {
  const { min = -Infinity, max = Infinity, integer = false } = options;
  const parsed = integer ? Number.parseInt(value, 10) : Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const bounded = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(bounded) : bounded;
}

function getSessionHistory(sessionId) {
  if (!sessionId) return [];
  return sessions.get(sessionId)?.messages || [];
}

function setSessionHistory(sessionId, messages) {
  if (!sessionId) return;

  if (sessions.size >= MAX_SESSIONS && !sessions.has(sessionId)) {
    const oldest = sessions.entries().next().value;
    if (oldest) {
      sessions.delete(oldest[0]);
    }
  }

  sessions.set(sessionId, {
    messages,
    updatedAt: Date.now()
  });
}

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function loadLongTermMemoryStore() {
  try {
    if (!fs.existsSync(longTermMemoryPath)) {
      return {};
    }

    const raw = fs.readFileSync(longTermMemoryPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn(`[WARN] Failed to load long-term memory: ${error.message}`);
    return {};
  }
}

const longTermMemoryStore = loadLongTermMemoryStore();

function saveLongTermMemoryStore() {
  try {
    fs.writeFileSync(longTermMemoryPath, JSON.stringify(longTermMemoryStore, null, 2), "utf8");
  } catch (error) {
    console.warn(`[WARN] Failed to save long-term memory: ${error.message}`);
  }
}

function resolveLongTermMemoryScope(memoryScopeId, sessionId = "") {
  return String(memoryScopeId || sessionId || "").trim();
}

function getLongTermBucket(memoryScopeId) {
  const safeSessionId = String(memoryScopeId || "global");

  if (!longTermMemoryStore[safeSessionId] || typeof longTermMemoryStore[safeSessionId] !== "object") {
    longTermMemoryStore[safeSessionId] = {
      facts: [],
      updatedAt: Date.now()
    };
  }

  if (!Array.isArray(longTermMemoryStore[safeSessionId].facts)) {
    longTermMemoryStore[safeSessionId].facts = [];
  }

  return {
    sessionId: safeSessionId,
    bucket: longTermMemoryStore[safeSessionId]
  };
}

function migrateLegacySessionBucketToScope(memoryScopeId, sessionId = "") {
  const safeScopeId = resolveLongTermMemoryScope(memoryScopeId, sessionId);
  const safeSessionId = String(sessionId || "").trim();
  if (!safeScopeId || !safeSessionId || safeScopeId === safeSessionId) {
    return 0;
  }

  const legacyBucket = longTermMemoryStore[safeSessionId];
  if (!legacyBucket || !Array.isArray(legacyBucket.facts) || !legacyBucket.facts.length) {
    return 0;
  }

  const { bucket: targetBucket } = getLongTermBucket(safeScopeId);
  let moved = 0;

  for (const rawFact of legacyBucket.facts) {
    const normalizedFact = normalizeLongTermFactInput(rawFact);
    if (!normalizedFact) continue;

    const sameKeyFacts = normalizedFact.key
      ? targetBucket.facts.filter((item) => getStoredFactKey(item) === normalizedFact.key)
      : [];
    const existing =
      sameKeyFacts.find((item) => normalizeFactText(item?.text).toLowerCase() === normalizedFact.text.toLowerCase()) ||
      sameKeyFacts[0] ||
      targetBucket.facts.find((item) => normalizeFactText(item?.text).toLowerCase() === normalizedFact.text.toLowerCase());

    if (existing) {
      existing.text = normalizedFact.text;
      existing.factKey = normalizedFact.key || existing.factKey || "";
      existing.factCategory = normalizedFact.category || existing.factCategory || "";
      existing.keywords = [...extractKeywords(normalizedFact.text)];
      existing.createdAt = Math.min(
        Number(existing.createdAt || Date.now()),
        Number(rawFact?.createdAt || existing.createdAt || Date.now())
      );
      existing.lastSeenAt = Math.max(
        Number(existing.lastSeenAt || existing.createdAt || 0),
        Number(rawFact?.lastSeenAt || rawFact?.createdAt || 0)
      );
      existing.lastUsedAt = Math.max(Number(existing.lastUsedAt || 0), Number(rawFact?.lastUsedAt || 0));

      if (sameKeyFacts.length > 1 && normalizedFact.key) {
        const keepId = String(existing.id || "");
        targetBucket.facts = targetBucket.facts.filter((item) => {
          const sameKey = getStoredFactKey(item) === normalizedFact.key;
          return !sameKey || String(item.id || "") === keepId;
        });
      }
      moved += 1;
      continue;
    }

    targetBucket.facts.push({
      id: String(rawFact?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
      text: normalizedFact.text,
      factKey: normalizedFact.key,
      factCategory: normalizedFact.category,
      keywords: [...extractKeywords(normalizedFact.text)],
      createdAt: Number(rawFact?.createdAt || Date.now()),
      lastSeenAt: Number(rawFact?.lastSeenAt || rawFact?.createdAt || Date.now()),
      lastUsedAt: Number(rawFact?.lastUsedAt || 0)
    });
    moved += 1;
  }

  if (!moved) {
    return 0;
  }

  targetBucket.facts.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  targetBucket.facts = targetBucket.facts.slice(0, maxLongTermFacts);
  targetBucket.updatedAt = Date.now();
  delete longTermMemoryStore[safeSessionId];
  saveLongTermMemoryStore();
  return moved;
}

function normalizeFactText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function extractKeywords(text) {
  const raw = String(text || "").toLowerCase();
  const keywords = new Set();
  const tokens = raw.match(/[a-z0-9][a-z0-9_\-]{1,}/gi) || [];

  for (const token of tokens) {
    if (token.length >= 2) {
      keywords.add(token);
    }
  }

  const hanSegments = raw.match(/[\u4e00-\u9fff]{2,}/gu) || [];
  for (const segment of hanSegments) {
    keywords.add(segment);

    for (let i = 0; i <= segment.length - 2; i += 1) {
      keywords.add(segment.slice(i, i + 2));
    }
  }

  return keywords;
}

function cleanCapturedFactValue(value, maxLength = 48) {
  return String(value || "")
    .replace(/^[\s:：,，;；]+/, "")
    .replace(/[\s。！？!?,，；;]+$/g, "")
    .trim()
    .slice(0, maxLength);
}

function isQuestionLikeValue(value) {
  const normalized = String(value || "")
    .replace(/[?？]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();

  if (!normalized) return true;
  if (/^(啥|甚麼|什麼|什麽|誰|哪裡|哪里|哪個|哪个|哪位|幾|几|多少|怎樣|怎么样|如何|嗎|嘛|呢)$/.test(normalized)) {
    return true;
  }

  return /^(啥|甚麼|什麼|什麽|誰|哪裡|哪里|哪個|哪个|哪位|幾|几|多少)/.test(normalized) && normalized.length <= 4;
}

function buildFactKey(prefix, value = "") {
  const normalizedValue = normalizeFactText(value).toLowerCase();
  return normalizedValue ? `${prefix}:${normalizedValue}` : prefix;
}

function deriveFactSemanticTags(rawFact) {
  const normalizedFact = normalizeLongTermFactInput(rawFact);
  const tags = new Set();
  if (!normalizedFact) {
    return tags;
  }

  const key = String(normalizedFact.key || "").toLowerCase();
  const text = normalizedFact.text.toLowerCase();
  const value = String(normalizedFact.value || "").toLowerCase();
  const merged = `${text} ${value}`;

  if (normalizedFact.category === "preference" || key.startsWith("user_like") || key.startsWith("user_dislike")) {
    tags.add("preference");
  }

  if (/(吃|飯|麵|餐|早餐|午餐|晚餐|宵夜|便當|火鍋|料理|食物|餐點|菜|壽司|拉麵|白飯|牛肉麵|雞排|漢堡|披薩|咖哩|鍋|甜點)/i.test(merged)) {
    tags.add("food");
  }

  if (/(喝|飲料|奶茶|咖啡|茶|果汁|可樂|汽水|豆漿|牛奶|手搖)/i.test(merged)) {
    tags.add("drink");
  }

  if (/(電影|影集|動漫|卡通|漫畫|netflix|youtube|劇)/i.test(merged)) {
    tags.add("media");
  }

  if (/(運動|打球|籃球|羽球|跑步|健身|游泳|足球)/i.test(merged)) {
    tags.add("sport");
  }

  return tags;
}

function deriveFactMetaFromText(text) {
  const normalizedText = normalizeFactText(text);
  if (!normalizedText) {
    return { key: "", category: "", value: "" };
  }

  const descriptors = [
    { regex: /^使用者名字是\s+(.+)$/i, key: "user_name", category: "profile" },
    { regex: /^使用者學號是\s+(.+)$/i, key: "user_student_id", category: "profile" },
    { regex: /^使用者室友名字是\s+(.+)$/i, key: "user_roommate_name", category: "profile" },
    { regex: /^使用者所在地：\s*(.+)$/i, key: "user_location", category: "profile" },
    { regex: /^使用者身分：\s*(.+)$/i, key: "user_identity", category: "profile" },
    {
      regex: /^使用者喜歡\s+(.+)$/i,
      key: (value) => buildFactKey("user_like", value),
      category: "preference"
    },
    {
      regex: /^使用者不喜歡\s+(.+)$/i,
      key: (value) => buildFactKey("user_dislike", value),
      category: "preference"
    },
    {
      regex: /^使用者要求記住：\s*(.+)$/i,
      key: (value) => buildFactKey("remember", value),
      category: "remember"
    }
  ];

  for (const item of descriptors) {
    const matched = normalizedText.match(item.regex);
    if (!matched) continue;

    const value = cleanCapturedFactValue(matched[1], 64);
    return {
      key: typeof item.key === "function" ? item.key(value) : item.key,
      category: item.category,
      value
    };
  }

  return { key: "", category: "", value: "" };
}

function normalizeLongTermFactInput(rawFact) {
  const text =
    typeof rawFact === "string"
      ? normalizeFactText(rawFact)
      : normalizeFactText(rawFact?.text);
  if (!text) return null;

  const derived = deriveFactMetaFromText(text);
  const key = String(rawFact?.factKey || rawFact?.key || derived.key || "").trim();
  const category = String(rawFact?.factCategory || rawFact?.category || derived.category || "").trim();
  const value = cleanCapturedFactValue(rawFact?.value || derived.value || "", 64);

  if (key && isQuestionLikeValue(value)) {
    return null;
  }

  return {
    text,
    key,
    category,
    value
  };
}

function getStoredFactKey(rawFact) {
  return String(rawFact?.factKey || rawFact?.key || deriveFactMetaFromText(rawFact?.text || rawFact).key || "").trim();
}

function buildMemoryQueryProfile(query) {
  const normalizedQuery = normalizeFactText(query).toLowerCase();
  const preferredKeys = [];
  const preferredCategories = [];
  const hintPhrases = [];
  const semanticTags = [];
  const pushKey = (key) => {
    if (key && !preferredKeys.includes(key)) {
      preferredKeys.push(key);
    }
  };
  const pushCategory = (category) => {
    if (category && !preferredCategories.includes(category)) {
      preferredCategories.push(category);
    }
  };
  const pushHint = (hint) => {
    if (hint && !hintPhrases.includes(hint)) {
      hintPhrases.push(hint);
    }
  };
  const pushTag = (tag) => {
    if (tag && !semanticTags.includes(tag)) {
      semanticTags.push(tag);
    }
  };

  if (/(我叫|名字|名子|name)/i.test(normalizedQuery)) {
    pushKey("user_name");
    pushHint("名字");
    pushHint("姓名");
  }

  if (/學號/i.test(normalizedQuery)) {
    pushKey("user_student_id");
    pushHint("學號");
  }

  if (/室友/i.test(normalizedQuery)) {
    pushKey("user_roommate_name");
    pushHint("室友");
    pushHint("名字");
  }

  if (/(住在|住哪|哪裡|哪里|所在地)/i.test(normalizedQuery)) {
    pushKey("user_location");
    pushHint("所在地");
    pushHint("住在");
  }

  if (/(身分|身份|職業|职业|我是誰|我是啥|我是什麼|我是甚麼)/i.test(normalizedQuery)) {
    pushKey("user_identity");
    pushHint("身分");
    pushHint("職業");
  }

  if (/(吃|餐|早餐|午餐|晚餐|宵夜|食物|料理|餐點|要吃|吃啥|吃什麼|吃甚麼)/i.test(normalizedQuery)) {
    pushCategory("preference");
    pushHint("喜歡");
    pushHint("不喜歡");
    pushTag("food");
  }

  if (/(喝|飲料|奶茶|咖啡|茶|果汁|喝啥|喝什麼|喝甚麼)/i.test(normalizedQuery)) {
    pushCategory("preference");
    pushHint("喜歡");
    pushHint("不喜歡");
    pushTag("drink");
  }

  if (/(推薦|建議|適合|要不要|覺得我|幫我選|選哪個|點什麼|點啥)/i.test(normalizedQuery)) {
    pushCategory("preference");
    pushHint("偏好");
  }

  if (/(看|電影|影集|動漫|漫畫|netflix|youtube|追劇|看啥|看什麼|看甚麼)/i.test(normalizedQuery)) {
    pushCategory("preference");
    pushHint("喜歡");
    pushHint("不喜歡");
    pushTag("media");
  }

  if (/(運動|打球|籃球|羽球|跑步|健身|游泳|足球|活動|休閒)/i.test(normalizedQuery)) {
    pushCategory("preference");
    pushHint("喜歡");
    pushHint("不喜歡");
    pushTag("sport");
  }

  const queryKeywords = extractKeywords([normalizedQuery, ...hintPhrases].join(" "));
  const broadRecall = /(你還記得|我說過|長期記憶|memory|記不記得|還記得嗎)/i.test(normalizedQuery);

  return {
    normalizedQuery,
    queryKeywords,
    preferredKeys,
    preferredCategories,
    semanticTags,
    broadRecall
  };
}

function upsertLongTermFacts(memoryScopeId, factTexts) {
  if (!memoryScopeId || !Array.isArray(factTexts) || !factTexts.length) {
    return {
      added: [],
      updated: []
    };
  }

  const { bucket } = getLongTermBucket(memoryScopeId);
  const now = Date.now();
  const added = [];
  const updated = [];

  for (const rawFact of factTexts) {
    const normalizedFact = normalizeLongTermFactInput(rawFact);
    if (!normalizedFact) continue;

    const sameKeyFacts = normalizedFact.key
      ? bucket.facts.filter((item) => getStoredFactKey(item) === normalizedFact.key)
      : [];
    const existingByText = bucket.facts.find((item) => normalizeFactText(item?.text).toLowerCase() === normalizedFact.text.toLowerCase());
    const targetFact = existingByText || sameKeyFacts[0];

    if (targetFact) {
      const previousText = normalizeFactText(targetFact.text);
      targetFact.text = normalizedFact.text;
      targetFact.factKey = normalizedFact.key || targetFact.factKey || "";
      targetFact.factCategory = normalizedFact.category || targetFact.factCategory || "";
      targetFact.keywords = [...extractKeywords(normalizedFact.text)];
      targetFact.lastSeenAt = now;

      if (previousText.toLowerCase() !== normalizedFact.text.toLowerCase()) {
        updated.push(normalizedFact.text);
      }

      if (sameKeyFacts.length > 1 && normalizedFact.key) {
        const keepId = String(targetFact.id || "");
        bucket.facts = bucket.facts.filter((item) => {
          const sameKey = getStoredFactKey(item) === normalizedFact.key;
          return !sameKey || String(item.id || "") === keepId;
        });
      }
      continue;
    }

    const fact = {
      id: `${now}_${Math.random().toString(36).slice(2, 8)}`,
      text: normalizedFact.text,
      factKey: normalizedFact.key,
      factCategory: normalizedFact.category,
      keywords: [...extractKeywords(normalizedFact.text)],
      createdAt: now,
      lastSeenAt: now,
      lastUsedAt: 0
    };

    bucket.facts.push(fact);
    added.push(normalizedFact.text);
  }

  bucket.facts.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  bucket.facts = bucket.facts.slice(0, maxLongTermFacts);
  bucket.updatedAt = now;

  if (added.length || updated.length) {
    saveLongTermMemoryStore();
  }

  return { added, updated };
}

function extractLongTermFactsFromMessage(message) {
  const text = String(message || "").trim();
  if (!text) return [];

  const facts = [];
  const seen = new Set();
  const pushFact = (fact) => {
    const normalizedFact = normalizeLongTermFactInput(fact);
    if (!normalizedFact) return;

    const identity = normalizedFact.key || normalizedFact.text.toLowerCase();
    if (seen.has(identity)) return;
    seen.add(identity);
    facts.push(normalizedFact);
  };

  const namedMatches = [
    {
      key: "user_name",
      category: "profile",
      regexes: [
        /(?:^|[。！？\n,，；;]\s*)(?:我叫|我的名字是)\s*([A-Za-z\u4e00-\u9fff0-9_\-]{1,24})/,
        /(?:^|[。！？\n,，；;]\s*)([A-Za-z\u4e00-\u9fff0-9_\-]{1,24})\s*(?:就是|是)\s*我(?:的)?名字/
      ],
      maxLength: 24,
      format: (value) => `使用者名字是 ${value}`
    },
    {
      key: "user_location",
      category: "profile",
      regexes: [
        /(?:^|[。！？\n,，；;]\s*)(?:我住在|我目前在)\s*([^。！？\n]{1,32})/,
        /(?:^|[。！？\n,，；;]\s*)([^。！？\n]{1,32})\s*(?:就是|是)\s*我(?:目前)?(?:住的地方|住處|所在地)/
      ],
      maxLength: 32,
      format: (value) => `使用者所在地：${value}`
    },
    {
      key: (value) => buildFactKey("user_like", value),
      category: "preference",
      regex: /(?:^|[。！？\n]\s*)(?:我喜歡|我愛)\s*([^。！？\n]{1,36})/,
      maxLength: 36,
      format: (value) => `使用者喜歡 ${value}`
    },
    {
      key: (value) => buildFactKey("user_dislike", value),
      category: "preference",
      regex: /(?:^|[。！？\n]\s*)(?:我討厭|我不喜歡)\s*([^。！？\n]{1,36})/,
      maxLength: 36,
      format: (value) => `使用者不喜歡 ${value}`
    },
    {
      key: "user_identity",
      category: "profile",
      regexes: [
        /(?:^|[。！？\n,，；;]\s*)(?:我是|我的職業是)\s*([^。！？\n]{1,24})/,
        /(?:^|[。！？\n,，；;]\s*)([^。！？\n]{1,24})\s*(?:就是|是)\s*我(?:的)?(?:身分|身份|職業)/
      ],
      maxLength: 24,
      format: (value) => `使用者身分：${value}`
    },
    {
      key: "user_student_id",
      category: "profile",
      regexes: [
        /(?:^|[。！？\n,，；;]\s*)(?:(?:我的)?學號)\s*(?:是|為)?\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9_\-]{3,23})/i,
        /(?:^|[。！？\n,，；;]\s*)([A-Za-z0-9][A-Za-z0-9_\-]{3,23})\s*(?:就是|是)\s*我(?:的)?學號/i
      ],
      maxLength: 24,
      format: (value) => `使用者學號是 ${value}`
    },
    {
      key: "user_roommate_name",
      category: "profile",
      regexes: [
        /(?:^|[。！？\n,，；;]\s*)(?:(?:我的|我)?室友(?:的名字)?)(?:叫|是|名字是)\s*([^。！？\n,，；;]{1,32})/,
        /(?:^|[。！？\n,，；;]\s*)([^。！？\n,，；;]{1,32})\s*(?:就是|是)\s*我(?:的)?室友(?:的名字)?/
      ],
      maxLength: 32,
      format: (value) => `使用者室友名字是 ${value}`
    }
  ];

  for (const item of namedMatches) {
    const patterns = Array.isArray(item.regexes) ? item.regexes : [item.regex];
    const matched = patterns.map((pattern) => text.match(pattern)).find(Boolean);
    if (matched) {
      const value = cleanCapturedFactValue(matched[1], item.maxLength);
      if (isQuestionLikeValue(value)) continue;
      pushFact({
        key: typeof item.key === "function" ? item.key(value) : item.key,
        category: item.category,
        value,
        text: item.format(value)
      });
    }
  }

  const rememberMatched = text.match(/(?:請)?(?:幫我)?記住[:：]?\s*(.+)$/);
  if (rememberMatched?.[1]) {
    const rememberedValue = cleanCapturedFactValue(rememberMatched[1], 96);
    if (!isQuestionLikeValue(rememberedValue)) {
      pushFact({
        key: buildFactKey("remember", rememberedValue),
        category: "remember",
        value: rememberedValue,
        text: `使用者要求記住：${rememberedValue}`
      });
    }
  }

  return facts;
}

function getRelevantLongTermFacts(memoryScopeId, query, limit = 6) {
  if (!memoryScopeId) return [];

  const { bucket } = getLongTermBucket(memoryScopeId);
  const facts = bucket.facts || [];
  if (!facts.length) return [];

  const queryProfile = buildMemoryQueryProfile(query);
  const queryKeywords = queryProfile.queryKeywords;
  const now = Date.now();

  const scored = facts
    .map((fact) => {
      const normalizedFact = normalizeLongTermFactInput(fact);
      if (!normalizedFact) return null;

      const factText = normalizedFact.text.toLowerCase();
      const factKeywords = new Set(Array.isArray(fact.keywords) && fact.keywords.length ? fact.keywords : [...extractKeywords(factText)]);
      const factSemanticTags = deriveFactSemanticTags(normalizedFact);
      const preferredKeyBoost = queryProfile.preferredKeys.includes(normalizedFact.key) ? 8 : 0;
      const preferredCategoryBoost = queryProfile.preferredCategories.includes(normalizedFact.category) ? 4 : 0;
      let semanticBoost = 0;
      for (const tag of queryProfile.semanticTags) {
        if (factSemanticTags.has(tag)) {
          semanticBoost += 4;
        }
      }
      let overlap = 0;

      for (const key of queryKeywords) {
        if (factKeywords.has(key)) {
          overlap += 1;
        }
      }

      let directMatch = 0;
      if (queryProfile.normalizedQuery && factText.includes(queryProfile.normalizedQuery)) {
        directMatch += 3;
      }

      for (const key of queryKeywords) {
        if (key.length >= 2 && factText.includes(key)) {
          directMatch += 1;
        }
      }

      const ageHours = Math.max(0, (now - Number(fact.lastSeenAt || fact.createdAt || now)) / (1000 * 60 * 60));
      const recency = Math.max(0, 3 - ageHours * 0.05);

      return {
        fact,
        normalizedFact,
        score: overlap * 4 + directMatch * 1.5 + preferredKeyBoost + preferredCategoryBoost + semanticBoost + recency,
        overlap,
        directMatch,
        preferredKeyBoost,
        preferredCategoryBoost,
        semanticBoost
      };
    })
    .filter(Boolean);

  scored.sort((a, b) => b.score - a.score || b.fact.lastSeenAt - a.fact.lastSeenAt);

  let filtered = scored.filter(
    (item) => item.overlap > 0 || item.directMatch > 0 || item.preferredKeyBoost > 0 || item.preferredCategoryBoost > 0 || item.semanticBoost > 0
  );
  if (!filtered.length && queryProfile.semanticTags.length) {
    filtered = scored.filter((item) => item.semanticBoost > 0 || item.preferredCategoryBoost > 0);
  }
  if (!filtered.length && queryProfile.broadRecall) {
    filtered = scored.slice(0, Math.min(limit, 3));
  }

  const picked = filtered.slice(0, limit).map((item) => item.fact);

  if (picked.length) {
    for (const fact of picked) {
      fact.lastUsedAt = Date.now();
    }
    saveLongTermMemoryStore();
  }

  return picked;
}

function clearLongTermMemory(memoryScopeId) {
  if (!memoryScopeId) {
    return 0;
  }

  const safeSessionId = String(memoryScopeId);
  if (!longTermMemoryStore[safeSessionId]) {
    return 0;
  }

  const count = Array.isArray(longTermMemoryStore[safeSessionId].facts)
    ? longTermMemoryStore[safeSessionId].facts.length
    : 0;

  delete longTermMemoryStore[safeSessionId];
  saveLongTermMemoryStore();
  return count;
}

function deleteLongTermFacts(memoryScopeId, factIds = []) {
  if (!memoryScopeId || !Array.isArray(factIds) || !factIds.length) {
    return 0;
  }

  const safeSessionId = String(memoryScopeId);
  const bucket = longTermMemoryStore[safeSessionId];
  if (!bucket || !Array.isArray(bucket.facts) || !bucket.facts.length) {
    return 0;
  }

  const idSet = new Set(factIds.map((item) => String(item || "").trim()).filter(Boolean));
  if (!idSet.size) {
    return 0;
  }

  const beforeCount = bucket.facts.length;
  bucket.facts = bucket.facts.filter((item) => !idSet.has(String(item.id || "")));
  const removed = beforeCount - bucket.facts.length;

  if (removed > 0) {
    bucket.updatedAt = Date.now();
    saveLongTermMemoryStore();
  }

  return removed;
}

function listToolDefinitions() {
  return [
    {
      name: "get_time",
      description: "取得目前時間（可指定時區）",
      inputSchema: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "例如 Asia/Taipei" }
        }
      }
    },
    {
      name: "calculate",
      description: "計算四則運算表達式",
      inputSchema: {
        type: "object",
        properties: {
          expression: { type: "string", description: "例如 (3+5)*2" }
        },
        required: ["expression"]
      }
    },
    {
      name: "memory_recall",
      description: "查詢目前記憶 scope 的長期記憶與偏好摘要。只有在使用者明確要你回想資料，或需要依偏好做推薦時才使用；對單純提供新資訊的陳述句不要呼叫。",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "要查詢的主題" }
        }
      }
    }
  ];
}

function evaluateMathExpression(expression) {
  const raw = String(expression || "").trim();
  if (!raw) {
    throw new Error("expression is required");
  }

  const normalized = raw.replace(/=/g, "").replace(/\^/g, "**");
  if (!/^[0-9+\-*/().%\s*]+$/.test(normalized)) {
    throw new Error("expression contains unsupported characters");
  }

  const value = Function(`"use strict"; return (${normalized});`)();
  if (!Number.isFinite(value)) {
    throw new Error("expression result is not finite");
  }

  return value;
}

function callLocalTool(toolName, args = {}, context = {}) {
  const sessionId = context.sessionId;
  const memoryScopeId = resolveLongTermMemoryScope(context.memoryScopeId, sessionId);
  const source = String(context.source || "local");

  if (toolName === "get_time") {
    const timezone = String(args.timezone || "Asia/Taipei");
    try {
      const formatted = new Intl.DateTimeFormat("zh-TW", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(new Date());

      return {
        ok: true,
        tool: toolName,
        source,
        output: `${formatted} (${timezone})`
      };
    } catch {
      const fallback = new Date().toISOString();
      return {
        ok: true,
        tool: toolName,
        source,
        output: `${fallback} (UTC)`
      };
    }
  }

  if (toolName === "calculate") {
    const result = evaluateMathExpression(args.expression || "");
    return {
      ok: true,
      tool: toolName,
      source,
      output: `${args.expression} = ${result}`
    };
  }

  if (toolName === "memory_recall") {
    if (!memoryScopeId) {
      return {
        ok: true,
        tool: toolName,
        source,
        output: "目前沒有可用的記憶 scope，無法查詢長期記憶。"
      };
    }

    const queryText = String(args.query || "");
    const queryProfile = buildMemoryQueryProfile(queryText);
    const facts = getRelevantLongTermFacts(memoryScopeId, queryText, queryProfile.preferredKeys.length ? 2 : 3);
    if (!facts.length) {
      return {
        ok: true,
        tool: toolName,
        source,
        output: "尚無相關長期記憶。"
      };
    }

    const summarizedFacts = queryProfile.preferredKeys.length ? facts.slice(0, 1) : facts.slice(0, 3);
    const summarizedText =
      summarizedFacts.length === 1
        ? summarizedFacts[0].text
        : summarizedFacts.map((item, index) => `${index + 1}. ${item.text}`).join("\n");

    return {
      ok: true,
      tool: toolName,
      source,
      output: queryProfile.preferredCategories.includes("preference")
        ? `可參考的偏好記憶：${summarizedText}`
        : summarizedText
    };
  }

  return {
    ok: false,
    tool: toolName,
    source,
    error: "Unknown tool"
  };
}

function buildNativeToolDefinitions() {
  return listToolDefinitions().map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

function normalizeAssistantContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        if (typeof item.text === "string") return item.text;
        if (typeof item?.content === "string") return item.content;
        return "";
      })
      .join("");
  }

  return "";
}

function normalizeMessageContentToText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return normalizeAssistantContent(content);
  }

  const parts = [];
  let imageCount = 0;

  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }

    if (!item || typeof item !== "object") {
      continue;
    }

    if (typeof item.text === "string" && item.text.trim()) {
      parts.push(item.text.trim());
    }

    if (typeof item.content === "string" && item.content.trim()) {
      parts.push(item.content.trim());
    }

    if (item.type === "image_url" || item.image_url?.url) {
      imageCount += 1;
    }
  }

  if (imageCount > 0) {
    parts.push(`[前文包含 ${imageCount} 張圖片]`);
  }

  return parts.filter(Boolean).join("\n").trim();
}

function normalizeStoredMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => {
      const role = String(message?.role || "").trim();
      if (!["system", "user", "assistant", "tool"].includes(role)) {
        return null;
      }

      const normalized = {
        role,
        content: normalizeMessageContentToText(message?.content)
      };

      if (role === "tool") {
        if (message?.tool_call_id) {
          normalized.tool_call_id = String(message.tool_call_id);
        }
        if (message?.name) {
          normalized.name = String(message.name);
        }
      }

      return normalized;
    })
    .filter((item) => item && item.content);
}

function hasStructuredMessageContent(messages) {
  return Array.isArray(messages) && messages.some((item) => Array.isArray(item?.content));
}

function buildStoredUserHistoryContent(messageText, imageUrls = [], documents = []) {
  const lines = [String(messageText || "").trim() || "使用者傳送了一則訊息。"];

  if (Array.isArray(imageUrls) && imageUrls.length) {
    lines.push(`[附加 ${imageUrls.length} 張圖片]`);
  }

  if (Array.isArray(documents) && documents.length) {
    const docNames = documents
      .map((item) => String(item?.name || "").trim())
      .filter(Boolean)
      .slice(0, MAX_DOCUMENT_ATTACHMENTS);
    if (docNames.length) {
      lines.push(`[附加 PDF：${docNames.join("、")}]`);
    }
  }

  return lines.join("\n");
}

function sanitizeUploadedDocuments(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  const documents = [];

  for (const rawItem of items.slice(0, MAX_DOCUMENT_ATTACHMENTS)) {
    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }

    const name = String(rawItem.name || `document-${documents.length + 1}.pdf`)
      .trim()
      .slice(0, 120);
    const mimeType = String(rawItem.mimeType || rawItem.type || "application/pdf")
      .trim()
      .toLowerCase();
    const dataUrl = String(rawItem.dataUrl || rawItem.content || "").trim();

    if (!/^data:application\/pdf;base64,/i.test(dataUrl)) {
      continue;
    }

    const base64Payload = dataUrl.split(",", 2)[1] || "";
    const approximateBytes = Math.floor((base64Payload.length * 3) / 4);
    if (!approximateBytes || approximateBytes > MAX_DOCUMENT_BYTES) {
      continue;
    }

    documents.push({
      name: name || `document-${documents.length + 1}.pdf`,
      mimeType,
      dataUrl
    });
  }

  return documents;
}

function dataUrlToBuffer(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/i);
  if (!match?.[2]) {
    throw new Error("Invalid data URL");
  }

  return Buffer.from(match[2], "base64");
}

function normalizeDocumentText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractUploadedDocumentTexts(documents) {
  const extracted = [];
  const warnings = [];

  for (const document of documents.slice(0, MAX_DOCUMENT_ATTACHMENTS)) {
    let parser = null;

    try {
      parser = new PDFParse({ data: dataUrlToBuffer(document.dataUrl) });
      const result = await parser.getText();
      const text = normalizeDocumentText(result?.text || "").slice(0, MAX_DOCUMENT_TEXT_PER_FILE);

      if (!text) {
        warnings.push(`${document.name} 讀不到可用文字。`);
        continue;
      }

      extracted.push({
        name: document.name,
        mimeType: document.mimeType,
        text
      });
    } catch (error) {
      warnings.push(`${document.name} 解析失敗：${error?.message || "unknown error"}`);
    } finally {
      if (parser?.destroy) {
        try {
          await parser.destroy();
        } catch {
          // ignore parser cleanup error
        }
      }
    }
  }

  return {
    documents: extracted,
    warnings
  };
}

function buildDocumentContext(documents) {
  if (!Array.isArray(documents) || !documents.length) {
    return "";
  }

  let remaining = MAX_DOCUMENT_TEXT_TOTAL;
  const sections = [];

  for (const [index, document] of documents.entries()) {
    const text = String(document?.text || "").slice(0, remaining).trim();
    if (!text) {
      continue;
    }

    sections.push(`文件 ${index + 1}（${document.name}）\n${text}`);
    remaining -= text.length;
    if (remaining <= 0) {
      break;
    }
  }

  if (!sections.length) {
    return "";
  }

  return ["以下是使用者上傳 PDF 的文字擷取，請根據內容回答：", ...sections].join("\n\n");
}

function safeParseJsonObject(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function buildToolResultMessage(result) {
  if (result.ok) {
    return JSON.stringify(
      {
        ok: true,
        tool: result.tool,
        output: result.output
      },
      null,
      2
    );
  }

  return JSON.stringify(
    {
      ok: false,
      tool: result.tool,
      error: result.error || "Unknown tool error"
    },
    null,
    2
  );
}

function buildAssistantToolCallMessage(message) {
  return {
    role: "assistant",
    content: normalizeAssistantContent(message?.content),
    tool_calls: (message?.tool_calls || []).map((call) => ({
      id: call.id,
      type: "function",
      function: {
        name: call.function?.name,
        arguments: call.function?.arguments || "{}"
      }
    }))
  };
}

async function maybePlanNativeToolCall({ model, messages, useTools, sessionId, memoryScopeId, temperature, topP, maxTokens }) {
  if (!useTools) {
    return {
      used: false,
      results: [],
      messages
    };
  }

  if (activeProvider !== "openai" && hasStructuredMessageContent(messages)) {
    return {
      used: false,
      results: [],
      messages,
      error: "native tool planning skipped for structured multimodal input on this provider"
    };
  }

  const nativeTools = buildNativeToolDefinitions();
  if (!nativeTools.length) {
    return {
      used: false,
      results: [],
      messages
    };
  }

  try {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: nativeTools,
      tool_choice: "auto",
      parallel_tool_calls: true,
      temperature: Math.min(temperature, 1),
      top_p: topP,
      max_tokens: Math.min(maxTokens, 512),
      stream: false
    });

    const choice = completion.choices?.[0];
    const assistantMessage = choice?.message;
    const toolCalls = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls : [];

    if (!toolCalls.length) {
      return {
        used: false,
        results: [],
        messages
      };
    }

    const toolMessages = [buildAssistantToolCallMessage(assistantMessage)];
    const results = [];

    for (const toolCall of toolCalls.slice(0, 4)) {
      const toolName = String(toolCall.function?.name || "").trim();
      if (!toolName) continue;

      try {
        const args = safeParseJsonObject(toolCall.function?.arguments || "{}");
        const result = callLocalTool(toolName, args, {
          sessionId,
          memoryScopeId,
          source: "native"
        });

        results.push(result);
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: buildToolResultMessage(result)
        });
      } catch (error) {
        const result = {
          ok: false,
          tool: toolName,
          source: "native",
          error: error?.message || "tool execution failed"
        };

        results.push(result);
        toolMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: buildToolResultMessage(result)
        });
      }
    }

    return {
      used: toolMessages.length > 1,
      results,
      messages: toolMessages.length > 1 ? [...messages, ...toolMessages] : messages
    };
  } catch (error) {
    return {
      used: false,
      results: [],
      messages,
      error: error?.message || "native tool planning failed"
    };
  }
}

function summarizeLongTermMemoryStore() {
  return Object.entries(longTermMemoryStore).map(([sessionId, bucket]) => ({
    sessionId,
    count: Array.isArray(bucket?.facts) ? bucket.facts.length : 0,
    updatedAt: Number(bucket?.updatedAt || 0),
    facts: Array.isArray(bucket?.facts)
      ? bucket.facts.map((item) => ({
          id: item.id,
          text: item.text,
          createdAt: item.createdAt,
          lastSeenAt: item.lastSeenAt
        }))
      : []
  }));
}

function createMcpSession(clientInfo = {}) {
  if (mcpSessions.size >= MAX_MCP_SESSIONS) {
    const oldest = mcpSessions.entries().next().value;
    if (oldest) {
      mcpSessions.delete(oldest[0]);
    }
  }

  const sessionId = crypto.randomUUID();
  mcpSessions.set(sessionId, {
    clientInfo,
    updatedAt: Date.now(),
    initialized: true
  });
  return sessionId;
}

function touchMcpSession(sessionId) {
  if (!sessionId || !mcpSessions.has(sessionId)) {
    return false;
  }

  const nextState = {
    ...mcpSessions.get(sessionId),
    updatedAt: Date.now()
  };
  mcpSessions.set(sessionId, nextState);
  return true;
}

function buildJsonRpcSuccess(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function buildJsonRpcError(id, code, message, data = undefined) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data })
    }
  };
}

function listMcpResources() {
  const sessionResources = summarizeLongTermMemoryStore().map((item) => ({
    uri: `memory://scope/${encodeURIComponent(item.sessionId)}/facts`,
    name: `Long-term memory for ${item.sessionId.slice(0, 8)}`,
    description: `Memory scope ${item.sessionId} 的長期記憶`,
    mimeType: "application/json"
  }));

  return [
    {
      uri: "memory://store/summary",
      name: "Long-term Memory Summary",
      description: "所有 memory scope 的長期記憶摘要",
      mimeType: "application/json"
    },
    ...sessionResources
  ];
}

function readMcpResource(uri) {
  const normalized = String(uri || "").trim();
  if (!normalized) {
    throw new Error("resource uri is required");
  }

  if (normalized === "memory://store/summary") {
    return JSON.stringify(summarizeLongTermMemoryStore(), null, 2);
  }

  const sessionMatch = normalized.match(/^memory:\/\/(?:scope|session)\/(.+)\/facts$/);
  if (!sessionMatch) {
    throw new Error("resource not found");
  }

  const sessionId = decodeURIComponent(sessionMatch[1]);
  const { bucket } = getLongTermBucket(sessionId);
  return JSON.stringify(
    {
      sessionId,
      facts: bucket.facts || []
    },
    null,
    2
  );
}

function buildMcpToolCallResult(result) {
  return {
    content: [
      {
        type: "text",
        text: result.ok ? result.output : result.error || "Unknown tool error"
      }
    ],
    structuredContent: result,
    isError: !result.ok
  };
}

function maybeRunHeuristicTools({ message, useTools, sessionId, memoryScopeId }) {
  if (!useTools) {
    return [];
  }

  const text = String(message || "").trim();
  if (!text) return [];

  const runs = [];
  const already = new Set();
  const pushRun = (tool, args) => {
    if (already.has(tool)) return;
    already.add(tool);
    runs.push({ tool, args });
  };

  if (/(現在幾點|現在時間|current time|what time)/i.test(text)) {
    pushRun("get_time", { timezone: "Asia/Taipei" });
  }

  const calcMatch = text.match(/(?:計算|calculate)\s*[:：]?\s*([0-9+\-*/().%\s^=]{3,})/i);
  const pureExpression = /^[0-9+\-*/().%\s^=]{3,}$/.test(text) ? text : "";
  const expression = (calcMatch?.[1] || pureExpression || "").trim();

  if (expression) {
    pushRun("calculate", { expression });
  }

  if (/(你還記得|我說過|長期記憶|memory)/i.test(text)) {
    pushRun("memory_recall", { query: text });
  }

  const results = [];
  for (const run of runs.slice(0, 2)) {
    try {
      results.push(callLocalTool(run.tool, run.args, { sessionId, memoryScopeId, source: "heuristic" }));
    } catch (error) {
      results.push({
        ok: false,
        tool: run.tool,
        source: "heuristic",
        error: error?.message || "tool execution failed"
      });
    }
  }

  return results;
}

function sanitizeImageUrls(single, list) {
  const merged = [];

  if (typeof single === "string" && single.trim()) {
    merged.push(single.trim());
  }

  if (Array.isArray(list)) {
    for (const item of list) {
      if (typeof item === "string" && item.trim()) {
        merged.push(item.trim());
      }
    }
  }

  const deduped = [...new Set(merged)].slice(0, MAX_IMAGE_ATTACHMENTS);
  return deduped.filter((item) => /^(https?:\/\/|data:image\/)/i.test(item));
}

function buildUserContent(messageText, imageUrls, options = {}) {
  const text = String(messageText || "").trim();
  const allowImageInput = Boolean(options.allowImageInput);

  if (!imageUrls.length || !allowImageInput) {
    if (imageUrls.length && !allowImageInput) {
      return [text, `[使用者另外附上 ${imageUrls.length} 張圖片，但目前模型設定不支援直接讀圖。]`]
        .filter(Boolean)
        .join("\n\n");
    }

    return text;
  }

  const content = [{ type: "text", text }];

  for (const url of imageUrls) {
    content.push({
      type: "image_url",
      image_url: { url }
    });
  }

  return content;
}

function isReasoningTask(text) {
  const input = String(text || "");
  if (input.length >= 220) return true;

  return /(分析|比較|推導|證明|最佳化|debug|除錯|step by step|why|原因|演算法|架構|設計)/i.test(input);
}

function resolveModelRoute({ requestedModel, message, imageUrls, hasDocumentContext, autoRoute }) {
  const requested = resolveManualModelName(requestedModel, defaultModel);

  if (!autoRoute) {
    return {
      routedModel: requested,
      routeReason: "manual",
      routeLabel: "手動選擇",
      routeWarnings: []
    };
  }

  if (imageUrls.length > 0) {
    return {
      routedModel: routerVisionModel,
      routeReason: "vision",
      routeLabel: "偵測到圖片輸入，使用視覺模型",
      routeWarnings: getRouteWarningsForReason("vision")
    };
  }

  if (hasDocumentContext) {
    return {
      routedModel: routerReasoningModel,
      routeReason: "document",
      routeLabel: "偵測到 PDF 文件內容，使用推理模型",
      routeWarnings: getRouteWarningsForReason("reasoning")
    };
  }

  if (isReasoningTask(message)) {
    return {
      routedModel: routerReasoningModel,
      routeReason: "reasoning",
      routeLabel: "偵測到複雜問題，使用推理模型",
      routeWarnings: getRouteWarningsForReason("reasoning")
    };
  }

  return {
    routedModel: routerFastModel,
    routeReason: "fast",
    routeLabel: "預設走快速模型",
    routeWarnings: getRouteWarningsForReason("fast")
  };
}

function buildLongTermContext(facts) {
  if (!facts.length) return "";

  const lines = facts.map((item, index) => `${index + 1}. ${item.text}`).join("\n");
  return [
    "以下是使用者長期記憶（若與本輪需求衝突，請以本輪需求為主）：",
    "若使用者是在問推薦、建議或下一步選擇，請把相關偏好記憶當成參考做合理延伸，不要因為沒有完全相同字句就直接說沒有記錄。",
    lines
  ].join("\n");
}

function buildToolContext(toolResults) {
  if (!toolResults.length) return "";

  const lines = toolResults.map((item) => {
    if (item.ok) {
      return `- ${item.tool} [${item.source || "local"}]: ${item.output}`;
    }
    return `- ${item.tool} [${item.source || "local"}]: [error] ${item.error}`;
  });

  return ["以下是工具執行結果（可作為回答參考）：", ...lines].join("\n");
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: activeProvider
  });
});

app.get("/api/models", (_req, res) => {
  res.json({
    provider: activeProvider,
    defaultModel,
    models: modelOptions,
    routerDefaults: {
      fast: routerFastModel,
      reasoning: routerReasoningModel,
      vision: routerVisionModel
    },
    routeDiagnostics,
    capabilities: {
      autoRoute: true,
      tools: true,
      nativeToolCalling: true,
      longTermMemory: true,
      multimodal: true,
      mcp: true,
      formalMcp: true
    }
  });
});

app.get("/api/tools", (_req, res) => {
  res.json({
    tools: listToolDefinitions()
  });
});

app.get("/api/mcp/tools", (_req, res) => {
  res.json({
    protocol: "mcp-jsonrpc+http",
    protocolVersion: MCP_PROTOCOL_VERSION,
    endpoint: "/mcp",
    tools: listToolDefinitions(),
    resources: listMcpResources()
  });
});

app.post("/api/mcp/call", (req, res) => {
  const { tool, args = {}, sessionId, memoryScopeId } = req.body || {};
  if (!tool) {
    return res.status(400).json({ error: "tool is required" });
  }

  const result = callLocalTool(String(tool), args, {
    sessionId: String(sessionId || ""),
    memoryScopeId: resolveLongTermMemoryScope(memoryScopeId, sessionId),
    source: "mcp-legacy"
  });
  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

app.get("/mcp", (_req, res) => {
  res.setHeader("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);
  res.json({
    name: appInfo.name,
    version: appInfo.version,
    protocolVersion: MCP_PROTOCOL_VERSION,
    transport: "streamable-http/json-rpc",
    instructions: "Send JSON-RPC 2.0 POST requests to this endpoint using initialize, tools/list, tools/call, resources/list, and resources/read."
  });
});

app.post("/mcp", (req, res) => {
  res.setHeader("MCP-Protocol-Version", MCP_PROTOCOL_VERSION);

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const method = String(body.method || req.get("Mcp-Method") || "").trim();
  const id = Object.prototype.hasOwnProperty.call(body, "id") ? body.id : null;

  if (!method) {
    return res.status(400).json(buildJsonRpcError(id, -32600, "Missing JSON-RPC method"));
  }

  if (method === "initialize") {
    const sessionId = createMcpSession(body.params?.clientInfo || {});
    res.setHeader("Mcp-Session-Id", sessionId);
    return res.json(
      buildJsonRpcSuccess(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false
          },
          resources: {
            listChanged: false
          }
        },
        serverInfo: appInfo,
        instructions:
          "Use tools/list and tools/call for tool access, and resources/list plus resources/read for memory resources."
      })
    );
  }

  const mcpSessionId = String(req.get("Mcp-Session-Id") || "").trim();
  if (mcpSessionId) {
    touchMcpSession(mcpSessionId);
  }

  if (method === "notifications/initialized") {
    return res.status(202).end();
  }

  if (method === "ping") {
    return res.json(buildJsonRpcSuccess(id, {}));
  }

  if (method === "tools/list") {
    return res.json(
      buildJsonRpcSuccess(id, {
        tools: listToolDefinitions()
      })
    );
  }

  if (method === "tools/call") {
    const toolName = String(body.params?.name || "").trim();
    if (!toolName) {
      return res.status(400).json(buildJsonRpcError(id, -32602, "tools/call requires params.name"));
    }

    const rawArgs = body.params?.arguments;
    const args = rawArgs && typeof rawArgs === "object" ? { ...rawArgs } : {};
    const contextSessionId = String(args.sessionId || mcpSessionId || "").trim();
    const contextMemoryScopeId = resolveLongTermMemoryScope(args.memoryScopeId, contextSessionId);
    delete args.sessionId;
    delete args.memoryScopeId;

    const result = callLocalTool(toolName, args, {
      sessionId: contextSessionId,
      memoryScopeId: contextMemoryScopeId,
      source: "mcp"
    });

    return res.json(buildJsonRpcSuccess(id, buildMcpToolCallResult(result)));
  }

  if (method === "resources/list") {
    return res.json(
      buildJsonRpcSuccess(id, {
        resources: listMcpResources()
      })
    );
  }

  if (method === "resources/read") {
    const resourceUri = String(body.params?.uri || "").trim();
    if (!resourceUri) {
      return res.status(400).json(buildJsonRpcError(id, -32602, "resources/read requires params.uri"));
    }

    try {
      const text = readMcpResource(resourceUri);
      return res.json(
        buildJsonRpcSuccess(id, {
          contents: [
            {
              uri: resourceUri,
              mimeType: "application/json",
              text
            }
          ]
        })
      );
    } catch (error) {
      return res.status(404).json(buildJsonRpcError(id, -32001, error?.message || "Resource not found"));
    }
  }

  return res.status(404).json(buildJsonRpcError(id, -32601, `Method not found: ${method}`));
});

app.get("/api/memory/long-term", (req, res) => {
  const sessionId = String(req.query.sessionId || "");
  const memoryScopeId = resolveLongTermMemoryScope(req.query.memoryScopeId, sessionId);
  if (!memoryScopeId) {
    return res.json({ sessionId: "", memoryScopeId: "", facts: [] });
  }

  migrateLegacySessionBucketToScope(memoryScopeId, sessionId);
  const { bucket } = getLongTermBucket(memoryScopeId);
  return res.json({
    sessionId,
    memoryScopeId,
    facts: (bucket.facts || []).map((item) => ({
      id: item.id,
      text: item.text,
      createdAt: item.createdAt,
      lastSeenAt: item.lastSeenAt
    }))
  });
});

app.post("/api/memory/long-term/clear", (req, res) => {
  const { sessionId, memoryScopeId } = req.body || {};
  const resolvedMemoryScopeId = resolveLongTermMemoryScope(memoryScopeId, sessionId);
  migrateLegacySessionBucketToScope(resolvedMemoryScopeId, sessionId);
  const removed = clearLongTermMemory(resolvedMemoryScopeId);
  return res.json({ ok: true, removed, memoryScopeId: resolvedMemoryScopeId });
});

app.post("/api/memory/long-term/delete", (req, res) => {
  const { sessionId, memoryScopeId, ids = [] } = req.body || {};
  const resolvedMemoryScopeId = resolveLongTermMemoryScope(memoryScopeId, sessionId);
  migrateLegacySessionBucketToScope(resolvedMemoryScopeId, sessionId);
  const removed = deleteLongTermFacts(resolvedMemoryScopeId, ids);
  return res.json({ ok: true, removed, memoryScopeId: resolvedMemoryScopeId });
});

app.post("/api/memory/clear", (req, res) => {
  const { sessionId, memoryScopeId, clearLongTerm = false } = req.body || {};
  if (sessionId) {
    sessions.delete(sessionId);
  }

  let removedLongTerm = 0;
  const resolvedMemoryScopeId = resolveLongTermMemoryScope(memoryScopeId, sessionId);
  if (clearLongTerm && resolvedMemoryScopeId) {
    migrateLegacySessionBucketToScope(resolvedMemoryScopeId, sessionId);
    removedLongTerm = clearLongTermMemory(resolvedMemoryScopeId);
  }

  res.json({ ok: true, removedLongTerm, memoryScopeId: resolvedMemoryScopeId });
});

app.post("/api/chat", async (req, res) => {
  const {
    sessionId,
    memoryScopeId,
    model,
    message,
    systemPrompt,
    useMemory = true,
    useLongTermMemory = true,
    autoRoute = true,
    useTools = true,
    imageUrl = "",
    imageUrls = [],
    documents = [],
    memoryTurns = 8,
    temperature = 0.7,
    topP = 1,
    maxTokens = 1024,
    frequencyPenalty = 0,
    presencePenalty = 0
  } = req.body || {};

  const normalizedSessionId = String(sessionId || "");
  const normalizedMemoryScopeId = resolveLongTermMemoryScope(memoryScopeId, normalizedSessionId);
  const normalizedImageUrls = sanitizeImageUrls(imageUrl, imageUrls);
  const normalizedDocuments = sanitizeUploadedDocuments(documents);
  const normalizedMessage = String(message || "").trim();

  if (!normalizedMessage && !normalizedImageUrls.length && !normalizedDocuments.length) {
    return res.status(400).json({ error: "message, image, or pdf is required" });
  }

  const userText = normalizedMessage || (normalizedDocuments.length ? "請整理這份 PDF 的重點。" : "請協助分析這張圖片。");
  migrateLegacySessionBucketToScope(normalizedMemoryScopeId, normalizedSessionId);

  const safeMemoryTurns = clampNumber(memoryTurns, 8, {
    min: 1,
    max: 30,
    integer: true
  });

  const safeTemperature = clampNumber(temperature, 0.7, { min: 0, max: 2 });
  const safeTopP = clampNumber(topP, 1, { min: 0, max: 1 });
  const safeMaxTokens = clampNumber(maxTokens, 1024, {
    min: 128,
    max: 4096,
    integer: true
  });
  const safeFrequencyPenalty = clampNumber(frequencyPenalty, 0, { min: -2, max: 2 });
  const safePresencePenalty = clampNumber(presencePenalty, 0, { min: -2, max: 2 });

  const extractedDocumentResult = await extractUploadedDocumentTexts(normalizedDocuments);
  const extractedDocuments = extractedDocumentResult.documents;
  const documentContext = buildDocumentContext(extractedDocuments);
  const documentWarnings = extractedDocumentResult.warnings;
  const promptText = documentContext ? `${userText}\n\n${documentContext}` : userText;

  const route = resolveModelRoute({
    requestedModel: model,
    message: promptText,
    imageUrls: normalizedImageUrls,
    hasDocumentContext: extractedDocuments.length > 0,
    autoRoute: Boolean(autoRoute)
  });

  if (normalizedImageUrls.length > 0 && !supportsImageInput(route.routedModel)) {
    route.routeWarnings = uniqueStrings([
      ...(route.routeWarnings || []),
      "目前選到的模型不支援直接讀圖，圖片會降級成附件提示。"
    ]);
  }

  if (documentWarnings.length) {
    route.routeWarnings = uniqueStrings([...(route.routeWarnings || []), ...documentWarnings]);
  }

  const previousMessages = useMemory ? normalizeStoredMessages(getSessionHistory(normalizedSessionId)) : [];
  const recentMessages = previousMessages.slice(-safeMemoryTurns * 2);
  const longTermFacts = useLongTermMemory ? getRelevantLongTermFacts(normalizedMemoryScopeId, userText, 6) : [];
  const baseMessages = [];
  const userMessage = {
    role: "user",
    content: buildUserContent(promptText, normalizedImageUrls, {
      allowImageInput: supportsImageInput(route.routedModel)
    })
  };

  if (systemPrompt && String(systemPrompt).trim()) {
    baseMessages.push({ role: "system", content: String(systemPrompt).trim() });
  }

  const longTermContext = buildLongTermContext(longTermFacts);
  if (longTermContext) {
    baseMessages.push({ role: "system", content: longTermContext });
  }

  baseMessages.push(...recentMessages);
  baseMessages.push(userMessage);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  sendSse(res, "route", {
    requestedModel: resolveManualModelName(model, defaultModel),
    routedModel: route.routedModel,
    reason: route.routeReason,
    label: route.routeLabel,
    autoRoute: Boolean(autoRoute),
    warnings: route.routeWarnings,
    diagnostics: routeDiagnostics
  });

  if (longTermFacts.length) {
    sendSse(res, "memory", {
      count: longTermFacts.length,
      facts: longTermFacts.map((item) => item.text),
      memoryScopeId: normalizedMemoryScopeId
    });
  }

  if (extractedDocuments.length) {
    sendSse(res, "document", {
      count: extractedDocuments.length,
      documents: extractedDocuments.map((item) => item.name),
      warnings: documentWarnings
    });
  }

  let messages = [...baseMessages];
  let toolResults = [];
  let toolMode = Boolean(useTools) ? "none" : "disabled";

  if (Boolean(useTools)) {
    const nativeToolPlan = await maybePlanNativeToolCall({
      model: route.routedModel,
      messages: baseMessages,
      useTools: Boolean(useTools),
      sessionId: normalizedSessionId,
      memoryScopeId: normalizedMemoryScopeId,
      temperature: safeTemperature,
      topP: safeTopP,
      maxTokens: safeMaxTokens
    });

    if (nativeToolPlan.used) {
      toolResults = nativeToolPlan.results;
      messages = nativeToolPlan.messages;

      const nativeToolContext = buildToolContext(toolResults);
      if (nativeToolContext) {
        messages = [
          ...messages,
          {
            role: "system",
            content: `${nativeToolContext}\n請直接根據以上工具結果回答；若工具已提供資訊，不要說你無法取得資料。`
          }
        ];
      }

      toolMode = "native";
    } else {
      toolResults = maybeRunHeuristicTools({
        message: userText,
        useTools: Boolean(useTools),
        sessionId: normalizedSessionId,
        memoryScopeId: normalizedMemoryScopeId
      });

      if (toolResults.length) {
        const heuristicMessages = [];
        if (systemPrompt && String(systemPrompt).trim()) {
          heuristicMessages.push({ role: "system", content: String(systemPrompt).trim() });
        }
        if (longTermContext) {
          heuristicMessages.push({ role: "system", content: longTermContext });
        }

        const toolContext = buildToolContext(toolResults);
        if (toolContext) {
          heuristicMessages.push({ role: "system", content: toolContext });
        }

        heuristicMessages.push(...recentMessages);
        heuristicMessages.push(userMessage);
        messages = heuristicMessages;
        toolMode = "heuristic";
      } else if (nativeToolPlan.error) {
        toolMode = "native-fallback-none";
        sendSse(res, "tool_mode", {
          mode: toolMode,
          message: nativeToolPlan.error
        });
      }
    }
  }

  sendSse(res, "tool_mode", {
    mode: toolMode,
    nativeAvailable: true
  });

  if (toolResults.length) {
    for (const result of toolResults) {
      sendSse(res, "tool", result);
    }
  }

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) {
      abortController.abort();
    }
  });

  let assistantText = "";

  try {
    const isReasoningModel =
      activeProvider === "xai" &&
      (/^grok-4(\.|-|$)/i.test(route.routedModel) || /reasoning/i.test(route.routedModel));

    const requestPayload = {
      model: route.routedModel,
      messages,
      stream: true,
      temperature: safeTemperature,
      top_p: safeTopP,
      max_tokens: safeMaxTokens
    };

    if (!isReasoningModel) {
      requestPayload.frequency_penalty = safeFrequencyPenalty;
      requestPayload.presence_penalty = safePresencePenalty;
    }

    const stream = await client.chat.completions.create(requestPayload, {
      signal: abortController.signal
    });

    for await (const chunk of stream) {
      const contentDelta = chunk.choices?.[0]?.delta?.content;
      const deltaText = normalizeAssistantContent(contentDelta);

      if (!deltaText) continue;

      assistantText += deltaText;
      sendSse(res, "delta", { content: deltaText });
    }

    if (useMemory && normalizedSessionId) {
      const updatedHistory = [
        ...previousMessages,
        {
          role: "user",
          content: buildStoredUserHistoryContent(userText, normalizedImageUrls, normalizedDocuments)
        },
        { role: "assistant", content: assistantText }
      ].slice(-safeMemoryTurns * 2);

      setSessionHistory(normalizedSessionId, updatedHistory);
    }

    if (!useMemory && normalizedSessionId) {
      sessions.delete(normalizedSessionId);
    }

    let memoryChanges = {
      added: [],
      updated: []
    };
    if (useLongTermMemory && normalizedMemoryScopeId) {
      memoryChanges = upsertLongTermFacts(normalizedMemoryScopeId, extractLongTermFactsFromMessage(userText));
    }

    const addedFacts = Array.isArray(memoryChanges.added) ? memoryChanges.added : [];
    const updatedFacts = Array.isArray(memoryChanges.updated) ? memoryChanges.updated : [];
    if (addedFacts.length || updatedFacts.length) {
      sendSse(res, "memory_update", {
        count: addedFacts.length + updatedFacts.length,
        added: addedFacts,
        updated: updatedFacts,
        addedCount: addedFacts.length,
        updatedCount: updatedFacts.length,
        memoryScopeId: normalizedMemoryScopeId
      });
    }

    sendSse(res, "done", {
      content: assistantText,
      routedModel: route.routedModel,
      routeReason: route.routeReason,
      toolMode
    });
    res.end();
  } catch (error) {
    const messageText =
      error?.status === 401
        ? "API key invalid or missing permission"
        : error?.message || "Unknown error";

    sendSse(res, "error", { message: messageText });
    res.end();
  }
});

app.use(express.static(frontendDir));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  return res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(port, () => {
  console.log(
    `Server is running on http://localhost:${port} (provider=${activeProvider}, baseURL=${resolvedBaseUrl || "default"})`
  );
});
