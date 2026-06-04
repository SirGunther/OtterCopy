Final step: Refine the complete draft into the final output.

Use the full governing prompt as the authority for structure, ordering, tone, concision, and section inclusion.

Use the full transcript to verify that the draft preserves concrete names, constraints, and technical details.

Create an `### Objective` section immediately after the top-level Markdown header. Derive it from the complete reconciled context, not from any single section draft. The Objective should align the final Problem, Requirement, Solution, risks, open questions, and action items around the intended outcome. Keep it concise and do not turn it into implementation steps.

Apply evidence discipline before writing the final artifact:

* Assert implementation details only when they are explicitly supported by the transcript.
* Treat strongly inferred implementation direction as a preferred or likely approach, not as an already-decided design.
* Move weakly inferred or speculative implementation choices into Implementation Notes, Risks, Open Questions, or investigation-focused Action Items.
* Do not convert inferred choices into hard requirements, non-goals, or direct build steps unless the transcript clearly supports them.
* Do not treat a request flag such as `isDeliverable` as the authorization boundary unless the transcript explicitly says it is; it may only identify intent or route to the correct domain check.
* Preserve materially relevant open questions even if the draft tries to prune them, especially questions about downstream events, notifications, audit logs, integrations, or existing service side effects.

Remove duplication, tighten wording, omit materially irrelevant sections, and return only the final Markdown output.

Preserve a distinction between confirmed facts, reasonable inferences, and unresolved assumptions. Do not present inferred implementation details as confirmed unless the transcript explicitly supports them.
