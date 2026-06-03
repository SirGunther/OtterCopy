importScripts("modelStore.js", "promptStore.js", "modelProviderClient.js");

const EXTRACT_TRANSCRIPT_ACTION = "extractTranscript";
const REFINE_TRANSCRIPT_ACTION = "refineTranscript";
const START_EXTENDED_REFINEMENT_ACTION = "startExtendedRefinement";
const STOP_EXTENDED_REFINEMENT_ACTION = "stopExtendedRefinement";
const GET_LATEST_REFINEMENT_RESULT_ACTION = "getLatestRefinementResult";
const GET_EXTENDED_DEBUG_LOG_ACTION = "getExtendedDebugLog";
const LATEST_REFINEMENT_RESULT_STORAGE_KEY = "ottercopyLatestRefinementResult";
const EXTENDED_DEBUG_LOG_STORAGE_KEY = "ottercopyLatestExtendedDebugLog";
const EXTENDED_DEBUG_LOG_INCLUDE_FULL_REQUESTS = false;
const MIN_TRANSCRIPT_CHARACTER_COUNT = 100;
const cancelledExtendedRunIds = new Set();
const CLAIM_LEDGER_CONTRACT = Object.freeze([
  "Explicit",
  "Strong Inference",
  "Weak Inference",
  "Speculative",
  "Discard",
]);
const EXTENDED_LIGHTWEIGHT_CALL_DELAY_MS = 4200;
const EXTENDED_PERSONA_MATRIX_PATH = "prompts/personalities/matrix.md";
const EXTENDED_SECTION_PIPELINE = Object.freeze([
  {
    name: "Header and Problem",
    path: "prompts/extended/01-header-problem.md",
    relationship: "user-facing failure plus causal technical explanation",
    primary: {
      name: "User Impact Analyst",
      why:
        "This person represents the user who experienced the failure and keeps the artifact grounded in the blocked workflow instead of internal implementation language.",
      how:
        "They listen for the attempted action, the user's expectation, the unexpected application behavior, the frustration or blocker, and the practical consequence of the failure.",
      produces:
        "A clear category, title, and problem framing centered on who was blocked, what failed, what should have happened, and why the behavior matters.",
      avoids:
        "Do not jump straight to the technical cause or solution before the user-facing failure is clear.",
    },
    secondary: {
      name: "System Diagnosis Engineer",
      why:
        "This person explains why the application behaved that way, so the problem does not remain a surface-level complaint.",
      how:
        "They trace the user-facing failure back through guards, endpoints, permissions, flags, services, routing paths, domain boundaries, and incorrect assumptions.",
      produces:
        "A causal technical explanation of the underlying system mismatch, without jumping ahead into the full solution.",
      avoids:
        "Do not overstate a technical cause unless the transcript supports it; qualify inferred causes in the claim ledger.",
    },
  },
  {
    name: "Requirement",
    path: "prompts/extended/02-requirement.md",
    relationship: "resolved-state definition plus scope validation",
    primary: {
      name: "Product Requirement Analyst",
      why:
        "This person protects the resolved state: what must become true for the user and product, regardless of how engineering implements it.",
      how:
        "They translate the problem into durable product/system expectations and separate success criteria from implementation details.",
      produces:
        "A requirement that says what must be true after the fix, without prescribing specific code unless unavoidable.",
      avoids:
        "Do not smuggle implementation choices into the requirement unless the transcript makes them mandatory.",
    },
    secondary: {
      name: "Requirement Boundary Reviewer",
      why:
        "This person prevents the requirement from becoming too vague, too broad, too narrow, or secretly implementation-shaped.",
      how:
        "They ask whether the requirement is testable, necessary, complete enough, and scoped to the actual failure.",
      produces:
        "A tightened requirement that removes accidental solution language and keeps only the necessary resolved-state conditions.",
      avoids:
        "Do not expand the requirement into adjacent improvements that are not needed to resolve the failure.",
    },
  },
  {
    name: "Solution",
    path: "prompts/extended/03-solution.md",
    relationship: "concrete implementation proposal plus complexity challenge",
    primary: {
      name: "Senior Implementation Engineer",
      why:
        "This person knows how to turn the requirement into a practical technical approach that can actually be built.",
      how:
        "They look for existing architecture, code paths, services, guards, DTOs, shared abstractions, and domain patterns that should shape the implementation.",
      produces:
        "A concise prose solution describing the implementation approach and the main technical changes needed.",
      avoids:
        "Do not format the solution as a checklist or invent architecture beyond what the transcript justifies.",
    },
    secondary: {
      name: "Complexity Skeptic Engineer",
      why:
        "This person protects the team from solving a small problem with an unnecessarily large design, while still allowing complexity when the domain truly requires it.",
      how:
        "They ask whether the proposed solution is too large, too clever, too coupled, too duplicative, or not justified by the failure.",
      produces:
        "A challenge pass that either validates the proposed solution or recommends simplifying, narrowing, or qualifying it.",
      avoids:
        "Do not reject necessary complexity only because the simpler version is easier to describe.",
    },
  },
  {
    name: "Implementation Notes",
    path: "prompts/extended/04-implementation-notes.md",
    relationship: "maintainable implementation framing plus regression protection",
    primary: {
      name: "Codebase Steward Engineer",
      why:
        "This person cares about the health of the codebase after the ticket is merged and wants the fix to fit the system cleanly.",
      how:
        "They think about naming, file placement, shared DTOs, reuse, modularity, drift, existing conventions, and how future engineers will understand the change.",
      produces:
        "Implementation notes covering strategy, constraints, technical notes, and maintainability concerns.",
      avoids:
        "Do not turn implementation notes into action items or broad refactoring wishes.",
    },
    secondary: {
      name: "Regression Defense Engineer",
      why:
        "This person cares about what might accidentally break because of the change.",
      how:
        "They look for existing behavior that must remain unchanged, affected permissions, role combinations, edge cases, and tests that should prove no regression occurred.",
      produces:
        "Testing considerations and implementation cautions focused on preserving current behavior.",
      avoids:
        "Do not propose generic test advice unless it is tied to the behavior under discussion.",
    },
  },
  {
    name: "Risks",
    path: "prompts/extended/05-risks.md",
    relationship: "broad engineering risk discovery plus permission/domain-boundary risk review",
    primary: {
      name: "Failure Mode Engineer",
      why:
        "This person imagines how the implementation could fail in realistic engineering terms.",
      how:
        "They look for hidden coupling, partial migrations, duplicated logic, implicit side effects, unclear ownership, and paths that could drift over time.",
      produces:
        "A list of meaningful architectural, implementation, and maintenance risks.",
      avoids:
        "Do not include low-value generic risks that would apply to any code change.",
    },
    secondary: {
      name: "Authorization Boundary Engineer",
      why:
        "This person is specifically responsible for preventing permission and domain-boundary mistakes.",
      how:
        "They examine whether roles, guards, resource types, file domains, and permission checks could be mixed, bypassed, or applied to the wrong object.",
      produces:
        "Permission-specific risks around authorization, role scope, guard reuse, and cross-domain behavior.",
      avoids:
        "Do not invent a permission model when the transcript does not mention one; mark unsupported concerns as speculative or discard them.",
    },
  },
  {
    name: "Open Questions",
    path: "prompts/extended/06-open-questions.md",
    relationship: "identify material unknowns plus remove nonessential questions",
    primary: {
      name: "Domain Uncertainty Engineer",
      why:
        "This person notices where the transcript does not provide enough information to safely finalize an implementation decision.",
      how:
        "They look for missing domain facts, unknown downstream effects, unclear ownership, implied behavior, and assumptions that could change the fix.",
      produces:
        "Only unresolved questions that materially affect implementation, testing, scope, or rollout.",
      avoids:
        "Do not ask questions whose answers would not change what gets built, tested, sequenced, or communicated.",
    },
    secondary: {
      name: "Scope Pruning Engineer",
      why:
        "This person prevents the artifact from filling up with interesting but nonessential questions.",
      how:
        "They ask whether answering each question would actually change what gets built, tested, sequenced, or communicated.",
      produces:
        "A reduced open-question list containing only questions that matter now.",
      avoids:
        "Do not preserve a question merely because it is interesting.",
    },
  },
  {
    name: "Action Items",
    path: "prompts/extended/07-action-items.md",
    relationship: "ordered implementation work plus handoff clarity",
    primary: {
      name: "Execution Sequencing Engineer",
      why:
        "This person turns the accepted solution into concrete work that can be picked up and implemented.",
      how:
        "They think in dependency order: what must move first, what can be added next, what must be verified, and what should be checked before completion.",
      produces:
        "Ordered checklist items that describe immediate implementation steps.",
      avoids:
        "Do not include background explanation, completed work, or generic process notes.",
    },
    secondary: {
      name: "New Engineer Handoff Reviewer",
      why:
        "This person reads the action items as someone who did not hear the original conversation and still needs to execute the work correctly.",
      how:
        "They look for vague verbs, missing context, hidden assumptions, unclear sequencing, and action items that require tribal knowledge.",
      produces:
        "A cleaned-up checklist that is concrete, understandable, and executable by another engineer.",
      avoids:
        "Do not add extra work only to make the checklist feel more complete.",
    },
  },
]);
const EXTENDED_FINAL_DIRECTIVE_PATH = "prompts/extended/08-final-pass.md";

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({ text: "" });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === START_EXTENDED_REFINEMENT_ACTION) {
    startExtendedRefinementJob(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Could not start extended refinement.",
        });
      });
    return true;
  }

  if (message.action === STOP_EXTENDED_REFINEMENT_ACTION) {
    stopExtendedRefinementJob()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Could not stop extended refinement.",
        });
      });
    return true;
  }

  if (message.action === GET_LATEST_REFINEMENT_RESULT_ACTION) {
    getLatestRefinementResult()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Could not load latest refinement result.",
        });
      });
    return true;
  }

  if (message.action === GET_EXTENDED_DEBUG_LOG_ACTION) {
    getLatestExtendedDebugLog()
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || "Could not load extended debug log.",
        });
      });
    return true;
  }

  if (message.action !== REFINE_TRANSCRIPT_ACTION) {
    return false;
  }

  refineTranscript(message)
    .then((result) => sendResponse(result))
    .catch((error) => {
      console.error("OtterCopy: refinement failed", error);
      sendResponse({
        ok: false,
        error: error.message || "Transcript refinement failed.",
      });
    });

  return true;
});

