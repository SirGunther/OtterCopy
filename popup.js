const COPY_ACTION = "copyTranscript";
const REFINE_ACTION = "refineTranscript";
const START_EXTENDED_ACTION = "startExtendedRefinement";
const START_EXTENDED_HANDOFF_ACTION = "startExtendedHandoff";
const STOP_EXTENDED_ACTION = "stopExtendedRefinement";
const LATEST_RESULT_ACTION = "getLatestRefinementResult";
const DEBUG_LOG_ACTION = "getExtendedDebugLog";
const TOAST_ACTION = "showOtterCopyToast";

const copyButtons = Array.from(document.querySelectorAll(".copy-action"));
const directionInput = document.getElementById("directionInput");
const stopRefinementButton = document.getElementById("stopRefinementButton");
const copyLatestResultButton = document.getElementById("copyLatestResultButton");
const copyDebugLogButton = document.getElementById("copyDebugLogButton");
const latestResultSummary = document.getElementById("latestResultSummary");
const statusEl = document.getElementById("status");
const activeModelSummary = document.getElementById("activeModelSummary");
const finalPassModelSummary = document.getElementById("finalPassModelSummary");
const activePromptSummary = document.getElementById("activePromptSummary");
const modelSettingsButton = document.getElementById("modelSettingsButton");
const closeModelSettingsButton = document.getElementById("closeModelSettingsButton");
const modelSettingsPanel = document.getElementById("modelSettingsPanel");
const modelSettingsStatus = document.getElementById("modelSettingsStatus");
const modelList = document.getElementById("modelList");
const modelForm = document.getElementById("modelForm");
const cancelModelEditButton = document.getElementById("cancelModelEditButton");
const promptSettingsStatus = document.getElementById("promptSettingsStatus");
const promptList = document.getElementById("promptList");
const promptForm = document.getElementById("promptForm");
const cancelPromptEditButton = document.getElementById("cancelPromptEditButton");
const modelFields = {
  id: document.getElementById("modelId"),
  name: document.getElementById("modelName"),
  provider: document.getElementById("modelProvider"),
  adapter: document.getElementById("modelAdapter"),
  model: document.getElementById("modelNameId"),
  apiKey: document.getElementById("modelApiKey"),
  baseUrl: document.getElementById("modelBaseUrl"),
  headers: document.getElementById("modelHeaders"),
  options: document.getElementById("modelOptions"),
  active: document.getElementById("modelActive"),
  finalPassActive: document.getElementById("modelFinalPassActive"),
};
const promptFields = {
  id: document.getElementById("promptId"),
  name: document.getElementById("promptName"),
  content: document.getElementById("promptContent"),
  active: document.getElementById("promptActive"),
};

let modelConfigs = [];
let promptConfigs = [];
let latestResultPollTimer = 0;

copyButtons.forEach((button) => {
  button.addEventListener("click", () => copyFromActiveTab(button.dataset.mode));
});
stopRefinementButton.addEventListener("click", stopRefinement);
copyLatestResultButton.addEventListener("click", copyLatestResult);
copyDebugLogButton.addEventListener("click", copyLatestDebugLog);
modelSettingsButton.addEventListener("click", openModelSettings);
closeModelSettingsButton.addEventListener("click", closeModelSettings);
cancelModelEditButton.addEventListener("click", () => resetModelForm());
modelForm.addEventListener("submit", saveModel);
cancelPromptEditButton.addEventListener("click", () => resetPromptForm());
promptForm.addEventListener("submit", savePrompt);

initializeSettings();
refreshLatestResultSummary();

async function copyFromActiveTab(mode) {
  setBusy(true);
  setStatus(getBusyStatus(mode), "");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    if (mode === "extended-refine" || mode === "extended-handoff") {
      const response = await chrome.runtime.sendMessage({
        action: mode === "extended-handoff" ? START_EXTENDED_HANDOFF_ACTION : START_EXTENDED_ACTION,
        tabId: tab.id,
        direction: getDirection(),
      });

      if (!response?.ok) {
        throw new Error(response?.error || `${getProcessLabel(mode)} failed to start.`);
      }

      await refreshLatestResultSummary();
      startLatestResultPolling();
      setStatus(`${getProcessLabel(mode)} started. You can close this popup.`, "success");
      return;
    }

    if (mode === "ai-refine") {
      const response = await chrome.runtime.sendMessage({
        action: REFINE_ACTION,
        tabId: tab.id,
        mode,
        direction: getDirection(),
      });

      if (!response?.ok || !response.refinedText) {
        throw new Error(response?.error || "AI refinement failed.");
      }

      await writeTextToClipboard(response.refinedText);
      await showPageToast(
        tab.id,
        response.processName
          ? `${response.processName}; copied.`
          : response.prompt?.name
          ? `Refined with ${response.prompt.name}; copied.`
          : "Refined transcript copied.",
      );
      setStatus("Refined result copied.", "success");
      window.setTimeout(() => window.close(), 900);
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: COPY_ACTION,
      mode,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Copy failed.");
    }

    setStatus("Copied.", "success");
    window.setTimeout(() => window.close(), 650);
  } catch (error) {
    setStatus(error.message || "Copy failed.", "error");
  } finally {
    setBusy(false);
  }
}

