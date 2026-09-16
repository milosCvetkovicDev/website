#!/usr/bin/env bash
# Runs one Playwright spec file N times and summarises every test's outcome and duration across the
# runs, to tell a flaky test from a slow one or a broken one.
#
#   pnpm test:e2e:sweep <spec> [runs] [out-dir]
#   pnpm test:e2e:sweep e2e/work-cards.spec.ts 20
#
# <spec> is a spec file relative to apps/web, spelled in the case it has on disk. Playwright reads a
# file argument as an unanchored, case-insensitive regular expression tested against absolute paths
# (`layout-overflow.spec.ts` would run both e2e/layout-overflow.spec.ts and
# e2e/mobile/layout-overflow.spec.ts, and `e2e/nav.spec.ts` would also run `e2e/nav.spec.tsx`), so
# the spec is passed as an anchored, escaped expression of its absolute path, and a run that reports
# any other file stops the sweep. [runs] defaults to 10 and is at most 999999. [out-dir] defaults to
# a new directory under $TMPDIR (/tmp when unset); a relative one is taken from the directory the
# command was typed in, which is INIT_CWD when pnpm runs the script and $PWD otherwise. Inside a
# workspace package such as apps/web, pnpm looks for the script in that package and does not find
# it, so type `pnpm -w test:e2e:sweep` there. An out-dir inside the checkout is ignored by git and
# Prettier only under an ignored path such as apps/web/test-results. A sweep takes minutes, a server
# start and the whole file per run, so start it in the background and read runs.tsv as it grows.
#
# Each run is a whole `playwright test <spec>` in apps/web, so the file's tests contend with each
# other for one server and the CPU as when that file runs on its own (a full-suite run adds every
# other file's tests, and CI=true uses one worker). Each run starts its own server (ADR 0014).
# Locally that is the dev server, whose build cache in .next-e2e carries over between runs, so run 1
# inherits whatever the cache held before the sweep; COLD=1 deletes .next-e2e before every run, so
# that each one pays the first compile. COLD must be unset, 0 or 1. CI=true serves the production
# build instead, needs `pnpm --filter web build` first, and cannot be combined with COLD=1.
# PLAYWRIGHT_PORT defaults to 3229, which no documented command uses: 3210 is the suite's default
# and 3211 the port a second checkout is told to use. Do not overlap a sweep with another e2e run in
# the same checkout, because they share .next-e2e. Needs jq 1.6 or a later 1.x.
#
# out-dir must be empty or an earlier sweep's (it holds .flake-sweep), and is emptied first. In it:
#   sweep.txt      what was swept: spec, runs asked for, commit and whether the tree was dirty, CI,
#                  COLD, port, Playwright version and start time
#   runs.tsv       one row per run: exit code, wall seconds, the 1-minute load average read just
#                  before the run (so it still carries the tail of the previous one), and the run's
#                  expected, unexpected, flaky and skipped test counts
#   summary.txt    first a line for each run that exited nonzero with no unexpected test or whose
#                  report carries errors outside any test, naming those errors; then for each test
#                  and project, by file and line and with its describe path, two or three lines: in
#                  how many of the runs it ran in it ended other than as declared (a test.fail()
#                  that fails is declared), how often it was flaky and how often skipped or not run,
#                  the runs it failed in, then its milliseconds in each run, summed over retries,
#                  with - for a run it did not run in
#   run-N.json     the run's Playwright JSON report, and run-N.log its console output
#   run-N-results  the run's Playwright output directory, kept only when a test failed or was flaky:
#                  traces, screenshots, and the error-context.md Playwright writes for a failure
#                  that raised an error (a test.fail() that passes and a worker crash get none)
#
# Failing tests are the data, not an error: the sweep exits 0 once every run has written a report.
# It stops with exit 1 on a bad argument, and on a run that writes no report, an unreadable one, one
# with no tests or one for another file, or that was killed by a signal. Ctrl-C or SIGTERM stops it
# with 130 or 143, and so does a run that Playwright ends with 130 or 143 (a sweep started in the
# background by a script ignores Ctrl-C itself, and Playwright does not). A signal sent to the sweep
# alone reaches Playwright as the SIGINT it stops its webServer for, and the sweep waits for it; a
# SIGTERM sent to Playwright as well ends it before it stops that server. Once the runs have begun,
# every stop but a SIGKILL of the sweep writes summary.txt for the runs that finished, or says that
# it could not.