async function refineTranscript({ tabId, mode }) {
  if (!tabId) {
    throw new Error("No active tab found.");
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });

  const transcriptResponse = await chrome.tabs.sendMessage(tabId, {
    action: EXTRACT_TRANSCRIPT_ACTION,
  });

  if (!transcriptResponse?.ok || !transcriptResponse.transcriptText) {
    throw new Error(transcriptResponse?.error || "No transcript text found.");
  }

  const models = await globalThis.OtterCopyModelStore.getModels();
  const activeModel = globalThis.OtterCopyModelStore.getActiveModel(models);
  const finalPassModel =
    globalThis.OtterCopyModelStore.getFinalPassModel(models) || activeModel;
  if (!activeModel) {
    throw new Error("No active model is configured.");
  }
  const prompts = await globalThis.OtterCopyPromptStore.getPrompts();
  const activePrompt = globalThis.OtterCopyPromptStore.getActivePrompt(prompts);

  const isExtended = mode === "extended-refine";
  const result = isExtended
    ? await runExtendedRefinement({
        modelConfig: activeModel,
        finalPassModelConfig: finalPassModel,
        governingPrompt: activePrompt?.content || "",
        transcriptText: transcriptResponse.transcriptText,
      })
    : await globalThis.OtterCopyModelProviderClient.generateModelContent({
        modelConfig: activeModel,
        contents: formatTranscriptForRefinement(
          activePrompt?.content || "",
          transcriptResponse.transcriptText,
        ),
      });

  return {
    ok: true,
    model: {
      id: activeModel.id,
      name: activeModel.name,
      provider: activeModel.provider,
      adapter: activeModel.adapter,
      model: activeModel.model,
    },
    prompt: activePrompt
      ? {
          id: activePrompt.id,
          name: activePrompt.name,
        }
      : null,
    processName: isExtended ? "Extended refinement" : null,
    refinedText: result.text,
  };
}

