import {test, expect}     from '@playwright/test';
import {mkdtempSync,
        mkdirSync,
        writeFileSync,
        rmSync}           from 'node:fs';
import {tmpdir}        from 'node:os';
import path            from 'node:path';
import {spawnSync}     from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
    buildLogicalIndex,
    findLogicalIdentityCollisions,
    findOrdinalMisplacements,
    listArchiveFamilies
} from '../../../../buildScripts/util/check-content-logical-identity.mjs';

// buildScripts -> unit -> playwright -> test -> repo root
const GUARD = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../buildScripts/util/check-content-logical-identity.mjs'
);

/**
 * The commit-time half of the corpus logical-identity invariant.
 *
 * These run against a TEMP archive tree rather than `resources/content`, for two reasons. The real
 * corpus can carry pre-existing collisions, so a spec reading it would assert today's damage and
 * start failing the moment the repair lands — a fixture that inverts. And the behaviour under test is
 * "does a deliberately reintroduced duplicate fail the check", which needs a duplicate the spec
 * created; observing a pre-existing one proves only that the corpus is broken, not that the guard works.
 */
test.describe('check-content-logical-identity — the commit-time corpus invariant (#16057)', () => {

    let archiveRoot;

    const artifact = (family, version, chunk, name) => {
        const dir = path.join(archiveRoot, family, version, chunk);

        mkdirSync(dir, {recursive: true});
        writeFileSync(path.join(dir, name), `# ${name}\n`, 'utf8');

        return path.join(dir, name)
    };

    test.beforeEach(() => {
        archiveRoot = path.join(mkdtempSync(path.join(tmpdir(), 'neo-archive-')), 'archive')
    });

    test.afterEach(() => {
        rmSync(path.dirname(archiveRoot), {force: true, recursive: true})
    });

    test('a clean corpus reports nothing', () => {
        artifact('pulls', 'v13.0.0', 'chunk-1', 'pr-1.md');
        artifact('pulls', 'v13.0.0', 'chunk-2', 'pr-2.md');

        expect(findLogicalIdentityCollisions({archiveRoot})).toEqual([])
    });

    test('a duplicate reintroduced across chunks FAILS — the defect this exists to catch', () => {
        const first              = artifact('pulls', 'v13.0.0', 'chunk-1', 'pr-11982.md'),
              second             = artifact('pulls', 'v13.0.0', 'chunk-10', 'pr-11982.md'),
              [finding, ...rest] = findLogicalIdentityCollisions({archiveRoot});

        expect(rest).toEqual([]);
        expect(finding.key).toBe('pulls/pr-11982.md');
        expect(finding.paths.sort()).toEqual([first, second].sort())
    });

    test('the same logical name under two VERSION buckets is the same defect', () => {
        // Scope is the family, not the bucket: a consumer keys on `pulls/pr-7`, and a pull request
        // belongs to exactly one release. Per-bucket scoping would report green on this.
        artifact('pulls', 'v13.0.0', 'chunk-1', 'pr-7.md');
        artifact('pulls', 'v13.1.0', 'chunk-1', 'pr-7.md');

        expect(findLogicalIdentityCollisions({archiveRoot}).map(item => item.key)).toEqual(['pulls/pr-7.md'])
    });

    test('the same name in DIFFERENT families is not a collision', () => {
        // `issue-5` and `pr-5` are distinct logical names; so are two families' identically-named
        // artifacts. Keying on the bare basename would fire here and train everyone to ignore it.
        artifact('issues', 'v13.0.0', 'chunk-1', 'shared-name.md');
        artifact('discussions', 'v13.0.0', 'chunk-1', 'shared-name.md');

        expect(findLogicalIdentityCollisions({archiveRoot})).toEqual([])
    });

    test('targets restrict reporting to what the change touched — a pre-existing pair is not this commit\'s', () => {
        artifact('pulls', 'v13.0.0', 'chunk-1', 'pr-100.md');
        artifact('pulls', 'v13.0.0', 'chunk-9', 'pr-100.md');

        const untouched = artifact('pulls', 'v13.0.0', 'chunk-3', 'pr-200.md');

        // staging an unrelated artifact must not fail on damage the commit never touched…
        expect(findLogicalIdentityCollisions({archiveRoot, targets: [untouched]})).toEqual([]);

        // …while staging either side of the pair reports it.
        expect(findLogicalIdentityCollisions({
            archiveRoot,
            targets: [path.join(archiveRoot, 'pulls/v13.0.0/chunk-1/pr-100.md')]
        }).map(item => item.key)).toEqual(['pulls/pr-100.md'])
    });

    test('families and membership are DERIVED from disk, never a hardcoded roster (AC4: the class)', () => {
        // The guard must cover any archived-content family keyed by a logical name. A roster in the
        // script would exempt the next family silently, which is the exact defect
        // `check-derived-domain.mjs` flags. So a family invented here must be covered with no code change.
        artifact('pulls', 'v13.0.0', 'chunk-1', 'pr-1.md');
        artifact('some-future-family', 'v14.0.0', 'chunk-1', 'thing-1.md');
        artifact('some-future-family', 'v14.0.0', 'chunk-2', 'thing-1.md');

        expect(listArchiveFamilies(archiveRoot).sort()).toEqual(['pulls', 'some-future-family']);
        expect(buildLogicalIndex(archiveRoot).get('some-future-family/thing-1.md')).toHaveLength(2);
        expect(findLogicalIdentityCollisions({archiveRoot}).map(item => item.key))
            .toEqual(['some-future-family/thing-1.md'])
    });

    test('a missing archive tree degrades to empty rather than throwing', () => {
        expect(listArchiveFamilies(path.join(archiveRoot, 'nope'))).toEqual([]);
        expect(findLogicalIdentityCollisions({archiveRoot: path.join(archiveRoot, 'nope')})).toEqual([])
    });

    /**
     * @summary Ordinal conformance: does an artifact sit where the layout contract's §2.2 would place it?
     *
     * A different question from logical identity over the same membership, so it shares this fixture.
     * The temp tree matters more here than for duplicates: the real corpus carries 175 known
     * non-conformances, so an arm reading it would assert today's damage and invert the moment a
     * repair lands. The real number belongs in a PR body as a measurement, never in an assertion.
     */
    test.describe('ordinal conformance (#18805)', () => {
        /**
         * Fills one bucket with `count` artifacts, each in the chunk the ordinal rule computes for it.
         * @param {String} family
         * @param {String} version
         * @param {Number} count
         */
        const conformingBucket = (family, version, count) => {
            for (let index = 0; index < count; index++) {
                artifact(family, version, `chunk-${Math.floor(index / 100) + 1}`, `pr-${index + 1}.md`)
            }
        };

        test('a conforming bucket reports nothing, across the 100/101 boundary', () => {
            // 101 members is the smallest tree that can catch an off-by-one in either direction: member
            // 100 is the last of chunk-1 and member 101 the first of chunk-2, so a rule shifted one way
            // misplaces the first and the other way misplaces the second.
            conformingBucket('pulls', 'v13.0.0', 101);

            expect(findOrdinalMisplacements({archiveRoot})).toEqual([])
        });

        test('an artifact in the wrong chunk is reported, and named with the chunk it belongs in', () => {
            conformingBucket('pulls', 'v13.0.0', 101);

            // The member that belongs at index 0 of chunk-1, filed in chunk-2 instead
            artifact('pulls', 'v13.0.0', 'chunk-2', 'pr-0.md');

            const [finding] = findOrdinalMisplacements({archiveRoot});

            expect(finding.bucket).toBe('pulls/v13.0.0');
            expect(finding.members).toBe(102);
            expect(finding.expectedChunks).toBe(2);
            expect(finding.misplaced.map(({file, chunk, expected}) => [path.basename(file), chunk, expected]))
                // `pr-0` displaces every later member by one, so the boundary member moves too — that
                // cascade IS the defect: an ordinal is a position in a complete bucket, not a property
                // of one file, which is why a per-file check could never have found this.
                .toEqual([['pr-0.md', 2, 1], ['pr-100.md', 1, 2]])
        });

        test('an artifact with no id is reported as unorderable rather than ranked', () => {
            // Folding it to 0 would sort it first and misreport every member after it — a wrong answer
            // that looks like a finding, which is worse here than no answer.
            conformingBucket('pulls', 'v13.0.0', 3);
            artifact('pulls', 'v13.0.0', 'chunk-1', 'readme.md');

            const [finding] = findOrdinalMisplacements({archiveRoot});

            expect(finding.unorderable.map(file => path.basename(file))).toEqual(['readme.md']);
            expect(finding.misplaced, 'the ranked members are still placed correctly').toEqual([])
        });

        test('buckets are derived on BOTH levels, so a new family or version is measured without an edit', () => {
            conformingBucket('some-future-family', 'v99.0.0', 2);
            artifact('some-future-family', 'v99.0.0', 'chunk-7', 'thing-3.md');

            expect(findOrdinalMisplacements({archiveRoot}).map(({bucket}) => bucket))
                .toEqual(['some-future-family/v99.0.0'])
        });

        test('the CLI mode reports and exits 0, against the real corpus that does NOT conform', () => {
            // AC-2's red control, and the one arm that reads the committed corpus deliberately: the
            // claim is about the EXIT CODE, which is 0 by construction whatever the count drifts to.
            // A mode that fails a commit over pre-existing damage would wedge the repository.
            const result = spawnSync('node', [GUARD, '--ordinals'], {encoding: 'utf8'});

            expect(result.status, 'report-only: it must never fail a commit').toBe(0);
            expect(result.stdout).toContain('ADR 0004');
            expect(result.stderr, 'nothing on stderr — this mode reports, it does not complain').toBe('')
        })
    })
});
