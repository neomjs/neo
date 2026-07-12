import {execFileSync} from 'node:child_process';
import fs             from 'node:fs';
import path           from 'node:path';

const
    ASAR_MARKERS = Object.freeze([
        'CODEX_ELECTRON_USER_DATA_PATH',
        '--open-project',
        'CODEX_SPARKLE_ENABLED',
        'shouldIncludeSparkle',
        'enableUpdater'
    ]),
    FRAMEWORK_MARKERS = Object.freeze(['user-data-dir']),
    UPDATER_DISABLE_PREDICATES = Object.freeze([
        'CODEX_SPARKLE_ENABLED===`false`',
        'CODEX_SPARKLE_ENABLED==="false"',
        "CODEX_SPARKLE_ENABLED==='false'"
    ]),
    CRASHPAD_BASENAME = 'browser_crashpad_handler';

/**
 * @summary Probe the INSTALLED Codex Desktop app bundle for the exact launch capabilities Fleet
 * relies on, without launching the app and without an exact-version allowlist.
 *
 * The app's profile mirror, project-open route, and updater-disable predicate are private packaged
 * contracts rather than public CLI guarantees. Presence of an env-var string alone is therefore
 * insufficient: the probe requires the app-side profile/open-project markers AND the explicit
 * `CODEX_SPARKLE_ENABLED === 'false'` predicate feeding the packaged updater path. Native profile
 * isolation is independently pinned by the embedded Chromium framework's `user-data-dir` marker.
 * Any bundle reshuffle or minifier change fails CLOSED with a named missing capability; that is the
 * revalidation trigger after an app update, never a reason to guess from the version number.
 *
 * The packaged Crashpad helper is derived through the framework's stable `Helpers` symlink and
 * resolved to its exact executable identity. The observed Chromium-version directory is never
 * hardcoded.
 *
 * @param {Object} options
 * @param {String} options.binaryPath Config-resolved packaged main binary.
 * @param {Object} [options.fsImpl] Injectable fs seam; defaults to `node:fs`.
 * @returns {{available: Boolean, reason: String|null, binaryPath: String|null,
 *            crashpadExecutable: String|null, appBundle: String|null}}
 */
export function probeCodexDesktopCapabilities({binaryPath, fsImpl = fs} = {}) {
    if (typeof binaryPath !== 'string' || !path.isAbsolute(binaryPath)) {
        return unavailable('binary-path-must-be-absolute');
    }

    let mainBinary;

    try {
        mainBinary = realpath(fsImpl, binaryPath);
        assertExecutableFile(fsImpl, mainBinary);
    } catch {
        return unavailable('packaged-main-unavailable');
    }

    const
        macosDir = path.dirname(mainBinary),
        contents = path.dirname(macosDir);

    if (path.basename(macosDir) !== 'MacOS' || path.basename(contents) !== 'Contents') {
        return unavailable('binary-is-not-an-app-bundle-main');
    }

    const
        appBundle       = path.dirname(contents),
        appAsar         = path.join(contents, 'Resources', 'app.asar'),
        framework       = path.join(contents, 'Frameworks', 'Codex Framework.framework', 'Codex Framework'),
        crashpadSymlink = path.join(contents, 'Frameworks', 'Codex Framework.framework', 'Helpers', CRASHPAD_BASENAME);

    let crashpadExecutable;

    try {
        assertReadableFile(fsImpl, appAsar);
        assertReadableFile(fsImpl, framework);
        crashpadExecutable = realpath(fsImpl, crashpadSymlink);
        assertExecutableFile(fsImpl, crashpadExecutable);
    } catch {
        return unavailable('required-app-bundle-resource-unavailable', {binaryPath: mainBinary, appBundle});
    }

    const asarMissing = missingMarkers(appAsar, ASAR_MARKERS, fsImpl);

    if (asarMissing.length) {
        return unavailable(`app-contract-marker-missing:${asarMissing.join(',')}`, {binaryPath: mainBinary, appBundle});
    }

    if (!containsAnyMarker(appAsar, UPDATER_DISABLE_PREDICATES, fsImpl)) {
        return unavailable('updater-disable-predicate-missing', {binaryPath: mainBinary, appBundle});
    }

    const frameworkMissing = missingMarkers(framework, FRAMEWORK_MARKERS, fsImpl);

    if (frameworkMissing.length) {
        return unavailable(`chromium-contract-marker-missing:${frameworkMissing.join(',')}`, {binaryPath: mainBinary, appBundle});
    }

    return {
        available : true,
        reason    : null,
        binaryPath: mainBinary,
        crashpadExecutable,
        appBundle
    };
}

