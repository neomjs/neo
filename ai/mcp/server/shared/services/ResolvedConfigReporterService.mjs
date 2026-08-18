import path     from 'node:path';
import Base     from '../../../../../src/core/Base.mjs';
import AiConfig from '../../../../config.mjs';

import {assertDisclosureAllowlist, projectDisclosedConfig} from '../helpers/resolvedConfigDisclosure.mjs';
import {writeFileAtomicSync}                               from '../../../../services/shared/atomicFileWrite.mjs';

/**
 * @summary Publishes the allowlisted subset of this process's own resolved config, so a sibling
 * process can report what this service was actually configured with.
 *
 * **Why the owning process has to be the one that answers.** A deployment's health is observable from
 * outside over the Docker socket; its configuration is not. The orchestrator can read its own config
 * tree, but the values that matter during an incident belong to other services — and resolving them
 * in the orchestrator would publish the orchestrator's numbers under another service's name. On a
 * deployment where a per-service `.env` diverges from the compose default, which is the only
 * deployment anyone would consult this field for, that is a confidently wrong answer. An absent field
 * says *cannot answer*; a wrong-process field says *answered*, and nobody re-checks an answer.
 *
 * So this runs the same transport the heap observation runs — the service writes, the orchestrator
 * reads — for the same reason: the fact belongs to the process, and only the process holds it.
 *
 * **The disclosure boundary is enforced here, not at the relay.** The allowlist is applied before
 * anything is written, so an unallowlisted value never leaves this process at all. No downstream
 * relay, snapshot copy, log or future consumer can surface what was never emitted, and there is no
 * second place a filter has to be re-applied correctly.
 * See {@link module:resolvedConfigDisclosure} for the four clauses and why each one is a clause.
 *
 * **Written once, not on a cadence, and that difference is deliberate.** A heap observation is
 * resampled because the number moves; resolved config does not move — it is fixed when the process
 * boots and runtime mutation of the shared config tree is forbidden. Re-publishing it on a timer
 * would spend writes restating an unchanging fact. If the file is lost, the next boot rewrites it and
 * the reader reports absence with a reason in the meantime, which is the honest state rather than a
 * stale value served as current.
 *
 * **A write failure degrades the channel and never the service.** This is an observation lane. A
 * service that refused to start because it could not describe its own configuration would be a
 * strictly worse outcome than the unobservability it exists to fix.
 *
 * @extends Neo.core.Base
 */
