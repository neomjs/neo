import {execFile} from 'child_process';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);

/**
 * @summary Resolves the OS process id of a specific GUI harness *instance* from its
 * `--user-data-dir`, so the bridge daemon can wake the intended instance when two
 * same-bundle harnesses (e.g. two `Claude.app` profiles) run in parallel.
 *
 * ## Why this exists
 *
 * Shape C GUI wake routing addresses the harness by app name (`tell application "Claude"`)
 * and then targets `first application process whose frontmost is true`. That is unambiguous
 * for one instance, but two same-bundle instances make app activation and the frontmost
 * heuristic non-deterministic — a wake for one identity can land in the other. macOS
 * instances launched via `open -n -a App.app --args --user-data-dir=<dir>` are distinguishable
 * at the OS level: the `--user-data-dir` value is present in the process command line (on the
 * main executable when passed via `--args`, and always on the Electron helper subprocesses),
 * so the instance maps to a unique main-process pid. That pid is then directly addressable by
 * osascript via `first process whose unix id is <pid>` (empirically verified addressable +
 * window-enumerable), which removes the frontmost guess.
 *
 * Pure resolution (`resolveInstancePid`) is separated from the `ps` side effect
 * (`getInstancePid`) so the matching logic is unit-testable with fixed process snapshots.
 *
 * @module ai/daemons/bridge/instanceResolver
 */

/**
 * @summary Pure resolver: given a `ps` snapshot, find the main app-process pid of the instance
 * whose command line carries `--user-data-dir=<userDataDir>`.
 *
 * Strategy: (1) prefer a matching row that is the main app executable (`Contents/MacOS/<App>`,
 * not a Helper/Framework/crashpad subprocess); (2) otherwise take a matching helper and walk the
 * parent-pid chain up to the main app executable. Returns `null` when nothing matches, so the
 * caller fails closed (no wake) rather than misrouting to the wrong instance.
 *
 * @param {Object} options
 * @param {String} options.userDataDir                       The instance address (its `--user-data-dir` value).
 * @param {String} options.psOutput                          `ps axww -o pid=,ppid=,command=` output.
 * @param {String} [options.appExecutableMarker='Contents/MacOS/'] Marker identifying the main app executable.
 * @returns {Number|null} The instance's main-process pid, or null if no instance matches.
 */
export function resolveInstancePid({userDataDir, psOutput, appExecutableMarker = 'Contents/MacOS/'} = {}) {
    if (!userDataDir || !psOutput) {
        return null;
    }

    const needle = `--user-data-dir=${userDataDir}`,
          rows   = psOutput.split('\n')
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => {
                  const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
                  return match ? {pid: Number(match[1]), ppid: Number(match[2]), command: match[3]} : null;
              })
              .filter(Boolean);

    const isMainExecutable = command =>
        command.includes(appExecutableMarker) && !/Helper|Framework|crashpad/i.test(command);

    const matches = rows.filter(row => row.command.includes(needle));

    if (matches.length === 0) {
        return null;
    }

    // 1) A matching row that is itself the main app executable (instance launched with --args --user-data-dir).
    const directMain = matches.find(row => isMainExecutable(row.command));
    if (directMain) {
        return directMain.pid;
    }

    // 2) Only helper subprocesses carry the dir: walk parent-pid up to the main app executable.
    const byPid = new Map(rows.map(row => [row.pid, row]));
    let   cursor = matches[0];
    const seen   = new Set();

    while (cursor && !seen.has(cursor.pid)) {
        seen.add(cursor.pid);
        if (isMainExecutable(cursor.command)) {
            return cursor.pid;
        }
        cursor = byPid.get(cursor.ppid);
    }

    return null;
}

/**
 * @summary Runs `ps` and resolves the instance pid for `userDataDir`. Side-effect wrapper around
 * {@link resolveInstancePid}.
 * @param {Object} options
 * @param {String} options.userDataDir
 * @param {Function} [options.exec=execFileAsync] Injectable `(cmd, args) => Promise<{stdout}>` for tests.
 * @returns {Promise<Number|null>} The instance pid, or null (caller fails closed).
 */
export async function getInstancePid({userDataDir, exec = execFileAsync} = {}) {
    if (!userDataDir) {
        return null;
    }

    let psOutput;
    try {
        ({stdout: psOutput} = await exec('ps', ['axww', '-o', 'pid=,ppid=,command=']));
    } catch {
        return null;
    }

    return resolveInstancePid({userDataDir, psOutput});
}
