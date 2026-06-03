import Base from '../../../../../src/core/Base.mjs';

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
 * Both must be set together or both omitted. Omitting both is the normal **default instance** — the
 * primary macOS app started without `--user-data-dir`, which is routed by the *absence* of an
 * address (see the bridge daemon's default-instance resolution). A partially-set envelope is a
 * configuration error and **fails closed** (throws): a non-default instance with a broken address
 * must never silently fall back to the default route, because that misroutes its wakes into the
 * default instance's window.
 *
 * ## Dispatch coverage
 *
 * The bridge daemon currently dispatches the `userDataDir` address kind. The `pid`, `tmuxSession`,
 * and `webhookUrl` kinds are recognized envelope values reserved for the forthcoming generic
 * address-type dispatch; until that lands they fail closed here rather than produce a subscription
 * the daemon would misroute. For `userDataDir`, the address is also mirrored onto the legacy
 * `userDataDir` metadata field the daemon reads today; that mirror is a transitional bridge and is
 * retired once dispatch reads the generic `addressType` directly.
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
     * The recognized instance-address kinds. `userDataDir` is dispatched today; the remainder are
     * reserved for generic address-type dispatch and currently fail closed.
     */
    validAddressTypes = ['userDataDir', 'pid', 'tmuxSession', 'webhookUrl']

    /**
     * @member {String[]} dispatchableAddressTypes
     * The subset of {@link validAddressTypes} the bridge daemon can route today.
     */
    dispatchableAddressTypes = ['userDataDir']

    /**
     * Resolves the boot instance-address envelope into wake-subscription `overrideMetadata`.
     *
     * @param {Object} [env=process.env] Environment source (injectable for tests).
     * @returns {Object|null} `overrideMetadata` to merge into the bootstrapped subscription
     *     (`{instanceAddress, addressType, ...}`), or `null` for the default instance (no address
     *     configured → routed by absence).
     * @throws {Error} When the envelope is partially configured, the address type is unrecognized,
     *     or the address type is recognized but not yet dispatchable (fail-closed to prevent
     *     misrouting a non-default instance to the default route).
     */
    resolveOverrideMetadata(env = process.env) {
        const instanceAddress = env.NEO_HARNESS_INSTANCE_ADDRESS?.trim(),
              addressType      = env.NEO_HARNESS_INSTANCE_ADDRESS_TYPE?.trim();

        // Default instance: no address configured → no override. The daemon routes the arg-less
        // main instance by the absence of an address.
        if (!instanceAddress && !addressType) {
            return null;
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
                `is not yet implemented (the bridge daemon currently routes: ` +
                `${this.dispatchableAddressTypes.join(', ')}). Failing closed to avoid misrouting.`
            );
        }

        const overrideMetadata = {instanceAddress, addressType};

        // Transitional daemon-compat: the live bridge daemon resolves the target instance from the
        // `userDataDir` metadata field. Mirror the address there so wake routing is functional now;
        // the mirror is retired once dispatch reads `addressType` directly.
        if (addressType === 'userDataDir') {
            overrideMetadata.userDataDir = instanceAddress;
        }

        return overrideMetadata;
    }
}

export default Neo.setupClass(BootEnvelopeResolver);
