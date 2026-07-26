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
    let listCensusFiles, PLANE_PATH_SOURCE, CENSUS_SELF_PATH;
    let readDeclaredPlaneMembers, buildPlanePathSource, PLANE_MEMBER_CONFIGS;
    let workRoot;

    test.beforeAll(async () => {
        ({
            stripComments,
            auditSeatContainment,
            censusPlaneOpeners,
            attributeWalSegment,
            normalizeSeatIdentity,
            resolveLatestWalSegment,
            listCensusFiles,
            PLANE_PATH_SOURCE,
            CENSUS_SELF_PATH,
            PLANE_DIR_NAME,
            WAL_DIR_NAME,
            readDeclaredPlaneMembers,
            buildPlanePathSource,
            PLANE_MEMBER_CONFIGS
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

    // ───────── review fixes: the census must not count itself, must see all plane leaves, must split escape/dangle ─────────

    test('the census EXCLUDES itself from its own domain (a verifier must not move its own baseline)', () => {
        // Committed, this file matches its own opener rule, so counting it shifts the total by one on commit.
        expect(listCensusFiles()).not.toContain(CENSUS_SELF_PATH);
    });

    // ───────── the matcher reconciles against the declared contract, not a name shape ─────────

    test('EVERY declared plane member matches when read through a config carrier', () => {
        // The invariant, asserted over the whole live set rather than a pinned example: a member that
        // stops matching is a module the census stops counting, and the election is priced on that count.
        const members = readDeclaredPlaneMembers();

        expect(members.length).toBeGreaterThan(0);

        for (const member of members) {
            expect(PLANE_PATH_SOURCE.test(`AiConfig.${member}`), `declared member "${member}" must match`).toBe(true);
        }
    });

    test('the declared set CONTAINS members no Path/Dir name shape could reach — the false negatives', () => {
        // Why the proxy had to go, proven from the contract instead of from an example that can be edited
        // away: members exist whose name does not end Path/Dir, or that sit behind a dotted trail the old
        // `[A-Za-z]*` could not cross. `fleet.instanceRoot` and `memoryWal.daemonDataDir` are both.
        const members   = readDeclaredPlaneMembers(),
              nameShape = /^[A-Za-z]*(?:Path|Dir)$/;

        expect(members.some(member => !nameShape.test(member))).toBe(true);

        // And the proxy itself, reconstructed, misses them — so this is the old behaviour, not a guess.
        const proxy = /\b[Aa]iConfig\.[A-Za-z]*(?:Path|Dir)\b/;

        expect(members.some(member => !proxy.test(`AiConfig.${member}`))).toBe(true);
    });

    test('a *Path/*Dir leaf that is NOT a declared member is not a plane reference — the false positives', () => {
        // The larger half of the defect, and the one the ticket did not predict: `neoRootDir` is the REPO
        // root and `hierarchyPath` is `docs/output/class-hierarchy.json`. Both merely END in Dir/Path, and
        // the shape proxy counted every module reading them — eleven knowledge-base sources among them —
        // as plane openers, pricing a volume decision on files a volume decision does not touch.
        const members = readDeclaredPlaneMembers();

        // Guarded, so a future membership change reports WHY this flipped instead of just going red.
        expect(members).not.toContain('neoRootDir');
        expect(members).not.toContain('hierarchyPath');

        expect(PLANE_PATH_SOURCE.test('aiConfig.neoRootDir')).toBe(false);
        expect(PLANE_PATH_SOURCE.test('AiConfig.hierarchyPath')).toBe(false);
        expect(PLANE_PATH_SOURCE.test('AiConfig.vectorDimension')).toBe(false);
    });

    test('the carrier is any *Config identifier, not AiConfig alone', () => {
        // Both WAL daemons read `memoryCoreConfig.*` and the shared logger reads `loggerConfig.logPath`.
        // Requiring the AiConfig spelling left all three uncounted while they opened the plane.
        const source = buildPlanePathSource(['memoryWal.daemonDataDir', 'logPath']);

        expect(source.test('memoryCoreConfig.memoryWal.daemonDataDir')).toBe(true);
        expect(source.test('loggerConfig.logPath')).toBe(true);
        expect(source.test('this.aiConfig.logPath')).toBe(true);
        // The carrier still has to BE a config — a same-named property on anything else is not a plane read.
        expect(source.test('options.logPath')).toBe(false);
        expect(source.test('this.logPath')).toBe(false);
    });

    test('a member carrying a regex metacharacter is matched LITERALLY, not interpreted', () => {
        // CodeQL's catch on this PR, and it is not hypothetical: `$` is legal in a JS identifier, so a leaf
        // named `$foo` is a real declaration. Escaping only the dot separator left `$` as an end-anchor, and
        // the matcher then silently stopped matching the member it had just been built from — the exact
        // silent-false-negative class this census exists to remove, reintroduced by its own builder.
        const source = buildPlanePathSource(['fleet.$instanceRoot', 'plain.leaf']);

        expect(source.test('AiConfig.fleet.$instanceRoot')).toBe(true);
        expect(source.test('AiConfig.plain.leaf')).toBe(true);
        // The dot is still a separator, never a wildcard — `plainXleaf` is a different identifier.
        expect(source.test('AiConfig.plainXleaf')).toBe(false);
    });

    test('reconciliation is BIDIRECTIONAL — a member removed from the contract stops being counted', () => {
        // The half a purely additive fix would miss: the matcher is BUILT from the set, so shrinking the
        // set shrinks the matcher. Asserted on a fixture, because asserting it on the live contract would
        // require removing a real member to prove it.
        const before = buildPlanePathSource(['alpha.one', 'beta.two']),
              after  = buildPlanePathSource(['alpha.one']);

        expect(before.test('AiConfig.beta.two')).toBe(true);
        expect(after.test('AiConfig.beta.two')).toBe(false);
        expect(after.test('AiConfig.alpha.one')).toBe(true);
    });

    test('the root-reference and storagePaths branches survive — they are a different signal', () => {
        // `.neo-ai-data` detects a module resolving the plane ROOT directly rather than through a leaf.
        // `storagePaths.` stays literal because `graphProd` declares planeMember:false with a reason that
        // says the decision is still OPEN, while the graph SQLite is the plane's core artifact — dropping
        // it would un-count ~10 graph consumers on the strength of a placeholder.
        expect(PLANE_PATH_SOURCE.test('config.storagePaths.graph')).toBe(true);
        expect(PLANE_PATH_SOURCE.test("'.neo-ai-data/sqlite'")).toBe(true);
        expect(PLANE_PATH_SOURCE.test('NEO_AI_DATA')).toBe(true);
        expect(PLANE_PATH_SOURCE.test('aiDataRoot')).toBe(true);
    });

    test('the member set is read from ALL declaring configs, not Tier 1 alone', () => {
        // Reading only `ai/configBase.mjs` is how both WAL daemons stayed invisible: their members are
        // declared by the memory-core server config. The exact roster keeps a newly-declared config
        // from being omitted while the union still looks plausible.
        const all        = readDeclaredPlaneMembers(),
              tier1      = readDeclaredPlaneMembers({configs: ['ai/configBase.mjs']}),
              neuralLink = readDeclaredPlaneMembers({
                  configs: ['ai/mcp/server/neural-link/configBase.mjs']
              });

        expect(PLANE_MEMBER_CONFIGS).toEqual([
            'ai/configBase.mjs',
            'ai/mcp/server/memory-core/configBase.mjs',
            'ai/mcp/server/knowledge-base/configBase.mjs',
            'ai/mcp/server/neural-link/configBase.mjs'
        ]);
        expect(neuralLink).toEqual(['logPath']);
        expect(all.length).toBeGreaterThan(tier1.length);
        expect(all).toEqual([...all].sort());
        // Union, not concatenation — `logPath` is declared by three server configs.
        expect(new Set(all).size).toBe(all.length);
    });

    test('a config that stops declaring its members FAILS LOUD rather than shrinking the census', () => {
        // The failure mode a measurement instrument must not have: an empty member set still produces a
        // perfectly plausible, much smaller total that no reviewer would question.
        const bare = path.join(workRoot, 'bare-config');

        fs.mkdirSync(path.join(bare, 'ai'), {recursive: true});
        fs.writeFileSync(path.join(bare, 'ai', 'configBase.mjs'), 'export const SOMETHING_ELSE = 1;\n');

        expect(() => readDeclaredPlaneMembers({projectRoot: bare, configs: ['ai/configBase.mjs']}))
            .toThrow(/exports no PLANE_MEMBER_PATHS/);

        // And a matcher can never be built from nothing, whatever produced the empty set.
        expect(() => buildPlanePathSource([])).toThrow(/empty member set/);
    });

    test('a symlink that is BOTH escaping AND dangling reports both, not just dangling', async () => {
        // The fallthrough @neo-gpt-emmy found: the escape check used realpathSync, which throws on a dangling
        // link, so a link pointing OUTSIDE the root to a NON-EXISTENT target counted as dangling only.
        const seat  = path.join(workRoot, 'escape-and-dangle'),
              plane = path.join(seat, PLANE_DIR_NAME);

        await fsExtra.ensureDir(plane);
        // Target is outside the plane root AND does not exist.
        fs.symlinkSync(path.join(workRoot, 'nonexistent-external', 'sqlite'), path.join(plane, 'sqlite'), 'dir');

        const audit = auditSeatContainment({seat});

        expect(audit.symlinks).toBe(1);
        expect(audit.dangling).toBe(1);
        expect(audit.escapes).toBe(1);              // <- the fact the old fallthrough dropped
        expect(audit.escaped[0].dangling).toBe(true);
    });

    test('a CHAINED escape is caught — link text reads inside but an intermediate symlink carries it out', async () => {
        // @neo-gpt-emmy's cycle-2 falsifier. A lexical-only resolver reads the link text `sub/x`, sees it
        // stay under the plane, and calls it contained — but `sub` is itself a symlink pointing OUTSIDE, so
        // the real target escapes. Only canonical resolution of an existing link follows that chain.
        const seat     = path.join(workRoot, 'chained-escape'),
              plane    = path.join(seat, PLANE_DIR_NAME),
              external = path.join(workRoot, 'chained-external');

        await fsExtra.ensureDir(path.join(external, 'x'));
        await fsExtra.ensureDir(plane);
        // `sub` -> outside the plane; then `entry` -> `sub/x`, whose TEXT stays under the plane.
        fs.symlinkSync(external, path.join(plane, 'sub'), 'dir');
        fs.symlinkSync(path.join(plane, 'sub', 'x'), path.join(plane, 'entry'), 'dir');

        const audit   = auditSeatContainment({seat}),
              escaped = audit.escaped.map(item => item.name);

        // Both the intermediate `sub` and the chained `entry` resolve outside the plane.
        expect(escaped).toContain('sub');
        expect(escaped).toContain('entry');   // <- the fact a lexical-only resolver dropped
    });

    test('a dangling symlink INSIDE the plane root is dangling but NOT escaping', async () => {
        // The orthogonality must hold both ways: dangling does not imply escaping.
        const seat  = path.join(workRoot, 'dangle-inside'),
              plane = path.join(seat, PLANE_DIR_NAME);

        await fsExtra.ensureDir(plane);
        fs.symlinkSync(path.join(plane, 'gone'), path.join(plane, 'alias'), 'dir');

        const audit = auditSeatContainment({seat});

        expect(audit.dangling).toBe(1);
        expect(audit.escapes).toBe(0);
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
