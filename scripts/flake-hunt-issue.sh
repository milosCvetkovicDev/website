#!/usr/bin/env bash
# Opens one GitHub issue for the flaky tests a flake hunt found that no open issue tracks yet.
#
#   scripts/flake-hunt-issue.sh <flake-report.json> [run-url]
#
# A test is reported when its spec is flagged in the report (failure rate above the hunt's
# threshold) and the test itself failed at least once. Each test is identified by its file,
# describe path and title, and project, which stay the same when lines above the test move; the
# issue body carries that key base64-encoded in a hidden `<!-- flake-key: ... -->` marker, so no
# title can break the comment. A test whose key is in any open issue labelled `flake-hunt` is not
# new, so a flake stays in one issue until someone closes it or renames the test. One issue lists at
# most 50 new tests, those that failed most, and cuts each cell short, so that its body stays well
# under GitHub's size limit; the rest are left untracked for a later hunt that still finds them.
# When nothing is new the script opens nothing and exits 0. Every gh failure exits non-zero: a hunt
# that found flakes and could not say so must not look like a quiet night.
#
# Needs gh with a token that may write issues (GH_TOKEN in CI), and jq 1.6 or later.

set -Eeuo pipefail
trap 'status=$?; echo "flake-hunt-issue: line $LINENO exited $status" >&2; exit 2' ERR

die() {
  echo "flake-hunt-issue: $*" >&2
  exit 2
}

usage='usage: scripts/flake-hunt-issue.sh <flake-report.json> [run-url]'
{ [ "$#" -ge 1 ] && [ "$#" -le 2 ]; } || die "$usage"
report=$1
run_url=${2:-}
for tool in gh jq; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done
jq -e 'has("specs") and has("threshold")' "$report" >/dev/null 2>&1 ||
  die "$report is not a flake-hunt report"

label=flake-hunt
# error is null for a failure without a message, and a report written before that was recorded.
flagged=$(jq -c '[ .specs[] | select(.flagged) as $spec | .tests[] | select(.failed > 0)
  | { key: "\($spec.file) \(.title) [\(.project)]",
      name: "\($spec.file):\(.line) \(.title) [\(.project)]",
      failed, runs,
      error: ((.failures[0].error // "") | split("\n") | .[0] // "") } ]' "$report")
if [ "$(jq 'length' <<<"$flagged")" -eq 0 ]; then
  echo "flake-hunt-issue: no flagged spec, nothing to open"
  exit 0
fi

# Keys already in open issues. `gh issue list` returns at most --limit issues (30 by default); 500
# is far more open flake-hunt issues than this repository should ever hold.
open_bodies=$(gh issue list --label "$label" --state open --limit 500 --json body)
known=$(jq -c '[ .[].body // "" | scan("<!-- flake-key: ([A-Za-z0-9+/=]+) -->") | .[0]
  | try @base64d catch empty ]' <<<"$open_bodies")
new=$(jq -c --argjson known "$known" 'map(select(.key as $k | $known | index($k) | not))' \
  <<<"$flagged")
count=$(jq 'length' <<<"$new")
if [ "$count" -eq 0 ]; then
  echo "flake-hunt-issue: every flagged test is already tracked by an open $label issue"
  exit 0
fi

listed=$(jq -c 'sort_by(-.failed) | .[:50]' <<<"$new")
listed_count=$(jq 'length' <<<"$listed")
body=$(jq -r --arg runUrl "$run_url" --slurpfile report "$report" \
  --argjson unlisted "$((count - listed_count))" '
  def cut($n): if length > $n then .[:$n - 1] + "…" else . end;
  def cell($n): (. // "") | tostring | gsub("\n"; " ") | cut($n) | gsub("\\|"; "\\|");
  $report[0] as $r
  | "The flake hunt ran the e2e suite \($r.completedRuns) times on commit "
    + "\($r.commit) (\($r.mode)) and found \(length) flaky "
    + (if length == 1 then "test" else "tests" end)
    + " that no open `flake-hunt` issue tracks. A spec is flagged when it failed in more than "
    + "\($r.threshold * 1000 | round / 10)% of the completed runs it ran in.",
    (if $unlisted == 0 then empty
     else "\n\($unlisted) more new flaky \(if $unlisted == 1 then "test is" else "tests are" end) "
       + "not listed, to keep this issue short; the report artifact names them, and a later hunt "
       + "that still finds them opens an issue for them." end),
    "",
    (if $runUrl == "" then empty
     else "Traces and screenshots are in the shard artifacts of \($runUrl), kept for 14 days, "
       + "and the full report is in its `flake-report` artifact, kept for 30.\n" end),
    "| Test | Failed runs | First error |",
    "| --- | --- | --- |",
    (.[] | "| `\(.name | cell(300))` | \(.failed) of \(.runs) | \(.error | cell(200)) |"),
    "",
    (.[] | "<!-- flake-key: \(.key | @base64) -->")
' <<<"$listed")

gh label create "$label" --color B60205 \
  --description 'Tests the nightly flake hunt found failing intermittently' --force >/dev/null
title="Flaky e2e tests: $listed_count new from the flake hunt"
url=$(gh issue create --label "$label" --title "$title" --body "$body")
echo "flake-hunt-issue: opened $url"
