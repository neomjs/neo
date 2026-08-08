import {test, expect} from '@playwright/test';
import {
    DEFAULT_CONTEXT_GATE_MAX_TOKENS,
    DEFAULT_CONTEXT_GATE_WARN_TOKENS,
    evaluateContextGate
} from '../../../../../../ai/daemons/wake/contextGatePolicy.mjs';

test.describe('ai/daemons/wake/contextGatePolicy (#16682 budget-cliff guard)', () => {
    const limits = {
        maxContextTokens : DEFAULT_CONTEXT_GATE_MAX_TOKENS,
        warnContextTokens: DEFAULT_CONTEXT_GATE_WARN_TOKENS
    };
    const probe = contextTokens => ({contextTokens, lastActivityAt: 1_786_190_000_000, sessionId: 'ses_test'});

    test.describe('evaluateContextGate', () => {
        test('defers above the max threshold — the cliff turn never starts', () => {
            const gate = evaluateContextGate({probe: probe(limits.maxContextTokens + 1), ...limits});

            expect(gate).toEqual({
                action       : 'defer',
                gateOutcome  : 'deferred',
                contextTokens: limits.maxContextTokens + 1
            });
        });

        test('delivers at the max threshold boundary (defer is strictly greater-than)', () => {
            const gate = evaluateContextGate({probe: probe(limits.maxContextTokens), ...limits});

            expect(gate.action).toBe('deliver');
            expect(gate.gateOutcome).toBe('warn');
        });

        test('warns but delivers inside the warn band — the seat sees the approach', () => {
            const gate = evaluateContextGate({probe: probe(limits.warnContextTokens), ...limits});

            expect(gate).toMatchObject({action: 'deliver', gateOutcome: 'warn'});
        });

        test('delivers quietly below the warn band', () => {
            const gate = evaluateContextGate({probe: probe(limits.warnContextTokens - 1), ...limits});

            expect(gate).toMatchObject({action: 'deliver', gateOutcome: 'within'});
        });

        test('a fresh-boot-sized context always delivers — rotation flushes a deferral by construction', () => {
            const gate = evaluateContextGate({probe: probe(60_000), ...limits});

            expect(gate).toMatchObject({action: 'deliver', gateOutcome: 'within'});
        });

        test('unknown context fails OPEN — never silently withheld (#16526 lesson)', () => {
            for (const probeValue of [null, undefined, {}, {contextTokens: Number.NaN}]) {
                const gate = evaluateContextGate({probe: probeValue ?? null, ...limits});

                expect(gate).toEqual({action: 'deliver', gateOutcome: 'unknown', contextTokens: null});
            }
        });

        test('there is no time-based flush: a session that stays large defers forever', () => {
            // The probe always reads CURRENT state, so a stale-but-still-large session keeps
            // deferring no matter how old the wake is — flushing into it would be the 97→100%
            // cliff event this module exists to prevent.
            const ancient = {contextTokens: 700_000, lastActivityAt: 1, sessionId: 'ses_old'};

            expect(evaluateContextGate({probe: ancient, ...limits}).action).toBe('defer');
        });
    });
});