async function startExtendedRefinementJob({ tabId }) {
  if (!tabId) {
    throw new Error("No active tab found.");
  }

  const latest = await getStoredLatestRefinementResult();
  if (latest && latest.status === "running") {
    throw new Error("An extended refinement is already running.");
  }

  const runId = `refinement-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  cancelledExtendedRunIds.delete(runId);
  await saveLatestRefinementResult({
    runId,
    mode: "extended-refine",
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: "",
    transcriptCharacterCount: 0,
    model: null,
    finalPassModel: null,
    prompt: null,
    debugRunId: "",
    refinedText: "",
    error: "",
  });

  runExtendedRefinementJob({ tabId, runId }).catch((error) => {
    console.error("OtterCopy: extended refinement job failed", error);
  });

  return {
    ok: true,
    runId,
  };
}

async function runExtendedRefinementJob({ tabId, runId }) {
  try {
    await assertExtendedRunNotCancelled(runId);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    const transcriptResponse = await chrome.tabs.sendMessage(tabId, {
      action: EXTRACT_TRANSCRIPT_ACTION,
    });

    if (!transcriptResponse?.ok || !transcriptResponse.transcriptText) {
      throw new Error(transcriptResponse?.error || "No transcript text found.");
    }

    const transcriptText = cleanText(transcriptResponse.transcriptText);
    if (transcriptText.length < MIN_TRANSCRIPT_CHARACTER_COUNT) {
      throw new Error(
        `Transcript is too short to refine (${transcriptText.length} characters found; minimum is ${MIN_TRANSCRIPT_CHARACTER_COUNT}). Make sure an Otter transcript is open and loaded.`,
      );
    }

    await assertExtendedRunNotCancelled(runId);
    const models = await globalThis.OtterCopyModelStore.getModels();
    const activeModel = globalThis.OtterCopyModelStore.getActiveModel(models);
    const finalPassModel =
      globalThis.OtterCopyModelStore.getFinalPassModel(models) || activeModel;
    if (!activeModel) {
      throw new Error("No active model is configured.");
    }

    const prompts = await globalThis.OtterCopyPromptStore.getPrompts();
    const activePrompt = globalThis.OtterCopyPromptStore.getActivePrompt(prompts);
    await mergeLatestRefinementResult(runId, {
      transcriptCharacterCount: transcriptText.length,
      model: summarizeModelConfig(activeModel),
      finalPassModel: summarizeModelConfig(finalPassModel),
      prompt: activePrompt
        ? {
            id: activePrompt.id,
            name: activePrompt.name,
          }
        : null,
    });

    const result = await runExtendedRefinement({
      cancellationRunId: runId,
      modelConfig: activeModel,
      finalPassModelConfig: finalPassModel,
      governingPrompt: activePrompt?.content || "",
      transcriptText,
    });

    await assertExtendedRunNotCancelled(runId);
    await mergeLatestRefinementResult(runId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      debugRunId: result.debugRunId || "",
      refinedText: result.text || "",
      error: "",
    });

    try {
      await chrome.tabs.sendMessage(tabId, {
        action: "showOtterCopyToast",
        message: "Extended refinement saved.",
      });
    } catch {
      /* The saved result remains available even if the page toast cannot be shown. */
    }
  } catch (error) {
    if (error && error.isExtendedCancellation) {
      await mergeLatestRefinementResult(runId, {
        status: "cancelled",
        completedAt: new Date().toISOString(),
        error: "Extended refinement stopped by user.",
      });
      return;
    }

    await mergeLatestRefinementResult(runId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error.message || "Extended refinement failed.",
    });
  }
}

async function stopExtendedRefinementJob() {
  const latest = await getStoredLatestRefinementResult();
  if (!latest || latest.status !== "running") {
    return {
      ok: false,
      error: "No extended refinement is currently running.",
    };
  }

  cancelledExtendedRunIds.add(latest.runId);
  await saveLatestRefinementResult({
    ...latest,
    status: "cancelled",
    completedAt: new Date().toISOString(),
    error: "Extended refinement stopped by user. Any in-flight provider response will be ignored.",
  });

  return {
    ok: true,
    runId: latest.runId,
  };
}

async function getLatestRefinementResult() {
  const result = await getStoredLatestRefinementResult();
  if (!result) {
    return {
      ok: false,
      error: "No saved refinement result found yet.",
    };
  }

  return {
    ok: true,
    result,
  };
}

async function getStoredLatestRefinementResult() {
  const data = await chrome.storage.local.get(LATEST_REFINEMENT_RESULT_STORAGE_KEY);
  return data[LATEST_REFINEMENT_RESULT_STORAGE_KEY] || null;
}

async function saveLatestRefinementResult(result) {
  await chrome.storage.local.set({
    [LATEST_REFINEMENT_RESULT_STORAGE_KEY]: result,
  });
  return result;
}

async function mergeLatestRefinementResult(runId, patch) {
  const current = await getStoredLatestRefinementResult();
  if (!current || current.runId !== runId) {
    return current || null;
  }

  if (
    current.status === "cancelled" &&
    (patch.status === "completed" || patch.status === "failed" || patch.refinedText)
  ) {
    return current;
  }

  return saveLatestRefinementResult({
    ...current,
    ...patch,
  });
}

function createExtendedCancellationError() {
  const error = new Error("Extended refinement stopped by user.");
  error.isExtendedCancellation = true;
  return error;
}

async function assertExtendedRunNotCancelled(runId) {
  if (!runId) return;
  if (cancelledExtendedRunIds.has(runId)) {
    throw createExtendedCancellationError();
  }

  const latest = await getStoredLatestRefinementResult();
  if (latest?.runId === runId && latest.status === "cancelled") {
    cancelledExtendedRunIds.add(runId);
    throw createExtendedCancellationError();
  }
}

async function runExtendedRefinement({
  cancellationRunId,
  modelConfig,
  finalPassModelConfig,
  governingPrompt,
  transcriptText,
}) {
  const trace = createExtendedDebugLog({
    modelConfig,
    finalPassModelConfig,
    transcriptText,
  });
  try {
    const personaMatrix = await loadDirectiveFile(EXTENDED_PERSONA_MATRIX_PATH);
    const sectionResults = [];

    for (const section of EXTENDED_SECTION_PIPELINE) {
      await assertExtendedRunNotCancelled(cancellationRunId);
      const stepDirective = await loadDirectiveFile(section.path);
      const previousSectionContext = formatPreviousSectionContext(sectionResults);
      const primary = await runExtendedPersonaPass({
        cancellationRunId,
        trace,
        modelConfig,
        section,
        persona: section.primary,
        passName: "Primary",
        personaMatrix,
        governingPrompt,
        stepDirective,
        transcriptText,
        previousSectionContext,
        primarySectionOutput: "",
      });
      await waitForExtendedRateLimit(cancellationRunId);

      await assertExtendedRunNotCancelled(cancellationRunId);
      const secondary = await runExtendedPersonaPass({
        cancellationRunId,
        trace,
        modelConfig,
        section,
        persona: section.secondary,
        passName: "Secondary",
        personaMatrix,
        governingPrompt,
        stepDirective,
        transcriptText,
        previousSectionContext,
        primarySectionOutput: primary.text,
      });
      await waitForExtendedRateLimit(cancellationRunId);

      sectionResults.push({
        name: section.name,
        relationship: section.relationship,
        primary: {
          role: section.primary.name,
          text: primary.text,
        },
        secondary: {
          role: section.secondary.name,
          text: secondary.text,
        },
      });
    }

    const finalDirective = await loadDirectiveFile(EXTENDED_FINAL_DIRECTIVE_PATH);
    await assertExtendedRunNotCancelled(cancellationRunId);
    const finalInput = formatExtendedFinalInput({
      trace,
      governingPrompt,
      finalDirective,
      transcriptText,
      sectionResults,
    });
    const finalGenerated = await generateExtendedModelContent({
      cancellationRunId,
      trace,
      modelConfig: finalPassModelConfig || modelConfig,
      callType: "final-synthesis",
      sectionName: "Final Synthesis",
      passName: "Final",
      role: "Final synthesis model",
      contents: finalInput.contents,
      debugRequest: finalInput.debugRequest,
    });
    finalGenerated.entry.normalizedResponseText = finalGenerated.result.text || "";
    trace.status = "completed";
    trace.completedAt = new Date().toISOString();
    trace.finalText = finalGenerated.result.text || "";
    await saveExtendedDebugLog(trace);
    return {
      ...finalGenerated.result,
      debugRunId: trace.runId,
    };
  } catch (error) {
    trace.status = error && error.isExtendedCancellation ? "cancelled" : "failed";
    trace.completedAt = new Date().toISOString();
    trace.error = error.message || "Extended refinement failed.";
    await saveExtendedDebugLog(trace);
    throw error;
  }
}

async function getLatestExtendedDebugLog() {
  const data = await chrome.storage.local.get(EXTENDED_DEBUG_LOG_STORAGE_KEY);
  const log = data[EXTENDED_DEBUG_LOG_STORAGE_KEY];
  if (!log) {
    return {
      ok: false,
      error: "No extended debug log found yet.",
    };
  }

  return {
    ok: true,
    log,
    text: JSON.stringify(log, null, 2),
  };
}

async function saveExtendedDebugLog(trace) {
  await chrome.storage.local.set({
    [EXTENDED_DEBUG_LOG_STORAGE_KEY]: {
      ...trace,
      callCount: trace.calls.length,
      totalDurationMs: computeTraceDurationMs(trace),
    },
  });
}

function createExtendedDebugLog({ modelConfig, finalPassModelConfig, transcriptText }) {
  const startedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    runId: `extended-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    status: "running",
    startedAt,
    completedAt: "",
    callCount: 0,
    totalDurationMs: 0,
    rateLimit: {
      lightweightCallDelayMs: EXTENDED_LIGHTWEIGHT_CALL_DELAY_MS,
      expectedDefaultCallPlan:
        "14 lightweight persona calls + optional repair calls + 1 final synthesis call",
    },
    models: {
      lightweight: summarizeModelConfig(modelConfig),
      finalPass: summarizeModelConfig(finalPassModelConfig || modelConfig),
    },
    transcript: {
      characterCount: cleanText(transcriptText).length,
    },
    promptLibrary: {},
    calls: [],
    events: [],
    finalText: "",
    error: "",
  };
}

