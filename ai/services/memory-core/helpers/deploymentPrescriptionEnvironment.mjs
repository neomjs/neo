/**
 * Renders declared deployment prescriptions into the env file Compose interpolates at container
 * CREATE time.
 *
 * **Why a file and not an export.** The actuator cannot apply a V8 heap ceiling itself:
 * `--max-old-space-size` lives in the container command, Compose interpolates it at create time, and
 * `reconfigure` is overlay-plus-restart — a restart re-runs the baked `Config.Cmd`, so the new value
 * never reaches the process. That is a no-op that reports success. The actuator therefore PRESCRIBES
 * and the deployment pipeline DELIVERS.
 *
 * **Why an env FILE and not an exported variable.** A value exported at deploy time reverts on the
 * next redeploy that omits it — measured previously when an orchestrator ceiling passed as
 * `NEO_ORCHESTRATOR_HEAP_MB=2048` silently fell back to the Compose default. Compose reads `.env`
 * from its project directory with no flag and from any working directory, so a rendered file also
 * reaches the raw operator paths (`docker compose up -d --force-recreate <svc>`, the down/up
 * survival check) that no pipeline-scoped mechanism can. Persisted, not passed.
 *
 * Measured with a control before this module was written: an env file declaring
 * `NEO_KB_SERVER_HEAP_MB=1234` made `docker compose config` resolve `--max-old-space-size=1234`;
 * removing the file returned it to the compose default. That round trip — prescription to the value
 * the container is created with — is the effect boundary this delivery path has to clear, and it is
 * reproducible without a Docker daemon reachable for `up`.
 *
 * **Residual, deliberately not dissolved.** `--env-file` and `--project-directory` override the
 * default lookup, and an operator-ordered compose-file list anchors the project directory on its
 * FIRST entry. A deliberately non-default deployment therefore reads the prescription from
 * somewhere else and silently gets the compose default. That is narrower than a pipeline-only
 * mechanism but not zero, and it is why {@link renderPrescribedEnvironment} returns the target path
 * it assumed rather than writing to an inferred one.
 */

/**
 * A single line's worth of prescription: which environment key carries the value, and the value
 * itself. Keys are validated rather than trusted — a prescription reaching this renderer has passed
 * through a ledger, and a malformed key would otherwise be written verbatim into a file Compose
 * parses for every service.
 * @typedef {Object} DeploymentPrescription
 * @property {String} key   Environment variable name, e.g. `NEO_KB_SERVER_HEAP_MB`.
 * @property {Number} value Prescribed value; finite and positive.
 */

/**
 * Compose's own env-file grammar is permissive, so this is deliberately stricter than it has to be:
 * an uppercase, underscore-separated identifier. A key that needs quoting or escaping is a key this
 * renderer refuses rather than encodes, because a mis-encoded line does not fail — Compose skips it
 * and the container is created with the default, which is the silent-revert this whole path exists
 * to remove.
 * @type {RegExp}
 */
const ENV_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * Refuses a prescription rather than rendering an unusable line.
 *
 * Returning a reason instead of throwing keeps the caller's disposition explicit: a refused
 * prescription is a fact the ledger should record, not an exception that aborts a rendering pass and
 * leaves the previously-written file in place — the stale file would then keep delivering an older
 * ceiling while the ledger showed a newer one.
 * @param {DeploymentPrescription} prescription
 * @returns {String|null} The refusal reason, or `null` when the prescription is renderable.
 */
export function refusePrescription(prescription) {
    const {key, value} = prescription ?? {};

    if (typeof key !== 'string' || !ENV_KEY_PATTERN.test(key)) {
        return 'key-not-an-env-identifier'
    }

    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return 'value-not-a-positive-finite-number'
    }

    return null
}

/**
 * Renders prescriptions into env-file content.
 *
 * **Last write wins per key, and that is a decision rather than an accident:** a prescription ledger
 * is append-only, so the same key legitimately appears more than once as a ceiling is raised over
 * time. Rendering every occurrence would leave Compose to pick, and Compose picks the last — so this
 * collapses duplicates explicitly and in the same direction, making the file's meaning independent
 * of how many entries preceded it.
 *
 * Refused prescriptions are reported, never silently dropped: a caller that writes the file without
 * reading `refused` would ship a ceiling it believes it prescribed.
 * @param {DeploymentPrescription[]} prescriptions Ledger order — oldest first.
 * @returns {{content: String, rendered: Object, refused: Array<{prescription: Object, reason: String}>}}
 */
export function renderPrescribedEnvironment(prescriptions) {
    const
        rendered = {},
        refused  = [];

    for (const prescription of prescriptions ?? []) {
        const reason = refusePrescription(prescription);

        if (reason) {
            refused.push({prescription, reason});
            continue
        }

        rendered[prescription.key] = prescription.value
    }

    const keys = Object.keys(rendered).sort();

    return {
        // Sorted and newline-terminated so an unchanged prescription set renders byte-identical
        // content: a delivery step can then compare against the file on disk and skip a rewrite,
        // rather than touching it every cycle and making every redeploy look like a change.
        content: keys.map(key => `${key}=${rendered[key]}`).join('\n') + (keys.length ? '\n' : ''),
        rendered,
        refused
    }
}
