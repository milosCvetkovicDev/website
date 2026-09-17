#!/usr/bin/env bash
# Stop: fires after every reply, not only at session end. Snapshots git state to one file per
# branch, so a checkout that switches branches keeps each branch's last snapshot. Never block the
# stop: every failure exits 0, a SIGTERM from the hook timeout included.

# `git status` would otherwise take index.lock and make another session's git add or commit fail.
export GIT_OPTIONAL_LOCKS=0
cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0
branch=$(git branch --show-current 2>/dev/null)
# The file name encodes the branch without collisions: % becomes %25 and / becomes %2F, so feat/x
# and feat-x get different files. A detached HEAD is ~detached, which no branch name can contain.
if [ -n "$branch" ]; then
  name=$(printf '%s' "$branch" | sed 's/%/%25/g; s|/|%2F|g')
else
  name='~detached'
fi
mkdir -p .agent-state 2>/dev/null || exit 0
out=".agent-state/last-session-$name.md"
# Written beside the snapshot and moved over it only when complete: a kill part-way leaves the
# previous snapshot whole, and the move replaces a symlink at that path instead of writing through.
tmp=".agent-state/.last-session-$name.md.$$"
job=
trap 'kill $job 2>/dev/null; rm -f "$tmp"; exit 0' TERM INT HUP
{
  echo "# Last snapshot: ${branch:-detached HEAD} at $(date '+%Y-%m-%d %H:%M')"
  echo '```'
  git status -sb 2>/dev/null | head -20
  git log --oneline -5 2>/dev/null
  echo '```'
} 2>/dev/null >"$tmp" &
job=$!
# `wait` returns as soon as a trapped signal arrives, where a foreground git would delay the trap.
wait "$job" && mv -f "$tmp" "$out" 2>/dev/null
rm -f "$tmp" 2>/dev/null
exit 0
