import {setup} from '../../../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'PlanePlacementCensusTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import fs             from 'fs';
import fsExtra        from 'fs-extra';
import path           from 'path';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * The placement census produces the cost rows a deployment election is decided on, so its two
 * classification rules are the assertions that matter — not its formatting.
 *
 * Both rules exist because a naive implementation gets them wrong in a way no reviewer would catch from
 * the output: a line-based match counts doc-comment MENTIONS of plane paths as code paths, and a
 * containment audit that only checks `existsSync` calls an escaping symlink "fine" because it resolves
 * perfectly on the host.
 */
test.describe.configure({mode: 'serial'});

test.describe('planePlacementCensus — the classification rules the election is priced on', () => {
    let stripComments, auditSeatContainment, censusPlaneOpeners, PLANE_DIR_NAME;
    let attributeWalSegment, normalizeSeatIdentity, resolveLatestWalSegment, WAL_DIR_NAME;
    let workRoot;

    test.beforeAll(async () => {
        ({
            stripComments,
            auditSeatContainment,
            censusPlaneOpeners,
            attributeWalSegment,
            normalizeSeatIdentity,
            resolveLatestWalSegment,
            PLANE_DIR_NAME,
            WAL_DIR_NAME
        } = await import('../../../../../../ai/scripts/diagnostics/planePlacementCensus.mjs'));

        workRoot = path.resolve(process.cwd(), 'tmp', `plane-census-${process.pid}-${Date.now()}`);
        fs.mkdirSync(workRoot, {recursive: true});
    });

    test.afterAll(() => {
        if (workRoot && fs.existsSync(workRoot)) {
            fs.rmSync(workRoot, {recursive: true, force: true});
        }
    });

    test('a plane path mentioned only in a COMMENT is not counted as a code path', () => {
        // The defect this closes inflated a first measurement by ~20%: JSDoc lines like
        // `* .neo-ai-data/embed-daemon/embed-daemon.log (post-hoc audit)` matched a line-based scan.
        const source = [
            '/**',
            ' * Writes to `.neo-ai-data/wake-daemon/heartbeat.alive` for the audit trail.',
            ' */',
            '// also mentions .neo-ai-data in a line comment',
            'export function unrelated() { return 1 }'
        ].join('\n');

        const stripped = stripComments(source);

        expect(stripped).not.toMatch(/\.neo-ai-data/);
        // Blanked, not deleted — offsets must survive so any caller can still report positions.
        expect(stripped).toHaveLength(source.length);
        expect(stripped).toContain('export function unrelated()');
    });

    test('a plane path in EXECUTABLE code survives stripping', () => {
        const source = "const p = '.neo-ai-data/sqlite'; // trailing comment mentions .neo-ai-data";

        expect(stripComments(source)).toMatch(/'\.neo-ai-data\/sqlite'/);
    });

    test('an unparseable file is returned unchanged rather than dropped from the census', () => {
        // Over-counting one broken file beats silently shrinking a census whose purpose is completeness.
        const broken = 'const = = =;  .neo-ai-data';

        expect(stripComments(broken)).toBe(broken);
    });

    test('a symlink resolving OUTSIDE the seat plane counts as an escape, not as healthy', () => {
        // The load-bearing rule. An escaping symlink resolves perfectly on the host, so an audit that
        // only asks "does it exist" reports containment that a bind-mount would not deliver.
        const seat      = path.join(workRoot, 'escaping-seat'),
              canonical = path.join(workRoot, 'canonical'),
              plane     = path.join(seat, PLANE_DIR_NAME);

        fsExtra.ensureDirSync(path.join(canonical, PLANE_DIR_NAME, 'sqlite'));
        fsExtra.ensureDirSync(plane);
        fs.symlinkSync(path.join(canonical, PLANE_DIR_NAME, 'sqlite'), path.join(plane, 'sqlite'), 'dir');

        const audit = auditSeatContainment({seat});

        expect(audit.present).toBe(true);
        expect(audit.symlinks).toBe(1);
        expect(audit.escapes).toBe(1);
        // It resolves fine on the host — which is exactly why the class stays invisible until containerised.
        expect(audit.dangling).toBe(0);
        expect(audit.escaped[0].name).toBe('sqlite');
    });

    test('a symlink resolving INSIDE the seat plane is contained, not an escape', () => {
        const seat  = path.join(workRoot, 'contained-seat'),
              plane = path.join(seat, PLANE_DIR_NAME);

        fsExtra.ensureDirSync(path.join(plane, 'real'));
        fs.symlinkSync(path.join(plane, 'real'), path.join(plane, 'alias'), 'dir');

        const audit = auditSeatContainment({seat});

        expect(audit.symlinks).toBe(1);
        expect(audit.escapes).toBe(0);
    });

    test('a seat with no plane directory reports absent rather than throwing', () => {
        const audit = auditSeatContainment({seat: path.join(workRoot, 'no-plane-here')});

        expect(audit.present).toBe(false);
        expect(audit.leaves).toBe(0);
    });

    // ───────── axis 3: per-seat WAL attribution (the falsified precision cap, mechanised) ─────────

    test('attribution reads agentIdentity and NEVER metadata.agent (the field that erased two seats)', async () => {
        // The load-bearing distinction. `agent` is caller-supplied and optional; a record that carries
        // only `agent` must count as unattributed, not be silently attributed to the caller label.
        const wal = path.join(workRoot, 'wal-field.jsonl');

        fs.writeFileSync(wal, [
            JSON.stringify({metadata: {agentIdentity: '@neo-opus-grace', agent: '@wrong'}}),
            JSON.stringify({metadata: {agent: '@neo-opus-ada'}}),               // agent-only -> unattributed
            JSON.stringify({metadata: {agentIdentity: '@neo-opus-grace'}})
        ].join('\n') + '\n');

        const result = await attributeWalSegment({walPath: wal});

        expect(result.records).toBe(3);
        expect(result.seats).toHaveLength(1);
        expect(result.seats[0].seat).toBe('@neo-opus-grace');
        expect(result.seats[0].records).toBe(2);
        // The agent-only record is unattributed, proving `agent` is never consulted.
        expect(result.unattributed.records).toBe(1);
    });

    test('the unattributed bucket is reported even when it is ZERO', async () => {
        // A fully-attributed segment must still expose the bucket. Omitting it at zero quotes shares of a
        // total the table did not measure — and the whole point of this axis is that the bucket reads 0.
        const wal = path.join(workRoot, 'wal-full.jsonl');

        fs.writeFileSync(wal, JSON.stringify({metadata: {agentIdentity: '@neo-opus-grace'}}) + '\n');

        const result = await attributeWalSegment({walPath: wal});

        expect(result.unattributed).toEqual({records: 0, bytes: 0});
    });

    test('a seat cannot split into two rows over the leading @', async () => {
        // `@neo-gpt` and `neo-gpt` are one seat; a table that treats them as two makes each look small.
        expect(normalizeSeatIdentity('neo-gpt')).toBe('@neo-gpt');
        expect(normalizeSeatIdentity('@neo-gpt')).toBe('@neo-gpt');
        expect(normalizeSeatIdentity('@@neo-gpt')).toBe('@neo-gpt');

        const wal = path.join(workRoot, 'wal-alias.jsonl');

        fs.writeFileSync(wal, [
            JSON.stringify({metadata: {agentIdentity: '@neo-gpt'}}),
            JSON.stringify({metadata: {agentIdentity: 'neo-gpt'}})
        ].join('\n') + '\n');

        const result = await attributeWalSegment({walPath: wal});

        expect(result.seats).toHaveLength(1);
        expect(result.seats[0].records).toBe(2);
    });

    test('shares sum to 1 across seats plus the unattributed bucket', async () => {
        const wal = path.join(workRoot, 'wal-shares.jsonl');

        fs.writeFileSync(wal, [
            JSON.stringify({metadata: {agentIdentity: '@a'}, pad: 'x'.repeat(50)}),
            JSON.stringify({metadata: {agentIdentity: '@b'}}),
            JSON.stringify({metadata: {}})
        ].join('\n') + '\n');

        const result    = await attributeWalSegment({walPath: wal});
        const seatShare = result.seats.reduce((sum, seat) => sum + seat.share, 0),
              absShare  = result.bytes ? result.unattributed.bytes / result.bytes : 0;

        expect(seatShare + absShare).toBeCloseTo(1, 10);
    });

    test('the latest WAL segment excludes derived .graph / .embedded projections', () => {
        // Counting a projection double-counts the same write under a different shape.
        const seat   = path.join(workRoot, 'wal-latest'),
              walDir = path.join(seat, PLANE_DIR_NAME, WAL_DIR_NAME);

        fsExtra.ensureDirSync(walDir);
        fs.writeFileSync(path.join(walDir, 'wal-2026-07-23.jsonl'), '{}\n');
        fs.writeFileSync(path.join(walDir, 'wal-2026-07-24.jsonl'), '{}\n');
        fs.writeFileSync(path.join(walDir, 'wal-2026-07-24.graph.jsonl'), '{}\n');
        fs.writeFileSync(path.join(walDir, 'wal-2026-07-24.embedded.jsonl'), '{}\n');

        const latest = resolveLatestWalSegment({planeRoot: path.join(seat, PLANE_DIR_NAME)});

        expect(path.basename(latest)).toBe('wal-2026-07-24.jsonl');
    });

    test('openers are bucketed three ways, and the buckets sum to the total', () => {
        // Three buckets, because folding an ambiguous module into whichever side tidies the total is the
        // unstated-classification problem this census exists to replace.
        const census = censusPlaneOpeners();

        expect(census.hostSide.length + census.inServer.length + census.unclassified.length).toBe(census.total);
        expect(census.total).toBeGreaterThan(0);
        // Host-side means invoked as its own process; a service is never host-side by this rule.
        expect(census.hostSide.every(file => /^(ai\/scripts|ai\/daemons|buildScripts)\//.test(file))).toBe(true);
        expect(census.inServer.every(file => /^(ai\/services|ai\/mcp)\//.test(file))).toBe(true);
    });
});
