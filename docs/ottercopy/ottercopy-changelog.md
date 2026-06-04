# OtterCopy Changelog

## Purpose

Track implementation sessions for the OtterCopy browser extension.

## Scope

Personal project changelog for extension behavior, prompt workflow changes, and verification notes.

## Session Log

### 2026-06-04T18:17:06Z — OtterCopy

Summary: Moved Objective generation to a separate post-final insertion pass.

Files / areas:
- `background.js`
- `prompts/extended/08-final-pass.md`
- `promptStore.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Final synthesis is Objective-agnostic again and produces the normal refined artifact.
- A separate `objective-insertion` model call now runs after final synthesis using the base/active model, generates only the `### Objective` block, and code inserts that block between the H1 and the first section without letting the model rewrite the note.
- Debug logs now show the additional `objective-insertion` call and the expected call plan includes it.
- Built-in prompt storage self-heals if the browser cached the short-lived bad `### Objective` instruction in the main refinement prompt.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check promptStore.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked `runExtendedRefinement(...)` — verified final synthesis prompt no longer includes Objective instructions, the separate objective-only call runs after final synthesis, and the generated block is inserted after the H1.
- Mocked `promptStore.getPrompts()` with a cached built-in prompt containing `### Objective` — verified the cached Objective instruction is removed by refreshing from the packaged prompt.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: objective quality should be checked with a real transcript, especially that the objective-only model does not overreach.

Regression impact:
- Extended output shape intentionally changes via deterministic insertion after final synthesis.
- Final synthesis, saved-result behavior, cancellation, polling, and debug logging remain otherwise unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, mocked pipeline, and prompt-store checks were run.

### 2026-06-04T17:52:07Z — OtterCopy

Summary: Corrected Objective prompt scope to final-pass only.

Files / areas:
- `prompts/refinement.md`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Removed the Objective instruction from the main governing refinement prompt because it changed the weighting and nature of intermediate/single-pass responses.
- Objective remains only in the extended final-pass instruction path through `prompts/extended/08-final-pass.md` and runtime final synthesis rules in `background.js`.
- This restores the main prompt to the original Problem → Requirement → Solution framing while preserving final reconciler-only Objective injection.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `Select-String -Path prompts\refinement.md -Pattern "Objective"` — verified no Objective instruction remains in the main prompt.
- `Select-String` checks verified Objective remains present in `prompts/extended/08-final-pass.md` and runtime final synthesis instructions in `background.js`.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: output quality should be revalidated with a real extended run.

Regression impact:
- Isolated to prompt-scope correction; execution flow, saved-result behavior, cancellation, polling, and debug logging remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax and prompt-presence checks were run.

### 2026-06-04T17:12:47Z — OtterCopy

Summary: Added final-pass Objective section requirement.

Files / areas:
- `prompts/refinement.md`
- `prompts/extended/08-final-pass.md`
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended final synthesis now instructs the reconciler to place an `### Objective` section immediately after the top-level Markdown header.
- The Objective is derived from the complete reconciled context, including Problem, Requirement, Solution, risks, open questions, and action items.
- The Objective is constrained to a concise outcome statement rather than implementation steps.
- The packaged governing prompt now documents the same output shape for future prompt resets and single-pass prompt use.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` final prompt capture — verified the runtime final request includes the Objective order, derivation, and concision rules.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: final artifact quality should be validated with a real transcript output.

Regression impact:
- Isolated to prompt/output-shape instructions; model call sequencing, saved-result behavior, cancellation, and debug logging remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax and mocked prompt-capture checks were run with Node.

### 2026-06-02T19:14:15Z — OtterCopy

Summary: Added popup polling for saved extended-refinement result status.

Files / areas:
- `popup.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- When the popup is open during an extended refinement, the latest-result summary now refreshes every 2.5 seconds while the saved result status is `running`.
- If the popup is reopened while a run is still active, the initial summary refresh detects `running` and starts polling automatically.
- Polling stops once the result is completed, failed, cancelled, unavailable, or missing.

