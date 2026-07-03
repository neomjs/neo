import {setup} from '../../../../setup.mjs';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

const appName = 'MigrationCensusReportTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';

test.describe('migrationCensusReport.mjs (#12768)', () => {
    let mod;

    test.beforeAll(async () => {
        mod = await import('../../../../../../ai/scripts/maintenance/migrationCensusReport.mjs');
    });

    test('parseArgs defaults to the cheap SQLite census; --chroma + --json opt in', () => {
        expect(mod.parseArgs([])).toEqual({includeChroma: false, json: false});
        expect(mod.parseArgs(['--chroma', '--json'])).toEqual({includeChroma: true, json: true});
    });

    test('formatCensus renders the SQLite counts and flags the omitted Chroma scan', () => {
        const out = mod.formatCensus({
            graph     : {memory: 3, session: 2, total: 5, available: true},
            measuredAt: '2026-06-13T07:00:00.000Z'
        });

        expect(out).toContain('SQLite untagged MEMORY  : 3');
        expect(out).toContain('SQLite untagged total   : 5');
        expect(out).toContain('--chroma');  // tells the operator the O(records) scan was skipped
    });

    test('formatCensus surfaces the Chroma debt when the scan was run', () => {
        const out = mod.formatCensus({
            graph     : {memory: 0, session: 0, total: 0, available: true},
            chromadb  : {memory: 1, session: 2, total: 3, available: true, untagged: {total: 4}},
            measuredAt: 'x'
        });

        expect(out).toContain('Chroma migration-debt total : 3');
        expect(out).toContain('untagged 4');
    });

    test('formatCensus surfaces an unavailable graph', () => {
        const out = mod.formatCensus({graph: {available: false, error: 'graph not mounted'}, measuredAt: 'x'});
        expect(out).toContain('unavailable');
    });

    test('runReport awaits readiness, inits the graph, calls getMigrationCensus, and prints', async () => {
        const calls  = [],
              lines  = [],
              census = {graph: {memory: 1, session: 0, total: 1, available: true}, measuredAt: 'x'};

        const result = await mod.runReport({
            lifecycle    : {ready: async () => { calls.push('ready'); }},
            graphService : {initAsync: async () => { calls.push('init'); }},
            healthService: {
                getMigrationCensus: async opts => { calls.push(['census', opts.includeChroma]); return census; }
            },
            includeChroma: true,
            json         : true,
            logger       : {log: line => lines.push(line)}
        });

        expect(result).toBe(census);
        // Readiness + graph init happen before the census query; the opt-in flag threads through.
        expect(calls).toEqual(['ready', 'init', ['census', true]]);
        expect(lines[0]).toContain('"memory": 1');  // --json emits raw payload
    });
});
