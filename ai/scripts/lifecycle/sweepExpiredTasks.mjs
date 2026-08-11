#!/usr/bin/env node
/**
 * @summary CLI invoker for `MailboxService.sweepExpiredTasks` consumed by the swarm heartbeat.
 *
 * Runs the maintenance bulk-UPDATE that transitions
 * stale `Submitted` / `Working` / `InputRequired` tasks past their `task.expiresAt` to
 * `Expired`. The Orchestrator swarm-heartbeat lane (`ai/daemons/SwarmHeartbeatService.mjs`)
 * now calls `MailboxService.sweepExpiredTasks()` directly each pulse; this CLI
 * wrapper is preserved for manual debugging.
 *
 * Output: a single JSON line on stdout containing `{success, sweptCount}` so a CLI caller
 * can capture the count for observability without parsing free-form prose.
 *
 * Exit codes:
 *  - 0: sweep completed (sweptCount may be 0; that is a successful no-op)
 *  - 1: substrate failure (LifecycleService init or sweep query threw)
 *
 * @example
 *   node ai/scripts/lifecycle/sweepExpiredTasks.mjs
 *   # → {"success":true,"sweptCount":3}
 * @plane in-plane
 */
// IMPORTANT: `Neo` MUST be imported BEFORE any module that uses `Neo.gatekeep()` /
// `Neo.setupClass()` at module-load time (e.g. `src/core/Compare.mjs`, transitively
// pulled in via the LifecycleService → GraphService → SQLite import chain). Without
// this prelude the script crashes at module-load with `ReferenceError: Neo is not
// defined`. Keep the bootstrap local to this entry point so manual CLI usage and
// orchestrator child-process usage share the same class-system prelude.
import Neo              from '../../../src/Neo.mjs';
import * as core        from '../../../src/core/_export.mjs';
import LifecycleService from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import MailboxService   from '../../services/memory-core/MailboxService.mjs';

async function main() {
    await LifecycleService.ready();
    const result = await MailboxService.sweepExpiredTasks();
    console.log(JSON.stringify(result));
    process.exit(0)
}

main().catch(err => {
    console.error('sweepExpiredTasks failed:', err.message);
    process.exit(1)
});
