import {setup} from '../../../../../../setup.mjs';

const appName = 'HeapObservationReporterTest';

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
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';
import fs             from 'fs';
// The service calls `fs-extra`'s `removeSync`, which node's own `fs` does not have. The cleanup
// falsifier below has to stub the module the production code actually reads — stubbing `node:fs`
// patches a property nothing calls, and the test then passes for a reason unrelated to its subject.
import fsExtra from 'fs-extra';
import os      from 'os';
import path    from 'path';
import HeapObservationReporterService
    from '../../../../../../../../ai/mcp/server/shared/services/HeapObservationReporterService.mjs';

/**
 * A real directory rather than a mocked `fs`. The contract under test is that a reader never sees a
 * fragment, and only a real write-then-rename can evidence that; a mocked filesystem would prove the
 * mock. The directory is a fresh temp per test — the shared `AiConfig` singleton is never mutated to
 * redirect a write, which is the mechanism that bled test data into live stores once already.
 */
const makeDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'neo-heap-observation-'));

test.describe('Neo.ai.mcp.server.shared.services.HeapObservationReporterService (#16763)', () => {
    test.afterEach(() => HeapObservationReporterService.stop());

    test('publishes one file per service, so a reader can tell whose heap it read', () => {
        const dir = makeDir();

        HeapObservationReporterService.writeOnce({serviceKey: 'mc-server', dir});
        HeapObservationReporterService.writeOnce({serviceKey: 'kb-server', dir});

        expect(fs.readdirSync(dir).sort()).toEqual(['kb-server.json', 'mc-server.json']);
    });

    test('the record marks itself self-reported and carries a real observation', () => {
        const dir = makeDir();

        expect(HeapObservationReporterService.writeOnce({serviceKey: 'mc-server', dir})).toBe(true);

        const record = fs.readJsonSync
            ? fs.readJsonSync(path.join(dir, 'mc-server.json'))
            : JSON.parse(fs.readFileSync(path.join(dir, 'mc-server.json'), 'utf8'));

        expect(record.recordType).toBe('process-heap-observation');
        expect(record.serviceKey).toBe('mc-server');
        // Marked, never inferred. Every other per-service fact in the snapshot is observed about the
        // process from outside; this one is the process vouching for itself, and the two fail in
        // different directions.
        expect(record.provenance).toBe('self-reported');
        expect(record.pid).toBe(process.pid);

        // A real capture from this process — not a fixture. If the collector regressed to reporting
        // an empty heap, this would catch it.
        expect(record.observation.state).toBe('observed');
        expect(record.observation.heapSizeLimitBytes).toBeGreaterThan(0);
        expect(record.observation.oldGenerationUsedBytes).toBeGreaterThan(0);
        expect(record.observation.rssBytes).toBeGreaterThan(0);
        expect(typeof record.observation.observedAt).toBe('number');
    });

    test('a later write replaces the earlier one — a reader sees one whole record, never two halves', () => {
        const dir    = makeDir(),
              target = path.join(dir, 'mc-server.json');

        HeapObservationReporterService.writeOnce({serviceKey: 'mc-server', dir});
        const first = JSON.parse(fs.readFileSync(target, 'utf8')).observation.observedAt;

        HeapObservationReporterService.writeOnce({serviceKey: 'mc-server', dir});
        const second = JSON.parse(fs.readFileSync(target, 'utf8')).observation.observedAt;

        expect(second).toBeGreaterThanOrEqual(first);
        // No staging residue: a `.tmp` left behind would eventually be read as a service's record.
        expect(fs.readdirSync(dir)).toEqual(['mc-server.json']);
    });

    test('a write failure degrades the channel and never the service', () => {
        // A path that cannot be created: the directory slot is occupied by a file.
        const dir     = makeDir(),
              blocked = path.join(dir, 'blocked'),
              levels  = [];

        fs.writeFileSync(blocked, 'not a directory');

        const wrote = HeapObservationReporterService.writeOnce({
            serviceKey: 'mc-server',
            dir       : path.join(blocked, 'nested'),
            writeLog  : (level, message) => levels.push([level, message])
        });

        expect(wrote).toBe(false);
        expect(levels[0][0]).toBe('WARN');
        expect(levels[0][1]).toContain('mc-server');
    });

    // ---- Totality at every boundary, not just the write. -----------------------------------------
    // A prior revision guarded only `outputJsonSync`/`renameSync`. Target resolution ran before the
    // try, and the failure path called an injected logger and `fs.removeSync` unguarded — so three
    // ordinary failures escaped a method the ticket promises is never fatal, into a host service's
    // boot. Each of these reds against that revision with a raw throw rather than a `false`.

    test('a LOGGER that throws cannot escape the failure path', () => {
        const dir     = makeDir(),
              blocked = path.join(dir, 'blocked');

        fs.writeFileSync(blocked, 'not a directory');

        expect(HeapObservationReporterService.writeOnce({
            serviceKey: 'mc-server',
            dir       : path.join(blocked, 'nested'),
            writeLog  : () => { throw new Error('logger down') }
        })).toBe(false);
    });

    test('a CLEANUP that throws cannot escape the failure path', () => {
        const dir      = makeDir(),
              blocked  = path.join(dir, 'blocked'),
              original = fsExtra.removeSync;

        fs.writeFileSync(blocked, 'not a directory');
        fsExtra.removeSync = () => { throw new Error('unlink refused') };

        try {
            expect(HeapObservationReporterService.writeOnce({
                serviceKey: 'mc-server',
                dir       : path.join(blocked, 'nested')
            })).toBe(false);
        } finally {
            fsExtra.removeSync = original;
        }
    });

    test('a TARGET that cannot be resolved is a false, not a throw', () => {
        // `path.resolve(undefined, …)` throws a TypeError before any write is attempted — the failure
        // that reached boot when resolution sat outside the guard.
        expect(HeapObservationReporterService.writeOnce({serviceKey: 'mc-server', dir: null})).toBe(false);
    });

    test('start() surfaces an unreadable CONFIG as false rather than into boot', () => {
        // `start()` runs inside `BaseServer.initAsync()`, so a throw here fails a whole MCP server's
        // startup over an observation lane. The config read is the one operation that runs before any
        // guard could report through a return value, which is why it is inside this one.
        //
        // This throws where PRODUCTION reads. The superseded seam was a default parameter,
        // `config = AiConfig.heapObservation`, and defaults evaluate before the body — so the shipped
        // read sat outside the `try` while this spec injected an object whose getter throws INSIDE it.
        // That arm passed against a boundary production never crossed. Failing the reader itself is
        // the same call the shipped path makes.
        const unreadable = () => { throw new Error('overlay unresolved') };

        expect(HeapObservationReporterService.start({serviceKey: 'mc-server', dir: makeDir(), readConfig: unreadable}))
            .toBe(false);
    });

    test('an unreadable config is caught at the READER, not merely at the leaf access', () => {
        // The distinction the default-parameter bug hid: a reader that throws on invocation models an
        // `AiConfig.heapObservation` read that fails outright — an unresolved overlay, a provider that
        // rejects — whereas a throwing `enabled` getter only models a failure one property deeper, and
        // is reachable from inside any guard. Both must be total; only the first was ever in doubt.
        const dir = makeDir();

        expect(() => HeapObservationReporterService.start({
            serviceKey: 'mc-server',
            dir,
            readConfig: () => { throw new Error('provider rejected the read') }
        })).not.toThrow();

        expect(HeapObservationReporterService.start({
            serviceKey: 'mc-server',
            dir,
            readConfig: () => ({get enabled() { throw new Error('leaf unresolved') }})
        })).toBe(false);

        // Neither arm started a cadence, so neither published.
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('start() survives a channel that can never be written', () => {
        // Returns true because the CADENCE started: the write's failure is reported through
        // `writeOnce()`, not by refusing to report at all. What matters at this call site is that
        // nothing escaped into the caller's boot.
        const dir     = makeDir(),
              blocked = path.join(dir, 'blocked');

        fs.writeFileSync(blocked, 'not a directory');

        expect(() => HeapObservationReporterService.start({
            serviceKey: 'mc-server',
            dir       : path.join(blocked, 'nested')
        })).not.toThrow();
    });

    test('a disabled channel starts nothing', () => {
        const dir = makeDir();

        expect(HeapObservationReporterService.start({serviceKey: 'mc-server', dir, readConfig: () => ({enabled: false})}))
            .toBe(false);
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('start() publishes immediately, before the first interval elapses', () => {
        const dir = makeDir();

        // A reader starting inside the first interval would otherwise see absence and report the
        // observation unavailable — correctly, and uselessly.
        expect(HeapObservationReporterService.start({serviceKey: 'mc-server', dir})).toBe(true);
        expect(fs.existsSync(path.join(dir, 'mc-server.json'))).toBe(true);
    });

    test('stop() is idempotent and start() does not stack timers', () => {
        const dir = makeDir();

        HeapObservationReporterService.start({serviceKey: 'mc-server', dir});
        HeapObservationReporterService.start({serviceKey: 'mc-server', dir});

        HeapObservationReporterService.stop();
        HeapObservationReporterService.stop();

        expect(HeapObservationReporterService.timer).toBeNull();
    });

    test('the published path is one file per service under the given directory', () => {
        expect(HeapObservationReporterService.observationPath('mc-server', '/tmp/x'))
            .toBe(path.resolve('/tmp/x', 'mc-server.json'));
    });
});
