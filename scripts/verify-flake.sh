#!/usr/bin/env bash
# Runs one Playwright spec N times and prints its pass rate and duration percentiles: evidence that
# a flaky test is fixed, or a measure of how flaky it is.
#
#   scripts/verify-flake.sh <runs> <spec>
#   scripts/verify-flake.sh 10 e2e/work-cards.spec.ts
#
# <runs> is a positive integer without leading zeros, at most 1000. <spec> is a spec file relative
# to apps/web; a leading ./ or apps/web/, or an absolute path inside apps/web, is accepted too.
# Playwright reads a file argument as an unanchored, case-insensitive regular expression, so the
# spec is passed as an anchored, escaped expression of its absolute path, and a run whose report
# names any file other than the spec (relative to the report's testDir) stops the script. Each run
# is a whole `playwright test <spec>` in apps/web, so it starts its own server (ADR 0014): the dev
# server locally, the production build with CI=true or CI=1 (build it first). PLAYWRIGHT_PORT is
# passed through untouched. Needs pnpm (the webServer runs it), node and jq 1.6 or later.
#
# Results go to .verify in the directory the script is run from. A second sweep started from the
# same directory while one is writing .verify, or while one is taking the lock, stops with exit 2
# (the lock is .verify.lock, taken under .verify.lock.taking). An earlier .verify is kept as
# .verify.previous until this sweep records its first run; a sweep that stops before that puts the
# earlier one back and leaves its own attempt in .verify.failed. A sweep killed outright before its
# first run cannot, so the next sweep does it before it starts. In .verify:
#   run-N.json     Playwright's JSON report for run N, with a top-level "verify" object added: the
#                  run number, its exit code, its wall duration in milliseconds (read from a
#                  monotonic clock) and the 1-minute load average when it started (null when the
#                  system does not say)
#   run-N.log      the run's console output
#   run-N-results  the run's Playwright output directory, kept only when a test failed or needed a
#                  retry: the error-context.md Playwright writes for a failure that raised an error
#                  (a test.fail() that passes gets none), attachments a test saved and, in CI mode
#                  only, where the config retries, the trace of a retried test ('on-first-retry')
#   summary.txt    the table printed at the end
#
# Failing tests are what this measures, so a run with failing tests is recorded and the next one
# starts. Anything else stops the script with exit 2: a bad argument, a missing tool, another sweep
# writing .verify, a run that writes no readable report (a config that did not load), a report with
# errors outside any test (a server that never started, no tests found), a run in which no test ran
# (every one skipped), an exit code other than 0, 1 or 130 (130 stops it with 130), an exit code
# the report contradicts, or a report for another file.
#
# Ctrl-C stops it with 130, SIGHUP with 129 and SIGTERM with 143, once Playwright has stopped its
# server; the run in progress is not recorded, and its console output stays in run-N.log. A SIGINT
# sent to this script alone, not its process group, lets the current run finish, records it, and
# then stops with 130. A shell that starts a script in the background without job control (`cmd &`
# in another script) makes it ignore SIGINT, which it then cannot trap: stop such a sweep with
# SIGTERM. Every stop after a recorded run writes the summary of the recorded runs, marked as
# stopped early. Once every run is recorded, the script exits 0 if every run passed and 1 if any
# did not. A run passes when no test ended other than as declared (a test.fail() that fails is
# declared) and none needed a retry. Progress lines go to stderr, the summary to stdout.
#
# Percentiles are nearest-rank, so p50 and p95 are always durations some run actually took: with
# fewer than 20 runs, p95 is the slowest. A test's duration is its slowest attempt in that run.

# pnpm is found the way .husky/pre-commit finds it (sourcing nvm.sh when it is missing), and before
# strict mode starts.
if ! command -v pnpm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  . "$NVM_DIR/nvm.sh"
fi

# Every message goes through an external printf. A reader that goes away (`2>&1 | head`) must not
# kill or corrupt a sweep: bash 3.2's builtin printf keeps the text of a failed write buffered, and
# the next command substitution flushes it into the value it captures, a clock reading included.
to_stderr() { env printf "$@" >&2 2>/dev/null || true; }
say() { to_stderr 'verify-flake: %s\n' "$*"; }

set -Eeuo pipefail
trap 'status=$?; say "line $LINENO exited $status"; exit 2' ERR

die() {
  say "$@"
  exit 2
}

usage='usage: scripts/verify-flake.sh <runs> <spec relative to apps/web>'
[ "$#" -eq 2 ] || die "$usage"
runs=$1
case $runs in
  '' | *[!0-9]* | 0*) die "runs must be a positive integer without leading zeros, got '$runs'" ;;
