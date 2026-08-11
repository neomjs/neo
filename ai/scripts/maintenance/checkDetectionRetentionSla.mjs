/**
 * @module ai/scripts/maintenance/checkDetectionRetentionSla
 * @summary CI guard entrypoint for the backup-reliability invariant: the data-integrity detect cadence
 * must beat the backup-retention window with margin, so a corruption is caught while a good backup
 * still exists to recover from.
 *
 * ```
 * detectCadenceMs  <=  backupRetentionMs / safetyFactor
 * ```
 *
 * This is the thread-entrypoint half of a three-part split, and the split is what keeps each part
 * honest:
 *
 * 1. `detectionRetentionSla.mjs` — the SLA arithmetic, pure, config-shape-free.
 * 2. `detectionRetentionSlaInputs.mjs` — config-shape adaptation, pure, Neo-free.
 * 3. **this file** — the only part that reads the config SSOT, and the only part that exits a process.
 *
 * Being an entrypoint is what licenses the `Neo` / `AiConfig` imports below; the two pure halves stay
 * importable by tests without pulling the config tree in.
 *
 * ## Why the CANONICAL template, not the operator overlay
 *
 * This reads `ai/config.template.mjs` rather than `ai/config.mjs`. The overlay is **gitignored and
 * generated**, so it does not exist in a fresh checkout — a guard importing it fails before reaching
 * its own logic, which is a red build that says nothing about the invariant. It is also the wrong
 * source on purpose: this gate asserts the invariant the **repository declares**, not a value some
 * machine happens to override locally. Env bindings still apply, because they are declared on the
 * leaves themselves, so an operator can still reproduce a breach verdict from the shell.
 *
 * ## Why this guard is expected to be GREEN, and why that is not a reason to skip it
 *
 * On shipped config the verdict passes with a wide margin (hourly detect against a 30-day window
 * leaves ~15 days of headroom). The value is entirely **prospective**: it fires when someone shortens
 * retention, lengthens the detect interval, or disables the detect lane — the three edits that
 * silently make recovery impossible without touching a line of recovery code. A guard measured only
 * against config that already satisfies it proves nothing about config not yet written, which is why
 * its unit coverage carries a positive control rather than relying on this run staying green.
 *
 * ## Exit contract
 *
 * `0` — the invariant holds. Anything else is a breach, including an input the guard could not
 * resolve: an unresolvable window is reported as a failure, never assumed benign. The output names
 * the required ceiling so the message carries the remedy rather than only the symptom.
 * @plane in-plane
 */

import {pathToFileURL} from 'url';
import Neo             from '../../../src/Neo.mjs';
import AiConfig        from '../../config.template.mjs';

import {evaluateDetectionRetentionSla}   from './detectionRetentionSla.mjs';
import {resolveDetectionRetentionInputs} from './detectionRetentionSlaInputs.mjs';

/**
 * Milliseconds per day — for rendering durations the verdict reports in ms.
 * @type {Number}
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @summary Renders a millisecond duration as days, for human-readable guard output.
 * @param {Number} ms Duration in milliseconds.
 * @returns {String}
 */
function asDays(ms) {
    return `${(ms / MS_PER_DAY).toFixed(2)}d`;
}

/**
 * @summary Evaluates the detect-vs-retention SLA against live config and reports a process verdict.
 *
 * Reads both leaves at the use site (the config SSOT owns their resolution; this file never
 * re-derives or caches them), hands them to the pure resolver, and only then applies the SLA
 * arithmetic. A resolution failure short-circuits before the arithmetic so the operator reads *which
 * input* is missing rather than a verdict computed from a value nobody configured.
 * @returns {Number} Process exit code — `0` when the invariant holds, `1` on any breach.
 */
function main() {
    const inputs = resolveDetectionRetentionInputs({
        dataIntegritySweepCheckMs: AiConfig.orchestrator.intervals.dataIntegritySweepCheckMs,
        retention                : AiConfig.maintenance.backup.retention
    });

    if (!inputs.ok) {
        console.error('check-detection-retention-sla: BREACH — inputs unresolvable');
        console.error(`  ${inputs.reason}`);
        console.error('  A recoverability window the guard cannot read is treated as a breach, not a pass.');

        return 1;
    }

    const verdict = evaluateDetectionRetentionSla({
        backupRetentionMs: inputs.backupRetentionMs,
        detectCadenceMs  : inputs.detectCadenceMs
    });

    if (!verdict.withinSla) {
        console.error('check-detection-retention-sla: BREACH — detection cannot beat backup retention');
        console.error(`  detect cadence      : ${asDays(inputs.detectCadenceMs)}`);
        console.error(`  retention window    : ${asDays(inputs.backupRetentionMs)}`);
        console.error(`  required max detect : ${asDays(verdict.requiredMaxDetectMs)}`);
        console.error(`  reason              : ${verdict.reason}`);
        console.error('  A corruption would age past the last good backup before anyone noticed.');

        return 1;
    }

    console.log('check-detection-retention-sla: OK');
    console.log(`  detect cadence ${asDays(inputs.detectCadenceMs)} <= ceiling ` +
                `${asDays(verdict.requiredMaxDetectMs)} (retention ${asDays(inputs.backupRetentionMs)}), ` +
                `margin ${asDays(verdict.marginMs)}`);

    return 0;
}

// Exit only when run as a CLI. Without this guard the module could not be imported at all — the
// import itself would terminate the importing process, which would make the entrypoint untestable
// and any future reuse impossible.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    process.exit(main());
}

export {asDays, main};
