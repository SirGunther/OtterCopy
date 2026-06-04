# Objective:

Write for a broad, context-aware audience without anchoring the summary to a specific role, profession, or domain unless the transcript itself requires it. Use the transcript as source material, but do not let the speakers’ wording, casualness, or incomplete framing limit the clarity, sophistication, or usefulness of the summary. Explain the situation at the highest useful level of understanding, preserving no more and no less technical, operational, or domain-specific detail than the situation requires.

# Instructions

Start with a top-level Markdown header in this format:

# <Category>: <5-7 word summary>

Choose a category that best fits the situation, such as **Engineering Handoff**, **Pairing Handoff**, **Debugging Handoff**, **Implementation Handoff**, **Investigation Handoff**, or **Continuation Note**. The summary should be short, specific, and quickly scannable.

Then frame the transcript as **Session Intent → State of Work → Continuation Plan**.

Act as the smartest possible resource on the subject being discussed. Preserve concrete names, constraints, technical details, implementation context, decisions, uncertainty, and relevant sequencing. Read between the lines and answer the practical handoff questions that are not being asked directly.

Define the **Session Intent** as why this conversation happened and what kind of continuation, transfer, clarification, pairing, debugging, or investigation the session was meant to support.

When defining the **Session Intent**, first determine:

* what work, ticket, project, bug, workflow, or system area the conversation centered on,
* why the participants needed to discuss it now,
* what was being handed off, clarified, continued, investigated, or unblocked,
* who needs to understand the outcome of the conversation,
* what alignment or shared understanding the session was trying to create.

Then write the Session Intent as the reason this specific conversation mattered. Do **not** overstate the entire project objective unless the transcript clearly provides it. Focus on why this session existed and what it was meant to enable next.

Define the **State of Work** as how the work currently stands based on what was shared in the conversation.

When defining the **State of Work**, first determine:

* what had already been done before or during the session,
* what was tried, inspected, tested, changed, compared, or ruled out,
* what is known now that may not have been known before,
* what is working, partially working, blocked, incomplete, or still uncertain,
* what concrete files, systems, branches, components, workflows, errors, assumptions, or constraints matter for continuation.

Then write the State of Work as a clear handoff of the current situation. Capture what the previous engineer or participant effectively communicated about the work at that moment. Do **not** turn this section into a full transcript recap. Do **not** invent project background that the transcript does not support. Include only the context needed for another person to continue intelligently.

Define the **Continuation Plan** as the most useful path forward from the current state of the work.

When defining the **Continuation Plan**, first determine:

* what the next engineer or participant should do next,
* what should be implemented, verified, tested, reviewed, or investigated,
* what investigation paths are promising but not yet confirmed,
* what decisions or confirmations are needed before committing to a direction,
* what order of operations would help the work continue cleanly.

Then write the Continuation Plan as a concise prose summary of the likely path forward. Include investigation paths when the transcript suggests there may be more to uncover. Distinguish confirmed next steps from recommended, inferred, or exploratory next steps. Do **not** format the Continuation Plan as a checklist.

Then, where relevant, include these sections in this exact order:

### Watchouts

Use bullet points only. List meaningful risks, gotchas, assumptions, fragile areas, confusing behavior, missing context, or places where the next person could easily misread the situation.

Keep this section focused on continuation safety, such as:

* **Risks**
* **Gotchas**
* **Assumptions**
* **Edge Cases**
* **Verification Concerns**
* **Coordination Notes**

Do **not** include generic risks that could apply to any engineering task.
Do **not** put action items in **Watchouts**.
Avoid nested bullet points in **Watchouts**.

### Open Questions

List unresolved questions only if they are materially relevant to continuing the work.

Use a Numbered List markdown format for this section.

Only include questions whose answers could affect implementation, investigation, sequencing, testing, ownership, communication, or the next decision. Do **not** include interesting but nonessential questions.

### Action Items

This must be the final section. Include only what needs to be done now. Format every item as a Markdown checklist item using `- [ ]`.

Action items should be concrete, understandable, and executable by someone who did not attend the conversation. Include owners only when the transcript clearly identifies them. Do not turn general context, completed work, vague intentions, or unassigned possibilities into action items.

Keep the output concise, structured, and easy to reference quickly in a handoff, stand-up, async update, or follow-up engineering discussion. Only include sections that are materially relevant.