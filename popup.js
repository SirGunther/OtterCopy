const COPY_ACTION = "copyTranscript";
const REFINE_ACTION = "refineTranscript";
const START_EXTENDED_ACTION = "startExtendedRefinement";
const START_EXTENDED_HANDOFF_ACTION = "startExtendedHandoff";
const STOP_EXTENDED_ACTION = "stopExtendedRefinement";
const LATEST_RESULT_ACTION = "getLatestRefinementResult";
const DEBUG_LOG_ACTION = "getExtendedDebugLog";
const UI_PREFS_KEY = "ottercopy:ui:refine";
// Failure-recovery snapshot of the inputs behind the latest refine attempt.
// Written on run-start, restored on reopen when that run failed/cancelled, and
// cleared on success. Device-local because it can hold a large manual transcript.
const LAST_ATTEMPT_KEY = "ottercopy:ui:lastAttempt";

// Only these prompts have an extended (multi-pass persona chain) pipeline; the
// Extended toggle is enabled solely for them. All other prompts are single-pass.
const EXTENDED_PIPELINE_BY_PROMPT_ID = {
  "prompt-refinement": "refinement",
  "prompt-handoff": "handoff",
};

const copyButtons = Array.from(document.querySelectorAll(".copy-action"));
const refineButton = document.getElementById("refineButton");
const refineType = document.getElementById("refineType");
const extendedToggle = document.getElementById("extendedToggle");
const directionInput = document.getElementById("directionInput");
const directionPromptOverride = document.getElementById("directionPromptOverride");
const manualTranscriptInput = document.getElementById("manualTranscriptInput");
const manualTranscriptOverride = document.getElementById("manualTranscriptOverride");
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
let latestResultState = null;

copyButtons.forEach((button) => {
  button.addEventListener("click", () => copyFromActiveTab(button.dataset.mode));
});
refineButton.addEventListener("click", runRefine);
refineType.addEventListener("change", () => {
  updateExtendedGating();
  saveUiPrefs();
});
extendedToggle.addEventListener("change", saveUiPrefs);
stopRefinementButton.addEventListener("click", stopRefinement);
copyLatestResultButton.addEventListener("click", copyLatestResult);
copyDebugLogButton.addEventListener("click", copyLatestDebugLog);
modelSettingsButton.addEventListener("click", openModelSettings);
closeModelSettingsButton.addEventListener("click", closeModelSettings);
cancelModelEditButton.addEventListener("click", () => resetModelForm());
modelForm.addEventListener("submit", saveModel);
cancelPromptEditButton.addEventListener("click", () => resetPromptForm());
promptForm.addEventListener("submit", savePrompt);

initializeSettings().then(async () => {
  // A failed/cancelled attempt restores its own inputs (incl. promptId/extended);
  // only fall back to generic UI prefs on the happy path.
  const restored = await restoreLastAttemptIfNeeded();
  if (!restored) loadUiPrefs();
});
refreshLatestResultSummary();

// Build the Type dropdown from the whole prompt library (built-ins + custom),
// preserving the current selection when possible.
function populateRefineTypes() {
  const previous = refineType.value;
  refineType.innerHTML = "";
  promptConfigs.forEach((prompt) => {
    const option = document.createElement("option");
    option.value = prompt.id;
    option.textContent = prompt.name;
    refineType.appendChild(option);
  });
  if (previous && promptConfigs.some((prompt) => prompt.id === previous)) {
    refineType.value = previous;
  }
  updateExtendedGating();
}

// The Extended toggle only applies to prompts that have an extended pipeline.
function updateExtendedGating() {
  const capable = Boolean(EXTENDED_PIPELINE_BY_PROMPT_ID[refineType.value]);
  extendedToggle.disabled = !capable;
  if (!capable) {
    extendedToggle.checked = false;
  }
}

// Dispatch through the existing copy/refine paths. Extended-capable prompt with
// the toggle on -> its multi-pass pipeline; otherwise a single-pass refine using
// the selected prompt id.
function runRefine() {
  const promptId = refineType.value;
  const pipeline = EXTENDED_PIPELINE_BY_PROMPT_ID[promptId];
  if (pipeline && extendedToggle.checked) {
    const mode = pipeline === "handoff" ? "extended-handoff" : "extended-refine";
    copyFromActiveTab(mode);
  } else {
    copyFromActiveTab("ai-refine", promptId);
  }
}

