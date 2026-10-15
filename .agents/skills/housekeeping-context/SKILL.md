---
name: housekeeping-context
description: Resume Housekeeping development with compact project context, locate relevant code and requirements, and update verified handoff notes after implementation. Use for project development or status/handoff requests, not unrelated questions.
---
# Housekeeping context

Use this skill as a navigation and handoff aid, not a substitute for inspecting code.
Paths below are relative to the repository root containing AGENTS.md and PROJECT.md.

## Resume with bounded reading

1. Read AGENTS.md and docs/CONTEXT.md unless already present in the current context. Do not repeat unchanged reads within a turn.
2. Check `git status --short` and `git log -1 --oneline`. Compare the snapshot's recorded commit and paths with current changes. Inspect relevant diffs; a matching commit does not prove an uncommitted file is unchanged.
3. Use the file map to open the affected source/tests/configuration and the relevant PROJECT.md sections. For first orientation, specification changes, cross-domain work, or uncertain requirements, read PROJECT.md fully. Otherwise use its headings to select related sections; retain the invariants in AGENTS.md.
4. Read only relevant dated DEVLOG entries. Entries are not necessarily sorted. Treat old test results as historical evidence, never as fresh verification.
5. If the snapshot is missing or stale, inspect the affected area and state the uncertainty. Do not scan the entire codebase merely to refresh an unrelated part of the snapshot. Follow installed Next.js documentation before editing Next.js code.

## Maintain the handoff

After authorized implementation and verification, update docs/CONTEXT.md only when status, file routing, a durable decision, or the next step materially changes. Append verification details to docs/DEVLOG.md per project instructions. For review-only requests, report proposed corrections without editing files.

Keep CONTEXT.md under roughly 100 lines. Replace superseded status rather than accumulating a second devlog. Record date and checked commit, distinguish committed work from uncommitted work, and cite source paths for decisions. Label historical checks and unresolved questions explicitly. Never infer business approval from implementation, or convert a suggested next step into authorization.

Do not duplicate PROJECT.md, paste source code/logs, or store credentials, guest data, private evidence URLs, or speculative conclusions. Source code establishes implementation; PROJECT.md establishes confirmed business rules; explicit user instructions establish task scope. A conflict is a reason to verify, not silently rewrite a source of truth.

## Routing examples

- Continue login: snapshot -> current Git changes -> auth/login source -> role requirements -> focused checks; no inventory-wide scan.
- Change partial returns: PROJECT.md sections 5-7 and relevant invariants are required even if the snapshot omits them.
- Explain prior progress: distinguish dated DEVLOG results from current inspected files; do not claim today's tests passed.