function computeTraceDurationMs(trace) {
  const started = Date.parse(trace.startedAt);
  const completed = Date.parse(trace.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return 0;
  return Math.max(0, completed - started);
}

function summarizeModelConfig(modelConfig = {}) {
  return {
    id: modelConfig.id || "",
    name: modelConfig.name || "",
    provider: modelConfig.provider || "",
    adapter: modelConfig.adapter || "",
    model: modelConfig.model || "",
    baseUrl: modelConfig.baseUrl || "",
    hasApiKey: Boolean(modelConfig.apiKey),
  };
}

function sanitizeDebugValue(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeDebugValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if (/(api[-_]?key|authorization|bearer|token|secret|password)/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, sanitizeDebugValue(entryValue)];
    }),
  );
}

function createDebugTextHash(text) {
  const value = String(text || "");
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function addDebugPromptLibraryEntry(trace, label, text) {
  if (!trace) return null;

  const value = cleanText(text);
  const hash = createDebugTextHash(value);
  const idBase = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const id = `${idBase || "prompt"}-${hash}`;
  if (!trace.promptLibrary[id]) {
    trace.promptLibrary[id] = {
      label,
      hash,
      characterCount: value.length,
      preview: value.slice(0, 700),
      contents: EXTENDED_DEBUG_LOG_INCLUDE_FULL_REQUESTS ? value : "",
    };
  }
  return id;
}

function createDebugTextRef(trace, label, text) {
  const value = cleanText(text);
  return {
    refId: addDebugPromptLibraryEntry(trace, label, value),
    hash: createDebugTextHash(value),
    characterCount: value.length,
    preview: value.slice(0, 700),
  };
}

async function generateExtendedModelContent({
  cancellationRunId,
  trace,
  modelConfig,
  callType,
  sectionName,
  passName,
  role,
  contents,
  debugRequest,
}) {
  await assertExtendedRunNotCancelled(cancellationRunId);
  const requestText = String(contents || "");
  const entry = {
    index: trace.calls.length + 1,
    callType,
    sectionName,
    passName,
    role,
    model: summarizeModelConfig(modelConfig),
    startedAt: new Date().toISOString(),
    completedAt: "",
    durationMs: 0,
    request: {
      characterCount: requestText.length,
      hash: createDebugTextHash(requestText),
      preview: cleanText(requestText).slice(0, 700),
      refs: debugRequest && debugRequest.refs ? debugRequest.refs : {},
      uniqueParts: debugRequest && debugRequest.uniqueParts ? debugRequest.uniqueParts : {},
      contents: EXTENDED_DEBUG_LOG_INCLUDE_FULL_REQUESTS ? requestText : "",
    },
    response: {
      text: "",
      raw: null,
    },
    normalizedResponseText: "",
    error: "",
  };
  trace.calls.push(entry);

  try {
    const result = await globalThis.OtterCopyModelProviderClient.generateModelContent({
      modelConfig,
      contents,
    });
    await assertExtendedRunNotCancelled(cancellationRunId);
    entry.response.text = result && result.text ? result.text : "";
    entry.response.raw = result && result.raw ? sanitizeDebugValue(result.raw) : null;
    entry.completedAt = new Date().toISOString();
    entry.durationMs = computeTraceDurationMs(entry);
    return { result, entry };
  } catch (error) {
    entry.error = error.message || "Model request failed.";
    entry.completedAt = new Date().toISOString();
    entry.durationMs = computeTraceDurationMs(entry);
    throw error;
  }
}

async function runExtendedPersonaPass({
  cancellationRunId,
  trace,
  modelConfig,
  section,
  persona,
  passName,
  personaMatrix,
  governingPrompt,
  stepDirective,
  transcriptText,
  previousSectionContext,
  primarySectionOutput,
}) {
  try {
    const input = formatExtendedPersonaInput({
      trace,
      section,
      persona,
      passName,
      personaMatrix,
      governingPrompt,
      stepDirective,
      transcriptText,
      previousSectionContext,
      primarySectionOutput,
    });
    const generated = await generateExtendedModelContent({
      cancellationRunId,
      trace,
      modelConfig,
      callType: "persona",
      sectionName: section.name,
      passName,
      role: persona.name,
      contents: input.contents,
      debugRequest: input.debugRequest,
    });
    const normalizedText = await normalizeOrRepairExtendedPersonaResult({
      cancellationRunId,
      trace,
      modelConfig,
      section,
      persona,
      passName,
      transcriptText,
      originalResponse: generated.result && generated.result.text,
      sourceEntry: generated.entry,
    });
    generated.entry.normalizedResponseText = normalizedText;
    return {
      ...generated.result,
      text: normalizedText,
    };
  } catch (error) {
    if (error && error.isExtendedCancellation) {
      throw error;
    }
    throw new Error(
      `${section.name} ${passName.toLowerCase()} persona pass failed (${persona.name}): ${
        error.message || "Model request failed."
      }`,
    );
  }
}

async function normalizeOrRepairExtendedPersonaResult({
  cancellationRunId,
  trace,
  modelConfig,
  section,
  persona,
  passName,
  transcriptText,
  originalResponse,
  sourceEntry,
}) {
  try {
    return normalizeExtendedPersonaResult(originalResponse);
  } catch (formatError) {
    if (sourceEntry) {
      sourceEntry.error = formatError.message || "Persona response format issue.";
    }
    await waitForExtendedRateLimit(cancellationRunId);
    try {
      const repairInput = formatExtendedPersonaRepairInput({
        trace,
        section,
        persona,
        passName,
        transcriptText,
        originalResponse,
        formatError,
      });
      const repair = await generateExtendedModelContent({
        cancellationRunId,
        trace,
        modelConfig,
        callType: "persona-format-repair",
        sectionName: section.name,
        passName,
        role: `${persona.name} format repair`,
        contents: repairInput.contents,
        debugRequest: repairInput.debugRequest,
      });
      const repairedText = normalizeExtendedPersonaResult(repair.result && repair.result.text);
      repair.entry.normalizedResponseText = repairedText;
      return repairedText;
    } catch (repairError) {
      if (repairError && repairError.isExtendedCancellation) {
        throw repairError;
      }
      const fallbackText = wrapUnstructuredPersonaResult(originalResponse, formatError);
      trace.events.push({
        type: "persona-format-fallback",
        at: new Date().toISOString(),
        sectionName: section.name,
        passName,
        role: persona.name,
        originalFormatError: formatError.message || "",
        repairError: repairError.message || "",
      });
      return fallbackText;
    }
  }
}

function normalizeExtendedPersonaResult(text) {
  const resultText = cleanText(text);
  if (!resultText.includes("SECTION_OUTPUT:") || !resultText.includes("CLAIM_LEDGER:")) {
    throw new Error("Persona response must include SECTION_OUTPUT and CLAIM_LEDGER.");
  }

  const missingLabels = CLAIM_LEDGER_CONTRACT.filter(
    (label) => !resultText.includes(`[${label}]`),
  );
  if (missingLabels.length === 0) return resultText;

  return [
    resultText,
    "",
    ...missingLabels.map((label) => `* [${label}] None identified.`),
  ].join("\n");
}

function wrapUnstructuredPersonaResult(text, formatError) {
  return [
    "SECTION_OUTPUT:",
    cleanText(text) || "(No usable persona output returned.)",
    "",
    "CLAIM_LEDGER:",
    "",
    `* [Explicit] The persona response was unstructured; final synthesis must verify any concrete claims against the transcript. Original format issue: ${
      formatError.message || "missing required structure"
    }`,
    "* [Strong Inference] None identified.",
    "* [Weak Inference] None identified.",
    "* [Speculative] None identified.",
    "* [Discard] None identified.",
  ].join("\n");
}

function formatExtendedPersonaRepairInput({
  trace,
  section,
  persona,
  passName,
  transcriptText,
  originalResponse,
  formatError,
}) {
  const contents = [
    "Repair the previous persona response format without adding new analysis.",
    "",
    `Section: ${section.name}`,
    `Pass: ${passName}`,
    `Role: ${persona.name}`,
    "",
    `Format issue: ${formatError.message || "The response did not match the required structure."}`,
    "",
    "Original persona response:",
    cleanText(originalResponse) || "(Empty response.)",
    "",
    "Full transcript for claim classification only:",
    cleanText(transcriptText),
    "",
    "Return exactly this structure and include every claim label. Use `None identified.` for empty claim buckets.",
    "",
    "SECTION_OUTPUT:",
    "<the original section contribution, cleaned up only as needed>",
    "",
    "CLAIM_LEDGER:",
    "",
    "* [Explicit] Claims directly supported by the transcript.",
    "* [Strong Inference] Claims strongly implied by the transcript.",
    "* [Weak Inference] Claims that may be useful but should be softened or qualified.",
    "* [Speculative] Claims that should only appear in Risks or Open Questions, if included at all.",
    "* [Discard] Claims or ideas that should not be included in the final artifact.",
  ].join("\n");

  return {
    contents,
    debugRequest: {
      refs: {
        originalResponse: createDebugTextRef(
          trace,
          `${section.name} ${passName} unstructured original response`,
          originalResponse || "(Empty response.)",
        ),
        transcript: createDebugTextRef(trace, "Full transcript", transcriptText),
      },
      uniqueParts: {
        sectionName: section.name,
        passName,
        role: persona.name,
        formatIssue: formatError.message || "The response did not match the required structure.",
      },
    },
  };
}

async function loadDirectiveFile(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) {
    throw new Error(`Could not load extended directive file: ${path}`);
  }

  return response.text();
}