Tests run:
- `node --check popup.js` — syntax check passed.
- `node --check background.js` — syntax check passed.
- Static lookup verified polling starts after extended start and when `renderLatestResultSummary(...)` sees `running`, and stops on non-running states.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: live popup refresh cadence should be validated in Chrome during a real extended run.

Regression impact:
- Isolated to popup status refresh behavior; refinement execution and storage behavior remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax checks were run with Node.

### 2026-06-02T19:10:09Z — OtterCopy

Summary: Fixed stop flow so cancellation cannot get stuck in a pending state.

Files / areas:
- `background.js`
- `popup.js`
- `popup.css`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- `Stop refinement` now marks the latest run `cancelled` immediately instead of leaving it in `cancel_requested`.
- A new extended refinement can be started right after stopping, even if an old provider call is still unwinding.
- Late completion/failure updates from the cancelled run cannot overwrite the terminal cancelled state or the next run.
- Popup now reports `Refinement stopped.`

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked stuck-state reproduction — verified stop immediately saved `cancelled`, a second run started successfully before the old provider call returned, and the old run did not overwrite the latest run.
- Mocked short transcript extraction returning `Transcript` — verified the minimum-character guard still failed before model calls.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: live provider calls still cannot be forcibly aborted mid-request without adding abort-signal support to provider clients.

Regression impact:
- Isolated to extended refinement cancellation state handling.
- Copy-only and single-pass refinement paths remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, and mocked behavior checks were run with Node.

### 2026-06-02T19:06:35Z — OtterCopy

Summary: Added wrong-screen transcript preflight and stop support for extended refinement.

Files / areas:
- `background.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement now rejects extracted transcript text shorter than 100 characters before any model calls, preventing accidental runs on pages that only expose labels such as `Transcript`.
- Popup now includes `Stop refinement`.
- Stop requests mark the latest run as `cancel_requested`, then the pipeline stops before the next model call or after the current in-flight provider call returns.
- Cancelled runs save as `cancelled` instead of `failed`.
- Starting a second extended refinement is blocked while a run is `running` or `cancel_requested`.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked short transcript extraction returning `Transcript` — verified run failed with the minimum-character message and made zero model calls.
- Mocked stop request after the first model response — verified latest result saved as `cancelled` and only one model call was made.
- Mocked normal extended run — verified latest result saved as `completed` with 15 model calls in the no-repair path.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: live cancellation cannot abort a provider request already in flight unless provider/client abort support is added later.

Regression impact:
- Copy-only and single-pass refinement paths remain unchanged.
- Extended refinement gains preflight validation and cooperative cancellation.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, and mocked behavior checks were run with Node.

### 2026-06-02T18:56:45Z — OtterCopy

Summary: Added saved latest-result retrieval for extended refinement.

Files / areas:
- `background.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement now starts as a background-style job and no longer immediately copies the final output or closes the popup.
- The latest extended run is saved in `chrome.storage.local` with `running`, `completed`, or `failed` status.
- Popup now includes `Copy latest result`, allowing the user to reopen the extension later and copy the saved final artifact.
- The saved result includes run metadata, model summaries, prompt summary, transcript character count, completion/error state, final text, and linked debug run id.
- Existing single-pass refinement still copies immediately.
- Existing debug-log copying remains available.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked `startExtendedRefinementJob(...)` — verified start returns while latest result is `running`, completion updates latest result to `completed`, final text is saved, debug run id is linked, and 15 model calls were made in the no-repair path.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: Chrome MV3 service-worker lifetime should be validated in a live browser run while the popup is closed or focus is elsewhere.

Regression impact:
- Copy-only and single-pass refinement paths remain unchanged.
- Extended refinement behavior intentionally changed from immediate clipboard copy to saved-result retrieval.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, and mocked saved-result checks were run with Node.

### 2026-06-02T18:33:18Z — OtterCopy

Summary: Compacted extended debug logs to remove repeated prompt context.