function getDirection() {
  return directionInput && directionInput.value ? directionInput.value.trim() : "";
}

async function copyLatestResult() {
  setBusy(true);
  setStatus("Copying latest saved result...", "");

  try {
    const response = await chrome.runtime.sendMessage({
      action: LATEST_RESULT_ACTION,
    });

    if (!response?.ok || !response.result) {
      throw new Error(response?.error || "No saved result found.");
    }

    const result = response.result;
    if (result.status === "running") {
      throw new Error("Extended refinement is still running.");
    }
    if (result.status === "cancelled") {
      throw new Error("Latest refinement was stopped before completion.");
    }
    if (result.status === "failed") {
      throw new Error(result.error || "Latest refinement failed.");
    }
    if (!result.refinedText) {
      throw new Error("Latest saved result is empty.");
    }

    await writeTextToClipboard(result.refinedText);
    setStatus("Latest result copied.", "success");
    renderLatestResultSummary(result);
  } catch (error) {
    setStatus(error.message || "Could not copy latest result.", "error");
    await refreshLatestResultSummary();
  } finally {
    setBusy(false);
  }
}

async function stopRefinement() {
  setBusy(true);
  setStatus("Stopping extended refinement...", "");

  try {
    const response = await chrome.runtime.sendMessage({
      action: STOP_EXTENDED_ACTION,
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not stop refinement.");
    }

    await refreshLatestResultSummary();
    setStatus("Refinement stopped.", "success");
  } catch (error) {
    setStatus(error.message || "Could not stop refinement.", "error");
    await refreshLatestResultSummary();
  } finally {
    setBusy(false);
  }
}

async function copyLatestDebugLog() {
  setBusy(true);
  setStatus("Copying latest debug log...", "");

  try {
    const response = await chrome.runtime.sendMessage({
      action: DEBUG_LOG_ACTION,
    });

    if (!response?.ok || !response.text) {
      throw new Error(response?.error || "No debug log found.");
    }

    await writeTextToClipboard(response.text);
    const callCount = response.log?.callCount;
    setStatus(
      callCount ? `Debug log copied (${callCount} calls).` : "Debug log copied.",
      "success",
    );
  } catch (error) {
    setStatus(error.message || "Could not copy debug log.", "error");
  } finally {
    setBusy(false);
  }
}

async function refreshLatestResultSummary() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: LATEST_RESULT_ACTION,
    });

    if (!response?.ok || !response.result) {
      latestResultSummary.textContent = "No saved result";
      latestResultSummary.dataset.state = "";
      stopLatestResultPolling();
      return;
    }

    renderLatestResultSummary(response.result);
  } catch {
    latestResultSummary.textContent = "Saved result unavailable";
    latestResultSummary.dataset.state = "error";
    stopLatestResultPolling();
  }
}

function renderLatestResultSummary(result) {
  const status = result.status || "unknown";
  const completed = result.completedAt ? formatTimestamp(result.completedAt) : "";
  const started = result.startedAt ? formatTimestamp(result.startedAt) : "";
  const model = result.finalPassModel?.model || result.model?.model || "";
  const count = result.refinedText ? `${result.refinedText.length} chars` : "";
  const details = [completed || started, model, count].filter(Boolean).join(" | ");
  latestResultSummary.textContent = `Latest result: ${status}${details ? ` | ${details}` : ""}`;
  latestResultSummary.dataset.state = status;
  if (status === "running") {
    startLatestResultPolling();
  } else {
    stopLatestResultPolling();
  }
}

function startLatestResultPolling() {
  if (latestResultPollTimer) return;
  latestResultPollTimer = window.setInterval(refreshLatestResultSummary, 2500);
}