# nvm.sh runs substitutions that fail by design (`command which node` when node is not on PATH), and
# under `set -E` each would run the ERR trap below, so pnpm is looked up before strict mode starts.
if ! command -v pnpm >/dev/null 2>&1 && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  . "$NVM_DIR/nvm.sh"
fi

set -Eeuo pipefail
trap 'status=$?; error="line $LINENO exited $status"; echo "flake-sweep: $error" >&2; exit 1' ERR

die() {
  echo "flake-sweep: $*" >&2
  exit 1
}

usage='usage: pnpm test:e2e:sweep <spec relative to apps/web> [runs] [out-dir]'
{ [ "$#" -ge 1 ] && [ "$#" -le 3 ]; } || die "$usage"
spec=$1
runs=${2:-10}
case $runs in
  '' | *[!0-9]* | 0*) die "runs must be a positive integer, got '$runs'" ;;
esac
# Bash arithmetic wraps around silently past 2^63.
[ "${#runs}" -le 6 ] || die "runs must be at most 999999, got '$runs'"
cold=${COLD:-0}
case $cold in
  0 | 1) ;;
  *) die "COLD must be unset, 0 or 1, got '$cold'" ;;
esac
case ${CI:-} in
  true | 1)
    mode='production build (CI)'
    [ "$cold" = 0 ] || die "COLD=1 deletes the dev server's .next-e2e, which CI=true does not use"
    ;;
  *) mode='dev server' ;;
esac

# playwright.config.ts starts the server with `pnpm dev` or `pnpm start`.
command -v pnpm >/dev/null 2>&1 || die "pnpm is not on PATH"
command -v jq >/dev/null 2>&1 || die "jq is not on PATH"
case $(jq --version 2>/dev/null || true) in
  jq-1.[6-9]* | jq-1.[1-9][0-9]*) ;;
  *) die "needs jq 1.6 or a later 1.x, found '$(jq --version 2>/dev/null || true)'" ;;
esac

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
web=$root/apps/web
[ -f "$web/$spec" ] || die "no $spec in $web ($usage)"
# A case-insensitive filesystem finds e2e/X.spec.ts for e2e/x.spec.ts, and so does Playwright's
# expression, so a wrong case would only show after a whole run.
dir=$web
IFS=/ read -r -a parts <<<"$spec"
for part in "${parts[@]}"; do
  case $part in
    '' | .) continue ;;
    ..) dir=$dir/.. && continue ;;
  esac
  if ! ls -A -- "$dir" | grep -xF -- "$part" >/dev/null; then
    die "no $spec in $web (names are case-sensitive)"
  fi
  dir=$dir/$part
done
# Called directly, not through `pnpm exec`: on Ctrl-C or SIGTERM `pnpm exec` exits before Playwright
# has stopped its webServer, which then keeps the port and .next-e2e locked for every later run.
playwright=$web/node_modules/.bin/playwright
[ -x "$playwright" ] || die "no $playwright; run pnpm install first"
spec_abs=$(cd "$(dirname -- "$web/$spec")" && pwd -P)/$(basename -- "$spec")
spec_regex="^$(printf '%s' "$spec_abs" | sed 's/[][\\.*^$(){}?+|]/\\&/g')\$"

