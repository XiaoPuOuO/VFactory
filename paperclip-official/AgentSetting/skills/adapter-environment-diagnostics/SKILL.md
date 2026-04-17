---
name: adapter-environment-diagnostics
description: >
  Use when diagnosing adapter execution environments for Claude, Codex,
  Cursor, Gemini, OpenClaw, and similar tools, including CLI readiness,
  authentication and permissions, model configuration, network and runtime
  dependencies, and pre-acceptance blockers.
mode: active
prompt: |
  Adapter Environment Diagnostics ({{skillName}})

  Your task is to perform systematic troubleshooting and pre-acceptance validation for
  the execution environment of Claude, Codex, Cursor, Gemini, OpenClaw, and similar
  adapters. You must answer three questions:
  1. Is the adapter currently usable?
  2. If not, what is the actual blocking issue?
  3. What still needs to be confirmed before acceptance?

  Focus on these diagnostic dimensions:
  - Whether environment variables and config files exist, are correctly formatted, and
    point to the correct runtime and working directory.
  - Whether the CLI is installed, executable, on PATH, and includes the required
    subcommands.
  - Whether login state, API keys, permission scopes, and organization or workspace
    authorization are sufficient.
  - Whether model names, provider settings, default and fallback models, and rate limit
    or quota assumptions are valid.
  - Whether network, DNS, proxy, VPN, firewall, certificates, or regional restrictions
    are preventing connectivity.
  - Whether Node, Python, Bun, package managers, shell behavior, and OS dependencies are
    compatible with adapter requirements.
  - Whether sandboxing, filesystem access, TTY, stdin/stdout, IPC, MCP, background
    processes, or permission isolation interfere with startup or execution.
  - Whether the acceptance flow proves the adapter can start reliably, list models, send
    a minimal request, return a result, and exit cleanly.

  Follow these operating principles:
  - First classify the issue as one of: environment not ready, credential or permission
    failure, model or provider misconfiguration, network blockage, runtime incompatibility,
    or acceptance not yet completed.
  - Start with the smallest reproducible check, then expand the investigation. Do not
    assume multiple root causes at once.
  - Clearly separate symptoms from root causes. For example, "CLI will not start" is a
    symptom; an invalid PATH or missing binary may be the root cause.
  - If information is missing, list the gaps explicitly. Do not invent credentials,
    model names, provider constraints, or account state.
  - Prioritize actionable remediation and acceptance steps over abstract advice.

  Use the following output flow:

  1) Problem Definition
  - Restate the adapter and failure scenario in one sentence.
  - List known symptoms, error messages, and the failure stage
    (before startup / during startup / during request / after response).
  - If key information is missing, list up to 5 required details first.

  2) Diagnostic Triage
  - Classify the issue into the 1-2 most likely diagnostic areas.
  - Explain why those areas should be checked first instead of other possibilities.

  3) Checklist
  - Inspect these seven sections one by one: Configuration / CLI / Permissions / Models /
    Network / Runtime / Acceptance.
  - For each section, provide:
    - Status: Pass / Fail / Unknown
    - Evidence: known facts or the command/log needed to verify
    - Interpretation: whether this item is sufficient to explain the current symptoms

  4) Root Cause Decision
  - State the most likely root cause.
  - If competing hypotheses remain, list up to 2 alternatives and explain how to rule
    them out.

  5) Remediation Plan
  - Provide ordered remediation steps.
  - For each step, include the expected result and the next move if it fails.
  - If credentials, permissions, billing, or quota require human intervention, mark them
    explicitly as blockers.

  6) Acceptance Plan
  - Define the minimum acceptance flow, which must include:
    - the adapter starts successfully
    - the CLI reports its version or basic identity
    - models can be listed or a valid model can be selected
    - a minimal test request can be sent
    - a successful response is returned and the process exits normally
  - For each step, state both the success condition and what failure would imply.

  7) Conclusion
  - End with exactly three lines:
    - Current status
    - Blocking item
    - Next highest-leverage action

  Output format (use these headings exactly):
  - ## 1. Problem Definition
  - ## 2. Diagnostic Triage
  - ## 3. Checklist
  - ## 4. Root Cause Decision
  - ## 5. Remediation Plan
  - ## 6. Acceptance Plan
  - ## 7. Conclusion

  If the issue is clearly caused by missing permissions or invalid credentials, label it
  directly as a blocker. Do not reframe it as a generic configuration problem.
---
