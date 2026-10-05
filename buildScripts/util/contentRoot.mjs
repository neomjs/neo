import fs   from 'fs';
import path from 'path';

/**
 * @module buildScripts.util.contentRoot
 * @summary The declared roots the Portal's content generators read from.
 *
 * The conversation corpus lives in its own repository (`github-content-sync`), and the release notes are
 * authored in the engine's `.github/RELEASE_NOTES`. A generator therefore takes each root as an input and
 * never derives one from the working directory. The paths it writes are relative to that root, and the Portal
 * resolves them against the base it serves the content from (`apps/portal/neo-config.json`).
 */

/**
 * @summary Returns the declared root as an absolute path, or throws naming the flag that supplies it.
 *
 * A root that does not exist, or is not a directory, throws too. Globbing a missing root finds nothing, so the
 * generator would write an empty index over the one it replaces; a file passes a glob's `cwd` but fails the first
 * reader that descends into it, after earlier builders have written their output.
 * @param {String|undefined} root   The root the caller declared
 * @param {String}           flag   The CLI flag that declares it, e.g. `--corpus-root`
 * @param {String}           caller The generator asking, for the message
 * @returns {String}
 */
export function requireContentRoot(root, flag, caller) {
    if (!root) {
        throw new Error(`${caller} needs ${flag} <dir>, the root it reads this content from`)
    }

    const
        resolved = path.resolve(root),
        stat     = fs.statSync(resolved, {throwIfNoEntry: false});

    if (!stat) {
        throw new Error(`${caller}: ${flag} ${resolved} does not exist`)
    }

    if (!stat.isDirectory()) {
        throw new Error(`${caller}: ${flag} ${resolved} is not a directory`)
    }

    return resolved
}

/**
 * @summary The release-notes root of an engine checkout, where the engine authors its notes.
 * @param {String} engineRoot
 * @returns {String}
 */
export function getEngineReleaseNotesRoot(engineRoot) {
    return path.resolve(engineRoot, '.github', 'RELEASE_NOTES')
}

/**
 * @summary A path relative to its content root, with forward slashes, the form the Portal fetches.
 * @param {String} root   The declared content root
 * @param {String} target A directory or file inside it
 * @returns {String}
 */
export function contentPath(root, target) {
    return path.relative(root, target).split(path.sep).join('/')
}