/**
 * @summary Classify Crashpad process observations against one exact Codex Desktop profile.
 * A process is Fleet-owned only when ALL proofs match: its loaded executable is the exact packaged
 * helper resolved by the capability probe, its single `--database` argument is strictly below this
 * instance's Electron profile, and a process-birth token is available for pre-signal revalidation.
 * A profile-matching row with missing/mismatched executable or birth proof is ambiguous — it is
 * never killed, and the lifecycle must fail rather than broaden ownership.
 * Rows outside the profile are foreign and remain untouched even when they use the same helper.
 * @param {Object} options
 * @param {Object[]} options.processes `{pid, command, executable, processToken}` observations.
 * @param {String} options.electronProfile Exact instance Electron profile.
 * @param {String} options.crashpadExecutable Exact packaged helper executable.
 * @returns {{owned: Object[], foreign: Object[], ambiguous: Object[]}}
 */
export function classifyCodexDesktopCrashpadProcesses({processes = [], electronProfile, crashpadExecutable} = {}) {
    assertAbsolutePath(electronProfile, 'electronProfile');
    assertAbsolutePath(crashpadExecutable, 'crashpadExecutable');

    const
        profileRoot = path.resolve(electronProfile),
        expectedExe = path.resolve(crashpadExecutable),
        result      = {owned: [], foreign: [], ambiguous: []};

    for (const process of processes) {
        const
            databases       = extractDatabaseArguments(process.command),
            matching        = databases.filter(database => isStrictlyContained(profileRoot, path.resolve(database))),
            exactExecutable = typeof process.executable === 'string' && path.resolve(process.executable) === expectedExe;

        if (databases.length === 0 && (exactExecutable || String(process.command).includes(profileRoot))) {
            result.ambiguous.push({...process, reason: 'database-identity-unavailable'});
            continue;
        }

        if (matching.length === 0) {
            result.foreign.push(process);
            continue;
        }

        if (databases.length !== 1) {
            result.ambiguous.push({...process, reason: 'multiple-profile-database-arguments'});
            continue;
        }

        if (typeof process.executable !== 'string') {
            result.ambiguous.push({...process, reason: 'executable-identity-unavailable'});
            continue;
        }

        if (!exactExecutable) {
            result.ambiguous.push({...process, reason: 'profile-match-with-foreign-executable'});
            continue;
        }

        if (typeof process.processToken !== 'string' || !process.processToken) {
            result.ambiguous.push({...process, reason: 'process-birth-token-unavailable'});
            continue;
        }

        result.owned.push({...process, database: matching[0]});
    }

    return result;
}

/**
 * @summary Read the host process table and return the exact-profile Crashpad ownership snapshot.
 * `pgrep -fl` supplies candidate pid+argv rows; `lsof -d txt` supplies the loaded executable rather
 * than trusting spoofable argv[0], and `ps lstart` supplies a stable birth token. Process-list,
 * executable-inspection, or birth-token failure becomes ambiguity for a profile-matching row,
 * never kill authority.
 * @param {Object} options
 * @param {String} options.electronProfile Exact instance Electron profile.
 * @param {String} options.crashpadExecutable Exact packaged helper executable.
 * @param {Function} [options.execFileImpl] Injectable shell-free `execFileSync` seam.
 * @returns {{owned: Object[], foreign: Object[], ambiguous: Object[]}}
 */
