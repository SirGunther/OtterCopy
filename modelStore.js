(() => {
  const STORAGE_KEY = "ottercopyModels";

  const DEFAULT_MODEL = Object.freeze({
    id: "model-google-gemma-4-31b-it",
    name: "Gemma 4 31B (Google)",
    provider: "google",
    adapter: "google-genai",
    model: "gemma-4-31b-it",
    apiKey: "",
    baseUrl: "",
    headers: {},
    options: {},
    active: true,
    finalPassActive: false,
    createdAt: "",
    updatedAt: "",
  });

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createId() {
    return `model-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return { ...value };
  }

  function normalizeAdapter(provider, adapter) {
    const normalizedAdapter = normalizeString(adapter).toLowerCase();
    if (normalizedAdapter) {
      return normalizedAdapter;
    }

    const normalizedProvider = normalizeString(provider).toLowerCase();
    if (
      normalizedProvider === "openai" ||
      normalizedProvider === "openai-compatible" ||
      normalizedProvider === "groq" ||
      normalizedProvider === "llama"
    ) {
      return "openai-compatible";
    }

    return "google-genai";
  }

  function normalizeModel(model, index = 0) {
    const now = new Date().toISOString();
    const base = index === 0 ? DEFAULT_MODEL : {};
    const provider = normalizeString(model && model.provider) || base.provider || "google";
    const adapter = normalizeAdapter(provider, model && model.adapter);
    const modelName =
      normalizeString(model && model.model) ||
      normalizeString(model && model.modelName) ||
      base.model ||
      "";

    return {
      id: normalizeString(model && model.id) || (index === 0 ? DEFAULT_MODEL.id : createId()),
      name: normalizeString(model && model.name) || modelName || base.name || "AI model",
      provider,
      adapter,
      model: modelName,
      apiKey: normalizeString(model && model.apiKey),
      baseUrl: normalizeString(model && model.baseUrl),
      headers: normalizeObject(model && model.headers),
      options: normalizeObject(model && model.options),
      active: Boolean(model && model.active),
      finalPassActive: Boolean(model && model.finalPassActive),
      createdAt: normalizeString(model && model.createdAt) || now,
      updatedAt: normalizeString(model && model.updatedAt) || now,
    };
  }

  function ensureOneActive(models) {
    if (!models.some((model) => model.active) && models[0]) {
      models[0].active = true;
    }

    let activeSeen = false;
    models.forEach((model) => {
      if (!model.active) return;
      if (!activeSeen) {
        activeSeen = true;
        return;
      }
      model.active = false;
    });

    return models;
  }

  function ensureOneFinalPassActive(models) {
    let finalPassSeen = false;
    models.forEach((model) => {
      if (!model.finalPassActive) return;
      if (!finalPassSeen) {
        finalPassSeen = true;
        return;
      }
      model.finalPassActive = false;
    });

    return models;
  }

  function normalizeModels(value) {
    const source = Array.isArray(value) && value.length > 0 ? value : [DEFAULT_MODEL];
    const seen = new Set();
    const models = source
      .map(normalizeModel)
      .filter((model) => {
        const key = model.id.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return ensureOneFinalPassActive(
      ensureOneActive(models.length > 0 ? models : [normalizeModel(DEFAULT_MODEL)]),
    );
  }

  function storageGet(key) {
    return chrome.storage.local.get(key);
  }

  function storageSet(value) {
    return chrome.storage.local.set(value);
  }

  async function getModels() {
    const data = await storageGet(STORAGE_KEY);
    const models = normalizeModels(data[STORAGE_KEY]);
    await storageSet({ [STORAGE_KEY]: models });
    return models;
  }

  async function saveModels(models) {
    const normalized = normalizeModels(models);
    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function upsertModel(payload) {
    const models = await getModels();
    const now = new Date().toISOString();
    const incoming = normalizeModel({
      ...payload,
      id: normalizeString(payload && payload.id) || createId(),
      updatedAt: now,
      createdAt: normalizeString(payload && payload.createdAt) || now,
    });
    const existingIndex = models.findIndex(
      (model) => model.id.toLowerCase() === incoming.id.toLowerCase(),
    );

    if (incoming.active) {
      models.forEach((model) => {
        model.active = false;
      });
    }
    if (incoming.finalPassActive) {
      models.forEach((model) => {
        model.finalPassActive = false;
      });
    }

    if (existingIndex >= 0) {
      incoming.createdAt = models[existingIndex].createdAt;
      models[existingIndex] = incoming;
    } else {
      models.push(incoming);
    }

    return saveModels(models);
  }

  async function deleteModel(modelId) {
    const normalizedId = normalizeString(modelId).toLowerCase();
    const models = await getModels();
    if (models.length <= 1) {
      throw new Error("At least one model must remain configured.");
    }

    const nextModels = models.filter((model) => model.id.toLowerCase() !== normalizedId);
    if (nextModels.length === models.length) {
      throw new Error("Model not found.");
    }

    return saveModels(nextModels);
  }

  async function activateModel(modelId) {
    const normalizedId = normalizeString(modelId).toLowerCase();
    const models = await getModels();
    let found = false;

    models.forEach((model) => {
      const isTarget = model.id.toLowerCase() === normalizedId;
      model.active = isTarget;
      if (isTarget) {
        model.updatedAt = new Date().toISOString();
        found = true;
      }
    });

    if (!found) {
      throw new Error("Model not found.");
    }

    return saveModels(models);
  }

  async function activateFinalPassModel(modelId) {
    const normalizedId = normalizeString(modelId).toLowerCase();
    const models = await getModels();
    let found = false;

    models.forEach((model) => {
      const isTarget = model.id.toLowerCase() === normalizedId;
      model.finalPassActive = isTarget;
      if (isTarget) {
        model.updatedAt = new Date().toISOString();
        found = true;
      }
    });

    if (!found) {
      throw new Error("Model not found.");
    }

    return saveModels(models);
  }

  async function clearFinalPassModel() {
    const models = await getModels();
    models.forEach((model) => {
      model.finalPassActive = false;
    });
    return saveModels(models);
  }

  function getActiveModel(models) {
    return normalizeModels(models).find((model) => model.active) || null;
  }

  function getFinalPassModel(models) {
    return normalizeModels(models).find((model) => model.finalPassActive) || null;
  }

  globalThis.OtterCopyModelStore = {
    activateFinalPassModel,
    activateModel,
    clearFinalPassModel,
    deleteModel,
    getActiveModel,
    getFinalPassModel,
    getModels,
    upsertModel,
  };
})();
