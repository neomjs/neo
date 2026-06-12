import {execFile} from 'child_process';
import {promisify} from 'util';

const execFileAsync = promisify(execFile);
const GUI_INSTANCE_ADDRESS_TYPES = Object.freeze(['userDataDir', 'pid']);

/**
 * @summary Resolves the OS process id of a specific GUI harness *instance* from its
 * `--user-data-dir`, so the wake daemon can wake the intended instance when two
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
 * @module ai/daemons/wake/instanceResolver
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

/**
 * @summary Normalize a pid-like value into a positive integer.
 * @param {*} value Candidate process id.
 * @returns {Number|null}
 */
export function normalizeInstancePid(value) {
    const pid = Number(String(value ?? '').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/**
 * @summary Normalize metadata/env GUI instance-address tuples shared by wake delivery and resume.
 *
 * A partial tuple is refused because falling through from a targeted route into default app
 * activation can wake or resume the wrong same-bundle harness instance. This helper covers the
 * GUI address types that are directly osascript-addressable (`pid`) or resolve to one
 * (`userDataDir`); tmux/webhook addresses remain transport-specific in the wake daemon.
 *
 * @param {Object} options
 * @param {String} [options.instanceAddress] Instance address value.
 * @param {String} [options.addressType] Address type (`userDataDir` or `pid`).
 * @param {String} [options.source='metadata'] Human-readable source for diagnostics.
 * @param {String} [options.target='harness'] Human-readable target surface for diagnostics.
 * @returns {{instanceAddress:String,addressType:String}|null}
 */
export function normalizeGuiInstanceAddressTuple({
    instanceAddress,
    addressType,
    source = 'metadata',
    target = 'harness'
} = {}) {
    const address = String(instanceAddress ?? '').trim(),
          type    = String(addressType ?? '').trim();

    if (!address && !type) return null;

    if (!address || !type) {
        throw new Error(
            `Partial ${target} instance address from ${source}: ` +
            'instanceAddress and addressType must be set together. ' +
            'Failing closed to avoid routing a targeted GUI action into the default instance.'
        );
    }

    if (!GUI_INSTANCE_ADDRESS_TYPES.includes(type)) {
        throw new Error(
            `Unsupported ${target} instance addressType '${type}' from ${source}. ` +
            `Supported types: ${GUI_INSTANCE_ADDRESS_TYPES.join(', ')}.`
        );
    }

    return {
        instanceAddress: address,
        addressType    : type
    };
}

/**
 * @summary Resolve GUI instance-address metadata, preferring wake route metadata over env probes.
 *
 * Caller-provided wake-subscription metadata wins over the CLI/manual environment envelope. This
 * keeps orchestrator-driven recovery identity-specific while preserving direct-script probes where
 * the caller supplies an explicit local deployment mode.
 *
 * @param {Object} [options]
 * @param {Object} [options.metadata={}] Wake route metadata (`instanceAddress` + `addressType`,
 *     or legacy `userDataDir`).
 * @param {Object} [options.env={}] Environment map for direct CLI invocations.
 * @param {String} [options.target='harness'] Human-readable target surface for diagnostics.
 * @returns {{instanceAddress:String,addressType:String}|null}
 */
export function resolveGuiInstanceAddress({metadata = {}, env = {}, target = 'harness'} = {}) {
    const metadataType = metadata.addressType || (metadata.userDataDir ? 'userDataDir' : null),
          metadataAddr = metadata.instanceAddress || (metadataType === 'userDataDir' ? metadata.userDataDir : null),
          fromMetadata = normalizeGuiInstanceAddressTuple({
              instanceAddress: metadataAddr,
              addressType    : metadataType,
              source         : 'harnessTargetMetadata',
              target
          });

    if (fromMetadata) return fromMetadata;

    return normalizeGuiInstanceAddressTuple({
        instanceAddress: env.NEO_HARNESS_INSTANCE_ADDRESS,
        addressType    : env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE,
        source         : 'environment',
        target
    });
}

/**
 * @summary Resolve an osascript-addressable pid for a GUI instance address.
 *
 * Deployment mode is intentionally caller-supplied instead of re-read from env: the Orchestrator
 * and wake daemon read `AiConfig.orchestrator.deploymentMode` at their use site, preserving the
 * reactive Provider SSOT. Missing/unknown/non-local modes fail closed before any GUI targeting.
 *
 * @param {Object} options
 * @param {String} options.instanceAddress
 * @param {String} options.addressType `userDataDir` or `pid`.
 * @param {String} options.deploymentMode Resolved deployment mode from AiConfig.
 * @param {String} [options.target='harness'] Human-readable target surface for diagnostics.
 * @param {String} [options.appName='harness'] Human-readable app name for diagnostics.
 * @param {Function} [options.getInstancePidFn=getInstancePid] Injectable resolver for tests.
 * @returns {Promise<Number>}
 */
export async function resolveGuiInstancePid({
    instanceAddress,
    addressType,
    deploymentMode,
    target = 'harness',
    appName = 'harness',
    getInstancePidFn = getInstancePid
} = {}) {
    const mode = String(deploymentMode ?? '').trim();
    if (mode !== 'local') {
        throw new Error(
            `${target} instance targeting requires local deployment (deploymentMode='${mode || 'unset'}'). ` +
            'Failing closed — instance-addressed GUI actions are local-only (ADR 0014).'
        );
    }

    if (addressType === 'pid') {
        const pid = normalizeInstancePid(instanceAddress);
        if (!pid) {
            throw new Error(
                `Invalid ${target} pid instanceAddress='${instanceAddress}'. ` +
                'Failing closed to avoid generic app activation.'
            );
        }
        return pid;
    }

    if (addressType === 'userDataDir') {
        const pid = await getInstancePidFn({userDataDir: instanceAddress});
        if (!pid) {
            throw new Error(
                `No running ${appName} instance found for userDataDir='${instanceAddress}'. ` +
                `Failing closed to avoid routing into another ${appName} instance.`
            );
        }
        return pid;
    }

    throw new Error(`Unsupported ${target} instance addressType '${addressType}'.`);
}

/**
 * @summary Pure resolver: given a `ps` snapshot, find the pid of the DEFAULT app instance — the one
 * started as the normal macOS app, carrying NO `--user-data-dir`.
 *
 * Complement of {@link resolveInstancePid}. The default instance can never carry a `--user-data-dir`
 * (launching the primary macOS app with that flag breaks its system app / menu-bar integration), so
 * it is identified by the *absence* of the flag among the app's main processes.
 *
 * Disambiguates only when it is actually needed: returns the default pid solely when two or more main
 * instances of the app are running and exactly one of them is arg-less. With a single instance, or
 * when the default cannot be uniquely picked (zero or multiple arg-less mains), returns `null` so the
 * caller keeps the unchanged legacy app-activate path.
 *
 * @param {Object} options
 * @param {String} options.appName                            The app / bundle name (e.g. `Claude`).
 * @param {String} options.psOutput                           `ps axww -o pid=,ppid=,command=` output.
 * @param {String} [options.appExecutableMarker='Contents/MacOS/'] Marker identifying the main app executable.
 * @returns {Number|null} The default instance's main-process pid, or null (caller keeps legacy activate).
 */
export function resolveDefaultInstancePid({appName, psOutput, appExecutableMarker = 'Contents/MacOS/'} = {}) {
    if (!appName || !psOutput) {
        return null;
    }

    const bundleMarker     = `/${appName}.app/${appExecutableMarker}`,
          isMainExecutable = command =>
              command.includes(appExecutableMarker) && !/Helper|Framework|crashpad/i.test(command),
          appMains = psOutput.split('\n')
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => {
                  const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
                  return match ? {pid: Number(match[1]), command: match[3]} : null;
              })
              .filter(Boolean)
              .filter(row => row.command.includes(bundleMarker) && isMainExecutable(row.command));

    const argless = appMains.filter(row => !row.command.includes('--user-data-dir'));

    // Disambiguate only when a sibling instance actually exists (>= 2 mains) and exactly one is
    // arg-less (the default). Otherwise null -> caller keeps the legacy activate path unchanged, so
    // single-instance behavior is untouched.
    return appMains.length >= 2 && argless.length === 1 ? argless[0].pid : null;
}

/**
 * @summary Runs `ps` and resolves the DEFAULT (arg-less) app-instance pid. Side-effect wrapper
 * around {@link resolveDefaultInstancePid}.
 * @param {Object} options
 * @param {String} options.appName
 * @param {Function} [options.exec=execFileAsync] Injectable `(cmd, args) => Promise<{stdout}>` for tests.
 * @returns {Promise<Number|null>} The default instance pid, or null (caller keeps legacy activate).
 */
export async function getDefaultInstancePid({appName, exec = execFileAsync} = {}) {
    if (!appName) {
        return null;
    }

    let psOutput;
    try {
        ({stdout: psOutput} = await exec('ps', ['axww', '-o', 'pid=,ppid=,command=']));
    } catch {
        return null;
    }

    return resolveDefaultInstancePid({appName, psOutput});
}
