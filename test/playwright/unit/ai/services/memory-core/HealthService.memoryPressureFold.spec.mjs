import {setup} from '../../../../setup.mjs';

const appName = 'HealthServiceMemoryPressureFoldTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}              from '@playwright/test';
import Neo                         from '../../../../../../src/Neo.mjs';
import * as core                   from '../../../../../../src/core/_export.mjs';
import {foldServiceMemoryPressure} from '../../../../../../ai/services/memory-core/HealthService.mjs';

const NOW            = 1_000_000_000;
const STALE_AFTER_MS = 2 * 60 * 1000;

/**
 * The consumed-surface half of the memory-ceiling fold.
 *
 * The orchestrator detected a lane at its memory ceiling and published the disposition on the service
 * record for a full incident, while every aggregate surface an operator reads still said healthy. The
 * first implementation folded only into the bridge's own nested record and called that "the composed
 * surface" — so the fact travelled one layer further and still reached no reader.
 *
 * These cases therefore assert the CONSUMER, not the producer: the question is whether the healthcheck
 * an operator actually calls changes its verdict.
 */
test.describe('foldServiceMemoryPressure (#17121)', () => {
    function makePayload(status = 'healthy') {
        return {status, details: ['All features are operational']};
    }

    function makeService({disposition = 'at-cap', observedAgoMs = 1000, serviceKey = 'embedding-model'} = {}) {
        return {
            serviceKey,
            observedAt    : new Date(NOW - observedAgoMs).toISOString(),
            memoryPressure: {
                disposition,
                reason : null,
                receipt: disposition === 'at-cap'
                    ? {serviceKey, metric: 'memory', scope: 'container', threshold: 90, minPercent: 99.8}
                    : null
            }
        };
    }

    function makeInspection({status = 'available', services} = {}) {
        return {
            ok      : status === 'available',
            status,
            snapshot: services === undefined ? {generatedAt: NOW} : {generatedAt: NOW, services}
        };
    }

    function fold(inspection, payload = makePayload()) {
        const observation = foldServiceMemoryPressure({payload, inspection, now: NOW, staleAfterMs: STALE_AFTER_MS});

        return {observation, payload};
    }

    test('a fresh at-cap service degrades the composed health an operator reads', () => {
        const {observation, payload} = fold(makeInspection({services: [makeService()]}));

        expect(observation.state).toBe('consumed-degraded');
        expect(payload.status).toBe('degraded');
        // The all-clear line is withdrawn: "all features are operational" and "a lane is pinned at its
        // ceiling" cannot both be true in one response.
        expect(payload.details).not.toContain('All features are operational');
        expect(payload.details.join(' ')).toContain('embedding-model sustained 99.8% of its container limit');
    });

    test('below and unknown never degrade — an inconclusive reading is not a verdict', () => {
        for (const disposition of ['below', 'unknown']) {
            const {observation, payload} = fold(makeInspection({services: [makeService({disposition})]}));

            expect(observation.state).toBe('consumed-clear');
            expect(payload.status).toBe('healthy');
            expect(payload.details).toContain('All features are operational');
        }
    });

    test('a stale record carries no degradation authority', () => {
        const {observation, payload} = fold(makeInspection({
            services: [makeService({observedAgoMs: STALE_AFTER_MS + 1})]
        }));

        expect(observation.state).toBe('consumed-clear');
        expect(payload.status).toBe('healthy');
    });

    test('a stale or unavailable snapshot cannot degrade, and says which', () => {
        expect(fold(makeInspection({status: 'stale', services: [makeService()]})).observation.state)
            .toBe('snapshot-stale');
        expect(fold(makeInspection({status: 'unavailable', services: [makeService()]})).observation.state)
            .toBe('snapshot-unavailable');
        expect(fold(null).observation.state).toBe('snapshot-unavailable');

        // and none of them moved the verdict
        expect(fold(makeInspection({status: 'stale', services: [makeService()]})).payload.status).toBe('healthy');
    });

    test('unhealthy wins — the fold only ever moves healthy to degraded', () => {
        const {payload} = fold(makeInspection({services: [makeService()]}), makePayload('unhealthy'));

        expect(payload.status).toBe('unhealthy');
    });

    test('a malformed record fails soft rather than deciding the health of the plane', () => {
        // This section is additive observability riding a file. One unreadable entry must neither
        // degrade nor throw: a record that fails a shape check is simply not evidence of a ceiling.
        const services = [
            {serviceKey: 'a', observedAt: 'not-a-date', memoryPressure: {disposition: 'at-cap'}},
            {serviceKey: 'b', memoryPressure: 'at-cap'},
            {serviceKey: 'c'},
            null
        ];

        const {observation, payload} = fold(makeInspection({services}));

        expect(observation.state).toBe('consumed-clear');
        expect(payload.status).toBe('healthy');
    });

    test('a fresh at-cap with an unusable receipt does not authorize degradation, and is not silent about it', () => {
        // The disposition alone is a CLAIM; the receipt is the evidence for it. Authorizing on
        // disposition plus a timestamp degrades the plane on a source-invalid state and prints an
        // all-null detail line — "sustained null% of its null limit" — which is worse than not
        // degrading, because it looks like a measurement.
        //
        // The earlier malformed case passed for the wrong reason: its at-cap row carried an invalid
        // DATE, so the freshness check excluded it and the receipt was never examined at all.
        for (const receipt of [
            null,
            {serviceKey: 'embedding-model', metric: 'memory', scope: 'container', threshold: 90},   // no minPercent
            {serviceKey: 'embedding-model', metric: 'memory', minPercent: 99.8, threshold: 90},     // no scope
            {serviceKey: 'embedding-model', metric: 'memory', scope: 'container', minPercent: 99.8} // no threshold
        ]) {
            const service                = {...makeService(), memoryPressure: {disposition: 'at-cap', reason: null, receipt}};
            const {observation, payload} = fold(makeInspection({services: [service]}));

            expect(payload.status).toBe('healthy');
            expect(payload.details).toContain('All features are operational');
            expect(observation.atCap).toEqual([]);
            // Not silent: an at-cap claim we refused to act on is exactly the thing an operator needs
            // to see, because it means the producer and the consumer disagree about the evidence.
            expect(observation.incompleteReceipts).toEqual(['embedding-model']);
        }
    });

    test('a snapshot without a services array is absent, not clear', () => {
        expect(fold(makeInspection({})).observation.state).toBe('absent');
    });

    test('one at-cap service among healthy ones still degrades, and only it is named', () => {
        const {observation, payload} = fold(makeInspection({
            services: [
                makeService({disposition: 'below', serviceKey: 'chat-model'}),
                makeService({serviceKey: 'embedding-model'}),
                makeService({disposition: 'unknown', serviceKey: 'memory-core'})
            ]
        }));

        expect(payload.status).toBe('degraded');
        expect(observation.atCap.map(entry => entry.serviceKey)).toEqual(['embedding-model']);
    });
});
