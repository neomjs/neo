import {setup}                       from '../../../../setup.mjs';
import {test, expect}                from '@playwright/test';
import Neo                           from '../../../../../../src/Neo.mjs';
import * as core                     from '../../../../../../src/core/_export.mjs';
import {wireFleetActivityReadSource} from '../../../../../../ai/services/fleet/wireFleetActivityReadSource.mjs';
import fs                            from 'node:fs';
import os                            from 'node:os';
import path                          from 'node:path';

/**
 * @summary Contract of the composer→bridge wiring: it INSTALLS a real composed source, never a stub,
 * and degrades honestly. The live wired/degraded receipt is the running-devFleetServer e2e's concern
 * (it needs the real memory-core singletons); this unit pins the pure wiring decisions with an
 * injected bridge + composer factory — no Neo instance, no real singletons.
 */
test.describe('Neo.ai.services.fleet.wireFleetActivityReadSource', () => {
    const stubBridge = () => ({activitySource: 'UNTOUCHED'});

    test('fail-soft: neither slot readable → returns null and leaves the bridge unwired (never fabricates)', () => {
        const bridge = stubBridge();

        const result = wireFleetActivityReadSource({bridge, createSource: () => ({readActivitySnapshot() {}})});

        expect(result).toBeNull();
        // the by-construction not-wired default must stand — no fabricated source installed
        expect(bridge.activitySource).toBe('UNTOUCHED');
    });

    test('both sources present → installs the composed source and hands the factory BOTH slot readers', () => {
        const bridge   = stubBridge();
        let   captured = null;
        const created  = {readActivitySnapshot() {}};

        const result = wireFleetActivityReadSource({
            issuesDir   : '/synced/issues',
            listMessages: () => [],
            graphService: {},
            limit       : 25,
            bridge,
            createSource: opts => { captured = opts; return created }
        });

        expect(result).toBe(created);
        expect(bridge.activitySource).toBe(created);
        expect(typeof captured.readA2ASnapshot).toBe('function');
        expect(typeof captured.readPrLaneSnapshot).toBe('function');
        expect(captured.limit).toBe(25);
    });

    test('an ABSENT slot source degrades honestly — its reader throws (contained by the composer), never a fabricated read', async () => {
        // Only the PR/lane source is present; the A2A slot has no listMessages.
        let captured = null;
        wireFleetActivityReadSource({
            issuesDir   : '/synced/issues',
            bridge      : stubBridge(),
            createSource: opts => { captured = opts; return {readActivitySnapshot() {}} }
        });

        // The A2A reader must throw (so the composer's per-slot catch degrades it naming the slot),
        // rather than silently returning an empty-but-'wired'-looking snapshot.
        await expect((async () => captured.readA2ASnapshot({limit: 5}))()).rejects.toThrow(/a2a activity source not wired/);
        // The present PR/lane slot is a real reader, not the throwing sentinel.
        expect(typeof captured.readPrLaneSnapshot).toBe('function');
    });

    test('a CONFIGURED-but-unreadable pullsDir degrades the PR/lane slot — degraded capability + source-degraded event', async () => {
        // Absent-vs-unreadable: a configured pulls directory that cannot be collected must reach
        // makeReadPrLaneSnapshot's catch → the builder's `error` path (degraded), NOT masquerade as a
        // 'wired' empty snapshot. issuesDir is a real empty temp dir; the reader throws first on the
        // missing pullsDir, so the issue/stall readers never run.
        const issuesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'synced-issues-'));
        let   captured  = null;

        try {
            wireFleetActivityReadSource({
                issuesDir,
                pullsDir    : path.join(issuesDir, 'no-such-pulls'),
                bridge      : stubBridge(),
                createSource: opts => { captured = opts; return {readActivitySnapshot() {}} }
            });

            const snapshot = await captured.readPrLaneSnapshot({limit: 5});

            expect(snapshot.capability.state).toBe('degraded');
            expect(snapshot.events.some(event => event.type === 'source-degraded')).toBe(true)
        } finally {
            fs.rmSync(issuesDir, {recursive: true, force: true})
        }
    });
});
