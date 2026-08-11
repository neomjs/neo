#!/usr/bin/env node
/**
 * @summary Unattended nightly whitebox-e2e run with a RED-ONLY A2A digest (ticket-ref-ok: #14685 owning-leaf anchor).
 *
 * e2e lives OUTSIDE CI by design (failing-honest discipline — a whitebox proof may be legitimately red without
 * blocking a merge), but nothing runs it on a schedule, so red states sit undiscovered (the 3-week middleware
 * staleness failure mode). This is the unattended quality heartbeat: run the declared e2e configs, and on ANY
 * red, push ONE mailbox-drain-class A2A digest naming the failing specs + first-error lines + the run-log path.
 * Green runs are SILENT — red-as-pointer made push, not pull.
 *
 * Hardening (the middleware-scheduler LaunchAgent precedent): an exclusive PID lockfile with stale-steal, a run log,
 * structured stderr, and finally-hygiene that always releases the lock. LaunchAgent-staged (not auto-installed);
 * see ai/scripts/lifecycle/nightly-e2e/README for activation. CRITICAL inherited rule: custom playwright configs
 * only — every run passes `-c <config>`, never the default `npx playwright test`.
 *
 * Out of scope (per the ticket): CI integration (the outside-CI discipline stands), fixing the reds (the digest
 * points; owners fix), and unit/integration suites (CI owns those).
 * @plane host
 */
import {spawnSync}                                         from 'node:child_process';
import path                                                from 'node:path';
import {fileURLToPath}                                     from 'node:url';
import fs                                                  from 'fs-extra';
import GraphService                                        from '../../services/memory-core/GraphService.mjs';
import LifecycleService                                    from '../../services/memory-core/lifecycle/SystemLifecycleService.mjs';
import MailboxService                                      from '../../services/memory-core/MailboxService.mjs';
import RequestContextService                               from '../../mcp/server/shared/services/RequestContextService.mjs';
import {buildRunLog, collectFailures, formatDigest, isRed} from './nightlyE2eDigest.mjs';

/**
 * The whitebox-e2e configs the nightly run executes. ADDITIVE: append a config here as a suite lands
 * (dock e2e, FM NL-proofs, tour-replay suites). Each entry is a repo-relative playwright config;
 * its own `json` reporter `outputFile` is read back for the digest. Unit/integration configs are CI-owned and
 * deliberately absent.
 */
const E2E_CONFIGS = [
    {config: 'test/playwright/playwright.config.e2e.mjs', results: 'test-results/e2e/results.json'}
];

const STATE_DIR     = '.neo-ai-data/nightly-e2e',
      LOCK_PATH     = `${STATE_DIR}/runner.lock`,
      STATE_PATH    = `${STATE_DIR}/last-run.json`,
      LOCK_STALE_MS = 6 * 60 * 60 * 1000;   // 6h — a nightly run that outlives this is a hung process; steal the lock

/**
 * @summary Acquires the exclusive runner lock, stealing it only when the holder is provably stale (> 6h). A
 * fresh lock means another nightly run is in flight — abort rather than double-run the suite.
 * @param {String} nowIso ISO timestamp for the lock stamp.
 * @returns {Promise<Boolean>} `true` when the lock is held by this process, `false` when a fresh run owns it.
 */
async function acquireLock(nowIso) {
    await fs.ensureDir(STATE_DIR);

    if (await fs.pathExists(LOCK_PATH)) {
        const held    = await fs.readJson(LOCK_PATH).catch(() => null),
              heldAt  = held?.at ? new Date(held.at).getTime() : 0,
              staleMs = Date.now() - heldAt;

        if (held && staleMs < LOCK_STALE_MS) {
            console.error(`[nightlyE2eRunner] Abort: a run started ${held.at} (pid ${held.pid}) still holds the lock.`);
            return false;
        }
        console.error(`[nightlyE2eRunner] Stealing stale lock (held ${held?.at ?? 'unknown'}, > ${LOCK_STALE_MS}ms).`);
    }

    await fs.writeJson(LOCK_PATH, {pid: process.pid, at: nowIso}, {spaces: 2});
    return true;
}

/**
 * @summary Runs one e2e config to completion and reads back its JSON reporter output. A non-zero exit with no
 * parseable results is itself a red (an infra/boot failure the digest must surface, not swallow).
 * @param {Object} entry declared config `{config, results}` — the config path + its reporter output path.
 * @returns {Object} per-config outcome `{config, failures, ran, note}`.
 */
