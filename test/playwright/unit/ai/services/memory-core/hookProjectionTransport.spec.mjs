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

        transport(fs).writeAtomic({targetId: 'abc123', channels: [{channel: 'computed-route'}]});

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

        transport(fs).writeAtomic({
            targetId: 'abc123',
            channels: [{channel: 'lifecycle-frontier', envelope: {items: []}}]
        });

        const body = JSON.parse(fs.calls.find(call => call[0] === 'write')[2]);

        expect(body).toEqual({channels: [{channel: 'lifecycle-frontier', envelope: {items: []}}]});
    });

    test('a failed write cleans up its temp sibling and re-throws the ORIGINAL failure', () => {
        const fs = makeFs({writeFileSync: () => { throw new Error('ENOSPC') }});

        expect(() => transport(fs).writeAtomic({targetId: 'abc123', channels: []})).toThrow(/ENOSPC/);

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
        expect(() => transport(fs).writeAtomic({targetId: 'abc123', channels: []})).toThrow(/ENOSPC/);
    });

    test('retries never collide — each attempt gets its own temp sibling', () => {
        const fs = makeFs(),
              tp = transport(fs);

        tp.writeAtomic({targetId: 'abc123', channels: []});
        tp.writeAtomic({targetId: 'abc123', channels: []});

        const temps = fs.calls.filter(call => call[0] === 'write').map(call => call[1]);

        expect(new Set(temps).size).toBe(2);
    });

    test('fails LOUD on an unbound root or fs — never a guessed path', () => {
        expect(() => makeAtomicProjectionTransport({fs: makeFs(), runtimeRoot: undefined, uniqueSuffix: () => 'x'}))
            .toThrow(/runtimeRoot is required from config/);
        expect(() => makeAtomicProjectionTransport({fs: undefined, runtimeRoot, uniqueSuffix: () => 'x'}))
            .toThrow(/fs with writeFileSync and renameSync/);
        expect(() => makeAtomicProjectionTransport({fs: makeFs(), runtimeRoot, uniqueSuffix: undefined}))
            .toThrow(/uniqueSuffix source must be injected/);
    });
});
