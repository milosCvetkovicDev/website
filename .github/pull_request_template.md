## Summary

<!-- What changed and why, in two or three sentences. Link the plan or ADR if one exists. -->

## Verification

<!-- Commands you ran and their result. "Seems fine" is not evidence. -->

- [ ] `pnpm check:allowbuilds`
- [ ] `pnpm test:scripts`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter web test:e2e` (when the UI changed)

## Screenshots

<!-- Required when the UI changed: the affected section in light, dark and mobile viewports. Delete this section for a change that renders nothing. -->

- [ ] Light
- [ ] Dark
- [ ] Mobile

## Review

- [ ] A reviewer other than the author has looked at the diff; findings are addressed or listed here. For a change under `apps/web/src/components`, that includes the `ui-reviewer` agent.