# pnpm runs the script from the repository root and records where the command was typed as
# INIT_CWD. Outside a pnpm script an INIT_CWD can only be inherited, and says nothing.
typed=$PWD
if [ -n "${npm_lifecycle_event:-}" ] && [ -n "${INIT_CWD:-}" ]; then typed=$INIT_CWD; fi
if [ -n "${3:-}" ]; then
  out=$3
  case $out in
    /*) ;;
    *) out=$typed/$out ;;
  esac
  if [ -e "$out" ]; then
    [ -d "$out" ] || die "$out is not a directory; choose another out-dir"
    { [ -r "$out" ] && [ -x "$out" ]; } || die "cannot read $out; choose another out-dir"
    out=$(cd "$out" && pwd -P)
    for inside in "$(cd "$typed" && pwd -P)" "$root"; do
      case $inside/ in
        "${out%/}"/*) die "$out holds $inside, so it cannot be emptied; choose another out-dir" ;;
      esac
    done
    if [ ! -e "$out/.flake-sweep" ] && [ -n "$(ls -A -- "$out")" ]; then
      die "$out is not empty and was not made by flake-sweep; choose another out-dir"
    fi
    rm -rf "$out"
  fi
  mkdir -p "$out"
else
  tmp=${TMPDIR:-/tmp}
  out=$(mktemp -d "${tmp%/}/flake-sweep.XXXXXX")
fi
# Absolute, because the runs start from apps/web.
out=$(cd "$out" && pwd -P)
touch "$out/.flake-sweep"

export PLAYWRIGHT_PORT=${PLAYWRIGHT_PORT:-3229}
# PLAYWRIGHT_JSON_OUTPUT_FILE would take precedence over the report name each run sets below; _DIR
# is unset too, so that no ambient reporter setting leaks in.
unset PLAYWRIGHT_JSON_OUTPUT_FILE PLAYWRIGHT_JSON_OUTPUT_DIR

load1() {
  if [ -r /proc/loadavg ]; then
    cut -d' ' -f1 /proc/loadavg
  else
    { sysctl -n vm.loadavg 2>/dev/null || /usr/sbin/sysctl -n vm.loadavg 2>/dev/null ||
      echo '{ - }'; } | awk '{print $2}'
  fi
}

# The fallbacks sit inside the substitutions: under `set -E` a failing substitution runs the ERR
# trap in its subshell and prints a false error before an outer `||` could catch it.
commit=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown)
if [ "$commit" = unknown ]; then
  dirty=unknown
else
  changed=$(git -C "$root" status --porcelain | wc -l | tr -d ' ')
  if [ "$changed" -gt 0 ]; then dirty="yes, $changed paths"; else dirty=no; fi
fi
{
  printf 'spec\t%s\n' "$spec"
  printf 'runs\t%s\n' "$runs"
  printf 'commit\t%s\n' "$commit"
  printf 'dirty\t%s\n' "$dirty"
  printf 'CI\t%s\n' "${CI:-}"
  printf 'mode\t%s\n' "$mode"
  printf 'COLD\t%s\n' "$cold"
  printf 'PLAYWRIGHT_PORT\t%s\n' "$PLAYWRIGHT_PORT"
  printf 'playwright\t%s\n' "$("$playwright" --version)"
  printf 'started\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} >"$out/sweep.txt"

# One row group per test and project. The run number is each report's position, which is why the
# reports are always passed in run order and only for runs that finished.
# shellcheck disable=SC2016 # a jq program, not shell
summary_program='
  def specs_in($path): (.specs[]? | {path: $path, spec: .}),
    (.suites[]? as $suite | $suite | specs_in($path + [$suite.title]));
  def failed: .status == "unexpected" or .status == "flaky";

  length as $runs
  | [ to_entries[] | (.key + 1) as $run | .value.suites[]? | specs_in([])
      | .spec as $s | .path as $path | $s.tests[]
      | { run: $run, id: [$s.file, $s.line, ($path + [$s.title] | join(" > ")), .projectName],
          status, declared: .expectedStatus, ms: (.results | map(.duration) | add // 0) } ]
  | group_by(.id)[]
  | .[0].id as [$file, $line, $title, $project]
  | . as $entries
  | map(select(.status != "skipped")) as $ran
  | ($ran | map(select(.status == "unexpected")) | length) as $unexpected
  | ($ran | map(select(.status == "flaky")) | length) as $flaky
  | (map(select(.status == "skipped")) | length) as $skipped
  | (map(.declared) | unique) as $declared
  | "\($unexpected)/\($ran | length) unexpected"
      + (if $flaky > 0 then ", \($flaky) flaky" else "" end)
      + (if $skipped > 0 then ", \($skipped) skipped or not run" else "" end)
      + "  \($file):\($line) \($title) [\($project)]"
      + (if $declared != ["passed"] then " (declared \($declared | join(", ")))" else "" end),
    (if $unexpected + $flaky > 0
     then "    failed in runs: \($ran | map(select(failed) | .run | tostring) | join(" "))"
     else empty end),
    "    ms: " + ([range(1; $runs + 1) as $r
                  | $entries | map(select(.run == $r and .status != "skipped"))
                  | if length == 0 then "-" else map(.ms) | add | round | tostring end]
                 | join(" "))
'

# A line for a run whose exit code its tests do not explain, or whose report carries errors outside
# any test (in globalSetup or globalTeardown, for example); nothing for any other run.
# shellcheck disable=SC2016 # a jq program, not shell
run_program='
  [.errors[]? | (.message // tostring) | tostring | split("\n")[0]] as $errors
  | [ (if $code != "0" and .stats.unexpected == 0
       then "exit \($code) with no unexpected test" else empty end),
      (if ($errors | length) > 0 then "report errors: \($errors | join("; "))" else empty end) ]
  | select(length > 0)
  | "run \($run): \(join("; "))"
'

# Writes and prints summary.txt for runs 1 to $1; $2, when given, says why the sweep stopped early.
summarise() {
  local finished=$1 note=${2:-} i code
  local list=()
  for ((i = 1; i <= finished; i++)); do list+=("$out/run-$i.json"); done
  {
    printf 'flake-sweep: %s, %d of %d runs, %s\n' "$spec" "$finished" "$runs" "$mode"
    if [ -n "$note" ]; then printf 'stopped early: %s\n' "$note"; fi
    for ((i = 1; i <= finished; i++)); do
      code=$(awk -F'\t' -v run="$i" '$1 == run { print $2 }' "$out/runs.tsv")
      jq -r --arg run "$i" --arg code "$code" "$run_program" "$out/run-$i.json"
    done
    if [ "$finished" -gt 0 ]; then jq -rs "$summary_program" "${list[@]}"; fi
  } >"$out/summary.txt.tmp" || return 1
  mv "$out/summary.txt.tmp" "$out/summary.txt" || return 1
  cat "$out/summary.txt" 2>/dev/null || true
}

finished=0
running=0
summarised=0
pw=
# Stops the sweep with exit $1 for the reason in $2, after summarising the runs that finished.
stop() {
  trap - INT TERM
  summarised=1
  echo "flake-sweep: $2" >&2
  summarise "$finished" "$2" || echo "flake-sweep: the summary could not be written" >&2
  echo "flake-sweep: report in $out" >&2
  exit "$1"
}
# Bash runs a trap only once the foreground command has ended, which is why Playwright runs in the
# background. Playwright ignores a second SIGINT within a second, so a Ctrl-C that reached it
# directly is not doubled; a SIGTERM, which it has no handler for, would end it before it stopped
# its webServer.
interrupted() {
  trap - INT TERM
  if [ -n "$pw" ]; then
    kill -INT "$pw" 2>/dev/null || true
    wait "$pw" 2>/dev/null || true
  fi
  stop "$1" "$2 during run $((finished + 1))"
}
trap 'interrupted 130 interrupted' INT
trap 'interrupted 143 terminated' TERM
# Any other exit once the runs have begun: an error the ERR trap reported, or `set -u`, which exits
# without it (and which bash 3.2 reports to this trap as status 0).
on_exit() {
  local status=$?
  if [ "$running" = 1 ] && [ "$summarised" = 0 ]; then
    summarised=1
    summarise "$finished" "${error:-the sweep stopped unexpectedly}" ||
      echo "flake-sweep: the summary could not be written" >&2
    echo "flake-sweep: report in $out" >&2
    if [ "$status" = 0 ]; then status=1; fi
    exit "$status"
  fi
}
trap on_exit EXIT

printf 'run\texit\tseconds\tload1\texpected\tunexpected\tflaky\tskipped\n' >"$out/runs.tsv"
cd "$web"
running=1
for ((i = 1; i <= runs; i++)); do
  report=$out/run-$i.json
  results=$out/run-$i-results
  log=$out/run-$i.log
  if [ "$cold" = 1 ]; then rm -rf .next-e2e; fi
  load=$(load1)
  start=$(date +%s)
  code=0
  PLAYWRIGHT_JSON_OUTPUT_NAME=$report "$playwright" test "$spec_regex" --reporter=json \
    --output "$results" </dev/null >"$log" 2>&1 &
  pw=$!
  wait "$pw" || code=$?
  pw=
  seconds=$(($(date +%s) - start))

  case $code in
    130) stop 130 "interrupted during run $i" ;;
    143) stop 143 "terminated during run $i" ;;
  esac
  if [ "$code" -ge 128 ]; then
    stop 1 "run $i was killed (exit $code); see $log"
  fi
  if [ ! -s "$report" ]; then
    tail -n 5 "$log" >&2 || true
    stop 1 "run $i wrote no report (exit $code); see $log"
  fi
  # The counts must be whole numbers: bash arithmetic would run a command substituted into a string.
  if ! jq -e '
      ([.stats | .expected, .unexpected, .flaky, .skipped]
        | all(type == "number" and . >= 0 and floor == .))
      and (.suites | type == "array" and all(type == "object" and (.file | type == "string")))
    ' "$report" >/dev/null 2>&1; then
    stop 1 "run $i wrote an unreadable report (exit $code): $report"
  fi
  counts=$(jq -r '.stats | "\(.expected) \(.unexpected) \(.flaky) \(.skipped)"' "$report")
  read -r expected unexpected flaky skipped <<<"$counts"
  if [ $((expected + unexpected + flaky + skipped)) -eq 0 ]; then
    jq -r '.errors[]? | .message // tostring' "$report" >&2
    stop 1 "run $i ran no tests (exit $code); see $log"
  fi
  # Playwright reports each file relative to its test directory, config.rootDir.
  root_dir=$(jq -r '.config.rootDir? // empty | strings' "$report" 2>/dev/null || true)
  if [ -z "$root_dir" ] || [ ! -d "$root_dir" ]; then
    stop 1 "run $i wrote a report with no test directory (config.rootDir): $report"
  fi
  root_dir=$(cd "$root_dir" && pwd -P)
  others=$(jq -r --arg root "$root_dir" --arg spec "$spec_abs" \
    '[.suites[].file | select($root + "/" + . != $spec)] | unique | join(", ")' "$report")
  [ -z "$others" ] || stop 1 "run $i ran $others, not only $spec"

  if [ $((unexpected + flaky)) -eq 0 ]; then rm -rf "$results"; fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$i" "$code" "$seconds" "$load" "$expected" \
    "$unexpected" "$flaky" "$skipped" >>"$out/runs.tsv"
  finished=$i
  # stdout is written only by external commands whose failure is ignored: when it is closed (the
  # sweep piped into head), a builtin's write would end the sweep with SIGPIPE.
  tail -n 1 "$out/runs.tsv" 2>/dev/null || true
done

trap - INT TERM
summarised=1
summarise "$runs" || die "the summary could not be written; the reports are in $out"
/usr/bin/env printf 'flake-sweep: report in %s\n' "$out" 2>/dev/null || true
