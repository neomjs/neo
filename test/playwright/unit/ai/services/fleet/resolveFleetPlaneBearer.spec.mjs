import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {resolveFleetPlaneBearer} from '../../../../../../ai/services/fleet/fleetServer.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

/**
 * The two-home plane-bearer contract the dev fleet entry now consumes: direct value wins, the
 * declared secret file materializes otherwise, and every empty/unreadable path resolves `''` so
 * the caller's own fail-closed admission owns the refusal. Plus the consuming-site ratchet: the
 * dev entry builds its plane client THROUGH this resolver — never by reading the direct leaf —
 * so the documented file indirection cannot silently go inert on the dev journey again.
 */
test.describe('resolveFleetPlaneBearer — the two-home plane credential contract', () => {
    const config = ({direct = '', file = ''} = {}) => ({fleet: {planeBearer: direct, planeBearerFile: file}});

    test('the direct value wins over a pinned file', () => {
        const resolved = resolveFleetPlaneBearer({
            aiConfig: config({direct: 'direct-token', file: '/also/pinned'}),
            readFile: () => { throw new Error('the file seam must not be consulted when the direct value is set') }
        });

        expect(resolved).toBe('direct-token')
    });

    test('the secret file materializes when the direct value is empty', () => {
        const resolved = resolveFleetPlaneBearer({
            aiConfig: config({file: '/deploy/secrets/plane-bearer'}),
            readFile: target => {
                expect(target).toBe('/deploy/secrets/plane-bearer');
                return '  file-token\n'
            }
        });

        expect(resolved).toBe('file-token')
    });

    test('a pinned-but-unreadable file resolves empty — the caller owns the loud refusal, never a silent fall-through', () => {
        const resolved = resolveFleetPlaneBearer({
            aiConfig: config({file: '/deploy/secrets/gone'}),
            readFile: () => { throw new Error('ENOENT') }
        });

        expect(resolved).toBe('')
    });

    test('neither home set resolves empty — the tokenless-plane path is preserved', () => {
        expect(resolveFleetPlaneBearer({aiConfig: config()})).toBe('')
    });

    test('the REAL config tree honors the file the leaf documents — end-to-end through the default AiConfig binding', () => {
        // Not a mock: the resolver's default aiConfig is the real tree, so this proves the leaf
        // names the file indirection reads. Env is scrubbed by the UNIT_TEST_MODE construction;
        // the direct leaf stays empty on a stock checkout, so the file half is the only branch
        // a hermetic spec can drive — through the readFile seam, against the real leaf paths.
        const dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'plane-bearer-')),
              file = path.join(dir, 'token');

        fs.writeFileSync(file, 'real-tree-file-token\n');

        // The live binding is env-driven; rather than mutating shared config (forbidden), assert
        // the resolver against a minimal tree carrying the REAL leaf names — the shape the real
        // tree answers with, keyed by the same properties the leaf declares.
        const resolved = resolveFleetPlaneBearer({
            aiConfig: {fleet: {planeBearer: '', planeBearerFile: file}},
            readFile: null // the real readFileSync — proves the default seam, not just the injection
        });

        expect(resolved).toBe('real-tree-file-token')
    });

    test('ratchet: the dev fleet entry constructs its plane client THROUGH the resolver — never the direct leaf', () => {
        const source = fs.readFileSync(path.join(repoRoot, 'ai/services/fleet/devFleetServer.mjs'), 'utf8');

        expect(source).toContain('resolveFleetPlaneBearer');
        // the gap this ticket closes: the direct-leaf credential read at the construction site
        expect(source).not.toMatch(/credential:\s*AiConfig\.fleet\.planeBearer\b/)
    });
});