function formatExtendedPersonaInput({
  trace,
  section,
  persona,
  passName,
  personaMatrix,
  governingPrompt,
  stepDirective,
  transcriptText,
  previousSectionContext,
  primarySectionOutput,
}) {
  const contents = [
    "You are completing one narrowly scoped persona pass in a deterministic transcript refinement workflow.",
    "",
    `Section: ${section.name}`,
    `Pass: ${passName}`,
    `Relationship for this section: ${section.relationship}`,
    "",
    "Full governing prompt:",
    cleanText(governingPrompt),
    "",
    "Persona matrix source of truth:",
    cleanText(personaMatrix),
    "",
    "Section directive:",
    cleanText(stepDirective),
    "",
    "Persona prompt:",
    `Role: ${persona.name}`,
    "",
    `Why you are in the room: ${persona.why}`,
    "",
    "How you think:",
    persona.how,
    "",
    "What you produce:",
    persona.produces,
    "",
    `What you avoid: ${persona.avoids}`,
    "",
    "Claim discipline:",
    formatClaimLedgerInstructions(),
    "",
    "Previous section outputs for dependency context only:",
    cleanText(previousSectionContext) || "(No previous section outputs.)",
    "",
    "Primary section output for this section:",
    cleanText(primarySectionOutput) || "(This is the primary pass.)",
    "",
    "Full transcript:",
    cleanText(transcriptText),
    "",
    "Return exactly this structure:",
    "The first non-whitespace text in your response must be `SECTION_OUTPUT:`. Do not start with a Markdown heading, explanation, greeting, or summary.",
    "",
    "SECTION_OUTPUT:",
    "<section-specific draft, revision, pruning notes, or review contribution>",
    "",
    "CLAIM_LEDGER:",
    "",
    "* [Explicit] Claims directly supported by the transcript.",
    "* [Strong Inference] Claims strongly implied by the transcript.",
    "* [Weak Inference] Claims that may be useful but should be softened or qualified.",
    "* [Speculative] Claims that should only appear in Risks or Open Questions, if included at all.",
    "* [Discard] Claims or ideas that should not be included in the final artifact.",
    "",
    "Include every claim label even when that bucket is empty. Use `None identified.` for empty claim buckets.",
  ].join("\n");

  return {
    contents,
    debugRequest: {
      refs: {
        governingPrompt: createDebugTextRef(trace, "Full governing prompt", governingPrompt),
        personaMatrix: createDebugTextRef(trace, "Persona matrix source of truth", personaMatrix),
        sectionDirective: createDebugTextRef(trace, `${section.name} section directive`, stepDirective),
        previousSectionContext: createDebugTextRef(
          trace,
          `${section.name} previous section context before ${passName}`,
          previousSectionContext || "(No previous section outputs.)",
        ),
        primarySectionOutput: createDebugTextRef(
          trace,
          `${section.name} primary output before ${passName}`,
          primarySectionOutput || "(This is the primary pass.)",
        ),
        transcript: createDebugTextRef(trace, "Full transcript", transcriptText),
      },
      uniqueParts: {
        sectionName: section.name,
        passName,
        relationship: section.relationship,
        role: persona.name,
        why: persona.why,
        how: persona.how,
        produces: persona.produces,
        avoids: persona.avoids,
      },
    },
  };
}

