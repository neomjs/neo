/**
 * @module ai/daemons/orchestrator/control-plane/restartActuator
 * @summary The daemon-core lifecycle-write restart-actuator endpoint (ticket-ref-ok: #14760 owning-leaf anchor, #14477 parent-epic).
 *
 * The lifecycle-write half of the R3 boundary. Its **placement is its authority**: living under `control-plane/`
 * (lifecycle-write) rather than `diagnostics/` (read-observe) IS the structural R3 seam — one folder per
 * envelope. It is **physically absent from every client Bridge / readiness surface** (not on
 * `FLEET_WIRE_METHODS`, not on the `registryBridge`, not on a healthcheck): no client RPC may hold or imply a
 * restart. Only an orchestrator-internal control-plane caller reaches it, and the actual restart is executed
 * **through** the `lifecycle-write` envelope (`DeploymentRuntimeAccessService.applyLifecycle`) — this endpoint
 * never restarts a target directly, so the envelope's allowlisted-service-key + anti-thrash + operation-gate
 * guarantees are inherited, not re-derived.
 *
 * Distinct from the existing Fleet Manager `restartAgent` (client-reachable via `createFleetRegistryBridge`),
 * which is an already-shipped operator-UI lifecycle control and out of scope here.
 *
 * `runtimeAccess` is injected (the Orchestrator holds the `DeploymentRuntimeAccessService` instance) rather than
 * hard-imported — the module stays a pure, testable delegation with no ambient singleton reach.
 */

/**
 * @summary Control-plane restart of a known runtime target, routed through the lifecycle-write
 * envelope. Fail-safe: an absent or misconfigured `runtimeAccess`, or a missing `serviceKey`, is **refused** —
 * never a fabricated success and never a direct restart that would bypass the envelope's guards.
 * @param {Object} options
 * @param {Object} options.runtimeAccess The injected `DeploymentRuntimeAccessService` instance (the L0 holder).
 * @param {String} options.serviceKey The allowlisted runtime service key to restart (validated by the envelope).
 * @param {String} [options.reason='control-plane restart'] Audit reason forwarded to the envelope.
 * @returns {Promise<Object>} `{ok:true, result}` on a delegated restart; `{ok:false, error}` on a refusal.
 */
export async function restartRuntimeTarget({runtimeAccess, serviceKey, reason = 'control-plane restart'} = {}) {
    if (!runtimeAccess || typeof runtimeAccess.applyLifecycle !== 'function') {
        return {ok: false, error: 'control-plane: no lifecycle-write runtime access wired — refusing restart'};
    }

    if (typeof serviceKey !== 'string' || serviceKey.length === 0) {
        return {ok: false, error: 'control-plane: a known service key is required — refusing restart'};
    }

    // Delegate to the lifecycle-write envelope: it enforces the allowlisted service key, the closed
    // action set, and the persisted anti-thrash cap. This endpoint adds the R3 placement boundary, not a second
    // restart path.
    const result = await runtimeAccess.applyLifecycle({serviceKey, operation: 'restart', reason});

    return {ok: true, result};
}
