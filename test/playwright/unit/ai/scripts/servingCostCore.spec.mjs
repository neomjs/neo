import {test, expect} from '@playwright/test';

import {aggregateWindow, buildMetricBags, classifySample}                from '../../../../../ai/scripts/benchmark/helpers/servingCostCore.mjs';
import {createMetricId, validateBusinessProperties}                      from '../../../../../ai/graph/businessSchema.mjs';
import {isLocalEndpoint, parseWindow, portFromHostUrl, resolveRolePorts} from '../../../../../ai/scripts/benchmark/serving-cost-meter.mjs';

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

/**
 * Pins the CLI's pure resolution helpers (import-safe — the entrypoint only parses argv when
 * executed directly): window parsing fails closed, endpoint locality gates what this
 * machine's process table may honestly claim to measure, and role/port resolution dedupes by
 * port while DECLARING remote skips instead of silently dropping them.
 */
test.describe('serving-cost meter CLI helpers (resolution honesty)', () => {
    test('window parsing accepts s/m/h and fails closed on anything else', () => {
        expect(parseWindow('90s')).toBe(90000);
        expect(parseWindow('45m')).toBe(2700000);
        expect(parseWindow('8h')).toBe(28800000);
        expect(() => parseWindow('8')).toThrow('--window');
        expect(() => parseWindow('8d')).toThrow('--window');
        expect(() => parseWindow('')).toThrow('--window')
    });

    test('port extraction handles explicit ports, protocol defaults, and garbage', () => {
        expect(portFromHostUrl('http://127.0.0.1:11434')).toBe(11434);
        expect(portFromHostUrl('http://localhost')).toBe(80);
        expect(portFromHostUrl('https://example.com')).toBe(443);
        expect(portFromHostUrl('not a url')).toBeNull()
    });

    test('endpoint locality is the sampling gate: only THIS machine\'s listeners are ours to measure', () => {
        expect(isLocalEndpoint('http://127.0.0.1:1234')).toBe(true);
        expect(isLocalEndpoint('http://localhost:11434')).toBe(true);
        expect(isLocalEndpoint('http://0.0.0.0:8000')).toBe(true);
        expect(isLocalEndpoint('http://192.168.1.50:11434')).toBe(false);
        expect(isLocalEndpoint('https://api.example.com')).toBe(false);
        expect(isLocalEndpoint('garbage')).toBe(false)
    });

    test('role/port resolution dedupes shared ports to one honest stream and DECLARES remote skips', () => {
        const config = {
            engines         : {chroma: {portProd: 8000}},
            ollama          : {host: 'http://remote-box:11434'},
            openAiCompatible: {host: 'http://127.0.0.1:1234'}
        };

        const {rolePorts, skipped} = resolveRolePorts(config);

        expect(rolePorts).toEqual([
            {port: 1234, role: 'model-server-openai-compatible'},
            {port: 8000, role: 'vector-store'}
        ]);
        expect(skipped).toHaveLength(1);
        expect(skipped[0].role).toBe('model-server-ollama');
        expect(skipped[0].reason).toContain('not local');

        // shared port → first role wins, one stream (same process, never interleaved samples)
        const shared = resolveRolePorts({
            engines         : {chroma: {portProd: 11434}},
            ollama          : {host: 'http://127.0.0.1:11434'},
            openAiCompatible: {host: 'http://127.0.0.1:11434'}
        });

        expect(shared.rolePorts).toEqual([{port: 11434, role: 'model-server-openai-compatible'}]);
        expect(shared.skipped).toEqual([])
    });
});
