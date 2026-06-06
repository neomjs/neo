import {test, expect} from '@playwright/test';

import {
    ALERT_SEVERITIES,
    cooldownKey,
    DEFAULT_COOLDOWN_MS,
    evaluateAlertRules,
    formatAlertMessage,
    KNOWN_METRICS,
    validateAlertRule
} from '../../../../../../ai/services/knowledge-base/helpers/kbAlertRuleEngine.mjs';

/**
 * Phase 4D (#11642) — `KbAlertRuleEngine` coverage: the pure rule-evaluation core of the
 * KB operator-alerting daemon.
 *
 * The module is dependency-free (no Neo class system, no I/O, no clock) — so this spec
 * needs no `setup()` harness; it imports the pure functions directly and exercises them
 * against fixture rollups whose shape mirrors `KBRecorderService.getTenantIngestionRollup`.
 *
 * Covers the #11642 Contract Ledger Evidence columns for the `alertRules` schema row
 * (rule parse + validation) and the hysteresis row (cooldown suppression + per-key
 * independence). Channel *dispatch* is the daemon's concern and is tested separately.
 *
 * @see https://github.com/neomjs/neo/issues/11642
 * @see ai/services/knowledge-base/helpers/kbAlertRuleEngine.mjs — the module under test.
 */

/** A baseline well-formed rule — individual tests clone + mutate it. */
const VALID_RULE = {
    metric  : 'errorRate',
    threshold: 0.1,
    severity: 'warning',
    channels: ['console', 'a2a:@neo-gpt']
};

/** A two-tenant rollup mirroring `getTenantIngestionRollup` row shape. */
const ROLLUP = [
    {tenantId: 'tenant-a', repoSlug: 'repo-a', eventCount: 8, errorEvents: 2, errorRate: 0.25, chunksEmbedded: 120},
    {tenantId: 'tenant-b', repoSlug: 'repo-b', eventCount: 4, errorEvents: 0, errorRate: 0,    chunksEmbedded: 60}
];

test.describe('KbAlertRuleEngine — validateAlertRule (#11642)', () => {
    test('accepts a well-formed rule', () => {
        expect(validateAlertRule(VALID_RULE)).toEqual({valid: true, reason: ''});
    });

    test('accepts an optional deliveryMode and rejects an invalid one', () => {
        expect(validateAlertRule({...VALID_RULE, deliveryMode: 'audit'}).valid).toBe(true);
        expect(validateAlertRule({...VALID_RULE, deliveryMode: 'wake'}).valid).toBe(true);
        expect(validateAlertRule({...VALID_RULE, deliveryMode: 'shout'}).valid).toBe(false);
    });

    test('rejects a non-object rule', () => {
        expect(validateAlertRule(null).valid).toBe(false);
        expect(validateAlertRule('errorRate>0.1').valid).toBe(false);
    });

    test('rejects an unknown metric', () => {
        const result = validateAlertRule({...VALID_RULE, metric: 'error_rate_5min'});
        expect(result.valid).toBe(false);
        expect(result.reason).toContain('unknown metric');
    });

    test('rejects a non-numeric or non-finite threshold', () => {
        expect(validateAlertRule({...VALID_RULE, threshold: '0.1'}).valid).toBe(false);
        expect(validateAlertRule({...VALID_RULE, threshold: Infinity}).valid).toBe(false);
        expect(validateAlertRule({...VALID_RULE, threshold: NaN}).valid).toBe(false);
    });

    test('rejects an invalid severity', () => {
        expect(validateAlertRule({...VALID_RULE, severity: 'fatal'}).valid).toBe(false);
    });

    test('rejects empty or missing channels — no implicit default', () => {
        expect(validateAlertRule({...VALID_RULE, channels: []}).valid).toBe(false);
        expect(validateAlertRule({...VALID_RULE, channels: undefined}).valid).toBe(false);
    });

    test('rejects a malformed channel spec', () => {
        expect(validateAlertRule({...VALID_RULE, channels: ['console', 'slack:foo']}).valid).toBe(false);
        expect(validateAlertRule({...VALID_RULE, channels: ['a2a:']}).valid).toBe(false);
        expect(validateAlertRule({...VALID_RULE, channels: ['webhook:']}).valid).toBe(false);
    });

    test('exposes the known-metric and severity vocabularies', () => {
        expect(KNOWN_METRICS).toContain('errorRate');
        expect(KNOWN_METRICS).toContain('chunksEmbedded');
        expect(ALERT_SEVERITIES).toEqual(['warning', 'critical']);
    });
});

