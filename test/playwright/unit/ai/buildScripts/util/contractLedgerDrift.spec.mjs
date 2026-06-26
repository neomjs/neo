import {test, expect}                         from '@playwright/test';
import {detectSignatureDrift, parseSignature} from '../../../../../../buildScripts/util/contractLedgerDrift.mjs';

test.describe('contractLedgerDrift — author-side ledger-vs-diff signature-drift spike (#14119)', () => {
    test('the real #14104 case: a positional ledger surface vs a destructured shipped decl is flagged as param-style drift', () => {
        const result = detectSignatureDrift({
            ledgerSignature : 'buildDimensionConsistencyDiagnosis(samples, observedAt, serviceId)',
            shippedSignature: 'export function buildDimensionConsistencyDiagnosis({samples, observedAt, serviceId})'
        });

        expect(result.drift).toBe(true);
        expect(result.kinds).toContain('param-style');
        // the param NAMES match — only the passing style drifted, the exact reviewer-caught gap this targets
        expect(result.kinds).not.toContain('param-set');
    });

    test('no drift when ledger and shipped declarations agree (style + param set)', () => {
        const result = detectSignatureDrift({
            ledgerSignature : 'buildDimensionConsistencyDiagnosis({samples, observedAt, serviceId})',
            shippedSignature: 'export function buildDimensionConsistencyDiagnosis({samples, observedAt, serviceId})'
        });

        expect(result.drift).toBe(false);
        expect(result.kinds).toEqual([]);
    });

    test('a shipped declaration that added a parameter the ledger omits is flagged as param-set drift', () => {
        const result = detectSignatureDrift({
            ledgerSignature : 'auditCollectionVectorDimensions({collection, collectionName, expectedDimension})',
            shippedSignature: 'auditCollectionVectorDimensions({collection, collectionName, expectedDimension, sampleSize})'
        });

        expect(result.drift).toBe(true);
        expect(result.kinds).toContain('param-set');
    });

    test('a renamed surface is flagged as name drift', () => {
        const result = detectSignatureDrift({
            ledgerSignature : 'buildSupervisedTaskDiagnosis({taskName, outcome})',
            shippedSignature: 'buildSupervisedTaskOutcome({taskName, outcome})'
        });

        expect(result.drift).toBe(true);
        expect(result.kinds).toContain('name');
    });

    test('defaults and type annotations are normalized away before comparison', () => {
        const result = detectSignatureDrift({
            ledgerSignature : 'fn({a, b})',
            shippedSignature: 'export async function fn({a = 1, b = {}})'
        });

        expect(result.drift).toBe(false);
    });

    test('an unparseable signature degrades to a flagged unparseable (never a false clean)', () => {
        expect(detectSignatureDrift({ledgerSignature: 'not a signature', shippedSignature: 'fn({a})'}).kinds)
            .toContain('unparseable');
    });

    test('parseSignature classifies positional vs destructured vs empty', () => {
        expect(parseSignature('fn(a, b)')).toMatchObject({name: 'fn', style: 'positional', params: ['a', 'b']});
        expect(parseSignature('fn({b, a})')).toMatchObject({name: 'fn', style: 'destructured', params: ['a', 'b']});
        expect(parseSignature('fn()')).toMatchObject({name: 'fn', style: 'none', params: []});
        expect(parseSignature('garbage')).toBeNull();
    });
});
