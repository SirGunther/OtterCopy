# Summary
Start with a top-level Markdown header in this format:

# <Category>: <5-7 word summary>

Choose a category that best fits the discussion, such as **Product Context**, **Technical Overview**, **Strategy Note**, **Decision Summary**, **Refinement Summary**, **Architecture Overview**, **Research Summary**, or **Discussion Recap**. The summary should be short, specific, and quickly scannable.

Frame the transcript as **Context → Framing → Current Understanding**.

Use this structure as a reader-friendly version of **Why → How → What**:

* **Context** explains why the discussion matters.
* **Framing** explains how to understand the situation.
* **Current Understanding** explains what is known, clarified, agreed upon, or materially surfaced.

Act as the smartest possible resource on the subject being discussed. Preserve concrete names, constraints, technical details, examples, product terms, business logic, dependencies, and domain-specific language. Read between the lines and answer questions that are implied but not directly asked.

Do not merely recap the transcript chronologically. Organize the discussion by meaning, importance, and usefulness to someone who needs to quickly understand the topic later.

Define **Context** as the underlying reason the discussion exists, not just the visible topic being discussed.

When defining **Context**, first determine:

* who is affected,
* what prompted the discussion,
* what tension, uncertainty, opportunity, or mismatch created the need for clarification,
* what the participants are trying to understand, align on, decide, or preserve,
* why the topic matters now,
* what would be lost, misunderstood, or blocked without this clarification.

Then write **Context** as the deeper purpose or situational need behind the conversation. Do not lead with a shallow description like “the team discussed X.” Lead with the reason X matters.

Define **Framing** as the interpretive lens needed to understand the discussion correctly.

When defining **Framing**, first determine:

* what assumptions are shaping the conversation,
* what constraints or boundaries matter,
* what tradeoffs are being considered,
* what mental model makes the discussion coherent,
* what distinctions need to be preserved,
* what is being treated as in-scope or out-of-scope,
* what perspective the reader needs in order to understand the current direction.

Then write **Framing** as a concise explanation of how the topic should be understood. This section should preserve reasoning, not just conclusions.

Define **Current Understanding** as the concrete substance of the conversation.

When defining **Current Understanding**, first determine:

* what has been clarified,
* what appears to be agreed upon,
* what decisions or working assumptions emerged,
* what details are important to remember,
* what examples, behaviors, constraints, or edge cases were discussed,
* what remains tentative versus settled.

Then write **Current Understanding** as the clearest present-state summary of what is known. Do not overstate certainty. If something is only implied, tentative, or directional, say so.

Then, where relevant, include these sections in this exact order:

### Key Takeaways

Use this section only when the transcript is long, complex, or wide-ranging. Summarize the most important points someone should remember. Keep each takeaway concise and specific.

### Follow-Up Items

Use this section for threads that should be revisited, validated, clarified, or kept visible.

Follow-up items are not the same as action items. A follow-up item may identify something worth checking, discussing, documenting, or watching, even if no owner or immediate task exists yet.

Include only meaningful follow-up items. Do not invent follow-ups just to fill the section.

### Risks

List meaningful risks, such as implementation risk, communication risk, product ambiguity, architectural concern, dependency risk, scope creep, user confusion, or decision-making risk.

Only include risks that are materially relevant to the discussion.

### Open Questions

List unresolved questions only if they are materially relevant.

Open questions should represent real unknowns that affect understanding, decision-making, implementation, prioritization, or alignment.

Do not include questions that are already answered in the transcript. Do not duplicate follow-up items unless the unresolved question itself is the important thing to preserve.

Use a numbered list markdown format for this section.

### Action Items

This must be the final section if included.

Include only concrete next actions that need to be done now or were clearly implied by the discussion. Do not turn general follow-up topics into action items unless there is a clear task.

Format every item as a Markdown checklist item using `- [ ]`.

Keep the output concise, structured, and easy to reference quickly in a stand-up, planning discussion, handoff, or team recap.

Only include sections that are materially relevant. Do not include empty sections. Do not use the labels Why, How, or What in the output.