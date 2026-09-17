#!/usr/bin/env bash
# SessionStart: print the branch, my open PRs with a check summary, then the recent handoff notes.
# Stdout becomes session context. Claude Code caps hook output at 10,000 characters and replaces
# anything longer with a short preview, so the whole output is held to a byte budget, and the git
# and PR sections come first so that notes cannot push them out. Never fail session start: every
# command may fail and the hook still exits 0.

# `git status` refreshes the index and takes index.lock to write it back, which makes a git add or
# commit by another session in this checkout fail on the lock. Optional locks are skipped instead.
export GIT_OPTIONAL_LOCKS=0
# Appended, not prepended: a hook's PATH may lack Homebrew, but whatever comes first on PATH wins.
PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"
cd "${CLAUDE_PROJECT_DIR:-$PWD}" || exit 0

BUDGET=9000     # bytes for the whole output, under the 10,000-character cap
NOTE_LINES=40   # lines printed from each note
LINE_BYTES=300  # bytes printed from each line
gh_timeout=${SESSION_START_GH_TIMEOUT:-8}
case $gh_timeout in '' | *[!0-9]* | 0 | ????*) gh_timeout=8 ;; esac

# Cuts every line of stdin to $1 bytes and keeps at most $2 lines.
clip() {
  perl -ne 'BEGIN { ($w, $n) = splice @ARGV, 0, 2 } last if $. > $n; chomp;
    $_ = substr($_, 0, $w) . " [...]" if length > $w; print "$_\n"' "$@"
}

git_out=$(git status -sb 2>/dev/null | clip 200 20)

# One line per PR: number, branch -> base, its checks counted by conclusion (by status or state
# while a check has none yet: gh gives a running check run an empty conclusion, which `//` keeps),
# title. gh gets 8 s: a gh that hangs on the network would otherwise use up the hook's 20 s timeout,
# and a timed-out hook's output is discarded. perl forks it into its own process group and sends
# SIGTERM to the group when the alarm fires, so a wrapper script's children die with it. An alarm
# alone does not work, because gh is a Go program and Go ignores SIGALRM.
filter='def check: if (.conclusion // "") != "" then .conclusion'
filter+=' else (.state // .status // "UNKNOWN") end;'
filter+=' .[] | "#\(.number) \(.headRefName) -> \(.baseRefName) ['
filter+='\([.statusCheckRollup[]? | check] | group_by(.) | map("\(.[0]) \(length)") | join(", "))]'
filter+=' \(.title | gsub("[\r\n]+"; " "))"'
if pr_out=$(perl -e '$s = shift; $pid = fork // exit 1;
    unless ($pid) { setpgrp(0, 0); exec @ARGV or exit 127 }
    $SIG{ALRM} = sub { kill("TERM", -$pid) or kill("TERM", $pid) }; alarm $s; waitpid $pid, 0;
    exit($? >> 8 || ($? ? 1 : 0))' \
  "$gh_timeout" gh pr list --author @me \
  --json number,title,headRefName,baseRefName,statusCheckRollup \
  --jq "$filter" 2>/dev/null </dev/null)
then
  pr_out=$(printf '%s\n' "$pr_out" | sed '/^$/d' | clip 200 15)
  [ -n "$pr_out" ] || pr_out='(none)'
else
  pr_out='(gh unavailable)'
fi

head_out=$(printf -- '--- GIT ---\n%s\n\n--- MY OPEN PRS ---\n%s\n\n' "$git_out" "$pr_out"
  echo '--- SAVED STATE (.agent-state, changed in the last 7 days, newest first) ---')
printf '%s\n' "$head_out"
used=$(printf '%s\n' "$head_out" | wc -c | tr -d ' ')

# Notes, newest first, until the budget runs out. -H follows .agent-state itself when it is a
# symlink; -type f skips directories named *.md; NUL-separated names survive any character.
find -H .agent-state -type f -name '*.md' -mtime -7 -print0 2>/dev/null |
  perl -0 -e '
    my ($max_lines, $width, $budget) = splice @ARGV, 0, 3;
    my @files = map { chomp; $_ } <STDIN>;
    my %mtime = map { $_ => (stat $_)[9] // 0 } @files;
    @files = sort { $mtime{$b} <=> $mtime{$a} or $a cmp $b } @files;
    $budget -= 120;  # room for the line saying how many notes did not fit
    my ($out, $shown) = ("", 0);
    for my $f (@files) {
      open my $fh, "<", $f or next;
      my @lines = do { local $/ = "\n"; <$fh> };
      close $fh;
      (my $name = $f) =~ s/[[:cntrl:]]/?/g;
      my @t = localtime $mtime{$f};
      my $block = sprintf "\n### %s (modified %04d-%02d-%02d %02d:%02d)\n", $name,
        $t[5] + 1900, $t[4] + 1, @t[3, 2, 1];
      my $n = 0;
      for my $line (@lines) {
        last if ++$n > $max_lines;
        $line =~ s/\n\z//;
        $line = substr($line, 0, $width) . " [...]" if length $line > $width;
        $block .= "$line\n";
      }
      # Counted with Perl lines, so a last line without a newline still counts.
      $block .= sprintf "[... %d more lines: read %s]\n", @lines - $max_lines, $name
        if @lines > $max_lines;
      if (length($out) + length($block) > $budget) {
        my $room = $budget - length($out) - 80;
        last if $shown > 0 || $room < 200;
        my $cut = substr($block, 0, $room);
        $cut =~ s/[^\n]*\z//;
        $block = $cut . "[... cut to fit the budget: read $name]\n";
      }
      $out .= $block;
      $shown++;
    }
    print $out;
    printf "\n[... %d more notes changed in the last 7 days did not fit: ls -t .agent-state]\n",
      @files - $shown if @files > $shown;
  ' "$NOTE_LINES" "$LINE_BYTES" "$((BUDGET - used))"
exit 0