esac
# The summary hands jq every report path as an argument; 1000 of them stay under ARG_MAX (1 MiB on
# macOS) from any directory whose path is shorter than about 1000 bytes.
{ [ "${#runs}" -le 4 ] && [ "$runs" -le 1000 ]; } || die "runs must be at most 1000, got $runs"
for tool in pnpm jq node; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done
case $(jq --version 2>/dev/null || true) in
  jq-1.[6-9]* | jq-1.[1-9][0-9]*) ;;
  *) die "needs jq 1.6 or later, found '$(jq --version 2>/dev/null || true)'" ;;
esac

root=$(CDPATH='' cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null && pwd -P)
web=$root/apps/web
spec=$2
case $spec in
  /*)
    spec_dir=$(CDPATH='' cd -P -- "$(dirname -- "$spec")" 2>/dev/null && pwd -P || true)
    spec=$spec_dir/$(basename -- "$spec")
    case $spec in
      "$web"/*) spec=${spec#"$web"/} ;;
      *) die "$2 is not inside $web ($usage)" ;;
    esac
    ;;
  *)
    spec=${spec#./}
    spec=${spec#apps/web/}
    ;;
esac
[ -f "$web/$spec" ] || die "no $spec in $web ($usage)"
# Called directly, not through `pnpm exec`: on Ctrl-C or SIGTERM `pnpm exec` exits before Playwright
# has stopped its webServer, which then keeps the port for every later run.
playwright=$web/node_modules/.bin/playwright
[ -x "$playwright" ] || die "no $playwright; run pnpm install first"
spec_abs=$(CDPATH='' cd -P -- "$(dirname -- "$web/$spec")" >/dev/null && pwd -P)
spec_abs=$spec_abs/$(basename -- "$spec")
spec_regex="^$(printf '%s' "$spec_abs" | sed 's/[][\\.*^$(){}?+|]/\\&/g')\$"
case ${CI:-} in
  true | 1) mode='production build (CI)' ;;
  *) mode='dev server' ;;
esac
# The report file named per run below is the highest-priority setting; these would only confuse.
unset PLAYWRIGHT_JSON_OUTPUT_NAME PLAYWRIGHT_JSON_OUTPUT_DIR

# process.hrtime is monotonic, so a wall clock stepped during a run cannot make a duration negative.
now_ms() { node -e 'process.stdout.write(String(process.hrtime.bigint() / 1000000n))'; }
load1() {
  if [ -r /proc/loadavg ]; then
    cut -d' ' -f1 /proc/loadavg
  else
    { sysctl -n vm.loadavg 2>/dev/null || /usr/sbin/sysctl -n vm.loadavg 2>/dev/null ||
      echo '{ - }'; } | awk '{print $2}'
  fi
}
now_ms >/dev/null || die "node could not read the clock"

verify_dir=$PWD/.verify
lock=$verify_dir.lock
taking=$lock.taking
taking_held=0
locked=0
moved_previous=0
started=0
recorded=0
child=
raw=

# Puts an earlier .verify back when this sweep stops before recording a run, and releases the lock.
on_exit() {
  local status=$?
  trap - ERR
  set +e
  if [ "$taking_held" = 1 ]; then rmdir "$taking"; fi
  if [ "$locked" = 1 ]; then
    if [ "$started" = 1 ] && [ "$recorded" -eq 0 ]; then
      rm -rf "$verify_dir.failed"
      if [ -e "$verify_dir" ]; then mv "$verify_dir" "$verify_dir.failed"; fi
      if [ "$moved_previous" = 1 ]; then mv "$verify_dir.previous" "$verify_dir"; fi
    fi
    rm -rf "$lock"
  fi
  exit "$status"
}
trap on_exit EXIT

# Stops the sweep with exit $1 for the reason in $2, after summarising the runs already recorded.
stop() {
  trap - INT TERM HUP
  if [ -n "$raw" ]; then rm -f "$raw"; fi
  say "$2"
  if [ "$recorded" -gt 0 ]; then
    summarise "$2" || say "no summary written"
  fi
  exit "$1"
}

# Ctrl-C reaches Playwright together with the rest of the process group, so nothing is passed on:
# Playwright drops its SIGINT handler a second after the first signal, and a second SIGINT after
# that kills it before it has stopped its server. A SIGTERM or SIGHUP sent to this script alone
# reaches nobody else, so Playwright gets exactly one SIGINT, which it answers by stopping its
# server and exiting. A run that ends as a test result all the same is recorded before the stop.
on_signal() {
  local status=$1 verb=$2 code=
  if [ -n "$child" ]; then
    if [ "$status" != 130 ]; then kill -INT "$child" 2>/dev/null || true; fi
    code=0
    wait "$child" 2>/dev/null || code=$?
    child=
  fi
  case $code in
    0 | 1)
      record_run
      stop "$status" "$verb after run $i"
      ;;
  esac
  local next=$((recorded + 1))
  if [ -e "$verify_dir/run-$next.log" ]; then
    stop "$status" "$verb during run $next, which was not recorded; see run-$next.log"
  fi
  stop "$status" "$verb before run $next"
}
trap 'on_signal 130 interrupted' INT
trap 'on_signal 129 "hung up"' HUP
trap 'on_signal 143 terminated' TERM

# The lock is taken under a second directory, so that deciding a lock is stale and replacing it is
# one step no other sweep can interleave with.
mkdir "$taking" 2>/dev/null || die "another sweep is taking $lock; if none is, remove $taking"
taking_held=1
if [ -e "$lock" ] || [ -L "$lock" ]; then
  holder=$(cat "$lock/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
    die "another sweep (pid $holder) is writing $verify_dir"
  fi
  # A sweep killed outright leaves its lock behind.
  rm -rf "$lock"
fi
mkdir "$lock"
echo "$$" >"$lock/pid"
locked=1
rmdir "$taking"
taking_held=0

# A sweep killed outright before recording its first run leaves the results before it in
# .verify.previous and its own attempt in .verify: put them back the way a sweep that stops does.
if [ -e "$verify_dir.previous" ] || [ -L "$verify_dir.previous" ]; then
  rm -rf "$verify_dir.failed"
  if [ -e "$verify_dir" ] || [ -L "$verify_dir" ]; then mv "$verify_dir" "$verify_dir.failed"; fi
  mv "$verify_dir.previous" "$verify_dir"
  say "put back $verify_dir.previous, left by a sweep killed before its first run"
fi
if [ -e "$verify_dir" ] || [ -L "$verify_dir" ]; then
  mv "$verify_dir" "$verify_dir.previous"
  moved_previous=1
fi
started=1
mkdir "$verify_dir"

# One row per test and project, by file and line with the describe path in the title.
# shellcheck disable=SC2016 # a jq program, not shell
summary_program='
  def nearest_rank(q): sort | if length == 0 then null else .[(length * q | ceil) - 1] end;
  def one_decimal: (. * 10 | round) as $t | "\($t / 10 | floor).\($t % 10)";
  def lpad(n): tostring | (n - length) as $gap | (if $gap > 0 then " " * $gap else "" end) + .;
  def ms: if . == null then "-" else round | tostring end;
  def specs_in($path): (.specs[]? | {path: $path, spec: .}),
    (.suites[]? as $suite
     | $suite | specs_in($path + (if $suite.title == "" then [] else [$suite.title] end)));
  def row: "\(.[0] | lpad(8))  \(.[1] | lpad(6))  \(.[2] | lpad(5))  \(.[3] | lpad(7))  "
    + "\(.[4] | lpad(7))  \(.[5])";

  length as $runs
  | (map(select(.stats.unexpected == 0 and .stats.flaky == 0)) | length) as $passed
  | (map(.verify.durationMs)) as $durations
  | def seconds(q): $durations | nearest_rank(q) / 1000 | one_decimal;
    [ .[] | .suites[]? | specs_in([]) | .spec as $s | .path as $path | $s.tests[]
      | { id: [$s.file, $s.line, ($path + [$s.title] | join(" > ") | gsub("\n"; "\\n")),
               .projectName],
          declared: .expectedStatus, status, ms: (.results | map(.duration) | max) } ]
  | group_by(.id)
  | map(
      .[0].id as [$file, $line, $title, $project]
      | map(select(.status != "skipped")) as $ran
      | ($ran | map(select(.status == "expected")) | length) as $ok
      | (map(.declared) | unique) as $declared
      | [ "\($ok)/\($ran | length)",
          (if ($ran | length) == 0 then "-" else (100 * $ok / ($ran | length) | one_decimal) end),
          ($ran | map(select(.status == "flaky")) | length),
          ($ran | map(.ms) | nearest_rank(0.5) | ms),
          ($ran | map(.ms) | nearest_rank(0.95) | ms),
          "\($file):\($line) \($title) [\($project)]"
            + (if $declared != ["passed"] then " (declared \($declared | join(", ")))" else "" end)
            + (map(select(.status == "skipped")) | length
               | if . > 0 then ", skipped \(.)x" else "" end) ] )
  | "verify-flake: \($spec), "
      + (if $runs == $asked then "\($runs) runs" else "\($runs) of \($asked) runs" end)
      + ", \($mode)",
    (if $stopped == "" then empty else "stopped early: \($stopped)" end),
    "runs passed  \($passed)/\($runs) (\(100 * $passed / $runs | one_decimal)%)",
    "run duration p50 \(seconds(0.5)) s, p95 \(seconds(0.95)) s (nearest rank)",
    "",
    (["passed", "rate %", "flaky", "p50 ms", "p95 ms", "test"] | row),
    (.[] | row)
'

# Writes summary.txt for the recorded runs and prints it; $1, when given, says why the sweep
# stopped.
summarise() {
  local i
  local reports=()
  for ((i = 1; i <= recorded; i++)); do reports+=("$verify_dir/run-$i.json"); done
  jq -rs --arg spec "$spec" --arg mode "$mode" --argjson asked "$runs" --arg stopped "${1:-}" \
    "$summary_program" "${reports[@]}" >"$verify_dir/summary.txt.tmp" || return 1
  mv "$verify_dir/summary.txt.tmp" "$verify_dir/summary.txt"
  cat "$verify_dir/summary.txt" || true
}

# Checks and records run $i, which exited with $code (0 or 1), or stops the sweep with exit 2.
record_run() {
  duration=$(($(now_ms) - start))
  if [ "$duration" -lt 0 ]; then duration=0; fi
  [ -s "$raw" ] || stop 2 "run $i wrote no JSON report (exit $code); see $log"
  jq -e '(.errors | type) == "array" and (.suites | type) == "array"
    and (.config.rootDir | type) == "string"
    and (.stats | [.expected, .unexpected, .flaky, .skipped]
         | all(type == "number" and . >= 0 and . == floor))' "$raw" >/dev/null 2>&1 ||
    stop 2 "run $i wrote a report that is not a Playwright JSON report (exit $code); see $log"
  errors=$(jq -r '.errors[] | .message // tostring' "$raw")
  [ -z "$errors" ] || stop 2 "run $i reported errors outside any test (exit $code):
$errors"
  counts=$(jq -r '.stats | "\(.expected) \(.unexpected) \(.flaky) \(.skipped)"' "$raw")
  read -r expected unexpected flaky skipped <<<"$counts"
  if [ $((expected + unexpected + flaky)) -eq 0 ]; then
    stop 2 "run $i ran no tests ($skipped skipped); see $log"
  fi
  if { [ "$code" -eq 0 ] && [ "$unexpected" -gt 0 ]; } ||
    { [ "$code" -eq 1 ] && [ "$unexpected" -eq 0 ]; }; then
    stop 2 "run $i exited $code but its report counts $unexpected unexpected; see $log"
  fi
  # The report names files relative to its rootDir, which is the config's testDir.
  test_dir=$(jq -r '.config.rootDir' "$raw")
  test_dir_abs=$(CDPATH='' cd -P -- "$test_dir" 2>/dev/null && pwd -P || true)
  case $spec_abs in
    "$test_dir_abs"/?*) [ -n "$test_dir_abs" ] || stop 2 "run $i has no testDir $test_dir" ;;
    *) stop 2 "run $i reports testDir $test_dir, which does not hold $spec" ;;
  esac
  files=$(jq -r '[.suites[].file] | unique | join(", ")' "$raw")
  [ "$files" = "${spec_abs#"$test_dir_abs"/}" ] || stop 2 "run $i ran $files, not only $spec"

  jq --argjson run "$i" --argjson exitCode "$code" --argjson durationMs "$duration" \
    --arg load1 "$load" '{verify: {run: $run, exitCode: $exitCode, durationMs: $durationMs,
      load1: (try ($load1 | tonumber) catch null)}} + .' "$raw" >"$verify_dir/run-$i.json"
  rm "$raw"
  raw=

  if [ $((unexpected + flaky)) -eq 0 ]; then
    passed_runs=$((passed_runs + 1))
    outcome=passed
    rm -rf "$results"
  else
    outcome=FAILED
  fi
  recorded=$i
  if [ "$i" -eq 1 ]; then rm -rf "$verify_dir.previous"; fi
  to_stderr 'run %d/%d %s: %d expected, %d unexpected, %d flaky, %d skipped in %d ms at load %s\n' \
    "$i" "$runs" "$outcome" "$expected" "$unexpected" "$flaky" "$skipped" "$duration" \
    "${load:-unknown}"
}

cd "$web"
passed_runs=0
for ((i = 1; i <= runs; i++)); do
  raw=$verify_dir/run-$i.playwright.json
  results=$verify_dir/run-$i-results
  log=$verify_dir/run-$i.log
  load=$(load1)
  start=$(now_ms)
  code=0
  PLAYWRIGHT_JSON_OUTPUT_FILE=$raw "$playwright" test "$spec_regex" --reporter=json \
    --output "$results" >"$log" 2>&1 &
  child=$!
  wait "$child" || code=$?
  child=

  case $code in
    0 | 1) ;;
    130) stop 130 "run $i was interrupted" ;;
    *) stop 2 "run $i exited $code, which is not a test result; see $log" ;;
  esac
  record_run
done

trap - INT TERM HUP
summarise || die "the summary could not be written; the reports are in $verify_dir"
say "reports in $verify_dir"
[ "$passed_runs" -eq "$runs" ] || exit 1
