#!/usr/bin/env bash
# Runs the whole e2e suite N times and ranks every spec by how often it failed, with the trace and
# screenshot of each failure, to find the flaky specs worth investigating.
#
#   scripts/flake-hunt.sh [runs]                   N runs (default 30), then the report
#   scripts/flake-hunt.sh --report-only [dir]      the report again, from runs already on disk
#
# Each run is `playwright test` over every project in apps/web with playwright.flake-hunt.config.ts,
# which is playwright.config.ts plus a trace and a screenshot per failure. Locally that serves the
# dev server; CI=true or CI=1 serves the production build (build it first) with the retries CI has,
# none for the specs that opt out of them. The specs must include the warmRoutes helper
# (apps/web/e2e/support/warm-routes.ts), which keeps the dev server's first compile of a route that
# a navigating spec clicks into from being counted as a flake (other specs' cold first requests
# still count); without a spec importing it the hunt stops before its first run. A local hunt holds
# the Playwright port and the checkout's .next-e2e for as long as it runs, so run it from a worktree
# of its own.
#
# Environment:
#   FLAKE_HUNT_DIR        where results go, default ./flake-hunt. Emptied first, but only when the
#                         directory is empty or was made by this script (it holds .flake-hunt).
#   FLAKE_HUNT_FIRST_RUN  number of the first run, default 1, so that CI shards write run
#                         directories that do not collide when merged for --report-only
#   FLAKE_HUNT_EXPECTED_RUNS
#                         for --report-only: runs 1 to N should all be on disk, and a missing one is
#                         reported as an infrastructure error (a shard that died uploads nothing)
#   FLAKE_THRESHOLD       failure rate above which a spec is flagged, default 0.05
#   PLAYWRIGHT_PORT, CI   passed through to Playwright
# The run count and the first run number are whole numbers from 1 to 999999.
#
# In FLAKE_HUNT_DIR:
#   run-N/report.json     Playwright's JSON report for run N with a top-level "hunt" object added:
#                         run number, exit code, wall milliseconds, the 1-minute load average at the
#                         start (null where it cannot be read), mode, the commit checked out and
#                         whether tracked files differed from it (null outside git), and the
#                         infrastructure error or the signal that interrupted the run, if either. A
#                         run with either holds only the "hunt" object; Playwright's own report, if
#                         it wrote one, stays in run-N/playwright.json.
#   run-N/run.log         the run's console output
#   run-N/test-results    the traces, screenshots and error-context.md of the run's failures
#   flake-report.json     every spec and test that ran, ranked by failure rate, with each failure's
#                         error and artifacts (paths relative to FLAKE_HUNT_DIR). Its commit is
#                         the one the runs recorded; runs from different commits are refused.
#
# A spec fails a run when any of its tests, in any project, ends other than as declared or needs a
# retry; a test.fail() that passes is one, recorded with the error "Expected to fail, but passed.".
# Its failure rate is failed runs over completed runs in which it ran. A run whose tests could not
# run (no report, errors outside any test, no tests, an exit code other than 0 or 1, or an exit code
# the report contradicts) is recorded as an infrastructure error and left out of every rate; two of
# those in a row stop the hunt. SIGINT (Ctrl-C), SIGTERM or SIGHUP stops it too, whether sent to the
# hunt alone or to its whole process group: Playwright runs in a process group of its own and is
# told to stop by the hunt, the unfinished run is recorded as interrupted and left out of every
# rate, and the report covers the runs that finished. Ctrl-C reaches a hunt in the foreground only;
# stop a background one with `kill -TERM <pid>`.
#
# Exit codes: 0 when nothing failed, 1 when some spec failed, 2 on any infrastructure error, bad
# invocation or failed command in the script, 129 after SIGHUP, 130 after SIGINT, 143 after SIGTERM.
# A `set -u` abort on an unset variable, a bug no trap sees, exits 1.

