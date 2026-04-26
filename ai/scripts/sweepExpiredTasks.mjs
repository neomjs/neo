#!/usr/bin/env node
/**
 * @summary CLI invoker for `MailboxService.sweepExpiredTasks` consumed by the swarm heartbeat.
 *
 * Track 2C (#10339) — TTL/Expired sweeper. Runs the maintenance bulk-UPDATE that transitions
 * stale `Submitted` / `Working` / `InputRequired` tasks past their `task.expiresAt` to
 * `Expired`. Designed for short-lived invocation from `ai/scripts/swarm-heartbeat.sh` per
 * cycle (one Node startup per heartbeat tick); also runnable directly for manual debugging.
 *
 * Output: a single JSON line on stdout containing `{success, sweptCount}` so the heartbeat
 * shell can capture the count for observability without parsing free-form prose.
 *
 * Exit codes:
 *  - 0: sweep completed (sweptCount may be 0; that is a successful no-op)
 *  - 1: substrate failure (LifecycleService init or sweep query threw)
 *
 * @example
 *   node ai/scripts/sweepExpiredTasks.mjs
 *   # → {"success":true,"sweptCount":3}
 */
import LifecycleService from '../mcp/server/memory-core/services/lifecycle/SystemLifecycleService.mjs';
import MailboxService   from '../mcp/server/memory-core/services/MailboxService.mjs';

async function main() {
    await LifecycleService.initAsync();
    const result = await MailboxService.sweepExpiredTasks();
    console.log(JSON.stringify(result));
    process.exit(0)
}

main().catch(err => {
    console.error('sweepExpiredTasks failed:', err.message);
    process.exit(1)
});