Files / areas:
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- `Copy latest debug log` now produces a less repetitive log.
- Full per-call request prompt bodies are omitted by default.
- Each call keeps request hash, character count, preview, unique call parts, and references into a shared `promptLibrary`.
- Repeated context such as the governing prompt, persona matrix, transcript, and directives is stored or referenced once by hash instead of repeated in every call.
- Responses, normalized responses, repair metadata, timings, call counts, and errors remain inspectable.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked `runExtendedRefinement(...)` — verified per-call request bodies are empty by default, calls include refs/previews/hashes, the persona matrix is stored once in `promptLibrary`, and responses remain visible.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: log size can still be large on long transcripts because responses and normalized outputs remain intentionally visible.

Regression impact:
- Isolated to debug-log serialization; model call contents and refinement behavior remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, and mocked debug-log checks were run with Node.

### 2026-06-02T18:20:12Z — OtterCopy

Summary: Added a copyable debug log for extended refinement model calls.

Files / areas:
- `background.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `manifest.json`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Popup now includes `Copy latest debug log`.
- After an extended refinement run, the latest debug log can be copied as formatted JSON for inspection.
- The log records each extended model call, including persona calls, format-repair calls, final synthesis, model metadata, timestamps, durations, request prompt contents, raw response text, normalized response text, errors, total call count, and rate-limit settings.
- API keys are not logged, and secret-like fields in raw provider payloads are redacted.
- Added `unlimitedStorage` permission so large transcript/prompt debug logs can be retained in `chrome.storage.local`.

Tests run:
- `node --check background.js` — syntax check passed.
- `node --check popup.js` — syntax check passed.
- `node --check content.js` — syntax check passed.
- `node --check modelProviderClient.js` — syntax check passed.
- `node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"` — manifest JSON parsed successfully.
- Mocked `runExtendedRefinement(...)` with one unstructured persona response — verified the stored debug log recorded 16 calls, request/response text, repair-call metadata, final synthesis metadata, and redacted secret-like raw response fields.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: live provider raw payload shapes may contain additional fields that should be redacted if discovered.

Regression impact:
- Copy-only and single-pass refinement behavior remain unchanged.
- Extended refinement now performs the same work while additionally storing the latest run log locally.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; direct syntax, manifest, and mocked debug-log checks were run with Node.

### 2026-06-02T16:55:13Z — OtterCopy

Summary: Added recovery for unstructured persona responses that omit the required top-level labels.

Files / areas:
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement no longer fails immediately when a persona pass returns useful content without `SECTION_OUTPUT` and `CLAIM_LEDGER`.
- The pipeline now attempts a strict format-repair call for that persona response; if repair also fails, it wraps the original content in a conservative structured result and flags that final synthesis must verify claims against the transcript.
- Persona prompts now explicitly require `SECTION_OUTPUT:` as the first non-whitespace response text.

Tests run:
- `node --check background.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` with the first persona returning plain Markdown — verified a repair call ran and the pipeline reached final synthesis.
- Mocked `runExtendedRefinement(...)` with both original and repair responses unstructured — verified the conservative wrapper fallback completed the pipeline.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: provider-specific formatting behavior remains model-dependent in live runs.

Regression impact:
- Isolated to extended persona result normalization/repair in `background.js`; copy-only and single-pass refinement paths remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax and mocked pipeline checks were run directly with Node.

### 2026-06-02T16:50:03Z — OtterCopy

Summary: Tuned final synthesis discipline after reviewing a real extended-refine output and critique.

Files / areas:
- `background.js`
- `prompts/extended/08-final-pass.md`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement should keep the implementation-ticket usefulness of the paired pipeline while reducing over-certainty in the final artifact.
- The final pass now explicitly downgrades inferred implementation choices, avoids turning unconfirmed details into hard requirements or action items, preserves material downstream-effect questions, and treats request flags such as `isDeliverable` as routing/intent signals unless the transcript proves they are authorization boundaries.

Tests run:
- `node --check background.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` with final prompt capture — verified the final synthesis prompt includes the new over-certainty, open-question preservation, and `isDeliverable` boundary rules.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: final artifact quality remains model-dependent and needs another real Otter transcript run.

Regression impact:
- Isolated to final synthesis prompting; persona pass order, copy-only mode, and single-pass refinement behavior remain unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax and mocked prompt-capture checks were run directly with Node.

### 2026-06-02T16:34:42Z — OtterCopy

Summary: Made extended persona claim-ledger handling resilient to omitted empty buckets.