function stopLatestResultPolling() {
  if (!latestResultPollTimer) return;
  window.clearInterval(latestResultPollTimer);
  latestResultPollTimer = 0;
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getBusyStatus(mode) {
  if (mode === "ai-refine") return "Refining transcript...";
  if (mode === "extended-refine") return "Running extended refinement...";
  if (mode === "extended-handoff") return "Running engineering handoff...";
  return "Copying...";
}

function getProcessLabel(mode) {
  if (mode === "extended-handoff") return "Engineering handoff";
  if (mode === "extended-refine") return "Extended refinement";
  return "Process";
}

async function showPageToast(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: TOAST_ACTION,
      message,
    });
  } catch {
    /* The popup status still confirms the copy if the page toast cannot be shown. */
  }
}

async function writeTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position: fixed; opacity: 0; pointer-events: none;";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function initializeSettings() {
  try {
    modelConfigs = await window.OtterCopyModelStore.getModels();
    promptConfigs = await window.OtterCopyPromptStore.getPrompts();
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderActivePromptSummary();
  } catch (error) {
    activeModelSummary.textContent = "Settings unavailable";
    finalPassModelSummary.textContent = "Final pass unavailable";
    activePromptSummary.textContent = error.message || "Settings unavailable";
  }
}

async function openModelSettings() {
  modelSettingsPanel.classList.remove("hidden");
  setModelSettingsStatus("Loading models...", "");

  try {
    modelConfigs = await window.OtterCopyModelStore.getModels();
    promptConfigs = await window.OtterCopyPromptStore.getPrompts();
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderActivePromptSummary();
    renderModelList();
    renderPromptList();
    resetModelForm();
    resetPromptForm();
    setModelSettingsStatus("", "");
  } catch (error) {
    setModelSettingsStatus(error.message || "Could not load model settings.", "error");
  }
}

function closeModelSettings() {
  modelSettingsPanel.classList.add("hidden");
}

function renderActiveModelSummary() {
  const activeModel = window.OtterCopyModelStore.getActiveModel(modelConfigs);
  activeModelSummary.textContent = activeModel
    ? `Active: ${activeModel.name} (${activeModel.model})`
    : "No active model";
}

function renderFinalPassModelSummary() {
  const finalPassModel = window.OtterCopyModelStore.getFinalPassModel(modelConfigs);
  finalPassModelSummary.textContent = finalPassModel
    ? `Final pass: ${finalPassModel.name} (${finalPassModel.model})`
    : "Final pass: active model";
}

function renderActivePromptSummary() {
  const activePrompt = window.OtterCopyPromptStore.getActivePrompt(promptConfigs);
  activePromptSummary.textContent = activePrompt
    ? `Prompt: ${activePrompt.name}`
    : "No active prompt";
}

