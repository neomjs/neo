/**
 * @summary Fail-closed acceptance gate for the two deployment symptoms a plane is judged on.
 *
 * This is NOT a diagnostic. A diagnostic helps you form a hypothesis; this answers one binary
 * question — **are the two symptoms gone?** — and it is meant to be run BEFORE a deploy against the
 * currently-deployed revision, where it must be observed FAILING. A gate that has never been seen
 * red certifies nothing, which is how a long incident accumulated nine falsified mechanisms: each
 * was reasoned, none was ever run against the failing plane first.
 *
 * It adds no instrumentation. Every field it reads is already published by
 * `get_deployment_state_snapshot`; the contribution is the assertion, not the data.
 *
 * **S1 — provider load with no work in flight.** A runner pinned at its CPU ceiling while its own
 * request log shows no inference. Both halves are required: the ceiling ALONE is ambiguous, because
 * a cgroup-capped container reports the same number when it is legitimately busy and when it is
 * wedged. Duration and an empty request census are what separate them.
 *
 * **S2 — multi-tenant ingestion.** Two or more tenant repositories reaching a non-null ingested
 * revision. `lastIngestedRev: null` means the repository has NEVER ingested successfully, which is a
 * different and much stronger statement than "the last attempt failed".
 *
 * @module ai/scripts/lifecycle/validateDeploymentAcceptance
 */

/**
 * @summary Minimum tenant repositories that must reach a non-null ingested revision.
 * @type {Number}
 */
export const MIN_INGESTED_TENANTS = 2;

/**
 * @summary Fraction of its CPU limit above which a service counts as pinned.
 *
 * Deliberately below 1.0: the interesting state is "effectively at the ceiling", and a runner
 * oscillating at 0.95 of its cap with no inference arriving is the same defect as one at 1.0.
 * @type {Number}
 */
export const PINNED_CPU_RATIO = 0.9;

/**
 * @summary Request paths that constitute actual inference, as opposed to health polling.
 *
 * `/api/tags` and `/api/ps` are excluded on purpose — they are how a supervisor asks whether a model
 * is resident, they cost microseconds, and a census dominated by them is the signature of a provider
 * that is being watched rather than used.
 * @type {Array<String>}
 */
export const INFERENCE_PATHS = ['/api/embed', '/api/embeddings', '/api/generate', '/api/chat'];

/**
 * @summary Counts inference requests in a provider request log.
 *
 * Returns `null` — never `0` — when no log was supplied. A null is "not measured"; reporting it as
 * zero would let a missing log certify the strongest possible claim about the provider, which is the
 * exact inversion this gate exists to prevent.
 *
 * @param {String|null} logText Raw provider request log.
 * @returns {Number|null} Inference request count, or null when unmeasurable.
 */
export function countInferenceRequests(logText) {
    if (typeof logText !== 'string' || logText === '') {
        return null;
    }

    return INFERENCE_PATHS.reduce(
        (total, path) => total + (logText.split(path).length - 1),
        0
    );
}

/**
 * @summary Asserts both deployment symptoms are absent, failing closed on anything unmeasured.
 *
 * @param {Object} input
 * @param {Object} [input.provider] Provider service facts.
 * @param {Number} [input.provider.cpuPercent] Observed CPU percent.
 * @param {Number} [input.provider.cpuLimitPercent] Configured cap, e.g. 400 for `cpus: 4.0`.
 * @param {String} [input.provider.logText] The provider's own request log.
 * @param {Array<Object>} [input.tenantRepos] Tenant repo rows carrying `lastIngestedRev`.
 * @param {Boolean} [input.sweepRunning] Whether the sync task claims to be running.
 * @param {Number|null} [input.sweepPid] The claimed pid for that run.
 * @returns {{accepted: Boolean, blockers: Array<String>}}
 */
