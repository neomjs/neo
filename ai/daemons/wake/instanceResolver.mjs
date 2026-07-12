import {execFile}  from 'child_process';
import {promisify} from 'util';

const execFileAsync              = promisify(execFile);
const GUI_INSTANCE_ADDRESS_TYPES = Object.freeze(['userDataDir', 'pid']);
const GUI_APP_PROCESS_IDENTITIES = Object.freeze({
    // Codex is the automation/product identity, while the installed Electron bundle and main
    // executable are both named ChatGPT. Keeping this alias here prevents app-level routing
    // vocabulary from leaking into process matching at the same-bundle delivery boundary.
    Codex: Object.freeze({bundleName: 'ChatGPT', executableName: 'ChatGPT'})
});

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
    const byPid  = new Map(rows.map(row => [row.pid, row]));
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
 * @summary Resolves the physical macOS process identity for a GUI harness activation name.
 *
 * Most harnesses use the same name at both layers (`Claude` -> `Claude.app/Claude`). Codex is the
 * known exception: AppleScript/subscription routing uses `Codex`, while the installed bundle and
 * executable are `ChatGPT.app/ChatGPT`. The explicit tuple keeps those contracts separate without
 * changing the externally validated activation name.
 *
 * @param {String} appName Harness activation/product name.
 * @returns {{bundleName:String, executableName:String}|null} Physical process identity.
 */
export function resolveGuiAppProcessIdentity(appName) {
    const normalized = String(appName ?? '').trim();

    if (!normalized) return null;

    return GUI_APP_PROCESS_IDENTITIES[normalized] || {
        bundleName    : normalized,
        executableName: normalized
    }
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
 * @summary Resolves the DEFAULT GUI-app instance and preserves ambiguity evidence.
 *
 * Complement of {@link resolveInstancePid}. The default instance can never carry a `--user-data-dir`
 * (launching the primary macOS app with that flag breaks its system app / menu-bar integration), so
 * it is identified by the *absence* of the flag among the app's main processes.
 *
 * The structured status keeps the delivery boundary from conflating safe legacy activation with an
 * ambiguous multi-resident state: `not-found` and `single-instance` retain legacy activation,
 * `resolved` carries the unique arg-less pid, while `ambiguous` and `probe-failed` must fail closed.
 *
 * @param {Object} options
 * @param {String} options.appName                            The app / bundle name (e.g. `Claude`).
 * @param {String} options.psOutput                           `ps axww -o pid=,ppid=,command=` output.
 * @param {String} [options.appExecutableMarker='Contents/MacOS/'] Marker identifying the main app executable.
 * @returns {{bundleName: String|null, executableName: String|null, instanceCount: Number, pid: Number|null, status: String}}
 * Physical process identity plus default-instance resolution evidence.
 */
export function resolveDefaultInstanceTarget({appName, psOutput, appExecutableMarker = 'Contents/MacOS/'} = {}) {
    const processIdentity = resolveGuiAppProcessIdentity(appName),
          baseResult      = {
              bundleName    : processIdentity?.bundleName || null,
              executableName: processIdentity?.executableName || null,
              instanceCount : 0,
              pid           : null,
              status        : 'not-found'
          };

    if (!processIdentity || !psOutput) return baseResult;

    const bundleMarker     = `/${processIdentity.bundleName}.app/${appExecutableMarker}${processIdentity.executableName}`,
          isMainExecutable = command => command.includes(bundleMarker) && !/Helper|Framework|crashpad/i.test(command),
          appMains         = psOutput.split('\n')
              .map(line => line.trim())
              .filter(Boolean)
              .map(line => {
                  const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
                  return match ? {pid: Number(match[1]), command: match[3]} : null;
              })
              .filter(Boolean)
              .filter(row => isMainExecutable(row.command));

    const instanceCount = appMains.length,
          argless       = appMains.filter(row => !row.command.includes('--user-data-dir'));

    if (instanceCount === 0) return baseResult;
    if (instanceCount === 1) {
        return {
            ...baseResult,
            instanceCount,
            status: argless.length === 1 ? 'single-instance' : 'ambiguous'
        };
    }

    return {
        ...baseResult,
        instanceCount,
        pid   : argless.length === 1 ? argless[0].pid : null,
        status: argless.length === 1 ? 'resolved' : 'ambiguous'
    }
}

/**
 * @summary Compatibility projection returning only the resolved default-instance pid.
 * Delivery boundaries that must distinguish ambiguous multi-instance state should consume
 * {@link resolveDefaultInstanceTarget} instead.
 * @param {Object} options See {@link resolveDefaultInstanceTarget}.
 * @returns {Number|null}
 */
export function resolveDefaultInstancePid(options = {}) {
    return resolveDefaultInstanceTarget(options).pid;
}

/**
 * @summary Runs `ps` and returns structured DEFAULT-instance resolution evidence.
 * Side-effect wrapper around {@link resolveDefaultInstanceTarget}.
 * @param {Object} options
 * @param {String} options.appName
 * @param {Function} [options.exec=execFileAsync] Injectable `(cmd, args) => Promise<{stdout}>` for tests.
 * @returns {Promise<{bundleName: String|null, executableName: String|null, instanceCount: Number, pid: Number|null, status: String}>}
 */
export async function getDefaultInstanceTarget({appName, exec = execFileAsync} = {}) {
    let psOutput    = '';
    let probeFailed = false;

    if (appName) {
        try {
            ({stdout: psOutput} = await exec('ps', ['axww', '-o', 'pid=,ppid=,command=']));
        } catch {
            probeFailed = true;
        }
    }

    const result = resolveDefaultInstanceTarget({appName, psOutput});

    return probeFailed ? {...result, status: 'probe-failed'} : result;
}

/**
 * @summary Compatibility side-effect wrapper returning only the default-instance pid.
 * Delivery boundaries that must distinguish ambiguous multi-instance state should consume
 * {@link getDefaultInstanceTarget} instead.
 * @param {Object} options See {@link getDefaultInstanceTarget}.
 * @returns {Promise<Number|null>}
 */
export async function getDefaultInstancePid(options = {}) {
    return (await getDefaultInstanceTarget(options)).pid;
}