export function inspectCodexDesktopCrashpadProcesses({electronProfile, crashpadExecutable, execFileImpl = execFileSync} = {}) {
    let output;

    try {
        output = execFileImpl('pgrep', ['-fl', CRASHPAD_BASENAME], {encoding: 'utf8'});
    } catch (error) {
        if (error?.status === 1) {
            return {owned: [], foreign: [], ambiguous: []};
        }

        throw new Error('inspectCodexDesktopCrashpadProcesses: process-table inspection unavailable; ownership is ambiguous.', {cause: error});
    }

    const processes = String(output)
        .split('\n')
        .map(line => line.match(/^\s*(\d+)\s+(.+)$/))
        .filter(Boolean)
        .map(match => {
            const
                pid     = Number(match[1]),
                command = match[2];

            let executable = null, processToken = null;

            try {
                const lsof = String(execFileImpl('lsof', ['-a', '-p', String(pid), '-d', 'txt', '-Fn'], {encoding: 'utf8'}));

                executable = lsof
                    .split('\n')
                    .filter(line => line.startsWith('n'))
                    .map(line => line.slice(1))
                    .find(file => path.basename(file) === CRASHPAD_BASENAME) ?? null;
            } catch {
                // Classification below turns a profile-matching row into ambiguity. A foreign
                // profile row remains foreign and is never granted kill authority.
            }

            try {
                processToken = String(execFileImpl('ps', ['-p', String(pid), '-o', 'lstart='], {encoding: 'utf8'})).trim() || null;
            } catch {
                // Same fail-closed classification as executable inspection: a profile match without
                // a stable birth token is ambiguous and never signal authority.
            }

            return {pid, command, executable, processToken}
        });

    return classifyCodexDesktopCrashpadProcesses({processes, electronProfile, crashpadExecutable});
}

/**
 * @summary Terminate only the exact-profile Crashpad helpers after the tracked main exits.
 * Ownership is re-proven immediately before each signal using pid + process-birth token + argv +
 * loaded executable, materially narrowing PID-reuse races. macOS exposes only a PID-based signal,
 * so identity-check and signal cannot be one atomic kernel operation; that final micro-window is an
 * explicit platform bound, never claimed closed. SIGTERM gets a bounded grace window; surviving
 * still-owned helpers receive SIGKILL; a final re-scan must prove zero. Ambiguity at any phase fails
 * closed and sends no broader signal.
 * @param {Object} options
 * @param {String} options.electronProfile Exact instance Electron profile.
 * @param {String} options.crashpadExecutable Exact packaged helper executable.
 * @param {Function} [options.inspect] Injectable ownership inspector.
 * @param {Function} [options.killProcess] Injectable `(pid, signal)` seam.
 * @param {Function} [options.wait] Injectable async wait seam.
 * @param {Number} [options.graceMs=250] Delay after each signal phase.
 * @returns {Promise<{terminated: Number[], escalated: Number[]}>}
 */
export async function cleanupCodexDesktopCrashpad({
    electronProfile,
    crashpadExecutable,
    inspect = inspectCodexDesktopCrashpadProcesses,
    killProcess = process.kill,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    graceMs = 250
} = {}) {
    const inspectOwned = () => {
        const snapshot = inspect({electronProfile, crashpadExecutable});

        if (snapshot.ambiguous.length) {
            const ids = snapshot.ambiguous.map(item => item.pid).filter(Number.isInteger).join(',') || 'unknown';
            throw new Error(`cleanupCodexDesktopCrashpad: ambiguous profile-owned process identity (pid ${ids}); refusing cleanup.`);
        }

        return snapshot.owned;
    };

    const signal = (rows, name) => {
        const signaled = [];

        for (const row of rows) {
            const current = inspectOwned().find(item => item.pid === row.pid);

            if (!current) continue;
            if (current.processToken !== row.processToken) {
                throw new Error(`cleanupCodexDesktopCrashpad: pid ${row.pid} birth token changed before ${name}; refusing signal.`);
            }

            try {
                killProcess(row.pid, name);
                signaled.push(row.pid);
            } catch (error) {
                if (error?.code !== 'ESRCH') throw error;
            }
        }

        return signaled;
    };

    const first = inspectOwned();
    if (!first.length) return {terminated: [], escalated: []};

    const terminated = signal(first, 'SIGTERM');
    await wait(graceMs);

    const survivors = inspectOwned();
    let   escalated = [];
    if (survivors.length) {
        escalated = signal(survivors, 'SIGKILL');
        await wait(graceMs);
    }

    const residual = inspectOwned();

    if (residual.length) {
        throw new Error(`cleanupCodexDesktopCrashpad: ${residual.length} exact-profile helper process(es) survived SIGKILL.`);
    }

    return {
        terminated,
        escalated
    };
}

