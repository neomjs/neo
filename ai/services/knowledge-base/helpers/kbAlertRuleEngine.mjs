/**
 * @summary Pure rule-evaluation engine for the Phase 4D KB operator-alerting daemon (#11642).
 *
 * Phase 4D (#11642) substrate. The cloud KB operator-alerting daemon (`KbAlertingService`)
 * polls per-tenant ingestion telemetry and fires alerts when operator-configured thresholds
 * are breached. This module is the **pure core** of that daemon — no I/O, no clock access,
 * no service references — so the threshold logic, rule validation, hysteresis/cooldown, and
 * message formatting are all trivially unit-testable in isolation.
 *
 * The daemon owns the I/O: it reads `aiConfig.knowledgeBase.alertRules`, calls
 * `KBRecorderService.getTenantIngestionRollup`, holds the cooldown state across ticks, and
 * dispatches each emitted alert to its channels (A2A / console / webhook). This module only
 * decides *which* alerts should fire *this tick* given the inputs.
 *
 * Contract: the per-#11642 Contract Ledger (ticket body) is the binding spec. This engine
 * implements its `alertRules` schema row + the hysteresis row; channel *dispatch* (the A2A /
 * console / webhook I/O) is the daemon's concern.
 *
 * @see ai/daemons/kb-alerting/KbAlertingService.mjs — the daemon that consumes this engine.
 * @see ai/services/knowledge-base/KBRecorderService.mjs — `getTenantIngestionRollup`, the rollup source.
 */

/**
 * @summary The telemetry metric names a rule may target.
 *
 * Exactly the numeric fields of a `KBRecorderService.getTenantIngestionRollup` row. A rule
 * whose `metric` is not one of these is rejected at validation — this turns an operator
 * typo (`errorRate` mistyped) into a clear skipped-rule warning rather than a rule that
 * silently never fires.
 * @type {ReadonlyArray<String>}
 */
export const KNOWN_METRICS = Object.freeze([
    'eventCount', 'ingestEvents', 'tombstoneEvents', 'reconcileEvents',
    'errorEvents', 'chunksEmbedded', 'chunksDeleted', 'errorRate'
]);

/**
 * @summary Permitted `severity` values for an alert rule.
 * @type {ReadonlyArray<String>}
 */
export const ALERT_SEVERITIES = Object.freeze(['warning', 'critical']);

/**
 * @summary Permitted `deliveryMode` values — `wake` (default) emits a wakeful A2A message;
 * `audit` emits a durable mailbox-only record (`wakeSuppressed: true`, no wake).
 * @type {ReadonlyArray<String>}
 */
export const DELIVERY_MODES = Object.freeze(['wake', 'audit']);

/**
 * @summary Default hysteresis window — a fired alert is suppressed from re-firing on the
 * same cooldown key within this span. Matches the #11642 AC ("default 1h").
 * @type {Number}
 */
export const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * @summary Validates the structural shape of one channel spec string.
 *
 * Recognized forms: `console`, `a2a:<target>`, `webhook:<url>`. Structural only — semantic
 * validation of an `a2a:` target against the live AgentIdentity registry needs graph I/O
 * and is the daemon's concern, not the pure engine's.
 *
 * @param {String} channel
 * @returns {Boolean}
 * @private
 */
function isWellFormedChannel(channel) {
    if (channel === 'console')            return true;
    if (channel.startsWith('a2a:'))       return channel.length > 'a2a:'.length;
    if (channel.startsWith('webhook:'))   return channel.length > 'webhook:'.length;
    return false;
}

/**
 * @summary Builds the deterministic cooldown key for a (tenant, metric, severity, channel) tuple.
 *
 * Keying on the full tuple — per @neo-gpt's #11642 overlay #4 — means a single noisy tenant
 * cannot wake-storm: distinct tenants, metrics, severities, and channel targets each cool
 * down independently.
 *
 * @param {String} tenantId
 * @param {String} metric
 * @param {String} severity
 * @param {String} channel
 * @returns {String}
 */
export function cooldownKey(tenantId, metric, severity, channel) {
    return `${tenantId}|${metric}|${severity}|${channel}`;
}

/**
 * @summary Structurally validates one alert rule against the #11642 Contract Ledger schema.
 *
 * Pure structural validation: `metric` ∈ {@link KNOWN_METRICS}, finite numeric `threshold`,
 * `severity` ∈ {@link ALERT_SEVERITIES}, an explicit non-empty `channels` array of
 * well-formed channel specs, optional `deliveryMode` ∈ {@link DELIVERY_MODES}. There is no
 * implicit default channel — a rule must name its channels explicitly (overlay #1).
 *
 * @param {Object} rule
 * @returns {{valid: Boolean, reason: String}} `reason` is `''` when valid.
 */
