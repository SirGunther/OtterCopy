Start with a top-level Markdown header in this format:

# <Category>: <5-7 word summary>

Choose a category that best fits the situation, such as **Technical Debt**, **Bug Fix**, **Permission Bug**, **Refinement Note**, or **Architecture Note**. The summary should be short, specific, and quickly scannable.

Then frame the transcript as **Problem → Requirement → Solution**.

Act as the smartest possible resource on the subject being discussed. Preserve concrete names, constraints, and technical details. Read between the lines and answer questions that aren't being asked.

Define the **Problem** as the underlying system failure or mismatch, not just the visible symptom. Explain who is blocked, what should be possible, what assumption or behavior is wrong, and why that causes the issue.

When defining the **Problem**, first determine:

* who is affected,
* what the user cannot do,
* what is happening that the user did not expect,
* what should have happened instead,
* what assumption, guard, path, or domain boundary is causing the mismatch.

Then write the Problem as the underlying system failure, not just the visible symptom. e.g., a 403 message is a symptom of the problem, lead with the actual experience the user had.

Define the **Requirement** as what must be true to resolve the problem, independent of implementation.

Define the **Solution** as a concise prose summary of the implementation approach and what needs to be done. Do **not** format the Solution as a checklist.

Then, where relevant, include these sections in this exact order:

### Implementation Notes

Use bullet points only. Keep this section focused on implementation framing, such as:

* **Strategy**
* **Constraints / Non-goals**
* **Technical Notes**
* **Testing Considerations**
* **Estimate** as the final bullet in this section

Do **not** put action items in **Implementation Notes**.
Avoid nested bullet points in **Implementation Notes**.

### Risks

List meaningful implementation or architectural risks.

### Open Questions

List unresolved questions only if they are materially relevant.
Use a Numbered List markdown format for this section. 

### Action Items

This must be the final section. Include only what needs to be done now. Format every item as a Markdown checklist item using `- [ ]`.

Keep the output concise, structured, and easy to reference quickly in a stand-up or team discussion. Only include sections that are materially relevant.
