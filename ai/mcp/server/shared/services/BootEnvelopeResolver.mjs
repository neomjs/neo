import {execFileSync as defaultExecFileSync} from 'child_process';

import {resolveInstancePid} from '../../../../daemons/wake/instanceResolver.mjs';
import Base from '../../../../../src/core/Base.mjs';

const USER_DATA_DIR_PATTERN = /(?:^|\s)--user-data-dir=(?:"([^"]+)"|'([^']+)'|(.+?))(?=\s--|$)/;

/**
 * @summary Resolves the per-instance wake-routing address from the boot environment into
 * `overrideMetadata` for the auto-bootstrapped wake subscription.
 *
 * ## Why this exists
 *
 * A harness instance's wake-routing address (e.g. which same-bundle GUI instance to target) is
 * **machine-specific** and must NOT live in the durable, shared `AgentIdentity.subscriptionTemplate`
 * — a per-operator filesystem path committed to the graph would break every other checkout. The
 * durable template stays machine-agnostic (trigger, filters, `appName`); the per-instance address
 * is supplied at boot time via the environment and merged in as `overrideMetadata` by
 * `WakeSubscriptionService.bootstrap()`.
 *
 * This is the address-dimension complement of {@link StdioIdentityResolver} (which resolves *who*
 * the instance is): this resolver resolves *where* wakes for that identity should be delivered when
 * two same-bundle harnesses run in parallel.
 *
 * ## Envelope contract (environment)
 *
 * - `NEO_HARNESS_INSTANCE_ADDRESS`      — the instance address value (for `userDataDir`, the
 *   `--user-data-dir` directory the sibling instance was launched with).
 * - `NEO_HARNESS_INSTANCE_ADDRESS_TYPE` — the address kind: one of `userDataDir`, `pid`,
 *   `tmuxSession`, `webhookUrl`.
 *
 * Both must be set together or both omitted. Omitting both first attempts a narrow macOS Electron
 * parent-chain fallback: if this MCP server was spawned under an app/helper process whose command
 * line carries `--user-data-dir`, that path is used as a `userDataDir` address. Otherwise omission
 * remains the normal **default instance** — the primary macOS app started without `--user-data-dir`,
 * routed by the *absence* of an address (see the wake daemon's default-instance resolution). A
 * partially-set envelope is a configuration error and **fails closed** (throws): a non-default
 * instance with a broken address must never silently fall back to the default route, because that
 * misroutes its wakes into the default instance's window.
 *
 * ## Dispatch coverage
 *
 * The wake daemon dispatches the generic `{instanceAddress, addressType}` pair directly:
 * `userDataDir` resolves to a same-bundle GUI process, `pid` targets that process directly,
 * `tmuxSession` sends to tmux, and `webhookUrl` posts the wake digest. The earlier transitional
 * `userDataDir` mirror is retired here; legacy subscriptions that already carry that field remain
 * a bridge-daemon compatibility read concern, not a boot-envelope output.
 *
 * Pure resolution is intentionally side-effect-free (reads `process.env` only) so the mapping is
 * unit-testable with injected environments.
 *
 * @class Neo.ai.mcp.server.shared.services.BootEnvelopeResolver
 * @extends Neo.core.Base
 * @singleton
 * @see Neo.ai.mcp.server.shared.services.StdioIdentityResolver
 * @see Neo.ai.services.memory-core.WakeSubscriptionService
 */
