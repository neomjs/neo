import {setup} from '../../../../setup.mjs';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

const appName = 'GraphLifecycleReportTest';

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

test.describe('graphLifecycleReport.mjs (#10158)', () => {
    let mod;

    test.beforeAll(async () => {
        mod = await import('../../../../../../ai/scripts/maintenance/graphLifecycleReport.mjs');
    });

    test('parseArgs defaults to the cheap census; --edges + --json opt in', () => {
        expect(mod.parseArgs([])).toEqual({includeIncidentEdges: false, json: false});
        expect(mod.parseArgs(['--edges', '--json'])).toEqual({includeIncidentEdges: true, json: true});
    });

    test('formatCensus renders the cheap fields and flags the omitted edge scan', () => {
        const out = mod.formatCensus({
            available     : true,
            memoryNodes   : 3,
            sessionNodes  : 2,
            sqliteBytes   : 4096,
            sqliteWalBytes: 0,
            sqliteShmBytes: 0,
            measuredAt    : '2026-06-05T20:00:00.000Z'
        });

        expect(out).toContain('MEMORY nodes  : 3');
        expect(out).toContain('SESSION nodes : 2');
        expect(out).toContain('--edges');  // tells the operator the O(edges) scan was skipped
    });

    test('formatCensus surfaces an unavailable graph', () => {
        const out = mod.formatCensus({available: false, error: 'Graph SQLite storage is unavailable.'});
        expect(out).toContain('unavailable');
    });

    test('runReport awaits readiness, calls getLifecycleCensus, and prints', async () => {
        const calls  = [],
              lines  = [],
              census = {
                  available: true, memoryNodes: 1, sessionNodes: 1,
                  sqliteBytes: 0, sqliteWalBytes: 0, sqliteShmBytes: 0, measuredAt: 'x'
              };

        const result = await mod.runReport({
            lifecycle   : {ready: async () => { calls.push('ready'); }},
            graphService: {
                initAsync         : async () => { calls.push('init'); },
                getLifecycleCensus: async opts => { calls.push(['census', opts.includeIncidentEdges]); return census; }
            },
            includeIncidentEdges: true,
            json                : true,
            logger              : {log: line => lines.push(line)}
        });

        expect(result).toBe(census);
        // Readiness + init happen before the census query; the opt-in flag threads through.
        expect(calls).toEqual(['ready', 'init', ['census', true]]);
        expect(lines[0]).toContain('"memoryNodes": 1');  // --json emits raw payload
    });
});
