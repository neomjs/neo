import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

import {
    buildInventory,
    discoverSubprocessLaunches,
    discoverWorkflowReferences,
    listTrackedFiles,
    reconcileInventory,
    rowKey,
    sourceBindingError,
    SURFACE
}                       from '../../../../../../ai/scripts/diagnostics/agentOsExtractionInventory.mjs';
import {censusPlaneOpeners} from '../../../../../../ai/scripts/diagnostics/planePlacementCensus.mjs';

const
    __dirname = path.dirname(fileURLToPath(import.meta.url)),
    REPO_ROOT = path.resolve(__dirname, '../../../../../..');

/**
 * @summary Mutation-resistant contract for the first blocking AgentOS extraction proof: source
 * populations are discovered semantically, both residue directions fail independently, and the
 * committed current-tree receipt is complete and deterministic.
 */
test.describe('agentOsExtractionInventory — exact population × explicit authority', () => {
    test('workflow discovery counts module, registry, test, and comment occurrences separately', () => {
        const source = [
            "paths: ['ai/scripts/lint/rules.json']",
            "run: node ai/scripts/lint/check.mjs",
            "# keep test/playwright/unit/ai/scripts/lint/check.spec.mjs in the rewrite population",
            "again: ai/scripts/lint/check.mjs"
        ].join('\n');

        const rows = discoverWorkflowReferences(source, '.github/workflows/fixture.yml');

        expect(rows.map(row => row.target)).toEqual([
            'ai/scripts/lint/rules.json',
            'ai/scripts/lint/check.mjs',
            'test/playwright/unit/ai/scripts/lint/check.spec.mjs',
            'ai/scripts/lint/check.mjs'
        ]);
        expect(rows[1].identity).toContain('ai/scripts/lint/check.mjs::1');
        expect(rows[3].identity).toContain('ai/scripts/lint/check.mjs::2');
        expect(rows.map(row => row.source)).toEqual([
            '.github/workflows/fixture.yml:1',
            '.github/workflows/fixture.yml:2',
            '.github/workflows/fixture.yml:3',
            '.github/workflows/fixture.yml:4'
        ])
    });

    test('subprocess discovery uses executable AST calls, folds static strings, and ignores prose', () => {
        const source = [
            '/** ai/scripts/maintenance/prose-only.mjs */',
            "runCommand('node ' + 'ai/scripts/maintenance/uploadKnowledgeBase.mjs');",
            "spawn(process.execPath, ['ai/scripts/runners/runAgent.mjs']);",
            'execSync(`node ai/scripts/diagnostics/check.mjs`);',
            "const inert = 'ai/scripts/diagnostics/not-launched.mjs';"
        ].join('\n');

        const result = discoverSubprocessLaunches(source, 'fixture.mjs');

        expect(result.parseError).toBeNull();
        expect(result.launches.map(row => row.target)).toEqual([
            'ai/scripts/maintenance/uploadKnowledgeBase.mjs',
            'ai/scripts/runners/runAgent.mjs',
            'ai/scripts/diagnostics/check.mjs'
        ]);
        expect(result.launches.map(row => row.source)).toEqual([
            'fixture.mjs:2', 'fixture.mjs:3', 'fixture.mjs:4'
        ]);
        expect(discoverSubprocessLaunches('const = broken', 'broken.mjs').parseError).toBeTruthy()
    });

    test('a dirty tree cannot masquerade as a SHA-bound receipt', () => {
        expect(sourceBindingError('M  ai/scripts/a.mjs\n?? scratch.mjs')).toEqual({
            kind : 'dirty-worktree',
            key  : 'ai/scripts/a.mjs, scratch.mjs',
            error: 'a commit SHA cannot bind staged, modified, or untracked source'
        });
        expect(sourceBindingError('M  ai/scripts/a.mjs', true)).toBeNull();
        expect(sourceBindingError('', false)).toBeNull()
    });

    test('a complete grouped override closes disk minus authority', () => {
        const rows = [{
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/a.mjs',
            source     : 'ai/scripts/a.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        }];

        const result = reconcileInventory(rows, {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : ['ai/scripts/a.mjs'],
                disposition: 'edge',
                source     : 'fixture authority',
                rationale  : 'explicit fixture Edge ownership'
            }],
            custody: []
        });

        expect(result.ok).toBe(true);
        expect(result.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(result.rows[0].disposition).toBe('edge')
    });

    test('RED: a disk row with no authority is named in disk minus authority', () => {
        const result = reconcileInventory([{
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/unowned.mjs',
            source     : 'ai/scripts/unowned.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        }], {overrides: [], custody: []});

        expect(result.ok).toBe(false);
        expect(result.residue.diskMinusAuthority)
            .toEqual(['script-module::ai/scripts/unowned.mjs'])
    });

    test('RED: a registry row whose disk identity vanished is named in authority minus disk', () => {
        const result = reconcileInventory([], {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : ['ai/scripts/deleted.mjs'],
                disposition: 'retire',
                source     : 'fixture authority',
                rationale  : 'fixture row intentionally left stale'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.residue.authorityMinusDisk)
            .toEqual(['script-module::ai/scripts/deleted.mjs']);
        expect(result.errors).toContainEqual({
            kind: 'stale-authority',
            key : 'script-module::ai/scripts/deleted.mjs'
        })
    });

    test('RED: duplicate, invalid, and explanation-free authority cannot suppress residue', () => {
        const row = {
            surface    : SURFACE.scriptModule,
            identity   : 'ai/scripts/a.mjs',
            source     : 'ai/scripts/a.mjs',
            disposition: null,
            rationale  : null,
            evidence   : {}
        };

        const result = reconcileInventory([row], {
            overrides: [{
                surface    : SURFACE.scriptModule,
                identities : [row.identity],
                disposition: 'unknown',
                source     : '',
                rationale  : 'short'
            }, {
                surface    : SURFACE.scriptModule,
                identities : [row.identity],
                disposition: 'edge',
                source     : 'second fixture',
                rationale  : 'duplicate fixture authority row'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.errors.map(error => error.kind)).toEqual(expect.arrayContaining([
            'duplicate-authority', 'invalid-disposition', 'missing-rationale', 'missing-source'
        ]))
    });

    test('RED: command authority cannot contradict its explicitly owned target', () => {
        const result = reconcileInventory([{
            surface    : SURFACE.rootScript,
            identity   : 'ai:fixture',
            source     : 'package.json#scripts.ai:fixture',
            disposition: null,
            rationale  : null,
            evidence   : {suggestedDisposition: 'edge'}
        }], {
            overrides: [{
                surface    : SURFACE.rootScript,
                identities : ['ai:fixture'],
                disposition: 'cloud',
                source     : 'fixture authority',
                rationale  : 'contradictory fixture ownership'
            }],
            custody: []
        });

        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual({
            kind : 'authority-conflict',
            key  : 'root-script::ai:fixture',
            error: 'registry says cloud; target custody says edge'
        })
    });

    test('the committed current-tree receipt is zero-residue, exhaustive, and deterministic', () => {
        const first       = buildInventory({allowDirty: true, projectRoot: REPO_ROOT}),
              second      = buildInventory({allowDirty: true, projectRoot: REPO_ROOT}),
              scriptFiles = listTrackedFiles({projectRoot: REPO_ROOT, pathspecs: ['ai/scripts']})
                  .filter(file => file.endsWith('.mjs')),
              packageScripts = Object.keys(JSON.parse(
                  fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
              ).scripts ?? {}),
              workflowReferences = listTrackedFiles({projectRoot: REPO_ROOT, pathspecs: ['.github/workflows']})
                  .filter(file => /\.ya?ml$/.test(file))
                  .flatMap(file => discoverWorkflowReferences(
                      fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'), file
                  ));

        expect(first).toEqual(second);
        expect(first.ok).toBe(true);
        expect(first.residue).toEqual({diskMinusAuthority: [], authorityMinusDisk: []});
        expect(first.errors).toEqual([]);
        expect(first.counts[SURFACE.scriptModule].total).toBe(scriptFiles.length);
        expect(first.counts[SURFACE.rootScript].total).toBe(packageScripts.length);
        expect(first.counts[SURFACE.workflowReference].total).toBe(workflowReferences.length);
        expect(first.counts[SURFACE.planeOpener].total).toBe(censusPlaneOpeners({projectRoot: REPO_ROOT}).total);

        const keys = first.rows.map(row => rowKey(row.surface, row.identity));

        expect(new Set(keys).size).toBe(keys.length);
        expect(keys).toEqual([...keys].sort((a, b) => a.localeCompare(b)));
        first.rows.forEach(row => {
            expect(['cloud', 'edge', 'retire', 'shared', 'stays-engine']).toContain(row.disposition);
            expect(row.source).toBeTruthy();
            expect(row.rationale).toBeTruthy()
        });

        first.rows.filter(row => row.evidence?.override).forEach(row => {
            expect(row.authoritySource).toBeTruthy()
        });
        [
            SURFACE.rootScript,
            SURFACE.scriptModule,
            SURFACE.subprocessLaunch,
            SURFACE.workflowReference
        ].forEach(surface => {
            expect(first.rows.filter(row => row.surface === surface).every(row => row.evidence?.override),
                `${surface} custody must never fall through to current source shape`).toBe(true)
        });

        expect(first.rows).toContainEqual(expect.objectContaining({
            surface    : SURFACE.subprocessLaunch,
            identity   : 'ai/scripts/lifecycle/postReleaseSync.mjs::runCommand::ai/scripts/maintenance/uploadKnowledgeBase.mjs::1',
            disposition: 'cloud'
        }))
    })
});
