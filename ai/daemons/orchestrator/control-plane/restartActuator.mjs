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
    // action set, and the persisted anti-thrash cap. This endpoint adds the R3 placement boundary, not a
    // second restart path. The envelope signals a refusal by THROWING (disabled / unsupported mechanism /
    // disallowed op / unknown-or-non-allowlisted service key); catch it so the control-plane endpoint
    // returns a clean {ok:false} instead of leaking a raw throw, and defensively treat an explicit
    // {ok:false} envelope result as a refusal too — a false {ok:true} must be impossible on any refusal shape.
    try {
        const result = await runtimeAccess.applyLifecycle({serviceKey, operation: 'restart', reason});

        if (result && typeof result === 'object' && result.ok === false) {
            return {ok: false, error: result.error ?? 'control-plane: lifecycle-write envelope refused the restart', result};
        }

        return {ok: true, result};
    } catch (error) {
        return {ok: false, error: `control-plane: lifecycle-write envelope refused the restart — ${error.message}`};
    }
}
