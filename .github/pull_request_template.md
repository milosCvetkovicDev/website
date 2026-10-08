## Summary

<!-- What changed and why, in two or three sentences. Link the plan or ADR if one exists. -->

## Verification

<!-- Commands you ran and their result. "Seems fine" is not evidence. -->

- [ ] `pnpm check:allowbuilds`
- [ ] `pnpm check:adrs`
- [ ] `pnpm check:adr-history` (accepted ADRs' Decision and Corrections against the merge base)
- [ ] `pnpm test:scripts`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm check:build-output` (after `pnpm build`: every route prerendered, no server function)
- [ ] `pnpm --filter web test:e2e` (when the UI changed)
- [ ] A Google Rich Results Test verdict, pasted here, when the change touches JSON-LD, page metadata or `robots.ts` (the tool has no API, so no gate runs it)

## Screenshots

<!-- Required when the UI changed: the affected section in light, dark and mobile viewports. Delete this section for a change that renders nothing. -->

- [ ] Light
- [ ] Dark
- [ ] Mobile

## Review

- [ ] A reviewer other than the author has looked at the diff; findings are addressed or listed here. For a change under `apps/web/src/components`, that includes the `ui-reviewer` agent.