export function validateAlertRule(rule) {
    if (!rule || typeof rule !== 'object') {
        return {valid: false, reason: 'rule is not an object'};
    }
    if (typeof rule.metric !== 'string' || !KNOWN_METRICS.includes(rule.metric)) {
        return {valid: false, reason: `unknown metric "${rule.metric}" (expected one of: ${KNOWN_METRICS.join(', ')})`};
    }
    if (typeof rule.threshold !== 'number' || !Number.isFinite(rule.threshold)) {
        return {valid: false, reason: 'threshold must be a finite number'};
    }
    if (!ALERT_SEVERITIES.includes(rule.severity)) {
        return {valid: false, reason: `severity must be one of: ${ALERT_SEVERITIES.join(', ')}`};
    }
    if (!Array.isArray(rule.channels) || rule.channels.length === 0) {
        return {valid: false, reason: 'channels must be a non-empty array (no implicit default)'};
    }
    for (const channel of rule.channels) {
        if (typeof channel !== 'string' || !isWellFormedChannel(channel)) {
            return {valid: false, reason: `malformed channel spec "${channel}"`};
        }
    }
    if (rule.deliveryMode !== undefined && !DELIVERY_MODES.includes(rule.deliveryMode)) {
        return {valid: false, reason: `deliveryMode must be one of: ${DELIVERY_MODES.join(', ')}`};
    }
    return {valid: true, reason: ''};
}

/**
 * @summary Evaluates operator alert rules against a per-tenant ingestion rollup.
 *
 * Pure — no I/O, no clock (the caller passes `now`). For each valid rule × each tenant row,
 * a metric value strictly greater than the rule's `threshold` is a breach; each of the
 * rule's channels then emits an alert *unless* that (tenant, metric, severity, channel)
 * cooldown key fired within `cooldownMs`. The returned `cooldownState` is the input map with
 * the freshly-fired keys stamped to `now` — the daemon threads it back in on the next tick.
 *
 * Invalid rules are not thrown on — they are collected into `skippedRules` (with a reason)
 * so the daemon can log them; one malformed rule never blocks the rest.
 *
 * @param {Object}        params
 * @param {Array<Object>} params.rules                 Operator `alertRules` array.
 * @param {Array<Object>} params.rollup                `getTenantIngestionRollup()` rows.
 * @param {Object}        [params.cooldownState={}]    Map of cooldown-key → last-fired epoch ms.
 * @param {Number}        params.now                   Current epoch ms (caller-supplied; keeps this pure).
 * @param {Number}        [params.cooldownMs=DEFAULT_COOLDOWN_MS] Hysteresis window.
 * @returns {{alerts: Array<Object>, cooldownState: Object, skippedRules: Array<{rule: Object, reason: String}>}}
 *   `alerts` — one descriptor per (tenant, rule, channel) firing this tick:
 *   `{tenantId, repoSlug, metric, value, threshold, severity, channel, deliveryMode}`.
 */
export function evaluateAlertRules({rules, rollup, cooldownState = {}, now, cooldownMs = DEFAULT_COOLDOWN_MS}) {
    const alerts        = [];
    const skippedRules  = [];
    const nextCooldown  = {...cooldownState};

    if (!Array.isArray(rules) || !Array.isArray(rollup)) {
        return {alerts, cooldownState: nextCooldown, skippedRules};
    }

    for (const rule of rules) {
        const {valid, reason} = validateAlertRule(rule);

        if (!valid) {
            skippedRules.push({rule, reason});
            continue;
        }

        for (const row of rollup) {
            const value = row?.[rule.metric];

            // Breach = a numeric value strictly above the threshold. A missing/non-numeric
            // field simply never breaches (graceful — no speculative metric support).
            if (typeof value !== 'number' || !(value > rule.threshold)) {
                continue;
            }

            for (const channel of rule.channels) {
                const key      = cooldownKey(row.tenantId, rule.metric, rule.severity, channel);
                const lastFired = nextCooldown[key];

                if (typeof lastFired === 'number' && now - lastFired < cooldownMs) {
                    continue; // still cooling down on this key
                }

                nextCooldown[key] = now;

                alerts.push({
                    tenantId    : row.tenantId,
                    repoSlug    : row.repoSlug,
                    metric      : rule.metric,
                    value,
                    threshold   : rule.threshold,
                    severity    : rule.severity,
                    channel,
                    deliveryMode: rule.deliveryMode || 'wake'
                });
            }
        }
    }

    return {alerts, cooldownState: nextCooldown, skippedRules};
}

/**
 * @summary Formats an alert descriptor into an A2A / console message `{subject, body}`.
 *
 * Pure — kept here (not in the daemon) so message shaping is unit-testable. The daemon
 * passes `subject`/`body` straight to `add_message` (A2A) or `logger` (console).
 *
 * @param {Object} alert An entry from {@link evaluateAlertRules}'s `alerts` array.
 * @returns {{subject: String, body: String}}
 */
export function formatAlertMessage(alert) {
    const subject = `[alert] ${alert.severity}: ${alert.metric} ${alert.value} over threshold ${alert.threshold} (tenant ${alert.tenantId})`;

    const body = [
        `KB ingestion alert — **${alert.severity}**`,
        '',
        `- Tenant: \`${alert.tenantId}\``,
        `- Repo: \`${alert.repoSlug}\``,
        `- Metric: \`${alert.metric}\``,
        `- Observed: ${alert.value} (threshold ${alert.threshold})`,
        '',
        'Per-tenant KB ingestion telemetry crossed an operator-configured threshold (#11642).'
    ].join('\n');

    return {subject, body};
}