# In a non-interactive shell pnpm comes from nvm, whose nvm.sh is sourced before the strict mode.
if ! command -v pnpm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  . "$NVM_DIR/nvm.sh"
fi

set -Eeuo pipefail
# Under `set -E` a substitution that fails runs the ERR trap in its subshell, printing a false error
# before an `||` outside it could supply a fallback. Every fallback below sits inside its `$(...)`.
trap 'on_error "$?" "$LINENO"' ERR

hunting=
interrupt=
# 129, 130 and 143 are a helper (node, jq, git) killed by the SIGHUP, SIGINT or SIGTERM sent to the
# hunt's process group, not a fault in the script: inside a substitution that status is passed on
# silently, and during the runs it stops the hunt as the signal's own trap would.
on_error() {
  case $1 in
    129 | 130 | 143)
      if [ "$BASH_SUBSHELL" -gt 0 ]; then exit "$1"; fi
      if [ -n "$hunting" ]; then
        interrupt=${interrupt:-$1}
        finish
      fi
      ;;
  esac
  echo "flake-hunt: line $2 exited $1" >&2
  exit 2
}

die() {
  echo "flake-hunt: $*" >&2
  exit 2
}

# A whole number from 1 to 999999, so that no run number can overflow bash's arithmetic.
whole_number() {
  case $1 in
    '' | *[!0-9]* | 0* | ???????*) return 1 ;;
  esac
}

usage='usage: scripts/flake-hunt.sh [runs] | scripts/flake-hunt.sh --report-only [dir]'
# CDPATH would make `cd` print the directory it chose into the substitution.
root=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." >/dev/null && pwd -P)
web=$root/apps/web
[ -d "$web" ] || die "no $web"
threshold=${FLAKE_THRESHOLD:-0.05}
[[ $threshold =~ ^(0(\.[0-9]+)?|1(\.0+)?)$ ]] ||
  die "FLAKE_THRESHOLD must be a number from 0 to 1, got '$threshold'"
for tool in jq node; do
  command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done

