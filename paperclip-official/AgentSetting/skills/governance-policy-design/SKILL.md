---
name: governance-policy-design
description: >
  Governance policy design for analyzing approval policy, budget policy, permission models, escalation and blocked flows, and governance acceptance criteria to identify risks, conflicts, and gaps, then produce concrete, actionable policy adjustments.
mode: active
prompt: |
  Governance Policy Design ({{skillName}})

  You will receive one or more governance-related inputs. These may include policy documents, configuration snippets, workflow descriptions, role matrices, budget constraints, permission rules, blocked-case examples, or governance acceptance criteria. Your task is not to give abstract commentary. Your task is to analyze the current state and produce concrete, actionable governance adjustments.

  Keep the analysis focused on these five areas:
  1. approval policy
  2. budget policy
  3. permission model
  4. escalation / blocked flow
  5. governance acceptance

  Follow the workflow below.

  ## 1. Build the current governance map first
  - Start by organizing the governance rules that already exist in the inputs. Do not jump straight to recommendations.
  - For each known rule, identify:
    - rule name
    - scope
    - trigger condition
    - executor / decision owner
    - current limits or exceptions
  - If information is incomplete, list the missing details that materially affect judgment. Do not invent critical rules.

  ## 2. Approval policy analysis requirements
  - Check whether the policy clearly defines:
    - which actions can be auto-approved
    - which actions require manual approval
    - which actions must be prohibited
    - who has approval authority and whether approval authority is tiered
  - Check for common issues such as:
    - approval thresholds that are too low and leak risk
    - approval thresholds that are too high and create operational blockage
    - unclear exception conditions
    - no fast decision path for urgent scenarios
  - Propose specific rule-level adjustments, for example:
    - add approval tiers
    - redefine auto-approve conditions
    - require dual approval for high-risk actions
    - move repetitive low-risk work into a pre-authorized path

  ## 3. Budget policy analysis requirements
  - Check whether the policy clearly defines:
    - total budget caps
    - per-action, per-day, per-task, and per-role limits
    - warning thresholds
    - over-budget handling
    - exception approval flow
  - Check whether any of the following are present:
    - unclear budget ownership
    - poor observability of budget consumption
    - execution continues after budget breach
    - the same limits are used across different environments or risk levels
  - Recommendations must be specific at the rule level, for example:
    - separate exploratory-task budgets from production-task budgets
    - define 50% / 80% / 100% warning and lock behaviors
    - require additional approval for high-cost capabilities

  ## 4. Permission model analysis requirements
  - Check whether roles, capabilities, and resources are aligned:
    - who can read
    - who can write
    - who can execute side-effecting operations
    - who can approve, override, or unblock
  - Check whether the model follows least privilege, separation of duties, and auditability.
  - Explicitly call out:
    - excessive permissions
    - overlapping permissions that blur accountability
    - missing boundaries during role transitions
    - high-risk permissions without additional safeguards
  - Recommendations must be implementable, for example:
    - split reviewer / approver / operator permissions
    - separate production write access from policy override authority
    - apply time-bound or case-bound access to sensitive permissions

  ## 5. Escalation / blocked flow analysis requirements
  - Check whether blocked states are identifiable, classifiable, and handoff-ready.
  - At minimum, analyze these scenarios:
    - missing information
    - insufficient permissions
    - insufficient budget
    - policy conflict
    - cross-role decision required
    - external dependency blocked
  - Check whether escalation is clearly defined:
    - who can escalate
    - who receives the escalation
    - what information must be prepared before escalation
    - time thresholds or SLA
    - response ownership after escalation
  - Recommendations must include process corrections, for example:
    - add a blocked-reason taxonomy
    - assign an owner for each blocker type
    - define escalation timers and fallback owners
    - require evidence, impact scope, and recommended decision options in escalations

  ## 6. Governance acceptance analysis requirements
  - Check whether the current governance acceptance criteria are operational and testable, not just principle-level slogans.
  - Acceptance should cover at least:
    - rule clarity
    - clear accountability
    - controlled exceptions
    - execution observability
    - convergence of blocked / escalation flows
    - auditability and traceability
  - If the current acceptance criteria are weak, you must provide a concrete replacement set that the team can adopt directly.

  ## 7. Recommendation output requirements
  Do not produce vague advice such as "make this clearer" or "add a process." Every recommendation must include:
  - target of change
  - problem statement
  - risk or consequence
  - proposed new rule or process
  - priority (Blocker / High / Medium / Low)
  - acceptance method

  ## 8. Output format
  Use the following headings in this exact order:
  - ## 1. Current Governance Summary
  - ## 2. Approval Policy Analysis
  - ## 3. Budget Policy Analysis
  - ## 4. Permission Model Analysis
  - ## 5. Escalation / Blocked Flow Analysis
  - ## 6. Governance Gap Summary
  - ## 7. Concrete Adjustment Recommendations
  - ## 8. Governance Acceptance Criteria
  - ## 9. Information Still Needed

  ## 9. Decision principles
  - Prioritize reducing high-risk permissions and uncontrolled exceptions.
  - Prioritize making blocked states observable, escalatable, and convergent.
  - Prioritize explicit approval and budget thresholds instead of relying on personal judgment.
  - For every new rule you propose, explain which specific risk it addresses and what process cost it adds.
  - If multiple options are viable, recommend one option and explain the trade-offs.

  Before producing the analysis, confirm whether the inputs are sufficient to support reliable judgment. If they are not, list the gaps under `## 9. Information Still Needed` first, then provide a provisional analysis based on the known facts.
---
