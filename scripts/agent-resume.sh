#!/usr/bin/env bash
# Prints a resume briefing for every long-running agent task checkpointed in .agent-state, and
# checks each checkpoint against what git and GitHub say now.
#
#   scripts/agent-resume.sh [task-id ...]
#
# A task is .agent-state/<task-id>.json, shaped by scripts/agent-state.schema.json: a goal,
# numbered plan steps, the step in progress, the steps done, the branches, pull requests and files
# it touches, blockers, the next action and when it was last written. With task ids, those tasks
# are briefed in full. With no arguments every checkpoint is: invalid ones first, then the tasks
# with a step in progress, newest first, in full, then one line for each finished task, so that
# old finished tasks cannot crowd out the live ones. The SessionStart hook runs it that way, so a
# new session starts from the briefing instead of a transcript.
#
# For each task the briefing gives the goal, every step marked done, current or pending, the next
# action and the blockers, then what git and gh report for its artifacts, then every contradiction
# between the two:
#   - a branch the checkpoint says is not pushed that is on origin, or the other way round
#   - a branch that exists neither locally nor on origin
#     (neither of these two is checked for a finished task, or for the head branch of a listed pull
#     request that merged or closed: the repository deletes a branch when its pull request merges)
#   - a branch whose tip has a committer date more than 60 s after updated_at, so the checkpoint was
#     not updated after that commit (a rebase re-dates the commits and counts as well)
#   - a pull request that merged or closed while the checkpoint still has a step in progress
#   - a pull request whose head branch the checkpoint does not list, when it lists any branches
#   - a pull request gh cannot find, or a listed file that does not exist
# A contradiction means the checkpoint is stale: trust git and gh, and update the checkpoint first.
# Failing checks on an open pull request are not a contradiction, since no update to the checkpoint
# clears them; they are listed under "Needs attention".
#
# An invalid checkpoint is reported with every rule it breaks, and the others are still briefed.
# Exit codes: 0 when every checkpoint is valid and was briefed, whatever it contradicts; 1 when any
# is invalid or could not be briefed; 2 when this script cannot run (not in a git repository, jq
# missing, a malformed or unknown task id, no temporary directory).
#
# Network calls are bounded, because the SessionStart hook must not stall: `git ls-remote origin`
# gets AGENT_RESUME_GIT_TIMEOUT seconds (default 5) and `gh pr list` AGENT_RESUME_GH_TIMEOUT
# (default 6), each a whole number from 1 to 999, and they run at the same time. When either fails,
# its checks are reported as unknown rather than as contradictions.

set -uo pipefail
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

die() {
  echo "agent-resume: $*" >&2
  exit 2
}

command -v jq >/dev/null 2>&1 || die "jq is not on PATH"
root=$(git -C "$(dirname "${BASH_SOURCE[0]}")/.." rev-parse --show-toplevel 2>/dev/null) ||
  die "not inside a git repository"
state_dir=$root/.agent-state
id_re='^[a-z0-9][a-z0-9-]*$'
id_rule='a-z, 0-9 and -, starting with a letter or digit'

# A timeout of 0, or one perl cannot read as a number, would leave the call unbounded.
seconds() {
  case $1 in
    '' | *[!0-9]* | 0* | ????*) echo "$2" ;;
    *) echo "$1" ;;
  esac
}
git_timeout=$(seconds "${AGENT_RESUME_GIT_TIMEOUT:-}" 5)
gh_timeout=$(seconds "${AGENT_RESUME_GH_TIMEOUT:-}" 6)

# Runs a command for at most $1 seconds. perl forks it into its own process group and sends SIGTERM
# to the group when the alarm fires, so the ssh or credential helper git starts dies with it. An
# alarm alone does not work for gh, which is a Go program and ignores SIGALRM.
limited() {
  perl -e '$s = shift; $pid = fork // exit 1;
    unless ($pid) { setpgrp(0, 0); exec @ARGV or exit 127 }
    $SIG{ALRM} = sub { kill("TERM", -$pid) or kill("TERM", $pid) }; alarm $s; waitpid $pid, 0;
    exit($? >> 8 || ($? ? 1 : 0))' "$@"
}