/**
 * Extract every `--database=<path>` or `--database <path>` value. `ps`/`pgrep` render argv without
 * preserving quotes on macOS, so the value ends at the next option token (` space + --`), not at
 * the next whitespace; this preserves profile paths containing spaces.
 * @param {String} command
 * @returns {String[]}
 * @private
 */
function extractDatabaseArguments(command) {
    if (typeof command !== 'string') return [];

    const
        values  = [],
        pattern = /(?:^|\s)--database(?:=|\s+)/g;

    let match;

    while ((match = pattern.exec(command))) {
        const valueStart = match.index + match[0].length;

        const
            remainder  = command.slice(valueStart),
            nextOption = remainder.search(/\s--[a-zA-Z0-9_-]+(?:=|\s|$)/),
            raw        = (nextOption === -1 ? remainder : remainder.slice(0, nextOption)).trim(),
            value      = stripMatchingQuotes(raw);

        if (value) values.push(value);
        pattern.lastIndex = valueStart + Math.max(raw.length, 1);
    }

    return values;
}

/** @returns {String} @private */
function stripMatchingQuotes(value) {
    return value.length >= 2 && value[0] === value.at(-1) && ['"', "'"].includes(value[0])
        ? value.slice(1, -1)
        : value;
}

/** @returns {Boolean} @private */
function isStrictlyContained(root, target) {
    const relative = path.relative(root, target);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/** @returns {String[]} @private */
function missingMarkers(file, markers, fsImpl) {
    const found = scanMarkers(file, markers, fsImpl);
    return markers.filter(marker => !found.has(marker));
}

/** @returns {Boolean} @private */
function containsAnyMarker(file, markers, fsImpl) {
    return scanMarkers(file, markers, fsImpl).size > 0;
}

/**
 * Memory-bounded binary marker scan. A tail preserves matches split across 1 MiB chunk boundaries.
 * @returns {Set<String>}
 * @private
 */
function scanMarkers(file, markers, fsImpl) {
    const
        pending    = new Map(markers.map(marker => [marker, Buffer.from(marker)])),
        found      = new Set(),
        chunk      = Buffer.allocUnsafe(1024 * 1024),
        tailSize   = Math.max(...[...pending.values()].map(marker => marker.length), 1) - 1,
        descriptor = fsImpl.openSync(file, 'r');

    let tail = Buffer.alloc(0), position = 0;

    try {
        while (pending.size) {
            const bytesRead = fsImpl.readSync(descriptor, chunk, 0, chunk.length, position);
            if (!bytesRead) break;

            position += bytesRead;

            const haystack = Buffer.concat([tail, chunk.subarray(0, bytesRead)]);

            for (const [text, marker] of pending) {
                if (haystack.indexOf(marker) !== -1) {
                    found.add(text);
                    pending.delete(text);
                }
            }

            tail = tailSize ? haystack.subarray(Math.max(0, haystack.length - tailSize)) : Buffer.alloc(0);
        }
    } finally {
        fsImpl.closeSync(descriptor);
    }

    return found;
}

/** @private */
function assertReadableFile(fsImpl, file) {
    if (!fsImpl.statSync(file).isFile()) throw new Error('not a file');
    fsImpl.accessSync(file, fs.constants.R_OK);
}

/** @private */
function assertExecutableFile(fsImpl, file) {
    if (!fsImpl.statSync(file).isFile()) throw new Error('not a file');
    fsImpl.accessSync(file, fs.constants.X_OK);
}

/** @returns {String} @private */
function realpath(fsImpl, file) {
    return (fsImpl.realpathSync.native ?? fsImpl.realpathSync)(file);
}

/** @private */
function assertAbsolutePath(value, name) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) {
        throw new Error(`manageCodexDesktopRuntime: '${name}' must be an absolute path.`);
    }
}

/** @returns {Object} @private */
function unavailable(reason, extra = {}) {
    return {available: false, reason, binaryPath: extra.binaryPath ?? null, crashpadExecutable: null, appBundle: extra.appBundle ?? null};
}