export function validateDeploymentAcceptance({
    provider,
    tenantRepos,
    sweepRunning,
    sweepPid
} = {}) {
    const blockers = [];

    // ---- S1: pinned provider with no inference -------------------------------------------------
    if (!provider) {
        blockers.push('S1: provider facts were not fetched — cannot certify the CPU symptom is gone; failing closed.');
    } else {
        const {cpuPercent, cpuLimitPercent, logText, inFlight} = provider;

        const inferenceCount = countInferenceRequests(logText),
              inFlightCount  = Array.isArray(inFlight) ? inFlight.length : null;

        if (typeof cpuPercent !== 'number' || typeof cpuLimitPercent !== 'number') {
            blockers.push('S1: cpuPercent/cpuLimitPercent were not both fetched — a ceiling reading is meaningless without its ceiling; failing closed.');
        } else if (cpuPercent >= cpuLimitPercent * PINNED_CPU_RATIO) {
            // `inFlightCount` is load-bearing and the reason this branch is not a one-liner.
            //
            // An arrival log answers "did a request ARRIVE in my window", never "is the provider
            // OCCUPIED". A long request arrives once and is then silent, so a window opened after its
            // arrival shows an empty census while the provider is legitimately saturated by it. That
            // exact artifact was measured on a real plane: three requests dispatched at 19:27 and
            // 19:32 were still in flight at 19:49, and the log window opened at 19:30 — an empty
            // census, a busy provider, and a wedge diagnosis that survived hours on it.
            //
            // So an empty census may only reject when NOTHING is in flight either. Rejecting on the
            // census alone would certify the symptom present on a working plane and block a good
            // deploy, which is worse than not gating.
            if (inferenceCount === null || inFlightCount === null) {
                // Pinned AND unmeasurable is the worst combination: the only facts that could
                // exonerate the provider are the ones we do not have.
                blockers.push(`S1: provider is at ${cpuPercent.toFixed(1)}% of a ${cpuLimitPercent}% cap and its request log or in-flight rows were not fetched — cannot distinguish busy from wedged; failing closed.`);
            } else if (inferenceCount === 0 && inFlightCount === 0) {
                blockers.push(`S1: provider is at ${cpuPercent.toFixed(1)}% of a ${cpuLimitPercent}% cap with ZERO inference requests in its own log AND ZERO in-flight rows — this is the symptom, not a risk of it.`);
            }
        }
    }

    // ---- S2: multi-tenant ingestion -------------------------------------------------------------
    if (!Array.isArray(tenantRepos)) {
        blockers.push('S2: tenant repo rows were not fetched — cannot certify ingestion works; failing closed.');
    } else {
        const ingested = tenantRepos.filter(repo => repo?.lastIngestedRev);

        if (ingested.length < MIN_INGESTED_TENANTS) {
            const never = tenantRepos.filter(repo => !repo?.lastIngestedRev).length;

            blockers.push(`S2: only ${ingested.length} of ${tenantRepos.length} tenant repos carry a lastIngestedRev (${never} have NEVER ingested); ${MIN_INGESTED_TENANTS} required.`);
        }
    }

    // A run claiming to be alive with no pid is the documented wedge shape. It is separated from S2's
    // count because it can be true while repos still show stale successes from before the wedge — and
    // a gate that only counted revisions would pass a plane whose sweep has been dead for hours.
    //
    // `undefined` is NOT `false`. A sweep that was never fetched has to blocker like every other
    // unmeasured input, or this third input group fails OPEN while the other two fail closed — and a
    // gate that is fail-closed in two of three groups does not have a fail-closed contract, it has a
    // hole with two guards in front of it. `false` is a real measurement (the sweep is idle) and
    // passes.
    if (sweepRunning === undefined || sweepRunning === null) {
        blockers.push('S2: the sync task state was not fetched — cannot certify the sweep is not wedged; failing closed.');
    } else if (sweepRunning === true && (sweepPid === null || sweepPid === undefined)) {
        blockers.push('S2: the sync task reports running:true with no pid — the documented wedge shape; no attempt can occur until it is normalized.');
    }

    return {accepted: blockers.length === 0, blockers};
}

/**
 * @summary Projects a `get_deployment_state_snapshot` payload into this gate's inputs.
 *
 * Kept separate from the assertion so the field mapping is testable without a plane, and so a schema
 * change breaks here loudly rather than silently degrading a verdict. Every read is deliberately
 * shallow — `providerServiceKey` is a parameter because a plane may name its provider service
 * anything, and guessing it would make an absent service look like an absent symptom.
 *
 * @param {Object} snapshot The `snapshot` object from a deployment-state payload.
 * @param {Object} [options={}]
 * @param {String} [options.providerServiceKey='local-model'] Compose service key of the provider.
 * @param {Number} [options.cpuLimitPercent=400] The provider's configured cap, as a percent.
 * @returns {Object} Input for {@link validateDeploymentAcceptance}.
 */
export function projectSnapshotForAcceptance(snapshot, {
    providerServiceKey = 'local-model',
    cpuLimitPercent    = 400
} = {}) {
    const provider = snapshot?.services?.find(service => service.serviceKey === providerServiceKey),
          task     = snapshot?.tenantRepoSync?.task;

    return {
        provider: provider ? {
            // `logs` is an object on current schemas and was a bare string on older ones. Accepting
            // both costs one expression; guessing wrong makes an unfetched log look like an empty one,
            // which is the difference between failing closed and certifying the symptom.
            cpuPercent: provider.stats?.cpuPercent,
            cpuLimitPercent,
            logText   : typeof provider.logs === 'string' ? provider.logs : provider.logs?.text,
            inFlight  : provider.providerActivity?.inFlight
        } : undefined,
        tenantRepos : task?.lastCompletion?.repos,
        sweepRunning: task?.running,
        sweepPid    : task?.pid
    }
}

export default validateDeploymentAcceptance;

// CLI: `node ai/scripts/lifecycle/validateDeploymentAcceptance.mjs <snapshot.json>`
//
// Exits 1 on any blocker so it composes into a deploy script or a recovery runbook's verify step. The
// snapshot is passed as a file rather than fetched here on purpose: fetching would put credentials and
// a network dependency inside a gate whose whole value is being trivially runnable, and the read-only
// MCP probe that produces the file is already the sanctioned way to obtain it.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*?(?=ai\/scripts)/, ''))) {
    const {readFileSync} = await import('node:fs'),
          path           = process.argv[2];

    if (!path) {
        console.error('usage: validateDeploymentAcceptance.mjs <snapshot.json>');
        process.exit(2)
    }

    // `snapshot` accepts either a raw snapshot or a full MCP tool result, so an operator can pipe the
    // probe output straight to a file without unwrapping it first.
    const payload  = JSON.parse(readFileSync(path, 'utf8')),
          snapshot = payload.snapshot ?? JSON.parse(payload.result?.content?.[0]?.text ?? '{}').snapshot,
          result   = validateDeploymentAcceptance(projectSnapshotForAcceptance(snapshot));

    console.log(`ACCEPTED: ${result.accepted}`);
    result.blockers.forEach(blocker => console.log(` x ${blocker}`));
    process.exit(result.accepted ? 0 : 1)
}
