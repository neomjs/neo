import {setup} from '../../../../setup.mjs';

const appName = 'HookProjectionTransportTest';

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
 * The transport's two properties: the path follows from admission rather than from a caller argument,
 * and a reader never sees a half-written projection.
 */
test.describe('hookProjectionTransport — derived path, atomic publication', () => {
    let makeAtomicProjectionTransport;

    const runtimeRoot = '/runtime/mc';

    // An fs double that records the ORDER of operations — ordering is the property under test, and a
    // double that only recorded final state could not distinguish flush-then-rename from the reverse.
    const makeFs = (overrides = {}) => {
        const
            calls = [],
            api   = {
                calls,
                mkdirSync    : (dir, opts) => calls.push(['mkdir', dir, opts?.recursive]),
                writeFileSync: (path, body) => calls.push(['write', path, body]),
                renameSync   : (from, to) => calls.push(['rename', from, to]),
                openSync     : path => { calls.push(['open', path]); return 42 },
                fsyncSync    : handle => calls.push(['fsync', handle]),
                closeSync    : handle => calls.push(['close', handle]),
                unlinkSync   : path => calls.push(['unlink', path]),
                readdirSync  : () => calls.push(['readdir']) || [],
                ...overrides
            };

        return api
    };

    let suffix = 0;

    const transport = (fs, overrides = {}) => makeAtomicProjectionTransport({
        fs,
        runtimeRoot,
        uniqueSuffix: () => `t${++suffix}`,
        ...overrides
    });

    test.beforeAll(async () => {
        ({makeAtomicProjectionTransport} = await import('../../../../../../ai/services/memory-core/hookProjectionTransport.mjs'))
    });

    test.beforeEach(() => { suffix = 0 });

    test('the path is DERIVED from the target id under the owned root — never supplied', () => {
        const {resolveTargetPath} = transport(makeFs());

        expect(resolveTargetPath('abc123')).toEqual({
            dir : '/runtime/mc/abc123',
            file: '/runtime/mc/abc123/current.json'
        });
    });

    test('a targetId that is not an opaque token is refused at the filesystem boundary', () => {
        const {resolveTargetPath} = transport(makeFs());

        // The id is server-derived, but this is where it BECOMES a path — a traversal segment reaching
        // here would escape the Memory-Core-owned root, so it is re-checked rather than trusted.
        expect(() => resolveTargetPath('../../etc/passwd')).toThrow(/opaque server-derived token/);
        expect(() => resolveTargetPath('a/b')).toThrow(/opaque server-derived token/);
        expect(() => resolveTargetPath('')).toThrow(/opaque server-derived token/);
    });

    test('flush precedes rename, and the temp sibling is unique and same-directory', () => {
        const fs = makeFs();

        transport(fs).writeAtomic({targetId: 'abc123', envelope: {schemaVersion: 'live-lane-awareness-projection.v1'}});

        const ops = fs.calls.map(call => call[0]);

        // Durability before visibility: a rename that beats its own data to disk publishes a
        // complete-LOOKING file with a torn body after a crash — the one outcome a reader cannot detect.
        expect(ops).toEqual(['mkdir', 'write', 'open', 'fsync', 'close', 'rename']);

        const write  = fs.calls.find(call => call[0] === 'write'),
              rename = fs.calls.find(call => call[0] === 'rename');

        // same directory ⇒ the rename is same-filesystem, hence atomic
        expect(write[1]).toBe('/runtime/mc/abc123/current.json.t1.tmp');
        expect(rename[1]).toBe(write[1]);
        expect(rename[2]).toBe('/runtime/mc/abc123/current.json');
    });

    test('the payload is written whole, before any rename makes it visible', () => {
        const fs = makeFs();

        // The transport writes the writer's envelope VERBATIM. Reshaping it here would make the
        // transport a second, silent author of a contract it does not own.
        const envelope = {
            schemaVersion   : 'live-lane-awareness-projection.v1',
            publication     : {targetId: 'abc123', fencingEpoch: 3, generatedAt: 1, producerWatermarks: {}},
            lifecycleActions: {status: 'fresh', envelope: {items: []}},
            notAuthority    : true
        };

        transport(fs).writeAtomic({targetId: 'abc123', envelope});

        const body = JSON.parse(fs.calls.find(call => call[0] === 'write')[2]);

        expect(body).toEqual(envelope);
    });

    test('a failed write cleans up its temp sibling and re-throws the ORIGINAL failure', () => {
        const fs = makeFs({writeFileSync: () => { throw new Error('ENOSPC') }});

        expect(() => transport(fs).writeAtomic({targetId: 'abc123', envelope: {}})).toThrow(/ENOSPC/);

        // the reader also scans this root, so a failed attempt must not leave debris behind
        expect(fs.calls.some(call => call[0] === 'unlink')).toBe(true);
        expect(fs.calls.some(call => call[0] === 'rename')).toBe(false);
    });

    test('a cleanup failure never masks the real error', () => {
        const fs = makeFs({
            writeFileSync: () => { throw new Error('ENOSPC') },
            unlinkSync   : () => { throw new Error('cleanup exploded') }
        });

        // The caller needs the cause, not the janitor's complaint.
        expect(() => transport(fs).writeAtomic({targetId: 'abc123', envelope: {}})).toThrow(/ENOSPC/);
    });

    test('retries never collide — each attempt gets its own temp sibling', () => {
        const fs = makeFs(),
              tp = transport(fs);

        tp.writeAtomic({targetId: 'abc123', envelope: {}});
        tp.writeAtomic({targetId: 'abc123', envelope: {}});

        const temps = fs.calls.filter(call => call[0] === 'write').map(call => call[1]);

        expect(new Set(temps).size).toBe(2);
    });

    test('sweepOrphans removes a crashed holder\'s temp siblings and nothing else', () => {
        const entries = ['current.json', 'current.json.t7.tmp', 'current.json.t8.tmp', 'notes.txt'],
              removed = [];

        const fs = makeFs({
            readdirSync: () => entries,
            unlinkSync : path => removed.push(path)
        });

        const {sweepOrphans} = transport(fs),
              {swept}        = sweepOrphans('abc123');

        // A crashed holder never reached its own cleanup, and nothing else will ever remove its litter:
        // the process is gone, and the next holder is the only party that knows the target is unowned.
        expect(swept).toEqual(['current.json.t7.tmp', 'current.json.t8.tmp']);
        // the published file and unrelated entries are untouched — a sweep that ate current.json would
        // turn litter-collection into an outage
        expect(removed).toEqual(['/runtime/mc/abc123/current.json.t7.tmp', '/runtime/mc/abc123/current.json.t8.tmp']);
    });

    test('a sweep failure is survivable — litter must never deny a publication', () => {
        const fs = makeFs({
            readdirSync: () => { throw new Error('EACCES') }
        });

        // Refusing to publish because cleanup failed would let a litter problem masquerade as an
        // availability one.
        expect(transport(fs).sweepOrphans('abc123')).toEqual({swept: []});

        const unlinkBlocked = makeFs({
            readdirSync: () => ['current.json.t1.tmp'],
            unlinkSync : () => { throw new Error('EPERM') }
        });

        expect(transport(unlinkBlocked).sweepOrphans('abc123')).toEqual({swept: []});
    });

    test('fails LOUD on an unbound root or fs — never a guessed path', () => {
        expect(() => makeAtomicProjectionTransport({fs: makeFs(), runtimeRoot: undefined, uniqueSuffix: () => 'x'}))
            .toThrow(/runtimeRoot is required from config/);
        expect(() => makeAtomicProjectionTransport({fs: undefined, runtimeRoot, uniqueSuffix: () => 'x'}))
            .toThrow(/must implement mkdirSync/);

        // Durability is NOT optional: an fs that can write and rename but cannot flush would publish a
        // complete-LOOKING file with a torn body after a crash. Treating fsync as best-effort meant a
        // test double could silently bless that downgrade — so the contract refuses the fs instead.
        const noFlush = {
            mkdirSync: () => {}, writeFileSync: () => {}, renameSync: () => {}, unlinkSync: () => {}
        };

        expect(() => makeAtomicProjectionTransport({fs: noFlush, runtimeRoot, uniqueSuffix: () => 'x'}))
            .toThrow(/must implement openSync — durability is not optional/);
        expect(() => makeAtomicProjectionTransport({fs: makeFs(), runtimeRoot, uniqueSuffix: undefined}))
            .toThrow(/uniqueSuffix source must be injected/);
    });
});
