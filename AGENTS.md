# Development Rules

This file is the operational rulebook for coding agents working in Feedloom. Follow it over generic defaults.

## Project Overview

Feedloom is a TypeScript ESM CLI for archiving long-form web content as clean Markdown with local assets. It accepts article URLs, URL list files, and RSS/Atom feeds, fetches pages, extracts readable content, converts it to Markdown, downloads images, and writes notes with YAML frontmatter.

Risk profile: the tool performs network fetching and browser automation. Keep defaults conservative, avoid aggressive scraping behavior, and preserve user-controlled rate, auth, and output boundaries.

## Conversational Style

- Keep responses concise, direct, and technical.
- Use exact file paths, commands, identifiers, and error messages.
- Avoid fluff, emojis, and unnecessary praise.
- When handing off, summarize files changed, behavior changed, tests run, and known limitations.

## Tech Stack

- Runtime: Node.js >= 24
- Package manager: npm
- Language: TypeScript
- Module system: ESM (`"type": "module"`)
- CLI framework: Commander
- Build: tsup
- Type checking: TypeScript
- Tests: Vitest
- Browser automation: Patchright
- HTML/content extraction: Defuddle, Linkedom, custom cleaning/site rules
- Markdown rendering: Turndown + GFM plugin

## Repository Layout

```text
src/cli.ts              CLI entry point and option parsing
src/pipeline.ts         Main per-URL processing pipeline
src/assets.ts           Image localization
src/output.ts           Markdown note writing and filename handling
src/tracking.ts         Source URL tracking and cleanup helpers
src/models.ts           Shared URL item models
src/constants.ts        Shared constants
src/input/              URL, file, and feed input parsing/slicing
src/fetch/              Static, browser, browser-state, stealth, and fallback strategies
src/extract/            Meaningful-content checks
src/cleaning/           HTML cleaning, profiles, and DOM manipulation
src/render/             HTML-to-Markdown conversion
src/site-rules/         Site-specific TOML rules; ignored locally in this repo
tests/                  Vitest tests mirroring source areas
skills/feedloom/        Packaged Agent Skill and bundled site rules
README.md               User-facing documentation
.github/workflows/      CI and npm release workflows
```

## Commands

Use npm scripts from `package.json`.

```bash
npm install
npm run dev -- --help
npm run typecheck
npm test
npm run build
```

Run the CLI from source:

```bash
npm run dev -- --output-dir ./outputs "https://example.com/article"
```

Run the built CLI:

```bash
npm run build
node dist/cli.js --output-dir ./outputs "https://example.com/article"
```

Install Patchright Chromium only when browser-based fetching/tests require it:

```bash
npx patchright install chromium
```

CI runs `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` on Node 24.

## Required Validation

- For TypeScript or behavior changes, run:

```bash
npm run typecheck
npm test
```

- If a change touches `src/cli.ts`, packaging, exports, build config, `package.json`, or release behavior, also run:

```bash
npm run build
```

- If a test file is created or modified, run the relevant Vitest target when practical, then the full test suite before handoff:

```bash
npx vitest run tests/path/to/file.test.ts
npm test
```

- For documentation-only changes, no test command is required unless examples or command behavior changed.
- Read command output before reporting success. Do not claim tests passed unless the command completed successfully.

## Forbidden Commands and Safer Alternatives

- NEVER run `git reset --hard`, `git checkout .`, or `git clean -fd`; they can destroy other agents' work. Ask before discarding changes.
- NEVER run `git add -A` or `git add .`; stage only files changed in the current session with explicit paths.
- NEVER run `git commit --no-verify`; fix the failing check or ask the user.
- NEVER force push unless the user explicitly confirms the exact branch and reason.
- Do not start long-running dev servers or browser sessions unless needed for the task. Prefer one-shot scripts and tests.
- Do not run real network clipping against many URLs unless the user requested it. Prefer fixtures, mocks, or a single conservative manual example.
- Do not publish packages or create release tags unless the user explicitly asks. The release workflow publishes `v*.*.*` tags to npm.

## Code Quality

- Follow existing source layout and patterns. Keep changes minimal and scoped.
- Keep reusable logic in modules under `src/`; keep `src/cli.ts` focused on argument parsing, validation, orchestration, and user-facing errors.
- Use ESM syntax and include `.js` extensions in relative imports, even for TypeScript source files.
  - Good: `import { foo } from "./foo.js";`
  - Bad: `import { foo } from "./foo";`
- Prefer explicit exported interfaces/types for cross-module data structures.
- Avoid `any`; use `unknown`, narrow errors, or define proper types.
- Do not remove intentional functionality to make tests pass without asking.
- Verify dependency APIs from installed packages or official docs before changing integration code.
- Preserve deterministic output where practical.

## CLI Behavior Rules

