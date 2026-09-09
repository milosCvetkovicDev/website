'use client';

import { usePrefersReducedMotion } from '@/hooks/use-prefers-reduced-motion';
import { memo, useEffect, useRef, useState } from 'react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LogEntry {
  text: string;
  cls: LogLevel;
}

type LogLevel = 'l-err' | 'l-wrn' | 'l-inf' | 'l-ok' | 'l-dbg' | 'l-agt';

interface PaneConfig {
  title: string;
  host: string;
  statusLeft: { cls: StatusColor; symbol: string; label: string };
  statusRight: string;
  speed: number;
  seq: LogEntry[];
}

type StatusColor = 's-ok' | 's-err' | 's-wrn';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LINES = 40;

const LOG_COLORS: Record<LogLevel, string> = {
  'l-err': 'var(--log-err)',
  'l-wrn': 'var(--log-wrn)',
  'l-inf': 'var(--log-inf)',
  'l-ok': 'var(--log-ok)',
  'l-dbg': 'var(--log-dbg)',
  'l-agt': 'var(--log-agt)',
};

const STATUS_COLORS: Record<StatusColor, string> = {
  's-ok': 'var(--tmux-status-ok)',
  's-err': 'var(--tmux-status-err)',
  's-wrn': 'var(--tmux-status-wrn)',
};

// ─── Pane Data ───────────────────────────────────────────────────────────────