Files / areas:
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement no longer fails when a persona response includes `SECTION_OUTPUT` and `CLAIM_LEDGER` but omits otherwise empty claim labels such as `Weak Inference` or `Speculative`; missing buckets are normalized to `None identified.`

Tests run:
- `node --check background.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` with the Requirement secondary persona omitting `Weak Inference` and `Speculative` — verified the pipeline completed all 15 calls.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: real provider responses may vary in other ways. Smallest follow-up: add a reusable mocked-provider harness if this repo gets a test setup.

Regression impact:
- Isolated to persona response normalization in `background.js`; missing required top-level response sections still fail clearly.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax and mocked pipeline checks were run directly with Node.

### 2026-06-02T16:26:28Z — OtterCopy

Summary: Tuned the extended refinement call pacing and verified malformed persona responses fail clearly.

Files / areas:
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement now spaces lightweight persona calls by default to respect the approximate 15-calls-per-minute budget.
- If a lightweight persona returns an incomplete claim ledger, the popup receives a clear section/persona failure message.

Tests run:
- `node --check background.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` with fake timers — verified 15 calls total: 14 persona passes in expected order plus 1 final synthesis call.
- Mocked malformed persona response — verified failure message names `Header and Problem`, `User Impact Analyst`, and the missing claim labels.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: real Chrome extension behavior and provider timing are not covered by automated tests. Smallest follow-up: add a reusable mocked-provider harness if this repo gets a test setup.

Regression impact:
- Isolated to extended refinement pacing and persona response validation in `background.js`; copy-only and single-pass refinement paths remain untouched.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax and mocked pipeline checks were run directly with Node.

### 2026-06-02T16:24:37Z — OtterCopy

Summary: Validated and hardened the paired extended refinement pipeline.

Files / areas:
- `background.js`
- `docs/ottercopy/ottercopy-changelog.md`

User-visible impact:
- Extended refinement now fails with a clear section/persona error if a lightweight persona response omits `SECTION_OUTPUT`, `CLAIM_LEDGER`, or any required claim label.

Tests run:
- `node --check background.js` — syntax check passed.
- Mocked `runExtendedRefinement(...)` in a Node VM with fake Chrome/fetch/model clients — verified 15 calls total: 14 persona passes in expected order plus 1 final synthesis call.

Tests added/updated:
- No persistent automated tests added; this repo still has no package/test harness. Residual risk: browser-extension runtime behavior with real Chrome APIs and provider responses remains manually verified only. Smallest follow-up: add a reusable mocked-provider harness if this repo gets a test setup.

Regression impact:
- Isolated to extended refinement validation in `background.js`; copy-only mode and single-pass refinement control flow remain untouched.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax and mocked pipeline checks were run directly with Node.

### 2026-06-02T16:22:13Z — OtterCopy

Summary: Reworked extended transcript refinement into a deterministic paired-perspective pipeline.

Files / areas:
- `background.js`

User-visible impact:
- Copy-only mode remains unchanged.
- Single-pass refinement remains unchanged.
- Extended refinement now runs each section through a primary and secondary persona pass, requires `SECTION_OUTPUT` plus `CLAIM_LEDGER`, and sends the collected persona outputs and claim ledgers to the final synthesis model.

Tests run:
- `node --check background.js` — syntax check passed.

Tests added/updated:
- No automated tests added; this repo currently has no package/test harness. Residual risk: full browser-extension runtime behavior and provider call sequencing are not covered by automated tests. Smallest follow-up: add a lightweight mocked-provider harness for `background.js` extended refinement helpers.

Regression impact:
- Isolated to extended refinement in `background.js`; popup actions, transcript extraction, model storage, prompt storage, and single-pass formatting surfaces were checked and left unchanged.

API docs:
- Not relevant: browser extension only; no HTTP API contract or Swagger/OpenAPI surface exists in this repo.

Tooling gates:
- No package-level lint/test/audit gates found because the repo has no `package.json`; syntax check was run for the touched JavaScript file.

## Current State

Extended refinement uses a seven-section paired persona pipeline with claim-ledger discipline before the final synthesis pass.