function loadUiPrefs() {
  try {
    chrome.storage.sync.get(UI_PREFS_KEY, (data) => {
      const prefs = (data && data[UI_PREFS_KEY]) || {};
      if (prefs.promptId && promptConfigs.some((prompt) => prompt.id === prefs.promptId)) {
        refineType.value = prefs.promptId;
      }
      updateExtendedGating();
      if (!extendedToggle.disabled) {
        extendedToggle.checked = Boolean(prefs.extended);
      }
    });
  } catch (error) {
    console.debug("OtterCopy: could not load UI prefs", error);
  }
}

function saveUiPrefs() {
  try {
    chrome.storage.sync.set({
      [UI_PREFS_KEY]: {
        promptId: refineType.value,
        extended: extendedToggle.checked,
      },
    });
  } catch (error) {
    console.debug("OtterCopy: could not save UI prefs", error);
  }
}

function getLocalStorage(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(key, (data) => resolve((data && data[key]) || null));
    } catch (error) {
      console.debug("OtterCopy: could not read local storage", error);
      resolve(null);
    }
  });
}

function setLocalStorage(key, value) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    } catch (error) {
      console.debug("OtterCopy: could not write local storage", error);
      resolve();
    }
  });
}

function removeLocalStorage(key) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove(key, () => resolve());
    } catch (error) {
      console.debug("OtterCopy: could not clear local storage", error);
      resolve();
    }
  });
}

// Snapshot every input feeding a refine attempt, keyed to its runId, so a later
// failure/cancel can rebuild the exact attempt for the user to retry.
function saveLastAttemptSnapshot(runId) {
  if (!runId) return Promise.resolve();
  return setLocalStorage(LAST_ATTEMPT_KEY, {
    runId,
    inputs: {
      promptId: refineType.value,
      extended: extendedToggle.checked,
      direction: getDirection(),
      directionAsPrompt: Boolean(directionPromptOverride?.checked),
      manualTranscript: getManualTranscript(),
      manualAsOnlySource: getManualAsOnlySource(),
    },
  });
}

function clearLastAttemptSnapshot() {
  return removeLocalStorage(LAST_ATTEMPT_KEY);
}

// On reopen, rebuild the inputs iff the snapshot's run failed or was cancelled;
// clear it on success. Returns true when it restored (so init skips loadUiPrefs).
async function restoreLastAttemptIfNeeded() {
  const snapshot = await getLocalStorage(LAST_ATTEMPT_KEY);
  if (!snapshot || !snapshot.inputs) return false;

  let result = null;
  try {
    const response = await chrome.runtime.sendMessage({ action: LATEST_RESULT_ACTION });
    result = response?.ok ? response.result : null;
  } catch {
    result = null;
  }

  const status = result?.status;
  const sameRun = result && snapshot.runId && result.runId === snapshot.runId;

  if (sameRun && (status === "failed" || status === "cancelled")) {
    const inputs = snapshot.inputs;
    if (inputs.promptId && promptConfigs.some((prompt) => prompt.id === inputs.promptId)) {
      refineType.value = inputs.promptId;
    }
    updateExtendedGating();
    if (!extendedToggle.disabled) {
      extendedToggle.checked = Boolean(inputs.extended);
    }
    if (directionInput) directionInput.value = inputs.direction || "";
    if (directionPromptOverride) directionPromptOverride.checked = Boolean(inputs.directionAsPrompt);
    if (manualTranscriptInput) manualTranscriptInput.value = inputs.manualTranscript || "";
    if (manualTranscriptOverride) {
      manualTranscriptOverride.checked = Boolean(inputs.manualAsOnlySource);
    }
    const label = status === "cancelled" ? "Last attempt was stopped" : "Last attempt failed";
    setStatus(`${label}: ${result.error || "adjust and try again."}`, "error");
    return true;
  }

  if (!result || status === "completed" || !sameRun) {
    await clearLastAttemptSnapshot();
  }
  return false;
}