class ResolvedConfigReporterService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.ResolvedConfigReporterService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.ResolvedConfigReporterService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Resolves the file this service publishes into.
     *
     * The filename carries its own suffix rather than sharing `${serviceKey}.json` with the heap
     * observation, so one directory can hold both self-reports without either reader having to guess
     * which record type it opened.
     *
     * The directory is the existing self-report channel. Its config key is heap-specific for
     * historical reasons — it was the first fact a service published about itself — while the
     * directory's meaning is broader: files a service writes about itself for a sibling to read.
     * Renaming that key is a config-surface change with its own callers and belongs in its own change,
     * not bundled here.
     *
     * `dir` is a parameter so a spec can publish into a temporary directory. The shared config
     * singleton is never mutated to isolate a test.
     * @param {String}  serviceKey Stable service identity, e.g. `kb-server`.
     * @param {String} [dir]       Directory to publish into.
     * @returns {String}
     */
    reportPath(serviceKey, dir = AiConfig.heapObservation.dir) {
        return path.resolve(dir, `${serviceKey}.resolved-config.json`)
    }

    /**
     * @summary Projects the allowlisted config and publishes it once, atomically.
     *
     * Write-then-rename, matching how every other cross-process record here is persisted: a direct
     * write torn by a crash leaves a truncated JSON file, and a reader that recovers half a record is
     * worse than one that finds none — it would report a subset of the disclosed values as though that
     * subset were the whole answer.
     *
     * The whole body is guarded. A `dir` that will not resolve, a logger that throws, a config getter
     * that fails — none of them may reach the caller, because the caller is a booting service.
     *
     * @param {Object}        options
     * @param {String}        options.serviceKey Stable service identity.
     * @param {Object}        options.config     This process's ALREADY-RESOLVED config.
     * @param {Array<Object>} options.allowlist  Frozen entries from {@link assertDisclosureAllowlist}.
     * @param {String}       [options.dir]       Directory to publish into.
     * @param {Function}     [options.writeLog]  Structured log sink.
     * @returns {Boolean} `true` when a record was published.
     */
    writeOnce({serviceKey, config, allowlist, dir, writeLog}) {
        const safely = fn => {
            try { fn() } catch (ignored) {}
        };

        try {
            const {disclosed, omitted} = projectDisclosedConfig({config, allowlist}),
                  record               = {
                      schemaVersion: 1,
                      recordType   : 'deployment-resolved-config',
                      serviceKey,
                      // Marked, because every other per-service fact in the snapshot is Docker-derived
                      // — observed about the process from outside. This one is the process describing
                      // its own inputs, and the two fail in opposite directions: an external
                      // observation degrades when the observer breaks, a self-report when the subject
                      // does. A reader that cannot tell them apart eventually reads silence as health.
                      provenance: 'self-reported',
                      observedAt: Date.now(),
                      disclosed,
                      // Published beside the disclosures rather than dropped. A reader who cannot
                      // separate "this service did not report the value" from "this service reported
                      // the default" will read the second when only the first is true.
                      omitted
                  };

            writeFileAtomicSync(this.reportPath(serviceKey, dir), JSON.stringify(record, null, 2) + '\n');

            safely(() => writeLog?.('INFO', `[ResolvedConfigReporter] published ${Object.keys(disclosed).length} disclosed value(s) for ${serviceKey}${omitted.length ? `, ${omitted.length} omitted` : ''}.`));

            return true
        } catch (error) {
            safely(() => writeLog?.('WARN', `[ResolvedConfigReporter] config report FAILED for ${serviceKey}: ${error.message}. This service's effective configuration stays unobservable until this succeeds.`));

            return false
        }
    }

    /**
     * @summary Validates the allowlist and publishes once at boot.
     *
     * `readConfig` and `readAllowlist` are thunks rather than default parameters on purpose. A default
     * parameter is evaluated at call time, *outside* this method's `try`, so a config getter that
     * throws would escape the guard and take a booting service down with it — the exact failure this
     * lane must never cause.
     *
     * Allowlist validation runs here rather than at module load of the caller, so a malformed entry
     * degrades the channel with a logged reason instead of throwing during boot. The validator itself
     * still refuses wildcards and unknown kinds; what changes is who absorbs the refusal.
     *
     * @param {Object}    options
     * @param {String}    options.serviceKey      Stable service identity.
     * @param {String}   [options.dir]            Directory to publish into.
     * @param {Function} [options.writeLog]       Structured log sink.
     * @param {Function} [options.readConfig]     Returns this process's resolved config.
     * @param {Function} [options.readAllowlist]  Returns this service's disclosure allowlist entries.
     * @returns {Boolean} `true` when a record was published.
     */
    start({serviceKey, dir, writeLog, readConfig, readAllowlist}) {
        const safely = fn => {
            try { fn() } catch (ignored) {}
        };

        try {
            return this.writeOnce({
                serviceKey,
                config   : readConfig(),
                allowlist: assertDisclosureAllowlist(readAllowlist()),
                dir,
                writeLog
            })
        } catch (error) {
            safely(() => writeLog?.('WARN', `[ResolvedConfigReporter] reporting NOT started for ${serviceKey}: ${error.message}. This service's effective configuration stays unobservable.`));

            return false
        }
    }
}

export default Neo.setupClass(ResolvedConfigReporterService);
