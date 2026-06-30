(() => {
  // Code-versioned prompt library + sync-backed user state.
  //
  // Model:
  // - The selectable prompt LIBRARY is defined in code (prompts/custom/*.md) and
  //   enumerated by prompts/custom/index.json. Built-in content is the packaged
  //   file; it is re-hydrated per install and never synced.
  // - chrome.storage.sync holds only lightweight, user-specific state, one item
  //   per prompt to respect QUOTA_BYTES_PER_ITEM (~8 KB):
  //     ottercopy:activePromptId   -> id of the active prompt
  //     ottercopy:override:<id>    -> { content, name?, createdAt, updatedAt } for an edited built-in
  //     ottercopy:custom:<id>      -> { id, name, content, createdAt, updatedAt } user-created prompt
  //   Built-ins with no override cost zero sync bytes.
  // - A one-shot migration folds the legacy chrome.storage.local "ottercopyPrompts"
  //   array into the per-key sync model.

  const INDEX_PATH = "prompts/custom/index.json";

  const ACTIVE_KEY = "ottercopy:activePromptId";
  const OVERRIDE_PREFIX = "ottercopy:override:";
  const CUSTOM_PREFIX = "ottercopy:custom:";
  const MIGRATED_KEY = "ottercopy:migratedV2";

  const LEGACY_LOCAL_KEY = "ottercopyPrompts";

  const SYNC_ITEM_LIMIT =
    (chrome.storage && chrome.storage.sync && chrome.storage.sync.QUOTA_BYTES_PER_ITEM) || 8192;

  let indexCache = null;

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createId() {
    return `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function syncItemFits(key, value) {
    return key.length + JSON.stringify(value).length <= SYNC_ITEM_LIMIT;
  }

  function assertSyncItemFits(key, value) {
    if (!syncItemFits(key, value)) {
      throw new Error(
        `Prompt is too large to sync (limit ~${SYNC_ITEM_LIMIT} bytes per item). Shorten it.`,
      );
    }
  }

  async function loadFileContent(path) {
    const response = await fetch(chrome.runtime.getURL(path));
    if (!response.ok) {
      throw new Error(`Could not load packaged prompt: ${path}`);
    }
    return normalizeString(await response.text());
  }

  async function loadIndex() {
    if (indexCache) return indexCache;
    const response = await fetch(chrome.runtime.getURL(INDEX_PATH));
    if (!response.ok) {
      throw new Error("Could not load prompt library index.");
    }
    const parsed = await response.json();
    indexCache = (Array.isArray(parsed) ? parsed : [])
      .map((entry) => ({
        id: normalizeString(entry && entry.id),
        name: normalizeString(entry && entry.name) || "Prompt",
        file: normalizeString(entry && entry.file),
        order: Number(entry && entry.order) || 0,
      }))
      .filter((entry) => entry.id && entry.file)
      .sort((a, b) => a.order - b.order);
    return indexCache;
  }

  async function readSyncState() {
    const all = await chrome.storage.sync.get(null);
    const overrides = {};
    const customs = [];
    let activeId = "";

    for (const [key, value] of Object.entries(all || {})) {
      if (key === ACTIVE_KEY) {
        activeId = normalizeString(value);
      } else if (key.startsWith(OVERRIDE_PREFIX)) {
        overrides[key.slice(OVERRIDE_PREFIX.length)] = value || {};
      } else if (key.startsWith(CUSTOM_PREFIX)) {
        if (value && normalizeString(value.id)) customs.push(value);
      }
    }

    return { activeId, overrides, customs };
  }

  function buildBuiltIn(entry, override) {
    const hasOverride = override && typeof override.content === "string";
    return {
      id: entry.id,
      name: (hasOverride && normalizeString(override.name)) || entry.name,
      content: hasOverride ? normalizeString(override.content) : entry.content,
      sourcePath: entry.file,
      builtIn: true,
      active: false,
      createdAt: (hasOverride && normalizeString(override.createdAt)) || "",
      updatedAt: (hasOverride && normalizeString(override.updatedAt)) || "",
    };
  }

  function buildCustom(custom) {
    return {
      id: normalizeString(custom.id),
      name: normalizeString(custom.name) || "Prompt",
      content: normalizeString(custom.content),
      sourcePath: "",
      builtIn: false,
      active: false,
      createdAt: normalizeString(custom.createdAt),
      updatedAt: normalizeString(custom.updatedAt),
    };
  }

  function applyActive(prompts, activeId) {
    const target =
      (activeId && prompts.find((prompt) => prompt.id === activeId)) || prompts[0] || null;
    prompts.forEach((prompt) => {
      prompt.active = prompt === target;
    });
    return prompts;
  }

  async function getPrompts() {
    await migrateLegacyIfNeeded();

    const index = await loadIndex();
    const state = await readSyncState();

    // Hydrate packaged content for built-ins that are NOT overridden.
    await Promise.all(
      index.map(async (entry) => {
        if (!state.overrides[entry.id]) {
          entry.content = await loadFileContent(entry.file);
        }
      }),
    );

    const builtIns = index.map((entry) => buildBuiltIn(entry, state.overrides[entry.id]));
    const customs = state.customs.map(buildCustom).filter((prompt) => prompt.id);

    return applyActive([...builtIns, ...customs], state.activeId);
  }

  function getActivePrompt(prompts) {
    if (!Array.isArray(prompts)) return null;
    return prompts.find((prompt) => prompt && prompt.active) || null;
  }

  async function builtInIdSet() {
    const index = await loadIndex();
    return new Set(index.map((entry) => entry.id));
  }

  async function upsertPrompt(payload) {
    const now = new Date().toISOString();
    const builtIns = await builtInIdSet();
    const name = normalizeString(payload && payload.name);
    const content = normalizeString(payload && payload.content);
    let id = normalizeString(payload && payload.id);

    if (id && builtIns.has(id)) {
      // Editing a built-in writes an override; the packaged file stays canonical.
      const key = OVERRIDE_PREFIX + id;
      const existing = (await chrome.storage.sync.get(key))[key] || {};
      const override = {
        content,
        name: name || undefined,
        createdAt: normalizeString(existing.createdAt) || now,
        updatedAt: now,
      };
      assertSyncItemFits(key, override);
      await chrome.storage.sync.set({ [key]: override });
    } else {
      // Create or update a user prompt.
      if (!id || builtIns.has(id)) id = createId();
      const key = CUSTOM_PREFIX + id;
      const existing = (await chrome.storage.sync.get(key))[key] || {};
      const custom = {
        id,
        name: name || normalizeString(existing.name) || "Prompt",
        content,
        createdAt: normalizeString(existing.createdAt) || now,
        updatedAt: now,
      };
      assertSyncItemFits(key, custom);
      await chrome.storage.sync.set({ [key]: custom });
    }

    if (payload && payload.active) {
      await chrome.storage.sync.set({ [ACTIVE_KEY]: id });
    }

    return getPrompts();
  }

  async function activatePrompt(promptId) {
    const id = normalizeString(promptId);
    const prompts = await getPrompts();
    if (!prompts.some((prompt) => prompt.id === id)) {
      throw new Error("Prompt not found.");
    }
    await chrome.storage.sync.set({ [ACTIVE_KEY]: id });
    return getPrompts();
  }

  async function deletePrompt(promptId) {
    const id = normalizeString(promptId);
    const builtIns = await builtInIdSet();
    if (builtIns.has(id)) {
      throw new Error("Built-in prompts cannot be deleted. Edit or reset them instead.");
    }

    const key = CUSTOM_PREFIX + id;
    const existing = await chrome.storage.sync.get(key);
    if (!existing[key]) {
      throw new Error("Prompt not found.");
    }

    await chrome.storage.sync.remove(key);

    const activeData = await chrome.storage.sync.get(ACTIVE_KEY);
    if (normalizeString(activeData[ACTIVE_KEY]) === id) {
      await chrome.storage.sync.remove(ACTIVE_KEY);
    }

    return getPrompts();
  }

  async function resetBuiltInPrompt(promptId) {
    const id = normalizeString(promptId);
    const builtIns = await builtInIdSet();
    if (!builtIns.has(id)) {
      throw new Error("Only built-in prompts can be reset.");
    }
    await chrome.storage.sync.remove(OVERRIDE_PREFIX + id);
    return getPrompts();
  }

  async function migrateLegacyIfNeeded() {
    const flag = await chrome.storage.sync.get(MIGRATED_KEY);
    if (flag[MIGRATED_KEY]) return;

    try {
      const legacy = await chrome.storage.local.get(LEGACY_LOCAL_KEY);
      const entries = legacy[LEGACY_LOCAL_KEY];

      if (Array.isArray(entries) && entries.length > 0) {
        const index = await loadIndex();
        const builtIns = new Map(index.map((entry) => [entry.id, entry]));
        const writes = {};
        let activeId = "";

        for (const prompt of entries) {
          const id = normalizeString(prompt && prompt.id);
          if (!id) continue;
          const content = normalizeString(prompt && prompt.content);
          const name = normalizeString(prompt && prompt.name);
          if (prompt && prompt.active) activeId = id;

          const builtInEntry = builtIns.get(id);
          if (builtInEntry) {
            // Only carry forward a built-in edit that differs from the packaged file.
            const packaged = await loadFileContent(builtInEntry.file);
            if (content && content !== packaged) {
              const key = OVERRIDE_PREFIX + id;
              const override = {
                content,
                name: name && name !== builtInEntry.name ? name : undefined,
                createdAt: normalizeString(prompt.createdAt) || "",
                updatedAt: normalizeString(prompt.updatedAt) || "",
              };
              if (syncItemFits(key, override)) writes[key] = override;
            }
          } else if (!(prompt && prompt.builtIn)) {
            // Legacy user-created prompt.
            const key = CUSTOM_PREFIX + id;
            const custom = {
              id,
              name: name || "Prompt",
              content,
              createdAt: normalizeString(prompt.createdAt) || "",
              updatedAt: normalizeString(prompt.updatedAt) || "",
            };
            if (syncItemFits(key, custom)) writes[key] = custom;
          }
        }

        if (activeId) writes[ACTIVE_KEY] = activeId;
        if (Object.keys(writes).length > 0) {
          await chrome.storage.sync.set(writes);
        }
      }
    } catch (error) {
      // Migration is best-effort; never block prompt loading on it.
      console.warn("OtterCopy prompt migration skipped:", error);
    }

    await chrome.storage.sync.set({ [MIGRATED_KEY]: true });
  }

  globalThis.OtterCopyPromptStore = {
    activatePrompt,
    deletePrompt,
    getActivePrompt,
    getPrompts,
    resetBuiltInPrompt,
    upsertPrompt,
  };
})();
