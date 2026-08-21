/**
 * @summary Fail-closed preflight for the Brain-side post-release sync — the safety envelope the
 * split command no longer inherits.
 *
 * While KB upload, full sync, and the archive commit lived inside `publish.mjs`, they inherited
 * its preconditions: the branch check had already run, `git checkout dev` had already happened,
 * and the working tree held exactly what the release process itself had produced. Splitting the
 * command turned those inherited preconditions into PROTOCOL FIELDS — implicit while one process,
 * they must be explicit (and mechanically asserted) when the second half is independently
 * runnable from an arbitrary checkout state. This module owns that assertion, deliberately free
 * of any service import so it is unit-testable without booting the Brain.
 *
 * Three gates, all before the first mutation:
 *
 * 1. **Branch** — the archive commit and `git push origin dev` are only coherent from `dev`.
 * 2. **Version** — derived from `package.json` ONLY (no CLI flag: an interpolated flag was both
 *    an injection surface and a version-mismatch class; removal beats validation) and still
 *    shape-checked as strict semver before it reaches a shell string.
 * 3. **Starting state** — the only admissible dirt is the staging release note's deletion, which
 *    `publish.mjs` performs on disk and this command's archive commit persists. Anything else is
 *    named and refused: the temporal gap between the two commands makes unrelated dirt newly
 *    capturable by the broad `git add .`, and a fail-open here publishes it.
 */

/**
 * Strict semver shape (optional pre-release suffix), asserted before any shell interpolation.
 * @type {RegExp}
 */
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Resolves and validates the release version from the package manifest.
 * @param {Object} config
 * @param {Function} config.readPackageJson Returns the parsed root package.json (test seam).
 * @returns {String} The validated version, without a leading `v`.
 * @throws {Error} When the manifest version is absent or not strict semver.
 */
export function resolveReleaseVersion({readPackageJson}) {
    const version = readPackageJson()?.version;

    if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
        throw new Error(
            `Post-release sync refused: package.json version ${JSON.stringify(version)} is not strict semver. ` +
            'The version is derived from the manifest only — there is deliberately no CLI override.'
        );
    }

    return version;
}

/**
 * Asserts the current branch is `dev` — the only branch the archive commit and push are coherent on.
 * @param {Object} config
 * @param {Function} config.getCurrentBranch Returns the current branch name (test seam).
 * @returns {void}
 * @throws {Error} On any other branch.
 */
export function assertOnDevBranch({getCurrentBranch}) {
    const branch = getCurrentBranch();

    if (branch !== 'dev') {
        throw new Error(
            `Post-release sync refused: must run on 'dev' (current: ${JSON.stringify(branch)}). ` +
            'The archive commit lands on the current branch while the push targets dev — running elsewhere diverges them.'
        );
    }
}

/**
 * Asserts the working tree holds nothing beyond what the release itself produced: clean, or
 * exactly the staged/unstaged deletion of this version's flat staging release note.
 * @param {Object} config
 * @param {Function} config.getPorcelainStatus Returns `git status --porcelain` output (test seam).
 * @param {String} config.version The validated release version.
 * @returns {void}
 * @throws {Error} Naming every inadmissible path, so the operator cleans deliberately.
 */
export function assertAdmissibleStartingState({getPorcelainStatus, version}) {
    const
        notePath     = `resources/content/release-notes/v${version}.md`,
        // Porcelain XY codes for the note's deletion: unstaged (` D`) as `publish.mjs` leaves it,
        // or staged (`D `) when an operator staged it manually. Nothing else is admissible.
        admissible   = new Set([` D ${notePath}`, `D  ${notePath}`]),
        status       = getPorcelainStatus() || '',
        inadmissible = status.split('\n').filter(line => line.trim() && !admissible.has(line));

    if (inadmissible.length > 0) {
        throw new Error(
            'Post-release sync refused: the working tree holds changes the release did not produce, and the ' +
            `broad archive stage would capture them:\n${inadmissible.join('\n')}\n` +
            `Admissible starting state: clean, or only the deletion of ${notePath}. Commit, stash, or clean first.`
        );
    }
}
