---
name: create-issue
description: Creates well-formed GitHub issues for the CF-Architect repository. Use whenever asked to create an issue, write a bug report, or plan a feature. 
---

# create-issue

Creates GitHub issues that match the CF-Architect project template exactly. The output is a live issue posted to GitHub via the `gh` CLI.

## When to Use

- "Create an issue for X"
- "Write up a bug report for Y"
- "Add a GitHub issue for feature Z"
- "Using skill create-issue, …"

---

## Workflow

Execute these four phases in order. **Do not skip Phase 1** — the Technical Approach section of every issue requires understanding the current code.

---

### Phase 1 — Read Project Context

Read all five files before writing anything:

| File | Purpose |
|------|---------|
| `docs/ISSUE-EXAMPLE.md` | Issue body template (sections and acceptance criteria) |
| `docs/REQUIREMENTS.md` | Requirements coverage — find which `F#-US#` stories the issue addresses |
| `docs/MVP_PLAN.md` | The plan for the original MVP code |
| `docs/DECISIONS.md` | The decision log to note variances to the plan and decisions made |
| `AGENTS.md` | Testing conventions, branch/commit conventions, coding rules |

**Note:** We have moved beyond the MVP now, so the MVP_PLAN.md does not necessarily contain all information about the project.

---

### Phase 2 — Research the Code

**Bug reports:** explore the codebase to find the exact file paths, line numbers, and current logic relevant to the bug before proposing a fix. Do not guess at file locations. Use the `explore` Task agent with thoroughness level "medium" or "very thorough" as warranted. Confirm:

- Where the broken behaviour lives (exact file:line)
- What the correct behaviour should be and why the current code diverges
- Whether any existing tests cover the area
- What a minimal correct fix looks like

**Feature / catalog / data-only issues:** explore enough to confirm the scope and list the exact files that need changing. For catalog additions, verify that every icon file exists in `../cloudflare-docs/src/icons/` before listing it as available.

---

### Phase 3 — Draft the Issue Body

Follow the template from `docs/ISSUE-EXAMPLE.md` exactly. Every section is required. Guidance for each section is below.

#### Title

- Single line, ≤ 80 characters.
- **Bug:** imperative verb phrase describing the fix — *"Fit to view on diagram load when nodes are present"*
- **Feature / addition:** action noun phrase — *"Add 15 missing Developer Platform services to the catalog"*
- No issue number in the title (GitHub assigns that).

#### Summary

2–5 sentences. Cover:

1. What is wrong or missing (observable symptom for bugs; gap for features)
2. Root cause or reason (one sentence)
3. Nature of the fix (data-only, UI-only, API change, etc.)

#### Relevant Skills

List only skills from `docs/SKILLS.md` that are genuinely useful for implementing this issue. Omit skills whose guidance is irrelevant. If no skill from the list adds value, write *"None"* rather than listing skills for the sake of it.

Consult `docs/SKILLS.md` for the canonical list of skills available in this project.

#### Requirements Coverage

Cite specific `F#-US#` story IDs from `docs/REQUIREMENTS.md`. Quote the story's one-line description so the reader does not have to look it up. Only include stories that are meaningfully addressed — do not pad with vague connections.

If the issue does not map cleanly to any existing story, write: *"This issue addresses an implementation gap not explicitly covered by a requirements story."*

#### Acceptance Criteria

A checkbox list. Include:

1. **Issue-specific criteria** first — one bullet per observable user-visible or system-verifiable outcome. Be precise: name the UI element, API endpoint, or data file; state what "correct" looks like.
2. **Standard gate criteria** last — always include all five, verbatim:

```markdown
- [ ] `npm run build` builds all artifacts.
- [ ] `npm run check` passes.
- [ ] `npm run test` passes.
- [ ] `npm run test:coverage` passes with > 90% coverage for new and changed files.
- [ ] `npm start` builds and starts the service without errors.
```

#### Technical Approach

This section is executed by an LLM agent. Write it to be **self-sufficient** — assume the agent has loaded this issue and the relevant skills, but has not read the codebase.

Required elements:

- **Location** — list every file that needs changing with its path relative to the repo root.
- **Root cause** (bugs) or **Scope** (features) — one paragraph explaining what needs to happen and why.
- **Step-by-step instructions** — numbered list; each step is a single, unambiguous action. Reference exact file paths and line numbers from your Phase 2 research.
- **Code snippets** — for bug fixes, show the before/after diff or the corrected code block. For data changes, show the JSON shape of a representative new entry.
- **Caveats** — note any non-obvious constraints (e.g. "do not change the `fitView` prop — see the comment at line 413", or "icon filename in `iconPath` must match the copied file exactly").

Avoid vague instructions like "update the relevant code" or "fix the logic". Every step should be actionable without further investigation.

#### Testing

Describe new tests to write. Apply the testing conventions from `AGENTS.md`:

- Tests go in `__tests__/` subdirectories next to the directory they cover.
- Test our code, not library code — verify wiring and observable outcomes.
- Classify any coverage gap as Simple, Standard Flow, or Defensive Programming before writing tests; skip Defensive Programming gaps.
- Name the specific assertion patterns where they matter (fake timers, `vi.advanceTimersByTimeAsync`, `vi.clearAllTimers` in afterEach, Radix open/select patterns).
- If no new test files are needed (e.g. data-only changes), say so explicitly and note which existing tests validate the change automatically.

---

### Phase 4 — Create the Issue

Verify `gh` is authenticated and the repo has a GitHub remote:

```bash
gh auth status
git remote -v
```

Create the issue with a single command. Use a heredoc or inline `--body` string:

```bash
gh issue create \
  --title "<title>" \
  --body "<full issue body as markdown>"
```

Return the issue URL to the user.

---

## Multiple Issues

When creating several related issues (e.g. one per category of a catalog audit):

- Create them in parallel using `&` + `wait` or multiple `gh issue create` calls in one shell command block.
- Each issue must be self-contained — do not cross-reference "see issue #N for steps" in the Technical Approach.
- Update test thresholds independently in each issue so they can be worked in any order.

---

## Issue Type Quick Reference

### Bug Report

```text
Title:   <Imperative verb> <symptom>  (≤80 chars)
Summary: Symptom → root cause → fix nature
Tech:    Location / Root cause / Steps / Before-after code / Caveats
Testing: Fake-timer tests, behaviour assertions, wiring tests
```

### Catalog / Data-Only Addition

```text
Title:   Add <N> missing <Category> services to the catalog
Summary: N services missing, icon source, data-only change
Tech:    Table of services (typeId, officialName, shortName, iconPath, docUrl)
         Step 1: copy icons
         Step 2: add JSON entries
         Step 3: verify docUrls
         Step 4: update test thresholds
Testing: No new test files; existing catalog.test.ts covers automatically;
         update threshold assertions to remain tight
```

### Feature / Enhancement

```text
Title:   <Action noun phrase>
Summary: Capability gap → user benefit → approach
Tech:    New files / changed files / API contracts / component structure
Testing: Happy path + edge cases; integration tests for new API routes
```

---

## Conventions

- **Branch naming:** `issues/NN` — mention this convention in the Technical Approach if the issue will introduce a branch.
- **Commit messages:** `<type>(issue-NN): <description>` — note this in the issue only when the commit shape matters (e.g. squash expectations).
- **No `noEmit: true` in tsconfig** — use `tsc -b --noEmit` on the CLI.
- **Named exports only** — never default exports for components or hooks.
- **`getValueOrDefault` for defensive nullish coalescing** — see AGENTS.md.

These conventions do not need to appear in every issue, but the Technical Approach must not contradict them.
