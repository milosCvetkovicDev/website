## Summary

<!-- What changed and why, in two or three sentences. Link the plan or ADR if one exists. -->

## Verification

<!-- Commands you ran and their result. "Seems fine" is not evidence. -->

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm --filter web test:e2e` (when the UI changed)

## Review

- [ ] A reviewer other than the author (human, or the `adversarial-reviewer` / `edge-case-hunter` agents) has looked at the diff; findings are addressed or listed here.