function formatExtendedFinalInput({
  trace,
  governingPrompt,
  finalDirective,
  transcriptText,
  sectionResults,
}) {
  const collectedSectionResults = formatCollectedSectionResults(sectionResults);
  const contents = [
    "You are completing the final consolidation pass for a transcript refinement workflow.",
    "Function as an architect, editor, and evidence reconciler.",
    "",
    "Full governing prompt:",
    cleanText(governingPrompt),
    "",
    "Final directive:",
    cleanText(finalDirective),
    "",
    "Final synthesis rules:",
    "Use Explicit claims freely.",
    "Use Strong Inference claims when they improve the artifact and remain grounded, but phrase inferred implementation direction as preferred, likely, or recommended rather than already decided.",
    "Use Weak Inference claims only with qualified wording, or move them into Implementation Notes, Risks, Open Questions, or investigation-focused Action Items.",
    "Move Speculative claims to Risks or Open Questions, if they are materially useful.",
    "Do not include Discard claims.",
    "Do not present inferred implementation details as confirmed facts.",
    "Do not convert inferred implementation choices into hard requirements, non-goals, or direct build steps unless the transcript clearly supports them.",
    "Do not claim that migrations, guard edits, helper providers, routes, DTO extraction, request flags, or architectural separation are required unless the transcript explicitly supports that exact commitment.",
    "Do not treat a request flag such as `isDeliverable` as the authorization boundary unless the transcript explicitly says it is; it may identify intent or route to the correct domain-specific permission check.",
    "When an implementation detail is useful but not confirmed, use language like `likely`, `consider`, `confirm whether`, or `if the existing code supports it`.",
    "Preserve materially relevant open questions even when a pruning pass removed them, especially questions about downstream events, notifications, audit logs, integrations, or existing service side effects.",
    "Action Items may include confirmation or investigation steps when the next build decision depends on an inferred detail.",
    "Preserve concrete names, constraints, systems, roles, guards, services, endpoints, DTOs, and technical details from the transcript.",
    "Prefer concise synthesis over exhaustive inclusion.",
    "Reconcile conflicts between primary and secondary passes.",
    "Remove duplication between section outputs.",
    "Ensure the final result reads like one coherent engineering artifact, not a stitched-together set of agent notes.",
    "Do not invent new facts during final synthesis.",
    "",
    "Collected section outputs and claim ledgers:",
    collectedSectionResults,
    "",
    "Full transcript:",
    cleanText(transcriptText),
  ].join("\n");

  return {
    contents,
    debugRequest: {
      refs: {
        governingPrompt: createDebugTextRef(trace, "Full governing prompt", governingPrompt),
        finalDirective: createDebugTextRef(trace, "Final directive", finalDirective),
        collectedSectionResults: createDebugTextRef(
          trace,
          "Collected section outputs and claim ledgers",
          collectedSectionResults,
        ),
        transcript: createDebugTextRef(trace, "Full transcript", transcriptText),
      },
      uniqueParts: {
        role: "Final synthesis model",
        sectionCount: sectionResults.length,
      },
    },
  };
}

