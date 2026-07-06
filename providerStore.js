(() => {
  // Provider-level credentials. A provider holds one API key shared by every model
  // that links to it (model.providerId), so a key is entered once per provider
  // instead of once per model. A model's own apiKey, when set, overrides the provider's.
  const STORAGE_KEY = "ottercopyProviders";
  // One-shot flag: providers were seeded from the pre-provider per-model key model.
  const MIGRATION_FLAG = "ottercopy:providersMigratedV1";

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createId() {
    return `provider-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  // Deterministic id from a provider name so the migration is idempotent even if it
  // runs twice (e.g. popup and background racing on first load).
  function providerIdForName(name) {
    const slug = normalizeString(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug ? `provider-${slug}` : "";
  }

  function normalizeObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }
    return { ...value };
  }

  function normalizeProvider(provider) {
    const now = new Date().toISOString();
    const providerName =
      normalizeString(provider && provider.provider) ||
      normalizeString(provider && provider.name) ||
      "provider";

    return {
      id:
        normalizeString(provider && provider.id) ||
        providerIdForName(providerName) ||
        createId(),
      provider: providerName,
      name: normalizeString(provider && provider.name) || providerName,
      apiKey: normalizeString(provider && provider.apiKey),
      baseUrl: normalizeString(provider && provider.baseUrl),
      headers: normalizeObject(provider && provider.headers),
      createdAt: normalizeString(provider && provider.createdAt) || now,
      updatedAt: normalizeString(provider && provider.updatedAt) || now,
    };
  }

  function normalizeProviders(value) {
    const source = Array.isArray(value) ? value : [];
    const seen = new Set();
    return source
      .map(normalizeProvider)
      .filter((provider) => {
        const key = provider.id.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function storageGet(key) {
    return chrome.storage.local.get(key);
  }

  function storageSet(value) {
    return chrome.storage.local.set(value);
  }

  async function getProviders() {
    const data = await storageGet(STORAGE_KEY);
    return normalizeProviders(data[STORAGE_KEY]);
  }

  async function saveProviders(providers) {
    const normalized = normalizeProviders(providers);
    await storageSet({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function upsertProvider(payload) {
    const providers = await getProviders();
    const now = new Date().toISOString();
    const incoming = normalizeProvider({
      ...payload,
      id: normalizeString(payload && payload.id) || createId(),
      updatedAt: now,
      createdAt: normalizeString(payload && payload.createdAt) || now,
    });
    const existingIndex = providers.findIndex(
      (provider) => provider.id.toLowerCase() === incoming.id.toLowerCase(),
    );

    if (existingIndex >= 0) {
      incoming.createdAt = providers[existingIndex].createdAt;
      providers[existingIndex] = incoming;
    } else {
      providers.push(incoming);
    }

    return saveProviders(providers);
  }

  async function deleteProvider(providerId) {
    const normalizedId = normalizeString(providerId).toLowerCase();
    const providers = await getProviders();
    const nextProviders = providers.filter(
      (provider) => provider.id.toLowerCase() !== normalizedId,
    );
    if (nextProviders.length === providers.length) {
      throw new Error("Provider not found.");
    }
    return saveProviders(nextProviders);
  }

  // Sync lookup against an already-loaded providers array (mirrors modelStore.getActiveModel).
  function getProvider(providers, providerId) {
    const id = normalizeString(providerId).toLowerCase();
    if (!id) return null;
    return normalizeProviders(providers).find(
      (provider) => provider.id.toLowerCase() === id,
    ) || null;
  }

  // Seed a provider per distinct model.provider that carries a key, link each model
  // to it, and leave the per-model apiKey intact so nothing breaks mid-migration.
  // Idempotent: deterministic ids + a flag make a double-run a no-op.
  async function migrateFromModelsIfNeeded() {
    const flagData = await storageGet(MIGRATION_FLAG);
    if (flagData[MIGRATION_FLAG]) return;

    const modelStore = globalThis.OtterCopyModelStore;
    if (!modelStore || typeof modelStore.getModels !== "function") return;

    let models;
    try {
      models = await modelStore.getModels();
    } catch {
      return;
    }

    const providers = await getProviders();
    const byId = new Map(providers.map((provider) => [provider.id.toLowerCase(), provider]));
    let modelsChanged = false;

    models.forEach((model) => {
      const providerName = normalizeString(model.provider);
      if (!providerName) return;

      const providerId = providerIdForName(providerName);
      if (!providerId) return;
      const lookupKey = providerId.toLowerCase();
      const modelKey = normalizeString(model.apiKey);

      if (!byId.has(lookupKey)) {
        byId.set(
          lookupKey,
          normalizeProvider({
            id: providerId,
            provider: providerName,
            name: providerName,
            apiKey: modelKey,
            baseUrl: normalizeString(model.baseUrl),
          }),
        );
      } else if (modelKey && !byId.get(lookupKey).apiKey) {
        byId.get(lookupKey).apiKey = modelKey;
      }

      if (!normalizeString(model.providerId)) {
        model.providerId = providerId;
        modelsChanged = true;
      }
    });

    await saveProviders(Array.from(byId.values()));
    if (modelsChanged && typeof modelStore.saveModels === "function") {
      await modelStore.saveModels(models);
    }
    await storageSet({ [MIGRATION_FLAG]: true });
  }

  globalThis.OtterCopyProviderStore = {
    deleteProvider,
    getProvider,
    getProviders,
    migrateFromModelsIfNeeded,
    saveProviders,
    upsertProvider,
  };
})();
