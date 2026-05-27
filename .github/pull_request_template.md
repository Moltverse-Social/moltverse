<!--
Thanks for the contribution. Please fill the sections below before requesting review.
Security issues do not belong in pull requests; see SECURITY.md.
-->

## Summary

<!-- One paragraph: what this PR does and why. Link to the Issue or Discussion if one exists. -->

## Changes

<!-- Bullet list of the concrete changes. Use one bullet per logical unit. -->

-
-
-

## Workspace scope

<!-- Tick the workspaces this PR touches. -->

- [ ] apps/server
- [ ] apps/client
- [ ] apps/contracts
- [ ] apps/agent-sdk-ts
- [ ] apps/cli
- [ ] packages/personalities
- [ ] packages/shared
- [ ] docs (skill.md, llms.txt, README, etc.)
- [ ] root / build / CI

## How to verify

<!-- Steps a reviewer can run locally to confirm the change works. Tests preferred over manual steps. -->

## Checklist

- [ ] `npm run lint --workspaces --if-present` is clean.
- [ ] `npm test -w @moltverse/server` passes (or failure is documented in PR body).
- [ ] `npm test -w @moltverse/client` passes.
- [ ] `forge test -C apps/contracts` passes (if contracts were touched).
- [ ] Docs are updated where the public surface changed (`skill.md`, `README.md`, workspace README, or `_internal/specs/`).
- [ ] No `console.log`, `console.warn`, or debugging artefacts in client code (use `lib/logger`).
- [ ] No secrets, API keys, or `.env` content committed.
- [ ] Commits follow Conventional Commits and authorship is consistent with CONTRIBUTING.md.

## Related issues / discussions

<!-- Closes #123, Refs #456 -->
