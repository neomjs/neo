import {test, expect} from '@playwright/test';

/**
 * The guard's value is the DIRECTION it enforces and the fact that its baseline fails BOTH ways, so
 * those are what is asserted — not the message text.
 *
 * A burndown baseline that only fails upward is the interesting failure mode and the reason the
 * symmetric case has its own tests: if a fixed violation may silently stay listed, the file drifts
 * above the real count and becomes a record of things that used to be true. The count then reads as
 * measurement while measuring nothing, which is precisely the shape that let the originating
 * ticket's "three exact sites" survive as a title over nine real ones.
 */
test.describe('check-engine-brain-boundary — one-way direction, ratchet fails both ways', () => {
    let findBrainImports, diffAgainstBaseline, describeAddedCrossings;

    test.beforeAll(async () => {
        ({findBrainImports, diffAgainstBaseline, describeAddedCrossings} =
            await import('../../../../buildScripts/util/check-engine-brain-boundary.mjs'));
    });

    test('FIRES: an engine build script importing a Brain service', () => {
        const findings = findBrainImports(
            `import GH_LabelService from '../../../ai/services/github-workflow/LabelService.mjs';`,
            'buildScripts/docs/index/labels.mjs'
        );

        expect(findings).toHaveLength(1);
        expect(findings[0].specifier).toBe('../../../ai/services/github-workflow/LabelService.mjs');
        expect(findings[0].line).toBe(1);
    });

    test('FIRES: the identity graph, which is deeper than a service boundary', () => {
        expect(findBrainImports(
            `import {IDENTITIES} from '../../ai/graph/identityRoots.mjs';`,
            'buildScripts/util/deriveFleetRoster.mjs'
        )).toHaveLength(1);
    });

    test('PASSES: a Brain file importing the engine — the legal direction', () => {
        // The whole point is that this direction is fine. A guard that fired here would forbid the
        // Brain from using the framework, which is the arrangement, not the violation.
        expect(findBrainImports(
            `import Base from '../../../src/core/Base.mjs';`,
            'ai/services/github-workflow/LabelService.mjs'
        )).toEqual([]);
    });

    test('PASSES: an app directory whose name merely starts with "ai"', () => {
        // `apps/ai/neural-link/**` exists. Anchoring on a `../`-prefixed `ai/` segment keeps it out;
        // a looser `includes('ai/')` would convict it.
        expect(findBrainImports(
            `import Main from '../../apps/ai/neural-link/view/Main.mjs';`,
            'buildScripts/build/webpack.mjs'
        )).toEqual([]);
    });

    test('RATCHET UP: a crossing absent from the baseline is a new violation', () => {
        const baseline = [{file: 'buildScripts/release/publish.mjs', specifier: '../../ai/services.host.mjs'}],
              planted  = findBrainImports(`import x from '../../ai/services/Secret.mjs';`, 'buildScripts/build/webpack.mjs'),
              {added}  = diffAgainstBaseline(planted, baseline);

        expect(added).toHaveLength(1);
        expect(added[0].file).toBe('buildScripts/build/webpack.mjs');
    });

    test('RATCHET DOWN: a baselined crossing that no longer exists must also fail', () => {
        // The asymmetric-ratchet defect, asserted directly. Fixing a violation without removing its
        // baseline row leaves the recorded count above the real one — and nothing would ever notice.
        const baseline     = [{file: 'buildScripts/release/publish.mjs', specifier: '../../ai/services.host.mjs'}],
              {burnedDown} = diffAgainstBaseline([], baseline);

        expect(burnedDown).toHaveLength(1);
        expect(burnedDown[0].file).toBe('buildScripts/release/publish.mjs');
    });

    test('CONTROL: live set identical to baseline reports neither direction', () => {
        const entries = [
            {file: 'buildScripts/release/publish.mjs', specifier: '../../ai/services.host.mjs'},
            {file: 'buildScripts/util/deriveFleetRoster.mjs', specifier: '../../ai/graph/identityRoots.mjs'}
        ];

        expect(diffAgainstBaseline(entries, entries)).toEqual({added: [], burnedDown: []});
    });

    test('the two identity-graph consumers are distinguished by FILE, not by specifier', () => {
        // Both import the same specifier. Keying the diff on the specifier alone would let one be
        // burned down while the other still violated, and report the pair as clean.
        const baseline = [
            {file: 'buildScripts/util/agentCoAuthorEmails.mjs', specifier: '../../ai/graph/identityRoots.mjs', count: 1},
            {file: 'buildScripts/util/deriveFleetRoster.mjs',   specifier: '../../ai/graph/identityRoots.mjs', count: 1}
        ];

        const {added, burnedDown} = diffAgainstBaseline([baseline[0]], baseline);

        expect(added).toEqual([]);
        expect(burnedDown).toHaveLength(1);
        expect(burnedDown[0].file).toBe('buildScripts/util/deriveFleetRoster.mjs');
    });

    test('PARTIAL burndown of a multi-occurrence crossing fails — the collapsed-key defect', () => {
        // devCockpit.mjs imports localBearer.mjs at two lines. A set keyed on file+specifier holds
        // ONE member for both, so removing one occurrence would leave the key present and the diff
        // silent. This is the measured shape from a sibling baseline where 83 rows collapsed to 9
        // keys and deleting 63 of 64 occurrences still reported green.
        const baseline = [{file: 'buildScripts/devCockpit.mjs', specifier: '../ai/x.mjs', count: 2}],
              oneLeft  = [{file: 'buildScripts/devCockpit.mjs', specifier: '../ai/x.mjs'}];

        expect(diffAgainstBaseline(oneLeft, baseline).burnedDown).toHaveLength(1);
    });

    test('an ADDED occurrence of an already-baselined crossing still fails up', () => {
        const baseline = [{file: 'buildScripts/devCockpit.mjs', specifier: '../ai/x.mjs', count: 2}],
              three    = [1, 2, 3].map(() => ({file: 'buildScripts/devCockpit.mjs', specifier: '../ai/x.mjs'}));

        expect(diffAgainstBaseline(three, baseline).added).toHaveLength(1);
    });

    test('the shipped baseline matches the live tree — the guard is green on what is merged', async () => {
        const {execFileSync} = await import('node:child_process'),
              {readFileSync} = await import('node:fs'),
              path           = (await import('node:path')).default,
              root           = path.resolve(process.cwd()),
              files          = execFileSync('git', ['ls-files', 'buildScripts', 'src'], {cwd: root, encoding: 'utf8'})
                  .split('\n').filter(file => file.endsWith('.mjs')),
              live           = files.flatMap(file => findBrainImports(readFileSync(path.join(root, file), 'utf8'), file)),
              baseline       = JSON.parse(readFileSync(
                  path.join(root, 'buildScripts/util/check-engine-brain-boundary-baseline.json'), 'utf8'));

        expect(diffAgainstBaseline(live, baseline)).toEqual({added: [], burnedDown: []});
    });

    test('the guard sees itself without convicting itself', async () => {
        // The first draft regex-matched `from '…'` over raw text and convicted its own JSDoc, which
        // quotes two specifiers as examples. It stayed invisible until the file became tracked and
        // the guard could scan itself. Reading declarations from the parse tree removes the class,
        // so this asserts the guard over its own source rather than over a fixture.
        const {readFileSync} = await import('node:fs'),
              path           = (await import('node:path')).default,
              self           = readFileSync(
                  path.resolve(process.cwd(), 'buildScripts/util/check-engine-brain-boundary.mjs'), 'utf8');

        expect(findBrainImports(self, 'buildScripts/util/check-engine-brain-boundary.mjs')).toEqual([]);
    });

    test('a DYNAMIC import is a crossing — the shape no hand-grep could see', () => {
        // All three of devCockpit.mjs's crossings are dynamic imports, which is why every
        // `from`-anchored sweep missed that file entirely.
        const findings = findBrainImports(
            `const {localBearer} = await import('../ai/mcp/server/shared/helpers/localBearer.mjs');`,
            'buildScripts/devCockpit.mjs'
        );

        expect(findings).toHaveLength(1);
    });

    test('IDENTICAL specifier, opposite verdicts — resolution decides, not text shape', () => {
        // The defect this pair exists to prevent, and it shipped a wrong public claim before it was
        // caught. `../ai/Client.mjs` resolves to the BRAIN from buildScripts/ and to `src/ai/` from
        // src/worker/. `src/ai/**` is the engine's own AI layer — the sanctioned seam by which the
        // Body connects to the Brain — and is engine code, not a crossing.
        const fromEngineTooling = findBrainImports(`import c from '../ai/Client.mjs';`, 'buildScripts/devCockpit.mjs'),
              fromEngineRuntime = findBrainImports(`import c from '../ai/Client.mjs';`, 'src/worker/App.mjs');

        expect(fromEngineTooling).toHaveLength(1);
        expect(fromEngineRuntime).toEqual([]);
    });

    test('PASSES: every src/ai/** consumer, however deep the hop', () => {
        // A path predicate that ignores its resolution context convicts the one seam the
        // architecture depends on. These must all stay clean.
        expect(findBrainImports(`import w from '../../ai/WriteGuard.mjs';`, 'src/worker/mixin/Foo.mjs')).toEqual([]);
        expect(findBrainImports(`import t from './ai/TransactionService.mjs';`, 'src/Neo.mjs')).toEqual([]);
        expect(findBrainImports(`import l from '../ai/LockRegistry.mjs';`, 'src/state/Provider.mjs')).toEqual([]);
    });

    // The reporter is the guard's whole product — a green run prints one line nobody reads. It was
    // also the one layer with no coverage, and it shipped `:undefined` where the location belongs,
    // because `tallyCrossings` drops `line` and the reporter asked a tallied row for it. Every
    // assertion above this point reads the returned ARRAYS, which is exactly why none of them saw
    // it: `line` is asserted on `findBrainImports`, one layer upstream of where it was lost.
    test.describe('the failure message — the only output anyone reads', () => {
        const crossing = (file, line) => ({file, specifier: '../../ai/graph/identityRoots.mjs', line});

        test('names a real line, never the literal ":undefined"', () => {
            const findings = [crossing('buildScripts/util/probe.mjs', 42)],
                  {added}  = diffAgainstBaseline(findings, []),
                  lines    = describeAddedCrossings(added, findings);

            expect(lines).toHaveLength(1);
            expect(lines[0]).toContain('buildScripts/util/probe.mjs:42');
            // The red-proof, stated as its own assertion rather than left to the `toContain` above:
            // the pre-fix reporter produced this exact string, and it passed 15 green specs.
            expect(lines[0]).not.toContain(':undefined');
        });

        test('a crossing occurring TWICE reports BOTH lines — what a tallied row cannot express', () => {
            // The reason this reports from raw findings rather than re-attaching one line to the
            // tally: `{file, specifier, count: 2}` can name at most one location, and a developer
            // sent to a file with two crossings has to find the second one by hand.
            const findings = [crossing('buildScripts/devCockpit.mjs', 223), crossing('buildScripts/devCockpit.mjs', 269)],
                  {added}  = diffAgainstBaseline(findings, []);

            expect(added).toHaveLength(1);
            expect(added[0].count).toBe(2);

            const lines = describeAddedCrossings(added, findings);

            expect(lines).toHaveLength(2);
            expect(lines[0]).toContain(':223');
            expect(lines[1]).toContain(':269');
        });

        test('reports ONLY the added crossings, not every finding in the tree', () => {
            // A baselined crossing is tolerated debt; printing it in the NEW list would tell a
            // developer to fix something the baseline already accepts.
            const baselined = crossing('buildScripts/release/publish.mjs', 25),
                  fresh     = crossing('buildScripts/util/probe.mjs', 7),
                  findings  = [baselined, fresh],
                  baseline  = [{file: baselined.file, specifier: baselined.specifier, count: 1}],
                  {added}   = diffAgainstBaseline(findings, baseline),
                  lines     = describeAddedCrossings(added, findings);

            expect(lines).toEqual(['  buildScripts/util/probe.mjs:7 imports ../../ai/graph/identityRoots.mjs']);
        });
    });
});