test.describe('KbAlertRuleEngine — evaluateAlertRules (#11642)', () => {
    test('emits one alert per channel for a breaching tenant', () => {
        const {alerts, skippedRules} = evaluateAlertRules({rules: [VALID_RULE], rollup: ROLLUP, now: 1000});

        expect(skippedRules).toHaveLength(0);
        // tenant-a breaches (errorRate 0.25 > 0.1) on 2 channels; tenant-b (0) does not.
        expect(alerts).toHaveLength(2);
        expect(alerts.every(a => a.tenantId === 'tenant-a')).toBe(true);
        expect(alerts.map(a => a.channel).sort()).toEqual(['a2a:@neo-gpt', 'console']);
        expect(alerts[0]).toMatchObject({metric: 'errorRate', value: 0.25, threshold: 0.1, severity: 'warning', deliveryMode: 'wake'});
    });

    test('emits nothing when no tenant breaches', () => {
        const lenient = {...VALID_RULE, threshold: 0.9};
        const {alerts} = evaluateAlertRules({rules: [lenient], rollup: ROLLUP, now: 1000});

        expect(alerts).toHaveLength(0);
    });

    test('uses strict greater-than — a value equal to the threshold does not breach', () => {
        const exact = {...VALID_RULE, metric: 'errorRate', threshold: 0.25};
        const {alerts} = evaluateAlertRules({rules: [exact], rollup: ROLLUP, now: 1000});

        expect(alerts).toHaveLength(0);
    });

    test('collects invalid rules into skippedRules without blocking valid ones', () => {
        const rules = [{...VALID_RULE, metric: 'bogus'}, VALID_RULE];
        const {alerts, skippedRules} = evaluateAlertRules({rules, rollup: ROLLUP, now: 1000});

        expect(skippedRules).toHaveLength(1);
        expect(skippedRules[0].reason).toContain('unknown metric');
        expect(alerts).toHaveLength(2); // the valid rule still fires
    });

    test('does not breach on a missing or non-numeric metric field', () => {
        const rule   = {...VALID_RULE, metric: 'chunksDeleted'}; // not present in ROLLUP rows
        const {alerts} = evaluateAlertRules({rules: [rule], rollup: ROLLUP, now: 1000});

        expect(alerts).toHaveLength(0);
    });

    test('returns an empty result for non-array rules or rollup (defensive)', () => {
        expect(evaluateAlertRules({rules: null, rollup: ROLLUP, now: 1}).alerts).toHaveLength(0);
        expect(evaluateAlertRules({rules: [VALID_RULE], rollup: undefined, now: 1}).alerts).toHaveLength(0);
    });

    test('carries deliveryMode into the descriptor (default wake)', () => {
        const auditRule = {...VALID_RULE, channels: ['a2a:@neo-gpt'], deliveryMode: 'audit'};
        const {alerts}  = evaluateAlertRules({rules: [auditRule], rollup: ROLLUP, now: 1000});

        expect(alerts[0].deliveryMode).toBe('audit');
    });

    test('suppresses a re-fire within the cooldown window and re-fires after it', () => {
        const first = evaluateAlertRules({rules: [VALID_RULE], rollup: ROLLUP, now: 1000});
        expect(first.alerts).toHaveLength(2);

        // Re-evaluate inside the default 1h window — fully suppressed.
        const within = evaluateAlertRules({
            rules: [VALID_RULE], rollup: ROLLUP, cooldownState: first.cooldownState, now: 1000 + 60_000
        });
        expect(within.alerts).toHaveLength(0);

        // Re-evaluate past the window — re-fires.
        const after = evaluateAlertRules({
            rules: [VALID_RULE], rollup: ROLLUP, cooldownState: first.cooldownState, now: 1000 + DEFAULT_COOLDOWN_MS + 1
        });
        expect(after.alerts).toHaveLength(2);
    });

    test('cools down per (tenant, metric, severity, channel) key independently', () => {
        // Seed a cooldown for ONLY tenant-a's console channel.
        const seeded = {[cooldownKey('tenant-a', 'errorRate', 'warning', 'console')]: 1000};

        const {alerts} = evaluateAlertRules({
            rules: [VALID_RULE], rollup: ROLLUP, cooldownState: seeded, now: 1000 + 60_000
        });

        // console is cooled down; a2a:@neo-gpt is not → exactly one alert, on the a2a channel.
        expect(alerts).toHaveLength(1);
        expect(alerts[0].channel).toBe('a2a:@neo-gpt');
    });

    test('honors a custom cooldownMs window', () => {
        const first  = evaluateAlertRules({rules: [VALID_RULE], rollup: ROLLUP, now: 1000, cooldownMs: 5000});
        const reEval = evaluateAlertRules({
            rules: [VALID_RULE], rollup: ROLLUP, cooldownState: first.cooldownState, now: 1000 + 6000, cooldownMs: 5000
        });
        expect(reEval.alerts).toHaveLength(2); // 6000 > 5000 → re-fires
    });
});

test.describe('KbAlertRuleEngine — formatAlertMessage / cooldownKey (#11642)', () => {
    test('formatAlertMessage builds an [alert]-prefixed subject and a detail body', () => {
        const [alert] = evaluateAlertRules({rules: [VALID_RULE], rollup: ROLLUP, now: 1000}).alerts;
        const {subject, body} = formatAlertMessage(alert);

        expect(subject).toBe('[alert] warning: errorRate 0.25 over threshold 0.1 (tenant tenant-a)');
        expect(body).toContain('`tenant-a`');
        expect(body).toContain('`repo-a`');
        expect(body).toContain('threshold 0.1');
    });

    test('cooldownKey is a deterministic 4-tuple join', () => {
        expect(cooldownKey('t', 'errorRate', 'critical', 'console')).toBe('t|errorRate|critical|console');
    });
});