function formatClaimLedgerInstructions() {
  return CLAIM_LEDGER_CONTRACT.map((label) => `- ${label}`).join("\n");
}

async function waitForExtendedRateLimit(cancellationRunId) {
  if (EXTENDED_LIGHTWEIGHT_CALL_DELAY_MS <= 0) return;
  const intervalMs = 250;
  let elapsedMs = 0;
  while (elapsedMs < EXTENDED_LIGHTWEIGHT_CALL_DELAY_MS) {
    await assertExtendedRunNotCancelled(cancellationRunId);
    const nextDelay = Math.min(intervalMs, EXTENDED_LIGHTWEIGHT_CALL_DELAY_MS - elapsedMs);
    await new Promise((resolve) => setTimeout(resolve, nextDelay));
    elapsedMs += nextDelay;
  }
  await assertExtendedRunNotCancelled(cancellationRunId);
}

function formatPreviousSectionContext(sectionResults) {
  if (!sectionResults.length) return "";

  return sectionResults
    .map((result) =>
      [
        `## ${result.name}`,
        `Primary (${result.primary.role}):`,
        cleanText(result.primary.text),
        "",
        `Secondary (${result.secondary.role}):`,
        cleanText(result.secondary.text),
      ].join("\n"),
    )
    .join("\n\n");
}

function formatCollectedSectionResults(sectionResults) {
  return sectionResults
    .map((result, index) =>
      [
        `# Section ${index + 1}: ${result.name}`,
        `Relationship: ${result.relationship}`,
        "",
        `## Primary: ${result.primary.role}`,
        cleanText(result.primary.text),
        "",
        `## Secondary: ${result.secondary.role}`,
        cleanText(result.secondary.text),
      ].join("\n"),
    )
    .join("\n\n");
}

function formatTranscriptForRefinement(refinementPrompt, transcriptText) {
  const prompt = cleanText(refinementPrompt);
  const transcript = cleanText(transcriptText);

  if (!prompt) {
    return transcript;
  }

  return `${prompt}\n\n---\n\nTranscript:\n\n${transcript}`;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