async function copyFromActiveTab(mode, promptId = "") {
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
        useDirectionAsPrompt: shouldUseDirectionAsPrompt(),
        manualTranscript: getManualTranscript(),
        manualTranscriptAsOnlySource: getManualAsOnlySource(),
      });

      if (!response?.ok) {
        throw new Error(response?.error || `${getProcessLabel(mode)} failed to start.`);
      }

      await saveLastAttemptSnapshot(response.runId);
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
        promptId,
        direction: getDirection(),
        useDirectionAsPrompt: shouldUseDirectionAsPrompt(),
        manualTranscript: getManualTranscript(),
        manualTranscriptAsOnlySource: getManualAsOnlySource(),
      });

      if (!response?.ok) {
        throw new Error(response?.error || "AI refinement failed to start.");
      }

      await saveLastAttemptSnapshot(response.runId);
      await refreshLatestResultSummary();
      startLatestResultPolling();
      setStatus("Refinement started. You can close this popup.", "success");
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

function shouldUseDirectionAsPrompt() {
  return Boolean(directionPromptOverride?.checked && getDirection());
}

function getManualTranscript() {
  return manualTranscriptInput && manualTranscriptInput.value
    ? manualTranscriptInput.value.trim()
    : "";
}

// Raw checkbox state. The background derives supplement (append) vs override
// (replace) from this plus whether any manual text was actually pasted, so the
// popup must not pre-collapse the two.
function getManualAsOnlySource() {
  return Boolean(manualTranscriptOverride?.checked);
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
      throw new Error("Refinement is still running.");
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
    renderLatestResultSummary(result, { announceTransition: false });
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
      latestResultState = null;
      stopLatestResultPolling();
      return;
    }

    renderLatestResultSummary(response.result);
  } catch {
    latestResultSummary.textContent = "Saved result unavailable";
    latestResultSummary.dataset.state = "error";
    latestResultState = null;
    stopLatestResultPolling();
  }
}

function renderLatestResultSummary(result, options = {}) {
  const status = result.status || "unknown";
  const previousState = latestResultState;
  const completed = result.completedAt ? formatTimestamp(result.completedAt) : "";
  const started = result.startedAt ? formatTimestamp(result.startedAt) : "";
  const model = result.finalPassModel?.model || result.model?.model || "";
  const count = result.refinedText ? `${result.refinedText.length} chars` : "";
  const details = [completed || started, model, count].filter(Boolean).join(" | ");
  latestResultSummary.textContent = `Latest result: ${status}${details ? ` | ${details}` : ""}`;
  latestResultSummary.dataset.state = status;
  latestResultState = {
    runId: result.runId || "",
    status,
  };

  if (options.announceTransition !== false) {
    announceLatestResultTransition(previousState, result);
  }

  if (status === "running") {
    startLatestResultPolling();
  } else {
    stopLatestResultPolling();
  }
}

function announceLatestResultTransition(previousState, result) {
  const runId = result.runId || "";
  const status = result.status || "unknown";
  if (!previousState || previousState.runId !== runId) return;
  if (previousState.status !== "running" || status === "running") return;

  if (status === "completed") {
    // Happy path reached while the popup stayed open: drop the failure snapshot
    // so a later reopen starts fresh.
    clearLastAttemptSnapshot();
    const count = result.refinedText ? ` (${result.refinedText.length} chars)` : "";
    setStatus(`Refinement ready${count}. Use Copy latest result.`, "success");
    return;
  }

  if (status === "failed") {
    setStatus(result.error || "Latest refinement failed.", "error");
    return;
  }

  if (status === "cancelled") {
    setStatus("Latest refinement was stopped.", "error");
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

async function writeTextToClipboard(text) {
  const value = String(text || "");
  if (!value) {
    throw new Error("Clipboard text is empty.");
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      console.debug("OtterCopy: popup async clipboard failed", error);
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "width: 1px",
    "height: 1px",
    "opacity: 0",
    "pointer-events: none",
  ].join(";");
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard write failed.");
    }
  } finally {
    textarea.remove();
  }
}

async function initializeSettings() {
  try {
    modelConfigs = await window.OtterCopyModelStore.getModels();
    promptConfigs = await window.OtterCopyPromptStore.getPrompts();
    populateRefineTypes();
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
  populateRefineTypes();

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
      : "Custom prompt | synced";

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
  refineButton.disabled = isBusy;
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
