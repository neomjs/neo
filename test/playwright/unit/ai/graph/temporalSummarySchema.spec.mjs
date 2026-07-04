import {setup} from '../../../setup.mjs';

const appName = 'TemporalSummarySchemaTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

test.describe('temporalSummarySchema — the ADR 0028 storage contract mechanized (#14433)', () => {
    let schema;

    const validMetadata = () => ({
        level      : 'daily',
        partition  : 'unified',
        windowStart: '2026-07-03T00:00:00.000Z',
        windowEnd  : '2026-07-04T00:00:00.000Z',
        version    : 1
    });

    test.beforeAll(async () => {
        schema = await import('../../../../../ai/graph/temporalSummarySchema.mjs');
    });

    test.describe('level vocabulary + the durable/dynamic boundary', () => {
        test('defines exactly the five pyramid levels with their SUMMARY_* labels', () => {
            expect(schema.TEMPORAL_SUMMARY_LEVELS.map(({key, tier, label}) => ({key, tier, label}))).toEqual([
                {key: 'session',   tier: 'L1', label: 'SUMMARY_SESSION'},
                {key: 'daily',     tier: 'L2', label: 'SUMMARY_DAILY'},
                {key: 'weekly',    tier: 'L3', label: 'SUMMARY_WEEKLY'},
                {key: 'monthly',   tier: 'L4', label: 'SUMMARY_MONTHLY'},
                {key: 'quarterly', tier: 'L5', label: 'SUMMARY_QUARTERLY'}
            ]);
        });

        test('only the L1/L2 durable tiers are writable node types — no durable label exists above daily', () => {
            expect(schema.DURABLE_SUMMARY_NODE_TYPES).toEqual(['SUMMARY_SESSION', 'SUMMARY_DAILY']);
        });

        test('resolves level records by key and fail-closes on unknown keys', () => {
            expect(schema.getTemporalSummaryLevel('daily')).toMatchObject({tier: 'L2', durable: true});
            expect(schema.getTemporalSummaryLevel('weekly')).toMatchObject({tier: 'L3', durable: false});
            expect(schema.getTemporalSummaryLevel('hourly')).toBeNull();
        });
    });

    test.describe('validateTemporalSummaryMetadata — the five-field contract', () => {
        test('accepts a complete record for both sanctioned partition forms', () => {
            expect(schema.validateTemporalSummaryMetadata(validMetadata())).toEqual({valid: true, errors: []});

            expect(schema.validateTemporalSummaryMetadata({
                ...validMetadata(),
                level    : 'session',
                partition: '@neo-fable-clio'
            })).toEqual({valid: true, errors: []});
        });

        test('rejects non-object input and missing fields with every violation named', () => {
            expect(schema.validateTemporalSummaryMetadata(null).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata([]).valid).toBe(false);

            const {valid, errors} = schema.validateTemporalSummaryMetadata({level: 'daily'});

            expect(valid).toBe(false);
            expect(errors).toEqual(expect.arrayContaining([
                'missing required metadata field: partition',
                'missing required metadata field: windowStart',
                'missing required metadata field: windowEnd',
                'missing required metadata field: version'
            ]));
        });

        test('rejects unknown extra fields — the contract is exactly five fields', () => {
            const {valid, errors} = schema.validateTemporalSummaryMetadata({...validMetadata(), prose: 'summary text'});

            expect(valid).toBe(false);
            expect(errors.some(message => message.includes('unknown metadata field: prose'))).toBe(true);
        });

        test('rejects unknown levels and malformed partitions', () => {
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), level: 'hourly'}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), partition: 'neo-fable-clio'}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), partition: '@'}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), partition: ''}).valid).toBe(false);
        });

        test('rejects non-ISO window bounds and empty or inverted windows', () => {
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), windowStart: 1751500800000}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), windowEnd: 'not-a-date'}).valid).toBe(false);

            const inverted = schema.validateTemporalSummaryMetadata({
                ...validMetadata(),
                windowStart: '2026-07-04T00:00:00.000Z',
                windowEnd  : '2026-07-03T00:00:00.000Z'
            });

            expect(inverted.valid).toBe(false);
            expect(inverted.errors.some(message => message.includes('strictly before'))).toBe(true);

            const empty = schema.validateTemporalSummaryMetadata({
                ...validMetadata(),
                windowEnd: validMetadata().windowStart
            });

            expect(empty.valid).toBe(false);
        });

        test('rejects non-positive and non-integer versions', () => {
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), version: 0}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), version: 1.5}).valid).toBe(false);
            expect(schema.validateTemporalSummaryMetadata({...validMetadata(), version: '1'}).valid).toBe(false);
        });
    });

    test.describe('createTemporalSummaryDocId — deterministic, append-only identity', () => {
        test('same window + track + version mints the same id; the @ marker is slug-dropped', () => {
            const metadata = {...validMetadata(), partition: '@neo-fable-clio'};

            const first  = schema.createTemporalSummaryDocId(metadata);
            const second = schema.createTemporalSummaryDocId({...metadata});

            expect(first).toBe(second);
            expect(first).toBe('temporal-summary-daily-neo-fable-clio-2026-07-03T00-00-00-000Z-v1');
        });

        test('the next version mints a NEW id — re-aggregation never rewrites history', () => {
            const v1 = schema.createTemporalSummaryDocId(validMetadata());
            const v2 = schema.createTemporalSummaryDocId({...validMetadata(), version: 2});

            expect(v1).not.toBe(v2);
            expect(v2.endsWith('-v2')).toBe(true);
        });

        test('fail-closes on invalid metadata instead of minting a partial id', () => {
            expect(() => schema.createTemporalSummaryDocId({...validMetadata(), level: 'hourly'}))
                .toThrow(/unknown level: hourly/);
        });
    });
});