const PANE_CONFIG: PaneConfig[] = [
  {
    title: 'kubectl \u2014 pods',
    host: 'prod-k8s-master',
    statusLeft: { cls: 's-ok', symbol: '\u25CF', label: '3/3 pods' },
    statusRight: 'ns: production',
    speed: 650,
    seq: [
      { text: '$ kubectl get pods -n production -w', cls: 'l-dbg' },
      {
        text: 'NAME                          READY   STATUS    RESTARTS   AGE',
        cls: 'l-dbg',
      },
      {
        text: 'api-server-6d7f4c8b9-x2k9p   1/1     Running   0          4d12h',
        cls: 'l-ok',
      },
      {
        text: 'api-server-6d7f4c8b9-m3j1q   1/1     Running   0          4d12h',
        cls: 'l-ok',
      },
      {
        text: 'api-server-6d7f4c8b9-r7n4t   1/1     Running   0          4d12h',
        cls: 'l-ok',
      },
      {
        text: 'worker-5c8b9d7f4-h7n2r       1/1     Running   0          4d12h',
        cls: 'l-ok',
      },
      { text: '', cls: 'l-dbg' },
      { text: '[03:14:05] Processing order batch (142 items)', cls: 'l-inf' },
      { text: '[03:14:06] warn: Heap usage 487Mi/512Mi (95.1%)', cls: 'l-wrn' },
      { text: '[03:14:07] FATAL ERROR: Reached heap limit', cls: 'l-err' },
      { text: '  \u2014 JavaScript heap out of memory', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: 'api-server-x2k9p   0/1   OOMKilled   1   4d12h', cls: 'l-err' },
      { text: 'api-server-m3j1q   0/1   OOMKilled   1   4d12h', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: '$ kubectl describe pod api-server-x2k9p', cls: 'l-dbg' },
      { text: '  State:        Waiting (CrashLoopBackOff)', cls: 'l-err' },
      { text: '  Last State:   Terminated (OOMKilled)', cls: 'l-err' },
      { text: '  Exit Code:    137', cls: 'l-err' },
      { text: '  Restart Count: 2', cls: 'l-wrn' },
      { text: '  Limits:       memory: 512Mi', cls: 'l-dbg' },
      { text: 'Events:', cls: 'l-dbg' },
      { text: '  Warning BackOff restarting failed container', cls: 'l-wrn' },
      { text: '', cls: 'l-dbg' },
      {
        text: '[AGENT] OOMKilled 2/3 pods \u2014 analyzing memory',
        cls: 'l-agt',
      },
      { text: '[AGENT] Root cause: unbounded Map OrderCache:47', cls: 'l-agt' },
      { text: '[AGENT] Fix: LRU eviction, cap 10k entries', cls: 'l-agt' },
      { text: '[AGENT] PR #847 opened', cls: 'l-agt' },
      { text: '', cls: 'l-dbg' },
      { text: 'api-server-x2k9p   1/1   Running   3   4d12h', cls: 'l-ok' },
      { text: 'api-server-m3j1q   1/1   Running   3   4d12h', cls: 'l-ok' },
      { text: '[OK] All pods recovered', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
    ],
  },
  {
    title: 'psql \u2014 slow query log',
    host: 'prod-db-primary',
    statusLeft: { cls: 's-ok', symbol: '\u25CF', label: 'pg 16.2' },
    statusRight: 'pool: 12/50',
    speed: 800,
    seq: [
      {
        text: '$ tail -f /var/log/postgresql/postgresql-16-main.log',
        cls: 'l-dbg',
      },
      { text: '', cls: 'l-dbg' },
      {
        text: 'LOG: duration: 4.231 ms  statement: SELECT id, status',
        cls: 'l-dbg',
      },
      { text: '     FROM orders WHERE customer_id = $1', cls: 'l-dbg' },
      {
        text: 'LOG: duration: 2.108 ms  statement: INSERT INTO audit_log',
        cls: 'l-dbg',
      },
      {
        text: 'LOG: duration: 11.4 ms  statement: SELECT p.*, i.qty',
        cls: 'l-inf',
      },
      {
        text: '     FROM products p JOIN inventory i ON p.id = i.pid',
        cls: 'l-inf',
      },
      { text: '', cls: 'l-dbg' },
      { text: 'LOG: duration: 847.312 ms  statement:', cls: 'l-wrn' },
      { text: '     SELECT o.*, c.name, SUM(li.qty * li.price)', cls: 'l-wrn' },
      {
        text: '     FROM orders o JOIN customers c ON o.cid = c.id',
        cls: 'l-wrn',
      },
      { text: '     JOIN line_items li ON o.id = li.oid', cls: 'l-wrn' },
      {
        text: '     GROUP BY o.id, c.name  -- Seq Scan (no index)',
        cls: 'l-wrn',
      },
      { text: '', cls: 'l-dbg' },
      { text: 'LOG: duration: 2001.3 ms  statement:', cls: 'l-err' },
      { text: '     SELECT count(*) FROM orders', cls: 'l-err' },
      { text: "     WHERE created_at > now() - interval '24h'", cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: 'FATAL: remaining connection slots reserved for', cls: 'l-err' },
      { text: '       non-replication superuser connections', cls: 'l-err' },
      { text: 'FATAL: too many connections for role "app_user"', cls: 'l-err' },
      { text: 'ERROR: canceling statement due to lock timeout', cls: 'l-err' },
      { text: 'DETAIL: Process 18247 waits for ShareLock', cls: 'l-err' },
      { text: '        on transaction 4847291', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: '[AGENT] Analyzing pg_stat_statements...', cls: 'l-agt' },
      { text: '[AGENT] Missing index: orders(created_at)', cls: 'l-agt' },
      {
        text: '[AGENT] N+1 detected: OrderRepository.findWithItems()',
        cls: 'l-agt',
      },
      { text: '', cls: 'l-dbg' },
      { text: 'LOG: duration: 3.651 ms  statement:', cls: 'l-ok' },
      { text: '     SELECT count(*) FROM orders -- Index Scan', cls: 'l-ok' },
      { text: '[OK] Pool: 12/50 \u2014 healthy', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
    ],
  },
  {
    title: 'gh actions \u2014 CI pipeline',
    host: 'github.com',
    statusLeft: { cls: 's-ok', symbol: '\u25CF', label: 'run #9847231' },
    statusRight: 'fix/bound-order-cache',
    speed: 500,
    seq: [
      { text: '$ gh run view 9847231 --log', cls: 'l-dbg' },
      { text: 'Triggered: self-healing-agent[bot]', cls: 'l-inf' },
      { text: 'Commit: a7f3e2d "fix: bound order cache"', cls: 'l-inf' },
      { text: 'Workflow: ci.yml (Nx Affected)', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25B6 Run actions/setup-node@v4', cls: 'l-dbg' },
      { text: '  Node.js 22.x (from cache)', cls: 'l-dbg' },
      { text: '\u25B6 Run npm ci', cls: 'l-dbg' },
      { text: '  added 1,847 packages in 23s', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF lint .................. running', cls: 'l-wrn' },
      { text: '  > nx affected --target=lint', cls: 'l-dbg' },
      { text: '  \u2713 api-server:lint (4.2s)', cls: 'l-ok' },
      { text: '  \u2713 shared-types:lint (1.1s)', cls: 'l-ok' },
      { text: '\u2713 lint .................. passed 12s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF typecheck ............. running', cls: 'l-wrn' },
      { text: '  > npx tsc --noEmit', cls: 'l-dbg' },
      { text: '\u2713 typecheck ............. passed 8s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF test .................. running', cls: 'l-wrn' },
      { text: '  > nx affected --target=test --parallel=4', cls: 'l-dbg' },
      { text: '  Shard 1/4 \u2014 212 passed', cls: 'l-inf' },
      { text: '  Shard 2/4 \u2014 211 passed', cls: 'l-inf' },
      { text: '  Shard 3/4 \u2014 212 passed', cls: 'l-inf' },
      { text: '  Shard 4/4 \u2014 212 passed', cls: 'l-inf' },
      { text: '  Suites: 47 passed | Tests: 847 passed', cls: 'l-ok' },
      { text: '  Coverage: 91.2% statements', cls: 'l-ok' },
      { text: '\u2713 test .................. passed 34s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF e2e (Playwright) ...... running', cls: 'l-wrn' },
      { text: '  68 tests, 4 workers, 4 shards', cls: 'l-dbg' },
      { text: '  68 passed (1m 12s)', cls: 'l-ok' },
      { text: '\u2713 e2e ................... passed 1m 14s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF security .............. running', cls: 'l-wrn' },
      { text: '  gitleaks: 0 secrets (308 commits)', cls: 'l-ok' },
      { text: '  npm audit: 0 vulnerabilities', cls: 'l-ok' },
      { text: '  trivy: 0 HIGH, 0 CRITICAL', cls: 'l-ok' },
      { text: '\u2713 security .............. passed 22s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u25CF build ................. running', cls: 'l-wrn' },
      { text: '  [cache] shared-types:build', cls: 'l-inf' },
      { text: '  api-server:build \u2014 14s', cls: 'l-ok' },
      { text: '\u2713 build ................. passed 18s', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: '\u2713 All 6 checks passed', cls: 'l-ok' },
      { text: '[AGENT] CI green. Awaiting human approval.', cls: 'l-agt' },
      { text: '', cls: 'l-dbg' },
    ],
  },
  {
    title: 'nginx \u2014 access + error',
    host: 'prod-lb-01',
    statusLeft: { cls: 's-ok', symbol: '\u25CF', label: 'nginx/1.25' },
    statusRight: 'upstream: 10.0.3.12',
    speed: 400,
    seq: [
      { text: '$ tail -f /var/log/nginx/access.log', cls: 'l-dbg' },
      { text: '10.0.1.42 "GET /api/v2/orders" 200 4832 14ms', cls: 'l-inf' },
      { text: '10.0.1.55 "POST /api/v2/orders" 201 247 23ms', cls: 'l-inf' },
      {
        text: '10.0.1.42 "GET /api/v2/customers?p=1" 200 12480 8ms',
        cls: 'l-inf',
      },
      { text: '10.0.1.78 "GET /api/v2/inventory" 200 8192 11ms', cls: 'l-inf' },
      { text: '10.0.1.55 "POST /api/v2/payments" 201 156 145ms', cls: 'l-inf' },
      { text: '10.0.1.99 "GET /healthz" 200 2 2ms', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: '$ tail -f /var/log/nginx/error.log', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: '10.0.1.55 "POST /api/v2/orders" 504 30001ms', cls: 'l-err' },
      { text: 'upstream timed out (110: Connection timed out)', cls: 'l-err' },
      { text: '  while reading response header from upstream', cls: 'l-err' },
      { text: '  upstream: http://10.0.3.12:3000', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: '10.0.1.42 "GET /api/v2/orders" 502 0ms', cls: 'l-err' },
      { text: 'connect() failed (111: Connection refused)', cls: 'l-err' },
      { text: '  while connecting to upstream', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: '10.0.1.78 "POST /api/v2/payments" 504 30002ms', cls: 'l-err' },
      { text: 'recv() failed (104: Connection reset by peer)', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: '[WARN] Error rate: 12.4% (threshold: 1%)', cls: 'l-wrn' },
      { text: '[WARN] p99: 30001ms (SLA: 500ms)', cls: 'l-wrn' },
      { text: '[INFO] Circuit breaker OPEN /api/v2/orders', cls: 'l-wrn' },
      { text: '', cls: 'l-dbg' },
      { text: '... upstream recovering ...', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: '10.0.1.42 "GET /api/v2/orders" 200 4832 12ms', cls: 'l-inf' },
      { text: '10.0.1.55 "POST /api/v2/orders" 201 247 19ms', cls: 'l-inf' },
      { text: '10.0.1.78 "POST /api/v2/payments" 201 156 132ms', cls: 'l-inf' },
      { text: '[OK] Circuit breaker CLOSED', cls: 'l-ok' },
      { text: '[OK] Error rate: 0.02%', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
    ],
  },
  {
    title: 'prometheus \u2014 alerts',
    host: 'monitoring',
    statusLeft: { cls: 's-err', symbol: '\u25B2', label: '3 FIRING' },
    statusRight: 'scrape: 15s',
    speed: 850,
    seq: [
      { text: '$ amtool alert query', cls: 'l-dbg' },
      { text: '', cls: 'l-dbg' },
      { text: 'container_memory{pod="api"} 312Mi/512Mi', cls: 'l-inf' },
      { text: 'node_cpu_idle                0.77', cls: 'l-inf' },
      { text: 'http_requests{code="500"}    0 (5m)', cls: 'l-inf' },
      { text: '', cls: 'l-dbg' },
      { text: 'container_memory{pod="api"} 421Mi/512Mi', cls: 'l-wrn' },
      { text: 'node_cpu_idle                0.53', cls: 'l-wrn' },
      { text: 'http_request_p99             0.847s', cls: 'l-wrn' },
      { text: '', cls: 'l-dbg' },
      { text: 'container_memory{pod="api"} 487Mi/512Mi', cls: 'l-err' },
      { text: 'node_cpu_idle                0.22', cls: 'l-err' },
      { text: 'http_requests{code="500"}    +847 (5m)', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: 'FIRING  HighMemoryUsage  severity=critical', cls: 'l-err' },
      { text: '  instance: api-server-x2k9p', cls: 'l-err' },
      { text: '  summary: Memory > 90% for 2m', cls: 'l-err' },
      { text: '  value: 95.1%', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: 'FIRING  HighErrorRate  severity=critical', cls: 'l-err' },
      { text: '  job: api-server', cls: 'l-err' },
      { text: '  summary: Error rate > 5% for 1m', cls: 'l-err' },
      { text: '  value: 12.4%', cls: 'l-err' },
      { text: '', cls: 'l-dbg' },
      { text: 'FIRING  PodCrashLooping  severity=warning', cls: 'l-wrn' },
      { text: '  pod: api-server-x2k9p', cls: 'l-wrn' },
      { text: '  restarts > 3 in 10m', cls: 'l-wrn' },
      { text: '', cls: 'l-dbg' },
      { text: '[AGENT] HPA triggered: replicas 3\u21925', cls: 'l-agt' },
      { text: '', cls: 'l-dbg' },
      { text: 'container_memory{pod="api"} 248Mi/512Mi', cls: 'l-ok' },
      { text: 'node_cpu_idle                0.62', cls: 'l-ok' },
      { text: 'http_requests{code="500"}    0 (5m)', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
      { text: 'RESOLVED HighMemoryUsage  value=48.4%', cls: 'l-ok' },
      { text: 'RESOLVED HighErrorRate    value=0.02%', cls: 'l-ok' },
      { text: 'RESOLVED PodCrashLooping', cls: 'l-ok' },
      { text: '', cls: 'l-dbg' },
    ],
  },
];

// ─── Sub-Components ──────────────────────────────────────────────────────────

const TabBar = memo(function TabBar({ clock }: { clock: string }) {
  return (
    <div
      className="flex h-[30px] shrink-0 items-center border-b px-2.5 font-mono text-xs"
      style={{
        background: 'var(--tmux-bar)',
        borderColor: 'var(--tmux-border)',
        fontSize: '12px',
      }}
    >
      {/* Tabs */}
      <div
        className="border-r px-3.5 py-1"
        style={{
          background: 'var(--tmux-active-tab)',
          color: 'var(--tmux-bar-text-bright)',
          borderColor: 'var(--tmux-border)',
        }}
      >
        {'\u2B24'} production-monitor
      </div>
      <div
        className="border-r px-3.5 py-1"
        style={{
          color: 'var(--tmux-bar-text)',
          borderColor: 'var(--tmux-border)',
        }}
      >
        {'\u25CB'} staging
      </div>
      <div
        className="border-r px-3.5 py-1"
        style={{
          color: 'var(--tmux-bar-text)',
          borderColor: 'var(--tmux-border)',
        }}
      >
        {'\u25CB'} logs
      </div>

      {/* Right side */}
      <div
        className="ml-auto flex gap-4"
        style={{ color: 'var(--tmux-bar-text)', fontSize: '11px' }}
      >
        <span>milos@obsidian22</span>
        <span>{clock}</span>
      </div>
    </div>
  );
});

const PaneTitle = memo(function PaneTitle({ title, host }: { title: string; host: string }) {
  return (
    <div
      className="flex h-[26px] shrink-0 items-center justify-between border-b px-3 font-mono"
      style={{
        background: 'var(--tmux-pane-title)',
        borderColor: 'var(--tmux-border)',
        fontSize: '11px',
        color: 'var(--tmux-bar-text)',
      }}
    >
      <span style={{ color: 'var(--tmux-pane-title-text)', fontWeight: 500 }}>{title}</span>
      <span>{host}</span>
    </div>
  );
});

const PaneStatus = memo(function PaneStatus({
  statusLeft,
  statusRight,
}: {
  statusLeft: PaneConfig['statusLeft'];
  statusRight: string;
}) {
  return (
    <div
      className="flex h-6 shrink-0 items-center justify-between border-t px-3 font-mono"
      style={{
        background: 'var(--tmux-pane-title)',
        borderColor: 'var(--tmux-border)',
        fontSize: '10px',
        color: 'var(--tmux-bar-text)',
      }}
    >
      <span>
        <span style={{ color: STATUS_COLORS[statusLeft.cls] }}>{statusLeft.symbol}</span>{' '}
        {statusLeft.label}
      </span>
      <span>{statusRight}</span>
    </div>
  );
});

const StatusBar = memo(function StatusBar({ clock }: { clock: string }) {
  return (
    <div
      className="flex h-7 shrink-0 items-center border-t px-3 font-mono"
      style={{
        background: 'var(--tmux-bar)',
        borderColor: 'var(--tmux-border)',
        fontSize: '11px',
        color: 'var(--tmux-bar-text)',
      }}
    >
      <div className="flex gap-3">
        <span style={{ color: 'var(--tmux-status-ok)' }}>{'\u25A0'}</span>
        <span>[0] production-monitor</span>
        <span>{'\u00B7'}</span>
        <span>5 panes</span>
      </div>
      <div className="ml-auto flex gap-4">
        <span style={{ color: 'var(--tmux-status-alerts)' }}>{'\u26A1'} 3 alerts</span>
        <span>{'\u2502'}</span>
        <span style={{ color: 'var(--tmux-status-uptime)' }}>{'\u2191'} 99.97%</span>
        <span>{'\u2502'}</span>
        <span>us-east-1</span>
        <span>{'\u2502'}</span>
        <span>{clock}</span>
      </div>
    </div>
  );
});

// ─── Static Snapshot (reduced motion) ────────────────────────────────────────

function StaticPane({ config }: { config: PaneConfig }) {
  // Show the first ~15 lines as a static snapshot
  const lines = config.seq.slice(0, 15);
  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden border-r last:border-r-0"
      style={{ borderColor: 'var(--tmux-border)', borderRightWidth: '2px' }}
    >
      <PaneTitle title={config.title} host={config.host} />
      <div className="relative flex-1 overflow-hidden">
        <div
          className="absolute right-0 bottom-0 left-0 font-mono whitespace-nowrap"
          style={{ padding: '6px 10px', fontSize: '14px', lineHeight: '1.65' }}
        >
          {lines.map((entry, i) => (
            <div key={i} style={{ color: LOG_COLORS[entry.cls] }}>
              {entry.text || '\u00A0'}
            </div>
          ))}
        </div>
      </div>
      <PaneStatus statusLeft={config.statusLeft} statusRight={config.statusRight} />
    </div>
  );
}

// ─── Animated Pane ───────────────────────────────────────────────────────────

// The log lines are 14px text at line-height 1.65; both values are set inline on the slot container
// below and the arithmetic here must stay in step with them.
const LINE_HEIGHT_PX = 14 * 1.65;
const PANE_PADDING_Y_PX = 6;
const LINE_APPEAR_MS = 250;

/**
 * A pane keeps a fixed grid of line slots and rotates text through them, newest at the bottom.
 * Appending a line to a bottom-anchored container instead moves every existing line up, and each
 * of those moves is a layout shift; over a long enough session they added up to most of the home
 * page's CLS. Text changes inside boxes that never move do not count as shifts, and neither does the
 * transform-based appear animation on the newest slot.
 */
function AnimatedPane({
  config,
  isVisibleRef,
}: {
  config: PaneConfig;
  isVisibleRef: React.RefObject<boolean>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const slots = slotsRef.current;
    if (!viewport || !slots) return;

    let nextIndex = 0;
    const history: LogEntry[] = [];

    // Write the newest lines into the slots. Skipping unchanged slots keeps the DOM churn down.
    const paint = () => {
      const count = slots.children.length;
      for (let i = 0; i < count; i++) {
        const slot = slots.children[i] as HTMLElement;
        const entry = history[history.length - count + i];
        const text = entry?.text || '\u00A0';
        if (slot.textContent !== text) slot.textContent = text;
        const color = entry ? LOG_COLORS[entry.cls] : '';
        if (slot.style.color !== color) slot.style.color = color;
      }
    };

    // Size the grid to the pane: as many lines as fit (the first may be clipped at the top) with
    // the last one flush against the bottom padding. Slots are only ever added or removed at the
    // end, so no existing slot moves when the pane resizes.
    const fit = (height: number) => {
      const usable = height - PANE_PADDING_Y_PX * 2;
      const count = Math.min(MAX_LINES, Math.max(0, Math.ceil(usable / LINE_HEIGHT_PX)));
      slots.style.top = `${usable - count * LINE_HEIGHT_PX}px`;
      while (slots.children.length < count) slots.appendChild(document.createElement('div'));
      while (slots.children.length > count && slots.lastChild) slots.removeChild(slots.lastChild);
      paint();
    };

    const addLine = () => {
      history.push(config.seq[nextIndex % config.seq.length]);
      nextIndex++;
      if (history.length > MAX_LINES) history.shift();
      paint();
      const newest = slots.lastElementChild;
      if (newest instanceof HTMLElement && typeof newest.animate === 'function') {
        newest.animate(
          [
            { opacity: 0, transform: 'translateY(3px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: LINE_APPEAR_MS, easing: 'ease' },
        );
      }
    };

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const latest = entries[entries.length - 1];
        if (latest) fit(latest.contentRect.height);
      });
      resizeObserver.observe(viewport);
    } else {
      fit(viewport.clientHeight);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    function tick() {
      if (isVisibleRef.current) addLine();
      const jitter = config.speed * 0.3;
      const delay = config.speed + (Math.random() - 0.5) * jitter;
      timer = setTimeout(tick, delay);
    }

    // Defer animation start until the browser is idle so we don't
    // compete with initial render, hydration, and boot animation
    let idleHandle: number | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

    if ('requestIdleCallback' in window) {
      idleHandle = requestIdleCallback(() => {
        timer = setTimeout(tick, Math.random() * 2000);
      });
    } else {
      fallbackTimer = setTimeout(() => {
        timer = setTimeout(tick, Math.random() * 2000);
      }, 1200);
    }

    return () => {
      resizeObserver?.disconnect();
      if (idleHandle !== undefined) cancelIdleCallback(idleHandle);
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
      clearTimeout(timer);
    };
  }, [config, isVisibleRef]);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col overflow-hidden border-r last:border-r-0"
      style={{ borderColor: 'var(--tmux-border)', borderRightWidth: '2px' }}
    >
      <PaneTitle title={config.title} host={config.host} />
      <div ref={viewportRef} className="relative flex-1 overflow-hidden">
        <div
          ref={slotsRef}
          className="absolute right-0 left-0 font-mono whitespace-nowrap"
          style={{ padding: `${PANE_PADDING_Y_PX}px 10px`, fontSize: '14px', lineHeight: '1.65' }}
        />
      </div>
      <PaneStatus statusLeft={config.statusLeft} statusRight={config.statusRight} />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TmuxBackground() {
  const [clocks, setClocks] = useState({
    clock: '03:14:07',
    status: 'Sat Feb 22 03:14',
  });
  const prefersReducedMotion = usePrefersReducedMotion();

  const containerRef = useRef<HTMLDivElement>(null);
  const isVisibleRef = useRef(true);

  // Track visibility with IntersectionObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Tick clock every second (pauses when off-screen)
  useEffect(() => {
    if (prefersReducedMotion) return;

    let seconds = 7;
    const interval = setInterval(() => {
      if (!isVisibleRef.current) return;
      seconds++;
      const s = String(seconds % 60).padStart(2, '0');
      const totalMinutes = 14 + Math.floor(seconds / 60);
      const h = String(3 + Math.floor(totalMinutes / 60)).padStart(2, '0');
      const m = String(totalMinutes % 60).padStart(2, '0');
      setClocks({ clock: `${h}:${m}:${s}`, status: `Sat Feb 22 ${h}:${m}` });
    }, 1000);

    return () => clearInterval(interval);
  }, [prefersReducedMotion]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 flex flex-col overflow-hidden"
      aria-hidden="true"
      style={{ background: 'var(--tmux-bg)' }}
    >
      {/* Top tab bar */}
      <TabBar clock={clocks.clock} />

      {/* 5 panes in a row */}
      <div className="flex flex-1 overflow-hidden">
        {PANE_CONFIG.map((config) =>
          prefersReducedMotion ? (
            <StaticPane key={config.title} config={config} />
          ) : (
            <AnimatedPane key={config.title} config={config} isVisibleRef={isVisibleRef} />
          ),
        )}
      </div>

      {/* Bottom tmux status bar */}
      <StatusBar clock={clocks.status} />
    </div>
  );
}
