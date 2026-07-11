import {test, expect} from '@playwright/test';

import {aggregateWindow, buildMetricBags, classifySample} from '../../../../../ai/scripts/benchmark/helpers/servingCostCore.mjs';
import {createMetricId, validateBusinessProperties}       from '../../../../../ai/graph/businessSchema.mjs';

/**
 * Pins the serving-cost meter's pure core — the deterministic heart of the measurement
 * program: phase classification is threshold-honest, window aggregation reports coverage
 * instead of guessing through gaps, and every produced figure is born as a business-schema
 * VALID metric bag (falsifier + disclaimer mandatory) whose identity is deterministic.
 */
test.describe('serving-cost meter core (the pure measurement transforms)', () => {
    const sample = (atMs, cpuPercent, rssBytes = 1000, role = 'chat-model') => ({atMs, cpuPercent, role, rssBytes});

    test('phase classification is the documented threshold heuristic — inclusive at the boundary, fail-closed on garbage', () => {
        expect(classifySample(sample(0, 4.9), 5)).toBe('idle');
        expect(classifySample(sample(0, 5),   5)).toBe('active');   // inclusive: >= threshold
        expect(classifySample(sample(0, 380), 5)).toBe('active');   // multi-core percents are legal

        expect(() => classifySample(sample(0, NaN), 5)).toThrow('finite non-negative');
        expect(() => classifySample(sample(0, -1),  5)).toThrow('finite non-negative');
        expect(() => classifySample(sample(0, 10),  0)).toThrow('positive finite')
    });

    test('window aggregation: phase time attributes to the closing sample, gaps are EXCLUDED and reported, never guessed into idle', () => {
        const tick = 1000;
        // 0s idle → 1s idle → 2s active → 3s active → [10s gap] → 13s idle
        const aggregate = aggregateWindow([
            sample(0,     1),
            sample(1000,  1),
            sample(2000, 50),
            sample(3000, 60),
            sample(13000, 1)
        ], {activeCpuThreshold: 5, expectedIntervalMs: tick});

        expect(aggregate.idleMs).toBe(1000);          // interval closed by the 1s idle sample
        expect(aggregate.activeMs).toBe(2000);        // intervals closed by the 2s + 3s active samples
        expect(aggregate.gapCount).toBe(1);
        expect(aggregate.gapMs).toBe(10000);          // the hole is reported...
        expect(aggregate.coveredMs).toBe(3000);       // ...and excluded from coverage
        expect(aggregate.dutyCycle).toBeCloseTo(2000 / 3000, 10);
        expect(aggregate.sampleCount).toBe(5);
        expect(aggregate.windowStartMs).toBe(0);
        expect(aggregate.windowEndMs).toBe(13000);
        expect(aggregate.rssHighWaterBytes).toBe(1000);
        expect(aggregate.cpuActiveMeanPercent).toBeCloseTo(55, 10);

        // determinism: identical input, identical output — the module reads no clock
        expect(aggregateWindow([
            sample(0,     1),
            sample(1000,  1),
            sample(2000, 50),
            sample(3000, 60),
            sample(13000, 1)
        ], {activeCpuThreshold: 5, expectedIntervalMs: tick})).toEqual(aggregate)
    });

    test('aggregation fails closed on unusable streams', () => {
        expect(() => aggregateWindow([sample(0, 1)], {activeCpuThreshold: 5, expectedIntervalMs: 1000}))
            .toThrow('at least two');
        expect(() => aggregateWindow([sample(1000, 1), sample(1000, 2)], {activeCpuThreshold: 5, expectedIntervalMs: 1000}))
            .toThrow('strictly chronological');
        expect(() => aggregateWindow([sample(0, 1), sample(1000, 1)], {activeCpuThreshold: 5, expectedIntervalMs: 0}))
            .toThrow('expectedIntervalMs')
    });

    test('every published figure is born schema-valid: falsifier + disclaimer mandatory, identity deterministic, provenance non-optional', () => {
        const aggregate = aggregateWindow([
            sample(0, 1), sample(1000, 50), sample(2000, 1)
        ], {activeCpuThreshold: 5, expectedIntervalMs: 1000});

        const identity = {
            activeCpuThreshold: 5,
            hardwareId        : 'ref-mac-m2ultra',
            periodStart       : '2026-07-10',
            rerunCommand      : 'node ai/scripts/benchmark/serving-cost-meter.mjs --window 24h --hardware ref-mac-m2ultra',
            role              : 'chat-model',
            windowSemantics   : 'institution-day-rolling'
        };

        const bags = buildMetricBags(aggregate, identity);

        expect(bags.map(b => b.metricName)).toEqual([
            'chat-model.dutyCycle',
            'chat-model.rssHighWater',
            'chat-model.cpuActiveMean',
            'chat-model.coveredWindow'
        ]);

        for (const b of bags) {
            // the business schema itself is the gate this core must always satisfy
            expect(validateBusinessProperties(b.properties)).toEqual({errors: [], valid: true});
            expect(b.properties.claimClass).toBe('measured');
            expect(b.properties.falsifyingQuery).toBe(identity.rerunCommand);
            expect(b.properties.confoundDisclaimer).toContain('cpu-threshold heuristic');
            expect(b.properties.confoundDisclaimer).toContain('0 gaps');

            // deterministic idempotent identity: recomputation lands on the SAME node
            const id = createMetricId({
                metricName     : b.metricName,
                periodStart    : b.periodStart,
                source         : b.source,
                windowSemantics: b.windowSemantics
            });
            expect(id).toBe(createMetricId({
                metricName     : b.metricName,
                periodStart    : b.periodStart,
                source         : b.source,
                windowSemantics: b.windowSemantics
            }));
            expect(id.startsWith('metric-')).toBe(true)
        }

        // provenance is not optional — a missing identity field throws, never defaults
        expect(() => buildMetricBags(aggregate, {...identity, hardwareId: ''}))
            .toThrow('provenance is not optional')
    });
});