export function runConfig(entry, {spawn = spawnSync} = {}) {
    console.error(`[nightlyE2eRunner] Running ${entry.config} …`);
    // Remove any stale reporter output FIRST: a prior run's results.json (or a leftover green one) must never
    // be read as THIS run's result — that would let an infra failure which writes no fresh report be scored
    // green, silently suppressing the red digest. The heartbeat's one job is to not go silent.
    fs.removeSync(entry.results);

    // Custom config ONLY — never the default `npx playwright test`. Capture (pipe) rather than inherit so the
    // output backs the per-run log the digest points at; echo it through so an attended run still sees it live.
    const run = spawn('npx', ['playwright', 'test', '-c', entry.config], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});

    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    const output = `$ npx playwright test -c ${entry.config}\n${run.stdout ?? ''}${run.stderr ?? ''}`;

    let report = null;
    try {
        if (fs.pathExistsSync(entry.results)) report = fs.readJsonSync(entry.results);
    } catch (error) {
        console.error(`[nightlyE2eRunner] Could not parse ${entry.results}: ${error.message}`);
    }

    if (!report) {
        // No parseable report + non-zero exit = infra/boot red. Surface it explicitly rather than reporting green.
        const ran = run.status === 0;
        return {config: entry.config, failures: [], ran, note: ran ? 'ran; no report emitted' : `runner exited ${run.status ?? 'signal'} with no report (infra/boot failure)`, output};
    }

    return {config: entry.config, failures: collectFailures(report), ran: true, note: '', output};
}

/**
 * @summary Executes the nightly run: hold the lock, run each declared config, and on ANY red push exactly one
 * normal-priority (mailbox-drain, never a wake storm) A2A digest. Green = silence. Always releases the lock.
 * @returns {Promise<Object>} run outcome `{red, sent, reason?}`.
 */
export async function runNightlyE2e() {
    const nowIso  = new Date().toISOString(),
          logPath = `${STATE_DIR}/logs/run-${nowIso.replace(/[:.]/g, '-')}.log`;

    if (!(await acquireLock(nowIso))) {
        return {red: false, sent: false, reason: 'lock-held'};
    }

    try {
        const outcomes = E2E_CONFIGS.map(entry => runConfig(entry)),
              red      = isRed(outcomes);

        // Back the digest's `Run log:` pointer with a real file: ensure the logs dir, write the captured
        // per-config output. Without this the logPath in last-run.json / the digest would be a phantom.
        fs.ensureDirSync(path.dirname(logPath));
        fs.writeFileSync(logPath, buildRunLog(outcomes, nowIso), 'utf8');

        await fs.writeJson(STATE_PATH, {
            at     : nowIso,
            red,
            configs: outcomes.map(o => ({config: o.config, failing: o.failures.length, ran: o.ran, note: o.note})),
            logPath
        }, {spaces: 2});

        if (!red) {
            console.error('[nightlyE2eRunner] All declared e2e configs green — staying silent.');
            return {red: false, sent: false};
        }

        const sender = process.env.NEO_AGENT_IDENTITY || '@system';
        await LifecycleService.ready();
        await GraphService.ready();

        await RequestContextService.run({agentIdentityNodeId: sender}, async () => {
            await MailboxService.addMessage({
                to      : 'AGENT:*',
                subject : `[nightly-e2e][RED] ${outcomes.reduce((n, o) => n + o.failures.length, 0)} failing whitebox-e2e spec(s) — ${nowIso.slice(0, 10)}`,
                body    : formatDigest(outcomes, logPath),
                priority: 'normal'   // mailbox-drain class (wake-tier compliant) — never a wake storm
            });
        });

        console.error('[nightlyE2eRunner] RED digest sent to AGENT:* (normal priority).');
        return {red: true, sent: true};
    } finally {
        await fs.remove(LOCK_PATH).catch(() => {});
    }
}

async function main() {
    const outcome = await runNightlyE2e();
    // Exit 0 on a clean run OR a clean-but-red run (the digest carries the signal; the process itself succeeded).
    // A thrown error (below) is the only non-zero exit — an infra failure of the RUNNER, distinct from a suite red.
    console.error(`[nightlyE2eRunner] Done: ${JSON.stringify(outcome)}`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
    main().catch(error => {
        console.error('[nightlyE2eRunner] Fatal:', error.stack);
        process.exit(1);
    });
}
