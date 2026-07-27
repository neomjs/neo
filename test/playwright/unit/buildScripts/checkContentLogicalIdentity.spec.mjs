import {test, expect}     from '@playwright/test';
import {mkdtempSync,
        mkdirSync,
        writeFileSync,
        rmSync}           from 'node:fs';
import {tmpdir} from 'node:os';
import path     from 'node:path';
import {
    buildLogicalIndex,
    findLogicalIdentityCollisions,
    listArchiveFamilies
} from '../../../../buildScripts/util/check-content-logical-identity.mjs';

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
    })
});
