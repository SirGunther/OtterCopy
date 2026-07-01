(() => {
  // Practical ceiling for a single model call. Chrome terminates an MV3 service
  // worker around the 5-minute mark for one in-flight request, so a longer
  // timeout cannot be honored here; >5 min would require an offscreen document.
  const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

  function normalizeString(value) {
    return String(value == null ? "" : value)
      .trim()
      .replace(/\s+/g, " ");
  }

  function createProviderError(statusCode, message, extras = {}) {
    const error = new Error(message);
    error.statusCode = statusCode;
    Object.assign(error, extras);
    return error;
  }

  // fetch with an AbortController-based timeout so a hung provider fails loudly
  // instead of waiting forever (which would let the worker die silently).
  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw createProviderError(
          504,
          `Model request timed out after ${Math.round(timeoutMs / 1000)}s.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function resolveModelApiKey(modelConfig = {}) {
    return normalizeString(modelConfig.apiKey);
  }

  function toAdapterName(modelConfig = {}) {
    const raw = normalizeString(modelConfig.adapter || modelConfig.provider).toLowerCase();
    if (!raw || raw === "google") {
      return "google-genai";
    }

    if (raw === "openai") {
      return "openai-compatible";
    }

    return raw;
  }

  function toModelName(modelConfig = {}) {
    return normalizeString(modelConfig.model || modelConfig.modelName || "");
  }

  function toHeaderMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    const headers = {};
    Object.entries(value).forEach(([name, headerValue]) => {
      const normalizedName = normalizeString(name);
      const normalizedValue = normalizeString(headerValue);
      if (normalizedName && normalizedValue) {
        headers[normalizedName] = normalizedValue;
      }
    });
    return headers;
  }

  function toOptionsMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return { ...value };
  }

  function toOpenAiCompatibleEndpoint(modelConfig = {}) {
    const configured = normalizeString(modelConfig.baseUrl);
    return configured || "https://api.openai.com/v1/chat/completions";
  }

  function toGoogleGenerateContentEndpoint(modelConfig = {}) {
    const modelName = encodeURIComponent(toModelName(modelConfig));
    return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  }

  function buildOpenAiCompatiblePayload({ modelConfig, contents, config }) {
    return {
      model: toModelName(modelConfig),
      messages: [{ role: "user", content: String(contents || "") }],
      ...toOptionsMap(config),
      ...toOptionsMap(modelConfig && modelConfig.options),
    };
  }

  function buildGoogleGenerateContentPayload({ modelConfig, contents, config }) {
    const options = {
      ...toOptionsMap(config),
      ...toOptionsMap(modelConfig && modelConfig.options),
    };
    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: String(contents || "") }],
        },
      ],
    };

    if (Object.keys(options).length > 0) {
      payload.generationConfig = options;
    }

    return payload;
  }

  function normalizeOpenAiMessageText(value) {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          if (typeof part.text === "string") return part.text;
          return "";
        })
        .join("")
        .trim();
    }

    return "";
  }

  function normalizeGoogleCandidateText(candidate) {
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : [];

    return parts
      .map((part) => (part && typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }

  async function readResponseJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function getProviderErrorMessage(body, fallback) {
    if (body && body.error) {
      if (typeof body.error === "string") return body.error;
      if (typeof body.error.message === "string") return body.error.message;
    }

    return fallback;
  }

  async function generateWithOpenAiCompatible({ apiKey, modelConfig, contents, config, timeoutMs }) {
    const response = await fetchWithTimeout(
      toOpenAiCompatibleEndpoint(modelConfig),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...toHeaderMap(modelConfig && modelConfig.headers),
        },
        body: JSON.stringify(buildOpenAiCompatiblePayload({ modelConfig, contents, config })),
      },
      timeoutMs,
    );
    const body = await readResponseJson(response);

    if (!response.ok) {
      throw createProviderError(
        response.status,
        getProviderErrorMessage(body, `Provider request failed with status ${response.status}.`),
        { responseBody: body },
      );
    }

    const messageContent =
      body &&
      body.choices &&
      body.choices[0] &&
      body.choices[0].message &&
      normalizeOpenAiMessageText(body.choices[0].message.content);

    if (!messageContent) {
      throw createProviderError(502, "Provider returned an empty response.", {
        responseBody: body,
      });
    }

    return {
      text: messageContent,
      raw: body,
    };
  }

  async function generateWithGoogleGenAi({ apiKey, modelConfig, contents, config, timeoutMs }) {
    const response = await fetchWithTimeout(
      `${toGoogleGenerateContentEndpoint(modelConfig)}?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...toHeaderMap(modelConfig && modelConfig.headers),
        },
        body: JSON.stringify(buildGoogleGenerateContentPayload({ modelConfig, contents, config })),
      },
      timeoutMs,
    );
    const body = await readResponseJson(response);

    if (!response.ok) {
      throw createProviderError(
        response.status,
        getProviderErrorMessage(body, `Provider request failed with status ${response.status}.`),
        { responseBody: body },
      );
    }

    const candidates = body && Array.isArray(body.candidates) ? body.candidates : [];
    const text = candidates.map(normalizeGoogleCandidateText).filter(Boolean).join("\n\n");

    if (!text) {
      throw createProviderError(502, "Provider returned an empty response.", {
        responseBody: body,
      });
    }

    return {
      text,
      raw: body,
    };
  }

  async function generateModelContent({
    modelConfig,
    contents,
    config,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  } = {}) {
    if (!modelConfig || typeof modelConfig !== "object") {
      throw createProviderError(500, "Model configuration is missing.");
    }

    const modelName = toModelName(modelConfig);
    if (!modelName) {
      throw createProviderError(400, "Model configuration must include a model id.");
    }

    const apiKey = resolveModelApiKey(modelConfig);
    if (!apiKey) {
      throw createProviderError(503, "No API key is configured for the active model.");
    }

    const adapter = toAdapterName(modelConfig);
    if (adapter === "google-genai") {
      return generateWithGoogleGenAi({
        apiKey,
        modelConfig,
        contents,
        config,
        timeoutMs,
      });
    }

    if (adapter === "openai-compatible") {
      return generateWithOpenAiCompatible({
        apiKey,
        modelConfig,
        contents,
        config,
        timeoutMs,
      });
    }

    throw createProviderError(
      501,
      `Model adapter "${adapter}" is not supported yet for transcript refinement.`,
    );
  }

  globalThis.OtterCopyModelProviderClient = {
    buildGoogleGenerateContentPayload,
    buildOpenAiCompatiblePayload,
    generateModelContent,
    resolveModelApiKey,
    toAdapterName,
    toModelName,
  };
})();