function renderModelList() {
  modelList.replaceChildren();

  if (modelConfigs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "model-empty";
    empty.textContent = "No models configured.";
    modelList.appendChild(empty);
    return;
  }

  modelConfigs.forEach((model) => {
    const row = document.createElement("article");
    row.className = "model-row";
    if (model.active) {
      row.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "model-row-main";

    const name = document.createElement("strong");
    name.textContent = model.name || model.model || model.id;

    const meta = document.createElement("span");
    meta.textContent = `${model.provider || "provider"} | ${model.adapter || "adapter"} | ${
      model.model || "model"
    }${model.apiKey ? " | key configured" : ""}${model.finalPassActive ? " | final pass" : ""}`;

    main.appendChild(name);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "model-row-actions";
    actions.appendChild(createModelActionButton(model.active ? "Active" : "Use", () =>
      activateModel(model.id),
    ));
    actions.appendChild(
      createModelActionButton(model.finalPassActive ? "Final" : "Use final", () =>
        activateFinalPassModel(model.id),
      ),
    );
    actions.appendChild(createModelActionButton("Edit", () => editModel(model)));
    actions.appendChild(createModelActionButton("Delete", () => removeModel(model.id), "danger"));

    row.appendChild(main);
    row.appendChild(actions);
    modelList.appendChild(row);
  });
}

function createModelActionButton(label, handler, variant = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = variant ? `model-row-button ${variant}` : "model-row-button";
  button.disabled = label === "Active";
  button.addEventListener("click", handler);
  return button;
}

function editModel(model) {
  modelFields.id.value = model.id;
  modelFields.name.value = model.name || "";
  modelFields.provider.value = model.provider || "";
  modelFields.adapter.value = model.adapter || "google-genai";
  modelFields.model.value = model.model || "";
  modelFields.apiKey.value = model.apiKey || "";
  modelFields.baseUrl.value = model.baseUrl || "";
  modelFields.headers.value = JSON.stringify(model.headers || {}, null, 2);
  modelFields.options.value = JSON.stringify(model.options || {}, null, 2);
  modelFields.active.checked = Boolean(model.active);
  modelFields.finalPassActive.checked = Boolean(model.finalPassActive);
  setModelSettingsStatus(`Editing ${model.name || model.model}.`, "");
}

function resetModelForm() {
  modelForm.reset();
  modelFields.id.value = "";
  modelFields.provider.value = "google";
  modelFields.adapter.value = "google-genai";
  modelFields.headers.value = "{}";
  modelFields.options.value = "{}";
  modelFields.active.checked = modelConfigs.length === 0;
  modelFields.finalPassActive.checked = false;
  setModelSettingsStatus("", "");
}

async function saveModel(event) {
  event.preventDefault();
  setModelSettingsStatus("Saving model...", "");

  try {
    const payload = {
      id: modelFields.id.value,
      name: modelFields.name.value,
      provider: modelFields.provider.value,
      adapter: modelFields.adapter.value,
      model: modelFields.model.value,
      apiKey: modelFields.apiKey.value,
      baseUrl: modelFields.baseUrl.value,
      headers: parseJsonField(modelFields.headers.value, "Headers JSON"),
      options: parseJsonField(modelFields.options.value, "Options JSON"),
      active: modelFields.active.checked,
      finalPassActive: modelFields.finalPassActive.checked,
    };

    if (!payload.name.trim()) throw new Error("Model name is required.");
    if (!payload.provider.trim()) throw new Error("Provider is required.");
    if (!payload.adapter.trim()) throw new Error("Adapter is required.");
    if (!payload.model.trim()) throw new Error("Model ID is required.");

    modelConfigs = await window.OtterCopyModelStore.upsertModel(payload);
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderModelList();
    resetModelForm();
    setModelSettingsStatus("Model saved.", "success");
  } catch (error) {
    setModelSettingsStatus(error.message || "Model save failed.", "error");
  }
}

function renderPromptList() {
  promptList.replaceChildren();

  if (promptConfigs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "model-empty";
    empty.textContent = "No prompts configured.";
    promptList.appendChild(empty);
    return;
  }

  promptConfigs.forEach((prompt) => {
    const row = document.createElement("article");
    row.className = "model-row";
    if (prompt.active) {
      row.classList.add("active");
    }

    const main = document.createElement("div");
    main.className = "model-row-main";

    const name = document.createElement("strong");
    name.textContent = prompt.name || prompt.id;

    const meta = document.createElement("span");
    meta.textContent = prompt.builtIn
      ? `Built-in | ${prompt.sourcePath || "packaged prompt"}`
      : "Custom prompt | stored locally";

    main.appendChild(name);
    main.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "model-row-actions";
    actions.appendChild(createModelActionButton(prompt.active ? "Active" : "Use", () =>
      activatePrompt(prompt.id),
    ));
    actions.appendChild(createModelActionButton("Edit", () => editPrompt(prompt)));
    if (prompt.builtIn) {
      actions.appendChild(createModelActionButton("Reset", () => resetBuiltInPrompt(prompt.id)));
    } else {
      actions.appendChild(
        createModelActionButton("Delete", () => removePrompt(prompt.id), "danger"),
      );
    }

    row.appendChild(main);
    row.appendChild(actions);
    promptList.appendChild(row);
  });
}

function editPrompt(prompt) {
  promptFields.id.value = prompt.id;
  promptFields.name.value = prompt.name || "";
  promptFields.content.value = prompt.content || "";
  promptFields.active.checked = Boolean(prompt.active);
  setPromptSettingsStatus(`Editing ${prompt.name || prompt.id}.`, "");
}

function resetPromptForm() {
  promptForm.reset();
  promptFields.id.value = "";
  promptFields.name.value = "";
  promptFields.content.value = "";
  promptFields.active.checked = promptConfigs.length === 0;
  setPromptSettingsStatus("", "");
}

async function savePrompt(event) {
  event.preventDefault();
  setPromptSettingsStatus("Saving prompt...", "");

  try {
    const payload = {
      id: promptFields.id.value,
      name: promptFields.name.value,
      content: promptFields.content.value,
      active: promptFields.active.checked,
    };

    if (!payload.name.trim()) throw new Error("Prompt name is required.");
    if (!payload.content.trim()) throw new Error("Prompt instructions are required.");

    promptConfigs = await window.OtterCopyPromptStore.upsertPrompt(payload);
    renderActivePromptSummary();
    renderPromptList();
    resetPromptForm();
    setPromptSettingsStatus("Prompt saved.", "success");
  } catch (error) {
    setPromptSettingsStatus(error.message || "Prompt save failed.", "error");
  }
}

async function activatePrompt(promptId) {
  setPromptSettingsStatus("Activating prompt...", "");

  try {
    promptConfigs = await window.OtterCopyPromptStore.activatePrompt(promptId);
    renderActivePromptSummary();
    renderPromptList();
    setPromptSettingsStatus("Active prompt updated.", "success");
  } catch (error) {
    setPromptSettingsStatus(error.message || "Prompt activation failed.", "error");
  }
}

async function resetBuiltInPrompt(promptId) {
  setPromptSettingsStatus("Resetting prompt...", "");

  try {
    promptConfigs = await window.OtterCopyPromptStore.resetBuiltInPrompt(promptId);
    renderActivePromptSummary();
    renderPromptList();
    resetPromptForm();
    setPromptSettingsStatus("Prompt reset from packaged file.", "success");
  } catch (error) {
    setPromptSettingsStatus(error.message || "Prompt reset failed.", "error");
  }
}

async function removePrompt(promptId) {
  const prompt = promptConfigs.find((entry) => entry.id === promptId);
  const label = prompt ? prompt.name || prompt.id : "this prompt";
  if (!window.confirm(`Delete prompt "${label}"?`)) {
    return;
  }

  setPromptSettingsStatus("Deleting prompt...", "");

  try {
    promptConfigs = await window.OtterCopyPromptStore.deletePrompt(promptId);
    renderActivePromptSummary();
    renderPromptList();
    resetPromptForm();
    setPromptSettingsStatus("Prompt deleted.", "success");
  } catch (error) {
    setPromptSettingsStatus(error.message || "Prompt deletion failed.", "error");
  }
}

async function activateModel(modelId) {
  setModelSettingsStatus("Activating model...", "");

  try {
    modelConfigs = await window.OtterCopyModelStore.activateModel(modelId);
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderModelList();
    setModelSettingsStatus("Active model updated.", "success");
  } catch (error) {
    setModelSettingsStatus(error.message || "Model activation failed.", "error");
  }
}

async function activateFinalPassModel(modelId) {
  setModelSettingsStatus("Setting final pass model...", "");

  try {
    if (window.OtterCopyModelStore.getFinalPassModel(modelConfigs)?.id === modelId) {
      modelConfigs = await window.OtterCopyModelStore.clearFinalPassModel();
      setModelSettingsStatus("Final pass will use the active model.", "success");
    } else {
      modelConfigs = await window.OtterCopyModelStore.activateFinalPassModel(modelId);
      setModelSettingsStatus("Final pass model updated.", "success");
    }
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderModelList();
  } catch (error) {
    setModelSettingsStatus(error.message || "Final pass model update failed.", "error");
  }
}

async function removeModel(modelId) {
  const model = modelConfigs.find((entry) => entry.id === modelId);
  const label = model ? model.name || model.model || model.id : "this model";
  if (!window.confirm(`Delete model "${label}"?`)) {
    return;
  }

  setModelSettingsStatus("Deleting model...", "");

  try {
    modelConfigs = await window.OtterCopyModelStore.deleteModel(modelId);
    renderActiveModelSummary();
    renderFinalPassModelSummary();
    renderModelList();
    resetModelForm();
    setModelSettingsStatus("Model deleted.", "success");
  } catch (error) {
    setModelSettingsStatus(error.message || "Model deletion failed.", "error");
  }
}

function parseJsonField(value, label) {
  const text = String(value || "").trim();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${label} must be a JSON object.`);
    }
    return parsed;
  } catch (error) {
    throw new Error(error.message || `${label} must be valid JSON.`);
  }
}

function setStatusElement(element, message, state) {
  element.textContent = message;
  if (state) {
    element.dataset.state = state;
  } else {
    delete element.dataset.state;
  }
}

function setModelSettingsStatus(message, state) {
  setStatusElement(modelSettingsStatus, message, state);
}

function setPromptSettingsStatus(message, state) {
  setStatusElement(promptSettingsStatus, message, state);
}

function setBusy(isBusy) {
  copyButtons.forEach((button) => {
    button.disabled = isBusy;
  });
  stopRefinementButton.disabled = isBusy;
  copyLatestResultButton.disabled = isBusy;
  copyDebugLogButton.disabled = isBusy;
}

function setStatus(message, state) {
  statusEl.textContent = message;
  if (state) {
    statusEl.dataset.state = state;
  } else {
    delete statusEl.dataset.state;
  }
}