full=false
files=()
if [ "$#" -gt 0 ]; then
  full=true
  for id in "$@"; do
    [[ $id =~ $id_re ]] || die "not a task id: $id ($id_rule)"
    [ -f "$state_dir/$id.json" ] || die "no checkpoint $id (looked for $state_dir/$id.json)"
    seen=false
    for f in ${files[@]+"${files[@]}"}; do
      [ "$f" = "$state_dir/$id.json" ] && seen=true
    done
    $seen || files+=("$state_dir/$id.json")
  done
else
  # Dot files, dangling symlinks and directories named *.json are listed too, and reported.
  shopt -s nullglob dotglob
  for f in "$state_dir"/*.json; do
    files+=("$f")
  done
  shopt -u nullglob dotglob
fi

echo '--- RESUME BRIEFING (.agent-state/*.json, checked against git and gh) ---'
if [ "${#files[@]}" -eq 0 ]; then
  echo 'No JSON checkpoints. Long-running work starts one: see scripts/agent-state.schema.json.'
  exit 0
fi

# The rules of scripts/agent-state.schema.json, as a list of the ones a document breaks. The schema
# cannot say that a timestamp is a real time or that a finished task has every step done, so those
# two rules exist only here. scripts/agent-resume.test.mjs checks the rest against the schema.
validate='
  def iso: type == "string" and test("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z\\z")
    and ((try (fromdateiso8601 | todateiso8601) catch null) == .);
  def positive_int: type == "number" and . == floor and . >= 1;
  def text: type == "string" and . != "" and (explode | all(. >= 32 and . != 127));
  def unknown_keys($allowed): keys - $allowed | map("unknown property \(.)");
  if type != "object" then ["the document is not an object"] else
    (.plan_steps | if type == "array" then length else 0 end) as $steps
    | unknown_keys(["schema_version", "goal", "plan_steps", "current_step", "completed_steps",
                    "artifacts", "blockers", "next_action", "updated_at"])
    + [ if .schema_version != 1 then "schema_version must be 1" else empty end,
        if (.goal | type) != "string" or .goal == "" then "goal must be a non-empty string"
        else empty end,
        if (.plan_steps | type) != "array" or $steps == 0
           or any(.plan_steps[]; type != "string" or . == "")
        then "plan_steps must be a non-empty array of non-empty strings" else empty end,
        if has("current_step") | not
        then "current_step is required (null once every step is done)"
        elif .current_step != null and ((.current_step | positive_int | not)
             or .current_step > $steps)
        then "current_step must be null or a step number from 1 to \($steps)" else empty end,
        if (.completed_steps | type) != "array" then "completed_steps must be an array"
        else
          (.completed_steps[]
           | if type != "object" then "each completed step must be an object"
             else
               (.step | tojson) as $s
               | (if (.step | positive_int | not) or .step > $steps
                  then "completed step \($s) is not a step number from 1 to \($steps)"
                  else empty end),
                 (if has("note") and (.note | type) != "string"
                  then "completed step \($s): note must be a string" else empty end),
                 (if has("at") and (.at | iso | not)
                  then "completed step \($s): at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ"
                  else empty end),
                 ((keys - ["step", "note", "at"])[] | "completed step \($s): unknown property \(.)")
             end),
          ([.completed_steps[] | objects | .step]
           | if length != (unique | length) then "completed_steps lists a step twice"
             else empty end),
          (.current_step as $current
           | if $current != null and any(.completed_steps[]; type == "object" and .step == $current)
             then "current_step \($current) is also in completed_steps" else empty end),
          (if .current_step == null and $steps > 0 then
             ([range(1; $steps + 1)] - [.completed_steps[] | objects | .step]) as $open
             | if $open != [] then "current_step is null, but step"
                 + (if ($open | length) > 1 then "s " else " " end)
                 + ($open | map(tostring) | join(", ")) + " not in completed_steps"
               else empty end
           else empty end)
        end,
        if (.artifacts | type) != "object" then "artifacts must be an object"
        else
          (.artifacts | unknown_keys(["branches", "prs", "files"])[]),
          (if (.artifacts.branches | type) != "array" then "artifacts.branches must be an array"
           else
             (.artifacts.branches[]
              | if type != "object" then "each branch must be an object"
                else
                  (.name | tojson) as $b
                  | (if .name | text | not
                     then "branch \($b): name must be a non-empty string without control characters"
                     else empty end),
                    (if has("pushed") and (.pushed | type) != "boolean"
                     then "branch \($b): pushed must be true or false" else empty end),
                    ((keys - ["name", "pushed"])[] | "branch \($b): unknown property \(.)")
                end),
             ([.artifacts.branches[] | objects | .name]
              | if length != (unique | length) then "artifacts.branches lists a branch twice"
                else empty end)
           end),
          (if (.artifacts.prs | type) != "array" or any(.artifacts.prs[]; positive_int | not)
           then "artifacts.prs must be an array of pull request numbers" else empty end),
          (if (.artifacts.files | type) != "array" or any(.artifacts.files[]; text | not)
           then "artifacts.files must be an array of non-empty paths without control characters"
           else empty end)
        end,
        if (.blockers | type) != "array" or any(.blockers[]; type != "string" or . == "")
        then "blockers must be an array of non-empty strings" else empty end,
        if (.next_action | type) != "string" then "next_action must be a string"
        elif .next_action == "" and .current_step != null
        then "next_action may be empty only when current_step is null" else empty end,
        if .updated_at | iso | not then "updated_at must be a real UTC time, YYYY-MM-DDTHH:MM:SSZ"
        else empty end ]
  end'

# The network facts are gathered once for all tasks, and only when some task needs them.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/agent-resume.XXXXXX") || die "cannot create a temporary directory"
trap 'rm -rf "$tmp"' EXIT
needs_branches=false
needs_prs=false
for f in "${files[@]}"; do
  jq -e '(.artifacts.branches // []) | length > 0' "$f" >/dev/null 2>&1 && needs_branches=true
  jq -e '(.artifacts.prs // []) | length > 0' "$f" >/dev/null 2>&1 && needs_prs=true
done
if $needs_branches; then
  (limited "$git_timeout" git -C "$root" ls-remote --heads origin >"$tmp/remote" 2>/dev/null ||
    echo failed >"$tmp/remote.failed") &
fi
if $needs_prs; then
  limited "$gh_timeout" gh pr list --state all --limit 200 \
    --json number,title,state,headRefName,statusCheckRollup >"$tmp/prs.json" 2>/dev/null ||
    echo failed >"$tmp/prs.failed"
fi
wait
if $needs_branches && [ ! -e "$tmp/remote.failed" ]; then
  sed -n 's|^[0-9a-f]*[[:space:]]*refs/heads/||p' "$tmp/remote" >"$tmp/remote-branches"
fi
# Read with --slurpfile: two hundred pull requests with their checks can outgrow an argument.
if $needs_prs && [ ! -e "$tmp/prs.failed" ] &&
  jq -e 'type == "array"' "$tmp/prs.json" >/dev/null 2>&1; then
  cp "$tmp/prs.json" "$tmp/prs-or-null.json"
else
  echo null >"$tmp/prs-or-null.json"
fi

briefing='
  def ago: (now - .) as $s
    | if $s < 90 then "just now" elif $s < 5400 then "\($s / 60 | floor) min ago"
      elif $s < 129600 then "\($s / 3600 | floor) h ago"
      else "\($s / 86400 | floor) days ago" end;
  # gh gives a check run that has not finished an empty conclusion, and a status context has none.
  def check: [.conclusion, .state, .status] | map(select(. != null and . != "")) | first
    // "UNKNOWN";
  def checks: .statusCheckRollup | if type == "array" then .[] | objects else empty end;
  def failing:
    ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"];
  $prs_file[0] as $prs
  | (.updated_at | fromdateiso8601) as $updated
  | .current_step as $current
  | (.plan_steps | length) as $steps
  | ([.completed_steps[] | {key: (.step | tostring), value: .}] | from_entries) as $done
  | [.artifacts.branches[].name] as $listed
  | .artifacts.prs as $numbers
  | .artifacts.branches as $declared
  | (if $prs == null then [] else
       [$prs[] | objects | select(.number as $n | $numbers | index($n))] end) as $mine
  | [$mine[] | select(.state != "OPEN") | .headRefName] as $ended_heads
  | [ ($branches[] as $b
       | ($declared[] | select(.name == $b.name)) as $d
       | (if $current == null or ($ended_heads | index($b.name)) then empty
          elif $b.origin == true and $d.pushed == false
          then "branch \($b.name) is on origin, but the checkpoint says it is not pushed"
          elif $b.origin == false and $d.pushed == true
          then "branch \($b.name) is not on origin, but the checkpoint says it was pushed"
          else empty end),
         (if $current != null and ($ended_heads | index($b.name) | not)
             and $b.local == false and $b.origin == false
          then "branch \($b.name) exists neither locally nor on origin" else empty end),
         (if $b.commit != null and $b.commit > $updated + 60
          then "branch \($b.name) has a commit from \($b.commit | todate), "
            + "after the checkpoint was written"
          else empty end)),
      (if $prs == null then empty else
         $numbers[] as $n
         | ([$mine[] | select(.number == $n)] | first) as $pr
         | if $pr == null then "PR #\($n) is not among the last 200 pull requests gh lists"
           else
             (if $pr.state != "OPEN" and $current != null
              then "PR #\($n) is \($pr.state), but step \($current) is still in progress"
              else empty end),
             (if ($listed | length) > 0 and ($listed | index($pr.headRefName)) == null
              then "PR #\($n) is from branch \($pr.headRefName), "
                + "which the checkpoint does not list"
              else empty end)
           end
       end),
      ($files[] | select(.exists | not) | "file \(.path) does not exist") ] as $contradictions
  | [ $mine[] | select(.state == "OPEN")
      | [checks | select(check | IN(failing[])) | .name // .context // "unnamed"] as $failed
      | if ($failed | length) > 0 then "PR #\(.number) has failing checks: \($failed | join(", "))"
        else empty end ] as $attention
  | if $mode == "summary" and $current == null then
      "## \($id): finished, updated \(.updated_at) (\($updated | ago))"
      + (if ($contradictions | length) + ($attention | length) > 0
         then "; \($contradictions | length) contradictions, \($attention | length) to attend to: "
           + "scripts/agent-resume.sh \($id)"
         else "" end)
    else
      "## \($id) (updated \(.updated_at), \($updated | ago))",
      "Goal: \(.goal)",
      "Steps (\($done | length) of \($steps) done):",
      (.plan_steps | to_entries[]
       | (.key + 1) as $n
       | if $done[$n | tostring] then
           "  [x] \($n). \(.value)"
             + ($done[$n | tostring].note // "" | if . == "" then "" else " -- \(.)" end)
         elif $n == $current then "  [>] \($n). \(.value)   <- in progress"
         else "  [ ] \($n). \(.value)" end),
      (if $current == null and ($done | length) == $steps then "Every step is done."
       else empty end),
      "Next action: \(if .next_action == "" then "(none)" else .next_action end)",
      (if (.blockers | length) == 0 then "Blockers: none"
       else "Blockers:", (.blockers[] | "  - \(.)") end),
      (if ($branches | length) + ($numbers | length) + ($files | length) > 0
       then "Artifacts now:" else empty end),
      ($branches[]
       | "  branch \(.name): local \(if .local then "yes" else "no" end), origin "
         + (if .origin == null then "unknown (git ls-remote failed)"
            elif .origin then "yes" else "no" end)),
      ($numbers[] as $n
       | if $prs == null then "  PR #\($n): unknown (gh unavailable)"
         else ([$mine[] | select(.number == $n)] | first) as $pr
         | if $pr == null then "  PR #\($n): not found"
           else "  PR #\($n) \($pr.state) \($pr.headRefName) ["
             + ([$pr | checks | check] | group_by(.) | map("\(.[0]) \(length)")
                | if length == 0 then "no checks" else join(", ") end)
             + "] \($pr.title)" end end),
      ($files[] | "  file \(.path): \(if .exists | not then "missing"
        elif .status == "" then "no uncommitted change" elif .status == "??" then "untracked"
        else "changed (\(.status | gsub(" "; "")))" end)"),
      (if ($attention | length) > 0 then "Needs attention:", ($attention[] | "  * \(.)")
       else empty end),
      (if ($contradictions | length) == 0 then "Contradictions: none"
       else "Contradictions (the checkpoint is stale; trust git and gh, then update it):",
         ($contradictions[] | "  ! \(.)") end)
    end
'

invalid=0
report=$tmp/invalid
active=$tmp/active
finished=$tmp/finished
: >"$report"
: >"$active"
: >"$finished"
n=0
for f in "${files[@]}"; do
  n=$((n + 1))
  name=$(basename "$f")
  id=${name%.json}
  problems=
  if [ ! -f "$f" ] || [ ! -r "$f" ]; then
    printf '\n!! %s is not a readable file (a dangling symlink or a directory?)\n' "$name" \
      >>"$report"
    invalid=1
    continue
  fi
  if ! count=$(jq -s length "$f" 2>"$tmp/err"); then
    printf '\n!! %s is not valid JSON: %s\n' "$name" "$(head -1 "$tmp/err")" >>"$report"
    invalid=1
    continue
  fi
  if [ "$count" != 1 ]; then
    problems="the file must hold exactly one JSON document, but holds $count"
  else
    problems=$(jq -r "$validate | .[]" "$f" 2>&1)
  fi
  if [[ ! $id =~ $id_re ]]; then
    problems="the file name must be <task-id>.json, with a task id of $id_rule"$'\n'"$problems"
  fi
  if [ -z "$problems" ]; then
    while IFS= read -r branch; do
      git check-ref-format "refs/heads/$branch" ||
        problems+="branch \"$branch\" is not a valid git branch name"$'\n'
    done < <(jq -r '.artifacts.branches[].name' "$f")
  fi
  if [ -n "$problems" ]; then
    printf '\n!! %s is invalid, so it was not briefed:\n' "$name" >>"$report"
    printf '%s\n' "$problems" | sed '/^$/d; s/^/   - /' >>"$report"
    invalid=1
    continue
  fi

  # What git knows about each branch, as JSON the briefing reads.
  facts='[]'
  file_facts='[]'
  error=
  while IFS= read -r branch; do
    local_ref=false
    commit_epoch=
    if git -C "$root" rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
      local_ref=true
      commit_epoch=$(git -C "$root" log -1 --format=%ct "refs/heads/$branch" 2>/dev/null)
    fi
    [[ $commit_epoch =~ ^[0-9]+$ ]] || commit_epoch=null
    if [ -e "$tmp/remote.failed" ]; then
      on_origin=null
    elif grep -qxF -- "$branch" "$tmp/remote-branches" 2>/dev/null; then
      on_origin=true
    else
      on_origin=false
    fi
    facts=$(jq -c --arg name "$branch" --argjson local "$local_ref" --argjson origin "$on_origin" \
      --argjson commit "$commit_epoch" '. + [{name: $name, local: $local, origin: $origin,
        commit: $commit}]' <<<"$facts" 2>&1) || error=$facts
  done < <(jq -r '.artifacts.branches[].name' "$f")

  while IFS= read -r path; do
    exists=false
    [ -e "$root/$path" ] && exists=true
    status=$(git -C "$root" status --porcelain -- ":(literal)$path" 2>/dev/null | head -1 |
      cut -c1-2)
    file_facts=$(jq -c --arg path "$path" --argjson exists "$exists" --arg status "$status" \
      '. + [{path: $path, exists: $exists, status: $status}]' <<<"$file_facts" 2>&1) ||
      error=$file_facts
  done < <(jq -r '.artifacts.files[]' "$f")

  mode=summary
  $full && mode=full
  out=$tmp/brief-$n
  if [ -z "$error" ] &&
    jq -r --arg id "$id" --arg mode "$mode" --argjson branches "$facts" \
      --argjson files "$file_facts" --slurpfile prs_file "$tmp/prs-or-null.json" \
      "$briefing" "$f" >"$out" 2>"$tmp/err"; then
    if jq -e '.current_step == null' "$f" >/dev/null && ! $full; then
      cat "$out" >>"$finished"
    else
      printf '%s\t%s\n' "$(jq -r '.updated_at' "$f")" "$out" >>"$active"
    fi
  else
    [ -n "$error" ] || error=$(head -1 "$tmp/err")
    printf '\n!! %s could not be briefed: %s\n' "$name" "$(printf '%s' "$error" | head -1)" \
      >>"$report"
    invalid=1
  fi
done

cat "$report"
# In progress, newest first; the timestamps are UTC in one format, so they sort as text.
sort -r "$active" | cut -f2 | while IFS= read -r out; do
  echo
  cat "$out"
done
if [ -s "$finished" ]; then
  printf '\nFinished tasks (scripts/agent-resume.sh <task-id> briefs one in full):\n'
  cat "$finished"
fi

exit "$invalid"