- Validate option values early and return clear errors.
- Preserve exit-code behavior:
  - processing failures set `process.exitCode = 1`
  - invalid CLI usage/configuration sets `process.exitCode = 2`
- Write progress and diagnostics to `stderr`; generated files go to disk, not stdout.
- Keep source URL tracking intact so repeated runs can clean up previous notes for the same source.
- Avoid overwriting unrelated notes or assets.

## Fetching, Browser Automation, and Ethics

- Respect the fetch-mode model: `auto`, `static`, `browser`, `stealth`.
- Add fetch behavior through `FetchHtmlOptions` and strategy modules in `src/fetch/` instead of special-casing in the pipeline.
- Keep static fetch fast and dependency-light.
- Keep browser/stealth behavior configurable through CLI flags where appropriate.
- Do not add aggressive crawling, bypass logic, high concurrency, or rate-unfriendly defaults.
- Respect website terms, copyright, robots policies, authentication boundaries, and user-controlled rate limits.
- Tests should not depend on live third-party websites by default.

## Markdown Output Rules

- Preserve frontmatter generated by `renderFrontmatter()` unless a schema change is intentional.
- Keep asset paths local and portable.
- Maintain stable filename sanitization and duplicate handling.
- Add regression tests for output changes that affect filenames, frontmatter, assets, or Markdown rendering.

## Site Rules Workflow

Trigger: changing extraction behavior for a specific website.

Files/directories:

- Packaged skill rules: `skills/feedloom/site-rules/*.toml`
- Source rules: `src/site-rules/` may be local/ignored in this repo
- Rule documentation: `src/site-rules/README.md` if present or created as part of a rule-system change
- Related tests: `tests/cleaning/`, `tests/extract/`, or `tests/pipeline.test.ts`

Rules:

- Prefer narrow, domain-specific selectors over broad selectors.
- Do not add rules that affect unrelated domains.
- Update rule documentation when adding or changing rule conventions.
- Add fixture-based regression tests when changing extraction behavior for a known site.

## Testing Rules

- Add or update Vitest tests for behavior changes.
- Prefer unit tests for parsing, output rendering, slicing, filename sanitization, cleaning, and strategy fallback behavior.
- Use fixtures, mocks, local HTML strings, fake fetch responses, and fake browser fetch functions.
- Do not use real secrets, production credentials, paid tokens, or authenticated accounts in tests.
- Keep network-dependent tests out of the default suite unless explicitly requested.

## Dependency Rules

- Do not add dependencies unless they materially simplify implementation.
- Prefer built-in Node.js APIs when sufficient.
- Keep CLI startup reasonably fast.
- If adding a runtime dependency, update `package.json`, `package-lock.json`, and user-facing docs if behavior changes.
- Use npm so `package-lock.json` stays consistent.
- Do not edit lockfiles by hand.

## Documentation Rules

- `README.md` is user-facing. Update it when CLI options, installation, examples, output behavior, or operational requirements change.
- `AGENTS.md` is maintainer/agent-facing. Update it when architecture, commands, workflows, or agent rules change.
- Keep docs concise and accurate.
- Do not document speculative or unsupported behavior as stable.
- When adding a CLI option, update README usage/options and tests.

## Generated and Ignored Files

Do not commit generated or local-output directories unless the user explicitly asks.

Ignored/local paths include:

```text
node_modules/
dist/
coverage/
.env
.DS_Store
outputs/
MEMORY.md
src/site-rules/
skills/feedloom/site-rules/
```

If new generated directories are introduced, update `.gitignore`.

## Git Rules for Parallel Agents

Multiple agents may work in the same worktree. Protect other agents' changes.

- Before editing, check relevant files when needed and avoid overwriting unsaved work.
- Track every file you create, modify, or delete.
- Before committing, run `git status` and verify only your intended files are staged.
- Commit only files changed in the current session.
- Stage explicit paths only:

```bash
git status
git add AGENTS.md
git commit -m "docs: update agent instructions"
```

- Include `fixes #<number>` or `closes #<number>` in commit messages when there is a related issue or PR.
- If rebase conflicts occur, resolve conflicts only in files you modified. If conflict is in another file, abort and ask the user.
- Never force push without explicit confirmation.

## PR and Release Workflow

- Do not open PRs unless the user explicitly asks.
- Analyze PRs without pulling locally first when possible.
- If the user approves local PR work, create or use a feature branch, make scoped changes, validate, then ask before merge/push actions.
- Release is tag-driven: `.github/workflows/release.yml` publishes npm when a `v*.*.*` tag matches `package.json` version.
- Do not create release tags, run `npm publish`, or alter release credentials unless explicitly requested.

## Before Handoff

For non-trivial changes, verify as much as practical:

```bash
npm run typecheck
npm test
npm run build
```

Then report:

- files changed
- behavior changed
- tests run
- known limitations or follow-up work
