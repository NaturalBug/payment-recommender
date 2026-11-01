# Spec Kit and Superpowers Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version a Copilot-compatible Spec Kit setup that hands complete feature task lists to
Superpowers without imposing the full process on small changes.

**Architecture:** Spec Kit remains the repository's durable planning layer and produces
`.specify/specs/<feature-id>/tasks.md`. Superpowers remains the execution layer for qualified
features; project governance documents the size-based decision and prevents duplicate execution.

**Tech Stack:** Specify CLI 1.2.5, Copilot skills, Markdown, Bash validation.

**Spec:** Approved integration assessment from the 2026-11-01 session, based on the referenced
Spec Kit and Superpowers guide.

## Global Constraints

- Initialize Spec Kit for the `copilot` integration in the isolated worktree.
- Do not add application code, dependencies, or credentials.
- Keep all generated templates and scripts versioned except paths ignored by `.specify/.gitignore`.
- Use Spec Kit for planning and Superpowers for execution; do not retain the Spec Kit execution
  stage in the project workflow.
- Treat 2026-11-01 as the constitution ratification date.

---

### Task 1: Initialize Versioned Spec Kit Assets

**Files:**
- Create: `.specify/init-options.json`
- Create: `.specify/integration.json`
- Create: `.specify/integrations/*.json`
- Create: `.specify/scripts/bash/*.sh`
- Create: `.specify/templates/*.md`
- Create: `.specify/workflows/**/*.yml`
- Create: `.github/skills/speckit-*/SKILL.md`
- Create: `.specify/.gitignore`

**Interfaces:**
- Consumes: `specify` CLI installed on the developer machine.
- Produces: a resolvable `constitution-template` and Copilot Spec Kit skills.

- [ ] **Step 1: Initialize the project-local Spec Kit assets**

  Run:

  ```bash
  specify init --here --force --non-interactive --integration copilot
  ```

- [ ] **Step 2: Resolve the constitution template**

  Run:

  ```bash
  .specify/scripts/bash/resolve-template.sh constitution-template --json
  ```

  Expected: JSON output includes `TEMPLATE_NAME` equal to `constitution-template`.

- [ ] **Step 3: Confirm machine-local state remains ignored**

  Run:

  ```bash
  git check-ignore -q .specify/feature.json
  ```

  Expected: exit status 0.

### Task 2: Make Spec Kit Planning-Only

**Files:**
- Modify: `.specify/workflows/speckit/workflow.yml`

**Interfaces:**
- Consumes: Spec Kit's generated full SDD workflow.
- Produces: a workflow ending at reviewed `tasks.md`, with Superpowers as the documented executor.

- [ ] **Step 1: Remove the Spec Kit implementation step**

  Delete the `implement` step from the workflow and revise its description to state that reviewed
  tasks are executed using Superpowers.

- [ ] **Step 2: Validate the workflow has no Spec Kit execution command**

  Run:

  ```bash
  ! grep -n 'speckit\.implement' .specify/workflows/speckit/workflow.yml
  ```

  Expected: exit status 0.

### Task 3: Amend Governance and Agent Instructions

**Files:**
- Modify: `.specify/memory/constitution.md`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the resolved constitution template and the planning-only workflow.
- Produces: a 1.1.0 constitution and agent instructions that select the correct process by task
  size and prevent replanning of an approved task list.

- [ ] **Step 1: Amend the constitution**

  Replace the unconditional delivery sequence with a size-based policy: direct changes under
  30 minutes and touching fewer than three files may skip both systems; single-concern work of
  30 minutes to two hours uses Superpowers; larger, multi-component, user-facing, or audited
  work uses Spec Kit planning followed by Superpowers execution. Remove the temporary Sync Impact
  Report before the final commit and set the ratification date to `2026-11-01`.

- [ ] **Step 2: Add the planning/execution handoff to agent guidance**

  State that Spec Kit owns constitution, specification, planning, and tasks; Superpowers owns
  implementation, review, and branch completion. Require an executor to treat a reviewed
  `.specify/specs/<feature-id>/tasks.md` as the contract and not re-plan it. Prohibit combining
  `/speckit-implement` with Superpowers for the same feature.

- [ ] **Step 3: Validate governance content**

  Run:

  ```bash
  ! grep -nE '\[[A-Z_]+\]|\bshould\b|TODO\(' .specify/memory/constitution.md
  grep -q 'Version**: 1.1.0' .specify/memory/constitution.md
  ```

  Expected: both commands exit with status 0.

### Task 4: Validate and Commit the Integration

**Files:**
- Verify: `.specify/`
- Verify: `.github/skills/`
- Verify: `.specify/memory/constitution.md`
- Verify: `AGENTS.md`

**Interfaces:**
- Consumes: initialized assets, planning-only workflow, and amended governance.
- Produces: a clean, committed integration branch based on `master`.

- [ ] **Step 1: Verify the template resolver and workflow boundary**

  Run:

  ```bash
  .specify/scripts/bash/resolve-template.sh constitution-template --json
  ! grep -n 'speckit\.implement' .specify/workflows/speckit/workflow.yml
  ```

  Expected: the resolver returns JSON and the workflow check exits with status 0.

- [ ] **Step 2: Verify only intended tracked assets are staged**

  Run:

  ```bash
  git status --short
  ```

  Expected: only `.specify/`, `.github/skills/`, `AGENTS.md`, and this plan are changed.

- [ ] **Step 3: Commit the configuration**

  Run:

  ```bash
  git add .specify .github/skills AGENTS.md docs/superpowers/plans/2026-11-01-spec-kit-superpowers-integration.md
  git commit -m "chore(spec-kit): configure superpowers handoff"
  ```