class BootEnvelopeResolver extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.BootEnvelopeResolver'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.BootEnvelopeResolver',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @member {String[]} validAddressTypes
     * The recognized instance-address kinds.
     */
    validAddressTypes = ['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']

    /**
     * @member {String[]} dispatchableAddressTypes
     * The subset of {@link validAddressTypes} the wake daemon can route today.
     */
    dispatchableAddressTypes = ['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']

    /**
     * Resolves the boot instance-address envelope into wake-subscription `overrideMetadata`.
     *
     * @param {Object} [env=process.env] Environment source (injectable for tests).
     * @param {Object} [options]
     * @param {Boolean} [options.enableParentChainFallback=true] Whether to use the macOS Electron
     *     parent-chain fallback when the explicit envelope is absent.
     * @param {Number} [options.bootPid=process.pid] MCP server boot pid for fallback discovery.
     * @param {String} [options.psOutput] Injectable `ps axww -o pid=,ppid=,command=` snapshot.
     * @param {Function} [options.execFileSync=child_process.execFileSync] Injectable `ps` runner.
     * @param {String} [options.platform=process.platform] Platform guard for tests.
     * @returns {Object|null} `overrideMetadata` to merge into the bootstrapped subscription
     *     (`{instanceAddress, addressType, ...}`), or `null` for the default instance (no address
     *     configured → routed by absence).
     * @throws {Error} When the envelope is partially configured, the address type is unrecognized,
     *     or the address type is recognized but not yet dispatchable (fail-closed to prevent
     *     misrouting a non-default instance to the default route).
     */
    resolveOverrideMetadata(env = process.env, {
        bootPid                   = process.pid,
        enableParentChainFallback = true,
        execFileSync              = defaultExecFileSync,
        platform                  = process.platform,
        psOutput
    } = {}) {
        const instanceAddress = env.NEO_HARNESS_INSTANCE_ADDRESS?.trim(),
              addressType      = env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE?.trim();

        // No explicit address configured: try the narrow macOS Electron fallback. If it cannot
        // prove an instance address, keep the existing default-instance behavior (null).
        if (!instanceAddress && !addressType) {
            return enableParentChainFallback
                ? this.resolveParentChainOverrideMetadata({bootPid, execFileSync, platform, psOutput})
                : null;
        }

        // Partial envelope is a misconfiguration. Fail closed rather than degrade to default
        // routing, which would misroute a non-default instance's wakes into the default window.
        if (!instanceAddress || !addressType) {
            throw new Error(
                'Partial boot envelope: NEO_HARNESS_INSTANCE_ADDRESS and ' +
                'NEO_HARNESS_INSTANCE_ADDRESS_TYPE must be set together ' +
                `(address ${instanceAddress ? 'present' : 'missing'}, type ${addressType ? 'present' : 'missing'}). ` +
                'Failing closed to avoid misrouting a non-default instance to the default route.'
            );
        }

        if (!this.validAddressTypes.includes(addressType)) {
            throw new Error(
                `Invalid NEO_HARNESS_INSTANCE_ADDRESS_TYPE '${addressType}'. ` +
                `Must be one of: ${this.validAddressTypes.join(', ')}.`
            );
        }

        if (!this.dispatchableAddressTypes.includes(addressType)) {
            throw new Error(
                `Boot-envelope addressType '${addressType}' is recognized but its wake dispatch ` +
                `is not yet implemented (the wake daemon currently routes: ` +
                `${this.dispatchableAddressTypes.join(', ')}). Failing closed to avoid misrouting.`
            );
        }

        return {instanceAddress, addressType};
    }

    /**
     * @summary Resolves `overrideMetadata` from the MCP server's macOS Electron parent chain.
     *
     * This fallback never runs when the explicit env envelope is present, and it returns `null` on
     * every ambiguous/non-Electron/cloud shape so bootstrapping keeps the default-instance absence
     * route instead of guessing.
     *
     * @param {Object} options
     * @param {Number} [options.bootPid=process.pid] Starting pid for the parent-chain walk.
     * @param {String} [options.psOutput] Injectable process snapshot.
     * @param {Function} [options.execFileSync=child_process.execFileSync] Injectable `ps` runner.
     * @param {String} [options.platform=process.platform] Platform guard.
     * @returns {{instanceAddress:String,addressType:String}|null}
     */
    resolveParentChainOverrideMetadata({
        bootPid      = process.pid,
        execFileSync = defaultExecFileSync,
        platform     = process.platform,
        psOutput
    } = {}) {
        if (platform !== 'darwin') {
            return null;
        }

        const snapshot = psOutput ?? this.readProcessSnapshot({execFileSync});
        if (!snapshot) {
            return null;
        }

        const userDataDir = this.resolveParentChainUserDataDir({bootPid, psOutput: snapshot});
        if (!userDataDir) {
            return null;
        }

        // Reuse the wake daemon's main-pid resolver as the final proof that the discovered
        // address maps to a concrete Electron app instance. If the snapshot cannot prove that,
        // fail closed rather than emitting a route that might mis-target.
        if (resolveInstancePid({userDataDir, psOutput: snapshot}) === null) {
            return null;
        }

        return {
            instanceAddress: userDataDir,
            addressType    : 'userDataDir'
        };
    }

    /**
     * @summary Reads a full process snapshot for parent-chain address discovery.
     * @param {Object} options
     * @param {Function} [options.execFileSync=child_process.execFileSync]
     * @returns {String|null}
     */
    readProcessSnapshot({execFileSync = defaultExecFileSync} = {}) {
        try {
            return execFileSync('ps', ['axww', '-o', 'pid=,ppid=,command='], {
                encoding: 'utf8',
                stdio   : ['ignore', 'pipe', 'pipe']
            });
        } catch {
            return null;
        }
    }

    /**
     * @summary Walks from the MCP server pid to its parents and extracts a proven Electron
     * `--user-data-dir` value when present.
     *
     * @param {Object} options
     * @param {Number} options.bootPid Starting pid for the parent-chain walk.
     * @param {String} options.psOutput `ps axww -o pid=,ppid=,command=` snapshot.
     * @param {Number} [options.maxDepth=12] Parent traversal cap.
     * @returns {String|null}
     */
    resolveParentChainUserDataDir({bootPid, psOutput, maxDepth = 12} = {}) {
        if (!bootPid || !psOutput) {
            return null;
        }

        const byPid  = this.parseProcessSnapshot(psOutput),
              seen   = new Set();
        let   cursor = Number(bootPid);

        for (let depth = 0; depth < maxDepth; depth++) {
            const row = byPid.get(cursor);
            if (!row || seen.has(row.pid)) {
                return null;
            }

            seen.add(row.pid);

            if (this.isElectronAppProcess(row.command)) {
                const userDataDir = this.extractUserDataDir(row.command);
                if (userDataDir) {
                    return userDataDir;
                }
            }

            if (!row.ppid || row.ppid === 1 || row.ppid === row.pid) {
                return null;
            }

            cursor = row.ppid;
        }

        return null;
    }

    /**
     * @summary Parses `ps axww -o pid=,ppid=,command=` rows by pid.
     * @param {String} psOutput
     * @returns {Map<Number,{pid:Number,ppid:Number,command:String}>}
     */
    parseProcessSnapshot(psOutput = '') {
        return new Map(psOutput.split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => {
                const match = line.match(/^(\d+)\s+(\d+)\s+(.*)$/);
                if (!match) {
                    return null;
                }
                const pid  = Number(match[1]),
                      ppid = Number(match[2]);

                return {pid, ppid, command: match[3]};
            })
            .filter(Boolean)
            .map(row => [row.pid, row]));
    }

    /**
     * @summary Detects macOS Electron app/main/helper process commands.
     * @param {String} command
     * @returns {Boolean}
     */
    isElectronAppProcess(command = '') {
        return command.includes('.app/Contents/') &&
            (command.includes('/Contents/MacOS/') || /Helper|Framework/i.test(command));
    }

    /**
     * @summary Extracts a `--user-data-dir` value from a process command line.
     * @param {String} command
     * @returns {String|null}
     */
    extractUserDataDir(command = '') {
        const match = command.match(USER_DATA_DIR_PATTERN);

        return match ? (match[1] || match[2] || match[3] || '').trim() || null : null;
    }
}

export default Neo.setupClass(BootEnvelopeResolver);