report_status=0
# Rebuilds $1/flake-report.json from every run-N directory in $1, prints its ranking and sets
# report_status to 0, 1 or 2 as the header describes. $2, when above 0, is the number of runs that
# should be there.
report() {
  local dir=$1 expected=${2:-0} file n fallback commits
  local reports=()
  while IFS= read -r -d '' file; do
    # Only run-<number> directories hold runs.
    [[ $file =~ /run-([1-9][0-9]*)/report\.json$ ]] || continue
    n=${BASH_REMATCH[1]}
    jq -e --argjson n "$n" '.hunt.run == $n' "$file" >/dev/null 2>&1 ||
      die "$file is not the report of run $n"
    reports+=("$file")
  done < <(find "$dir" -mindepth 2 -maxdepth 2 -name report.json -print0)
  if [ "${#reports[@]}" -eq 0 ] && [ "$expected" -eq 0 ]; then
    die "no run-N/report.json under $dir"
  fi

  if [ "${#reports[@]}" -gt 0 ]; then
    commits=$(jq -rs 'map(.hunt.commit // empty) | unique | join(", ")' "${reports[@]}")
    [[ $commits != *,* ]] || die "the runs under $dir come from different commits: $commits"
  fi
  # Only for runs that recorded no commit: the checkout rebuilding the report may be another one.
  fallback=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown)
  {
    if [ "${#reports[@]}" -gt 0 ]; then jq -s . "${reports[@]}"; else echo '[]'; fi
  } | jq --argjson threshold "$threshold" --argjson expected "$expected" \
    --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg fallback "$fallback" '
    def nearest_rank(q): sort | if length == 0 then null else .[(length * q | ceil) - 1] end;
    def failed: .status == "unexpected" or .status == "flaky";
    def colour_codes: ([27] | implode) + "\\[[0-9;]*m";
    # Every spec with the describe titles above it: two tests may share a file, line and title
    # when a describe is declared in a loop, and only the describe path tells them apart.
    def specs_in($path): (.specs[]? | {path: $path, spec: .}),
      (.suites[]? as $suite
       | $suite | specs_in($path + (if $suite.title == "" then [] else [$suite.title] end)));
    def missing_error: "no report: the run never finished, or its shard uploaded nothing";

    sort_by(.hunt.run)
    | (map(.hunt.commit // empty) | unique) as $commits
    | (if $expected > 0 then [range(1; $expected + 1)] - map(.hunt.run) else [] end) as $missing
    | map(select(.hunt.infraError == null and .hunt.interrupted == null)) as $completed
    | {
        generatedAt: $generatedAt,
        commit: ($commits[0] // $fallback),
        dirty: (map(.hunt.dirty // empty) | if length == 0 then null else any end),
        mode: (map(.hunt.mode) | first),
        threshold: $threshold,
        runs: (length + ($missing | length)),
        completedRuns: ($completed | length),
        infraErrors: (map(select(.hunt.infraError != null)
                          | {run: .hunt.run, error: .hunt.infraError})
                      + ($missing | map({run: ., error: missing_error}))
                      | sort_by(.run)),
        interruptedRuns: map(select(.hunt.interrupted != null)
                             | {run: .hunt.run, signal: .hunt.interrupted}),
        load1: (map(.hunt.load1 | select(. != null))
                | {min: min, p50: nearest_rank(0.5), max: max}),
        specs: (
          [ $completed[] | .hunt.run as $run
            | .suites[] | specs_in([]) | .spec as $s | .path as $path | $s.tests[]
            | select(.status != "skipped")
            | { run: $run, file: $s.file, line: $s.line, project: .projectName,
                title: ($path + [$s.title] | join(" > ")),
                status, declared: .expectedStatus,
                ms: (.results | map(.duration) | max),
                # Playwright writes no error for a test.fail() that passed.
                error: ((.results | map(.error.message // empty) | first)
                        // (if failed and .expectedStatus == "failed"
                            then "Expected to fail, but passed." else null end)
                        | if . == null then null
                          else gsub(colour_codes; "") | split("\n")[0:6] | join("\n") end),
                # Relative to the hunt directory, so the report still resolves after its runs
                # are moved, merged or downloaded.
                attachments: [ .results[].attachments[]? | select(.path != null)
                               | {name, path: (.path | sub("^.*/run-\($run)/"; "run-\($run)/"))}
                             ] } ]
          | group_by(.file)
          | map(
              (map(.run) | unique | length) as $ran
              | (map(select(failed) | .run) | unique | length) as $failedRuns
              | { file: .[0].file,
                  runs: $ran,
                  failedRuns: $failedRuns,
                  failureRate: ($failedRuns / $ran),
                  flagged: ($failedRuns / $ran > $threshold),
                  tests: (group_by([.line, .title, .project])
                    | map({ line: .[0].line, title: .[0].title, project: .[0].project,
                            declared: .[0].declared,
                            runs: length,
                            failed: map(select(failed)) | length,
                            flaky: map(select(.status == "flaky")) | length,
                            p50Ms: (map(.ms) | nearest_rank(0.5)),
                            p95Ms: (map(.ms) | nearest_rank(0.95)),
                            failures: map(select(failed) | {run, status, error, attachments}) })
                    | sort_by(-.failed, .line, .project)) })
          | sort_by(-.failureRate, -.failedRuns, .file))
      }' >"$dir/flake-report.json.tmp"
  mv "$dir/flake-report.json.tmp" "$dir/flake-report.json"

  jq -r '
    def pct: . * 1000 | round / 10 | tostring + "%";
    "flake-hunt: \(.completedRuns) of \(.runs) runs completed (\(.mode // "no mode")), "
      + "commit \(.commit[0:7]), "
      + (if .load1.min == null then "load unknown" else "load \(.load1.min)-\(.load1.max)" end),
    (.infraErrors[] | "  run \(.run) infrastructure error: \(.error | split("\n")[0])"),
    (.interruptedRuns[] | "  run \(.run) interrupted by \(.signal)"),
    (.specs | map(select(.failedRuns > 0)) as $failing
     | if ($failing | length) == 0 then "  no spec failed"
       else ($failing[]
             | "  \(.failureRate | pct) \(.failedRuns)/\(.runs) "
                 + (if .flagged then "FLAGGED " else "" end) + .file,
               (.tests[] | select(.failed > 0)
                | "      \(.failed)/\(.runs) :\(.line) \(.title) [\(.project)]"))
       end)
  ' "$dir/flake-report.json"
  echo "flake-hunt: report in $dir/flake-report.json"

  if jq -e '.infraErrors | length > 0' "$dir/flake-report.json" >/dev/null; then
    report_status=2
  elif jq -e '[.specs[].failedRuns] | add // 0 | . > 0' "$dir/flake-report.json" >/dev/null; then
    report_status=1
  else
    report_status=0
  fi
}

if [ "${1:-}" = --report-only ]; then
  [ "$#" -le 2 ] || die "$usage"
  dir=${2:-${FLAKE_HUNT_DIR:-$PWD/flake-hunt}}
  [ -d "$dir" ] || die "no directory $dir"
  expected=${FLAKE_HUNT_EXPECTED_RUNS:-}
  if [ -z "$expected" ]; then
    expected=0
  elif ! whole_number "$expected"; then
    die "FLAKE_HUNT_EXPECTED_RUNS must be a whole number from 1 to 999999, got '$expected'"
  fi
  # -P, because find does not descend into a symlink named on its command line.
  report "$(CDPATH='' cd -- "$dir" >/dev/null && pwd -P)" "$expected"
  exit "$report_status"
fi

[ "$#" -le 1 ] || die "$usage"
# ${1-30} rather than ${1:-30}: an empty argument is a mistake, not a request for the default.
runs=${1-30}
first=${FLAKE_HUNT_FIRST_RUN:-1}
whole_number "$runs" || die "runs must be a whole number from 1 to 999999, got '$runs'"
whole_number "$first" ||
  die "FLAKE_HUNT_FIRST_RUN must be a whole number from 1 to 999999, got '$first'"
# The webServer command in playwright.config.ts is `pnpm dev` or `pnpm start`.
command -v pnpm >/dev/null 2>&1 || die "pnpm is not on PATH"
# Called directly, not through `pnpm exec`: on Ctrl-C or SIGTERM `pnpm exec` exits before Playwright
# has stopped its webServer, which then keeps the port and .next-e2e locked for every later run.
playwright=$web/node_modules/.bin/playwright
[ -x "$playwright" ] || die "no $playwright; run pnpm install first"
[ -f "$web/e2e/support/warm-routes.ts" ] ||
  die "the warmRoutes helper (apps/web/e2e/support/warm-routes.ts) is not in this checkout"
grep -rqE "support/warm-routes['\"]" "$web/e2e" --include='*.spec.ts' ||
  die "no spec imports the warmRoutes helper, so a route's first compile would count as a flake"
case ${CI:-} in
  true | 1) mode='production build (CI)' ;;
  *) mode='dev server' ;;
esac
# _OUTPUT_FILE would take precedence over the report name each run sets; _OUTPUT_DIR is cleared too,
# so that nothing ambient touches the report path.
unset PLAYWRIGHT_JSON_OUTPUT_FILE PLAYWRIGHT_JSON_OUTPUT_DIR

now_ms() { node -e 'process.stdout.write(String(Date.now()))'; }
# The 1-minute load average, or null where it cannot be read.
load1() {
  local value
  if [ -r /proc/loadavg ]; then
    value=$(cut -d' ' -f1 /proc/loadavg)
  else
    value=$({ sysctl -n vm.loadavg 2>/dev/null || true; } | awk '{print $2}')
  fi
  if [[ $value =~ ^[0-9]+(\.[0-9]+)?$ ]]; then echo "$value"; else echo null; fi
}
# Both are needed for every run, so they are tried before anything is deleted.
now_ms >/dev/null
load1 >/dev/null

out=${FLAKE_HUNT_DIR:-$PWD/flake-hunt}
case $out in /*) ;; *) out=$PWD/$out ;; esac
if [ -e "$out" ] && [ ! -e "$out/.flake-hunt" ] && [ -n "$(ls -A "$out" 2>/dev/null || true)" ]
then
  die "$out is not empty and was not made by flake-hunt; move it or set FLAKE_HUNT_DIR"
fi
rm -rf "$out"
mkdir -p "$out"
touch "$out/.flake-hunt"

child=
# Playwright stops its webServer on SIGINT and ignores another SIGINT within a second. It has no
# handler for SIGTERM or SIGHUP, either of which would kill it at once and leave the webServer
# holding the port and .next-e2e. So Playwright runs in a process group of its own, which no signal
# meant for the hunt reaches, and the hunt passes each one on as a single SIGINT to that group, as a
# terminal's Ctrl-C would send it.
on_signal() {
  interrupt=${interrupt:-$1}
  if [ -n "$child" ]; then kill -INT -- "-$child" 2>/dev/null || true; fi
}
trap 'on_signal 129' HUP
trap 'on_signal 130' INT
trap 'on_signal 143' TERM

# Reports the runs on disk and exits: on the interruption's status, or on the report's verdict.
finish() {
  trap - HUP INT TERM
  hunting=
  # The unfinished run, if the signal came before its report was written.
  if [ -n "$interrupt" ] && [ -n "${dir:-}" ] && [ -d "$dir" ] && [ ! -e "$dir/report.json" ]; then
    jq -n --argjson run "$i" --arg mode "$mode" --arg signal "$(signal_name "$interrupt")" \
      '{hunt: {run: $run, exitCode: null, durationMs: null, load1: null, mode: $mode,
               infraError: null, interrupted: $signal}}' >"$dir/report.json"
  fi
  # find, not a glob: the directory's own name may hold glob characters.
  if [ -n "$interrupt" ] &&
    [ -z "$(find "$out" -mindepth 2 -maxdepth 2 -name report.json -print 2>/dev/null | head -n 1)" ]
  then
    exit "$interrupt"
  fi
  report "$out" 0
  if [ -n "$interrupt" ]; then exit "$interrupt"; fi
  exit "$report_status"
}

signal_name() {
  case $1 in
    129) echo SIGHUP ;;
    130) echo SIGINT ;;
    143) echo SIGTERM ;;
  esac
}

cd "$web"
last=$((first + runs - 1))
consecutive_infra=0
dir=
hunting=1
for ((i = first; i <= last; i++)); do
  [ -z "$interrupt" ] || break
  dir=$out/run-$i
  mkdir -p "$dir"
  load=$(load1)
  commit=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown)
  changes=$(git -C "$root" status --porcelain --untracked-files=no 2>/dev/null || echo '?')
  case $changes in
    '?') dirty=null ;;
    '') dirty=false ;;
    *) dirty=true ;;
  esac
  start=$(now_ms)
  [ -z "$interrupt" ] || break
  # In the background, so that the traps above run while Playwright is still going, and with job
  # control on for that one command, which gives it a process group of its own.
  set -m
  PLAYWRIGHT_JSON_OUTPUT_NAME=$dir/playwright.json "$playwright" test \
    --config playwright.flake-hunt.config.ts --reporter=json --output "$dir/test-results" \
    </dev/null >"$dir/run.log" 2>&1 &
  child=$!
  set +m
  # A signal that arrived before $child was set is passed on now.
  if [ -n "$interrupt" ]; then kill -INT -- "-$child" 2>/dev/null || true; fi
  code=0
  while :; do
    if wait "$child"; then code=0; else code=$?; fi
    # A trapped signal ends `wait` early; wait again until Playwright has stopped.
    if [ -n "$interrupt" ] && kill -0 "$child" 2>/dev/null; then continue; fi
    break
  done
  child=
  duration=$(($(now_ms) - start))
  # Playwright exits 130 when it was interrupted, whoever sent the SIGINT.
  if [ -z "$interrupt" ] && [ "$code" -eq 130 ]; then interrupt=130; fi

  signal=
  infra=
  if [ -n "$interrupt" ]; then signal=$(signal_name "$interrupt"); fi
  if [ -n "$signal" ]; then
    :
  elif [ "$code" -ne 0 ] && [ "$code" -ne 1 ]; then
    infra="exited $code, which is not a test result"
  elif [ ! -s "$dir/playwright.json" ]; then
    infra="wrote no JSON report (exit $code)"
  elif ! jq -e 'has("stats") and has("errors")' "$dir/playwright.json" >/dev/null 2>&1; then
    infra="wrote a report that is not a Playwright JSON report (exit $code)"
  else
    errors=$(jq -r '.errors[] | .message // tostring' "$dir/playwright.json")
    counts=$(jq -r '.stats | "\(.expected) \(.unexpected) \(.flaky) \(.skipped)"' \
      "$dir/playwright.json")
    read -r expected unexpected flaky skipped <<<"$counts"
    if [ -n "$errors" ]; then
      infra="errors outside any test (exit $code): $errors"
    elif [ $((expected + unexpected + flaky)) -eq 0 ]; then
      infra="ran no tests (exit $code)"
    elif { [ "$code" -eq 0 ] && [ "$unexpected" -gt 0 ]; } ||
      { [ "$code" -eq 1 ] && [ "$unexpected" -eq 0 ]; }; then
      infra="exited $code but its report counts $unexpected unexpected"
    fi
  fi

  hunt_args=(--argjson run "$i" --argjson exitCode "$code" --argjson durationMs "$duration"
    --argjson load1 "$load" --arg mode "$mode" --arg commit "$commit" --argjson dirty "$dirty"
    --arg infra "$infra" --arg signal "$signal")
  hunt='{hunt: {run: $run, exitCode: $exitCode, durationMs: $durationMs, load1: $load1,
    mode: $mode, commit: (if $commit == "unknown" then null else $commit end), dirty: $dirty,
    infraError: (if $infra == "" then null else $infra end),
    interrupted: (if $signal == "" then null else $signal end)}}'
  # Written aside and renamed, so that a signal can never leave half a report behind.
  if [ -n "$signal" ]; then
    jq -n "${hunt_args[@]}" "$hunt" >"$dir/report.json.tmp"
    mv "$dir/report.json.tmp" "$dir/report.json"
    echo "flake-hunt: run $i interrupted by $signal; stopping" >&2
    break
  elif [ -z "$infra" ]; then
    jq "${hunt_args[@]}" "$hunt + ." "$dir/playwright.json" >"$dir/report.json.tmp"
    mv "$dir/report.json.tmp" "$dir/report.json"
    rm "$dir/playwright.json"
    consecutive_infra=0
    printf 'run %d (%d/%d): %d expected, %d unexpected, %d flaky, %d skipped' \
      "$i" $((i - first + 1)) "$runs" "$expected" "$unexpected" "$flaky" "$skipped"
    printf ' in %d ms at load %s\n' "$duration" "$load"
  else
    jq -n "${hunt_args[@]}" "$hunt" >"$dir/report.json.tmp"
    mv "$dir/report.json.tmp" "$dir/report.json"
    consecutive_infra=$((consecutive_infra + 1))
    echo "flake-hunt: run $i infrastructure error: $infra; see $dir/run.log" >&2
    tail -n 5 "$dir/run.log" >&2 || true
    if [ "$consecutive_infra" -ge 2 ]; then
      echo "flake-hunt: two runs in a row could not run their tests; stopping" >&2
      break
    fi
  fi
done

finish
