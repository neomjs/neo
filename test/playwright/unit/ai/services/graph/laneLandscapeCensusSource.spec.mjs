import {setup} from '../../../../setup.mjs';

const appName = 'LaneLandscapeCensusSourceTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Contract tests for the graph census source adapter: it must read the SQLite source of truth (not the
 * lazy in-memory stores), match both node vintages, stay read-only, and resolve its handle at call time.
 */
test.describe('laneLandscapeCensusSource — the graph census reads', () => {
    let makeLandscapeCensusSource;

    // A minimal prepare/all stub capturing the SQL + bound params.
    const stubDb = (rowsBySql = {}) => {
        const calls = [];

        return {
            calls,
            prepare(sql) {
                return {
                    all: (...params) => {
                        calls.push({sql, params});
                        const key = Object.keys(rowsBySql).find(fragment => sql.includes(fragment));
                        return key ? rowsBySql[key] : []
                    }
                }
            }
        }
    };

    test.beforeAll(async () => {
        ({makeLandscapeCensusSource} = await import('../../../../../../ai/services/graph/laneLandscapeCensusSource.mjs'));
    });

    test('reads OPEN issue nodes matching BOTH row vintages — a flat-only match would under-report the census', async () => {
        const db     = stubDb({'FROM Nodes': [{id: 'issue-1', data: '{}'}]}),
              source = makeLandscapeCensusSource({getDb: () => db}),
              rows   = await source.queryOpenIssueNodes();

        expect(rows).toEqual([{id: 'issue-1', data: '{}'}]);

        const sql = db.calls[0].sql;
        // both the `properties`-nested and the flat state shapes, or the landscape silently omits work
        expect(sql).toContain(`json_extract(n.data, '$.properties.state') = 'OPEN'`);
        expect(sql).toContain(`json_extract(n.data, '$.state') = 'OPEN'`);
        expect(sql).toContain(`n.id LIKE 'issue-%'`);
    });

    test('reads only the landscape edge types, bound as params, in ONE query (never an N+1 walk)', async () => {
        const db     = stubDb({'FROM Edges': [{source: 'issue-1', target: 'issue-2', type: 'PARENT_OF'}]}),
              source = makeLandscapeCensusSource({getDb: () => db});

        await source.queryRelationEdges();

        expect(db.calls).toHaveLength(1);
        expect(db.calls[0].params).toEqual(['PARENT_OF', 'BLOCKS']);
        expect(db.calls[0].sql).toContain('WHERE type IN (?, ?)');
    });

    test('is read-only by construction — both statements are SELECTs', async () => {
        const db     = stubDb(),
              source = makeLandscapeCensusSource({getDb: () => db});

        await source.queryOpenIssueNodes();
        await source.queryRelationEdges();

        for (const {sql} of db.calls) {
            expect(sql.trim().toUpperCase().startsWith('SELECT')).toBe(true);
            expect(sql).not.toMatch(/INSERT|UPDATE|DELETE|DROP/i);
        }
    });

    test('resolves the handle at CALL time — a module-load capture would read a dead db after re-open', async () => {
        let current = null;

        const source = makeLandscapeCensusSource({getDb: () => current});

        // unavailable at first call: throws so buildLaneLandscape degrades honestly rather than
        // reporting an empty census as a complete landscape
        await expect(source.queryOpenIssueNodes()).rejects.toThrow(/graph SQLite handle is unavailable/);

        current = stubDb({'FROM Nodes': [{id: 'issue-9', data: '{}'}]});

        expect(await source.queryOpenIssueNodes()).toEqual([{id: 'issue-9', data: '{}'}]);
    });

    test('fails LOUD without a getDb resolver — an unbound source is a wiring bug', () => {
        expect(() => makeLandscapeCensusSource({})).toThrow(/injected `getDb` resolver is required/);
    });
});
