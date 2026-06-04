(() => {
  const STORAGE_KEY = "ottercopyPrompts";
  const DEFAULT_PROMPT_PATH = "prompts/refinement.md";

  const DEFAULT_PROMPT = Object.freeze({
    id: "prompt-refinement",
    name: "Refinement",
    content: "",
    sourcePath: DEFAULT_PROMPT_PATH,
    builtIn: true,
    active: true,
    createdAt: "",
    updatedAt: "",
  });

  function normalizeString(value) {
    return String(value == null ? "" : value).trim();
  }

  function createId() {
    return `prompt-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  async function loadDefaultPromptContent() {
    const response = await fetch(chrome.runtime.getURL(DEFAULT_PROMPT_PATH));
    if (!response.ok) {
      throw new Error("Could not load default refinement prompt.");
    }

    return response.text();
  }

  function normalizePrompt(prompt, index = 0) {
    const now = new Date().toISOString();
    const base = index === 0 ? DEFAULT_PROMPT : {};
    return {
      id: normalizeString(prompt && prompt.id) || (index === 0 ? DEFAULT_PROMPT.id : createId()),
      name: normalizeString(prompt && prompt.name) || base.name || "Prompt",
      content: normalizeString(prompt && prompt.content),
      sourcePath: normalizeString(prompt && prompt.sourcePath) || base.sourcePath || "",
      builtIn: Boolean(prompt && prompt.builtIn),
      active: Boolean(prompt && prompt.active),
      createdAt: normalizeString(prompt && prompt.createdAt) || now,
      updatedAt: normalizeString(prompt && prompt.updatedAt) || now,
    };
  }

  function ensureOneActive(prompts) {
    if (!prompts.some((prompt) => prompt.active) && prompts[0]) {
      prompts[0].active = true;
    }

    let activeSeen = false;
    prompts.forEach((prompt) => {
      if (!prompt.active) return;
      if (!activeSeen) {
        activeSeen = true;
        return;
      }
      prompt.active = false;
    });

    return prompts;
  }

  function normalizePrompts(value) {
    const source = Array.isArray(value) && value.length > 0 ? value : [DEFAULT_PROMPT];
    const seen = new Set();
    const prompts = source
      .map(normalizePrompt)
      .filter((prompt) => {
        const key = prompt.id.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return ensureOneActive(prompts.length > 0 ? prompts : [normalizePrompt(DEFAULT_PROMPT)]);
  }

  async function hydrateBuiltInPrompts(prompts) {
    let changed = false;
    const hydrated = [];
    const defaultPromptContent = await loadDefaultPromptContent();

    for (const prompt of prompts) {
      if (
        prompt.builtIn &&
        prompt.sourcePath === DEFAULT_PROMPT_PATH &&
        shouldRefreshBuiltInPromptContent(prompt.content, defaultPromptContent)
      ) {
        hydrated.push({
          ...prompt,
          content: defaultPromptContent,
        });
        changed = true;
      } else {
        hydrated.push(prompt);
      }
    }

    return { prompts: hydrated, changed };
  }

  function shouldRefreshBuiltInPromptContent(currentContent, defaultContent) {
    const current = normalizeString(currentContent);
    const packaged = normalizeString(defaultContent);
    if (!current) return true;
    return current.includes("### Objective") && !packaged.includes("### Objective");
  }

  async function getPrompts() {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const normalized = normalizePrompts(data[STORAGE_KEY]);
    const hydrated = await hydrateBuiltInPrompts(normalized);
    if (hydrated.changed || !Array.isArray(data[STORAGE_KEY])) {
      await savePrompts(hydrated.prompts);
    }
    return hydrated.prompts;
  }

  async function savePrompts(prompts) {
    const normalized = normalizePrompts(prompts);
    await chrome.storage.local.set({ [STORAGE_KEY]: normalized });
    return normalized;
  }

  async function upsertPrompt(payload) {
    const prompts = await getPrompts();
    const now = new Date().toISOString();
    const incoming = normalizePrompt({
      ...payload,
      id: normalizeString(payload && payload.id) || createId(),
      updatedAt: now,
      createdAt: normalizeString(payload && payload.createdAt) || now,
    });
    const existingIndex = prompts.findIndex(
      (prompt) => prompt.id.toLowerCase() === incoming.id.toLowerCase(),
    );

    if (incoming.active) {
      prompts.forEach((prompt) => {
        prompt.active = false;
      });
    }

    if (existingIndex >= 0) {
      incoming.createdAt = prompts[existingIndex].createdAt;
      incoming.builtIn = prompts[existingIndex].builtIn;
      incoming.sourcePath = prompts[existingIndex].sourcePath;
      prompts[existingIndex] = incoming;
    } else {
      prompts.push(incoming);
    }

    return savePrompts(prompts);
  }

  async function deletePrompt(promptId) {
    const normalizedId = normalizeString(promptId).toLowerCase();
    const prompts = await getPrompts();
    if (prompts.length <= 1) {
      throw new Error("At least one prompt must remain configured.");
    }

    const prompt = prompts.find((entry) => entry.id.toLowerCase() === normalizedId);
    if (!prompt) {
      throw new Error("Prompt not found.");
    }

    if (prompt.builtIn) {
      throw new Error("Built-in prompts cannot be deleted. Edit or reset them instead.");
    }

    return savePrompts(prompts.filter((entry) => entry.id.toLowerCase() !== normalizedId));
  }

  async function activatePrompt(promptId) {
    const normalizedId = normalizeString(promptId).toLowerCase();
    const prompts = await getPrompts();
    let found = false;

    prompts.forEach((prompt) => {
      const isTarget = prompt.id.toLowerCase() === normalizedId;
      prompt.active = isTarget;
      if (isTarget) {
        prompt.updatedAt = new Date().toISOString();
        found = true;
      }
    });

    if (!found) {
      throw new Error("Prompt not found.");
    }

    return savePrompts(prompts);
  }

  async function resetBuiltInPrompt(promptId) {
    const normalizedId = normalizeString(promptId).toLowerCase();
    const prompts = await getPrompts();
    const prompt = prompts.find((entry) => entry.id.toLowerCase() === normalizedId);
    if (!prompt || !prompt.builtIn || prompt.sourcePath !== DEFAULT_PROMPT_PATH) {
      throw new Error("Only the built-in refinement prompt can be reset.");
    }

    prompt.content = await loadDefaultPromptContent();
    prompt.updatedAt = new Date().toISOString();
    return savePrompts(prompts);
  }

  function getActivePrompt(prompts) {
    return normalizePrompts(prompts).find((prompt) => prompt.active) || null;
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
