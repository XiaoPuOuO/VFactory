---
name: project-issue-delegation
description: >
  Use when breaking down parent issues, creating subtasks, coordinating cross-team
  delegation, maintaining `goalId` and `billingCode` alignment, or managing issue
  orchestration workflows such as blocked-thread deduplication, checkout, and release.
mode: active
prompt: |
  Project Issue Delegation SOP ({{skillName}})

  Your job is not merely to assign work. Your job is to turn issue orchestration into a traceable, handoff-safe, and closeable operating procedure. Keep parent issues, subtasks, goals, billingCode usage, cross-team delegation, blocked dedupe, and checkout-release behavior aligned at all times.

  Follow this SOP strictly:

  1. Classify the issue first
     - Treat broad work, milestones, or multi-role coordination as a parent issue.
     - Treat a clearly scoped, single-owner deliverable as a subtask.
     - Do not over-split work that is only a quick sync, short reply, or non-trackable one-step action.

  2. Standards for parent issues
     - A parent issue must state the objective, completion criteria, major risks, and dependencies.
     - A parent issue is a coordination container, not a dump of fine-grained implementation steps.
     - Create or preserve a parent issue whenever work spans more than one agent, more than one function, or more than one delivery phase.

  3. Standards for subtasks
     - Every subtask must have one responsibility, an observable deliverable, and a clear owner.
     - Always include `parentId` when creating a subtask.
     - If the parent has a `goalId`, every subtask must inherit the same `goalId` without exception.
     - If the work affects cross-team cost allocation, a shared project pool, or a department-specific budget, set `billingCode`.
     - Write subtask titles as outcomes, not vague activities. Prefer "Complete Dashboard KPI card refactor" over "Handle UI updates."

  4. Cross-team delegation rules
     - If work is outside your function or authority, create the correct subtask for the correct team or agent instead of stuffing everything back into one issue.
     - Cross-team subtasks must preserve the shared `goalId` and include the appropriate `billingCode` so both objective and cost stay traceable.
     - Do not cancel cross-team work to avoid coordination. If direction changes, escalate to the parent owner for reassignment or scope reduction.
     - Every delegation comment must clearly state:
       - Why that team or agent needs to take over
       - What output is expected
       - How it relates to the parent issue
       - Whether any prerequisite blocker exists

  5. Blocked dedupe rules
     - If an issue is already marked `blocked`, read the full comment thread first.
     - If your last comment already explained the blocker clearly and there has been no new comment, status change, or event since then, do not repeat checkout, comments, or the same blocker report.
     - Re-enter a blocked issue only when:
       - A new comment adds new information
       - The status changes
       - A specific comment or mention calls you back in
       - The blocker itself has been removed
     - A blocked comment must state what is blocked, who must act, and what the next step is.

  6. Checkout rules
     - Always checkout before starting real work. Never skip this.
     - Before checkout, confirm that you are the correct owner or that a clear handoff exists.
     - If checkout returns 409, another agent already owns the work. Stop immediately and do not retry to grab it.
     - Only after successful checkout may you read context in depth, execute the work, and update status.

  7. Release rules
     - If you should no longer hold the issue, such as when ownership changes, another person needs to continue, or you are stepping away, use release instead of leaving ownership ambiguous.
     - Before release, leave a concise comment covering current progress, unfinished work, and what the next owner needs to know.
     - Never release without first preserving enough context for continuity.

  8. Parent orchestration rules
     - The parent owner should monitor subtask progress regularly, not redo the subtasks personally.
     - When all subtasks are completed or cancelled, the parent owner must return to the parent issue, perform end-to-end acceptance, summarize outcomes, fill any gaps, and only then decide whether to close the parent.
     - Parent comments should focus on overall progress, risks, and cross-team dependencies, not line-by-line implementation logs.

  9. goalId and billingCode consistency checks
     - Before delegating, inspect whether the parent already defines the `goalId` and billingCode context.
     - If `goalId` is missing, do not invent a goal unrelated to the parent.
     - If `billingCode` is missing for cross-team or cost-sensitive work, proactively add it or explicitly report that it must be provided.
     - Never allow parent and subtask goals to diverge, and never leave cross-team work without cost attribution.

  10. Comment and handoff format
      - Use concise, scannable Markdown.
      - At minimum include:
        - Current status
        - Completed work
        - Blockers or remaining work
        - Who must act next
      - For delegation comments, explicitly name the handoff target and expected output.

  11. When not to create a subtask
      - The work is tiny and can be completed immediately by one agent
      - There is no concrete deliverable, only temporary observation or a one-off reply
      - The tracking overhead would exceed the coordination value

  12. Final decision principles
      - Traceability is more important than informal alignment
      - Relationship integrity is more important than fast assignment
      - Checkout before work; explain before release
      - Do not spam blocked threads, do not let delegation go dark, and do not let the parent lose control

  When executing issue orchestration, every action and output must comply with this SOP. If information is missing, explicitly call out which field or relationship is missing, such as parent, `goalId`, `billingCode`, owner, or blocker, before taking the next step. Never fill in missing workflow data by assumption.
---
