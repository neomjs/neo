/**
 * @file test/playwright/unit/ai/scripts/setup/revisionConfigDiff.spec.mjs
 * @summary Proves revision-local config discovery, static declaration parsing, three-way diffs,
 * target applicability, fail-loud reads, and the direct JSON CLI contract.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import os                             from 'node:os';
import path                           from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {test, expect}                 from '@playwright/test';
import {
    REVISION_CONFIG_DIFF_SCHEMA_VERSION,
    REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION,
    RevisionConfigDiffError,
    classifyAddedLeaf,
    diffDeclaredConfigSurfaces,
    diffRevisionConfig,
    discoverRevisionConfigSurfaces,
    loadRevisionConfig,
    parseDeclaredConfigSource
} from '../../../../../../ai/scripts/setup/revisionConfigDiff.mjs';
import {diffCohortLeafSets} from '../../../../../../ai/scripts/setup/cohortAdmissibility.mjs';

const MODULE_PATH = path.resolve(
    fileURLToPath(new URL('../../../../../../ai/scripts/setup/revisionConfigDiff.mjs', import.meta.url))
);

/**
 * @summary Minimal source shape accepted by the static config parser.
 * @param {String} dataSource
 * @param {String} [imports='']
 * @returns {String}
 */
function configSource(dataSource, imports = '') {
    return `${imports}\nclass ConfigBase {\n    static config = {\n        className: 'Fixture.ConfigBase',\n        data: ${dataSource}\n    }\n}\n\nexport default ConfigBase;\n`
}

test.describe.serial('revisionConfigDiff — declared inputs across immutable revisions (#16765)', () => {
    let repoRoot, revisionPreHorizon, revisionA, revisionB, revisionBroken;

    const diff = options => diffRevisionConfig({
        ...options,
        repoRoot,
        supportedFromRevision: revisionA
    });
    const load = options => loadRevisionConfig({
        ...options,
        repoRoot,
        supportedFromRevision: revisionA
    });

    const git = args => execFileSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'pipe']
    }).trim();

    const runFixtureCli = argv => {
        const options = {argv, repoRoot, supportedFromRevision: revisionA};
        const source  = `import {main} from ${JSON.stringify(pathToFileURL(MODULE_PATH).href)};\n` +
            `main(${JSON.stringify(options)});\n`;

        return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
            cwd     : repoRoot,
            encoding: 'utf8'
        })
    };

    const write = (filePath, content) => {
        const absolute = path.join(repoRoot, filePath);
        mkdirSync(path.dirname(absolute), {recursive: true});
        writeFileSync(absolute, content)
    };

    const commit = message => {
        git(['add', '-A']);
        git(['commit', '-m', message]);
        return git(['rev-parse', 'HEAD'])
    };

    test.beforeAll(() => {
        repoRoot = mkdtempSync(path.join(os.tmpdir(), 'neo-revision-config-diff-'));

        git(['init']);
        git(['config', 'user.name', 'Revision Config Test']);
        git(['config', 'user.email', 'revision-config@example.invalid']);

        write('README.md', 'fixture history before the configBase contract\n');
        revisionPreHorizon = commit('fixture pre-horizon');

        write('ai/env.mjs', `export const BOUND_ENV = 'NEO_BOUND_A';\n`);
        write('ai/configBase.mjs', configSource(`{
            stable: leaf('same', 'NEO_STABLE', 'string'),
            removed: leaf(1, 'NEO_REMOVED', 'number'),
            changed: leaf('old', 'NEO_OLD', 'string'),
            boundEnv: leaf(1, BOUND_ENV, 'number'),
            spacing: leaf(5 * 60, 'NEO_SPACING', 'number')
        }`, `import {BOUND_ENV} from './env.mjs';`));
        write('ai/mcp/server/alpha/config.template.mjs', 'export default {};\n');
        write('ai/mcp/server/alpha/configBase.mjs', configSource(`{
            alpha: {
                onlyAtA: leaf(true, 'NEO_ALPHA_ONLY', 'boolean')
            }
        }`));

        revisionA = commit('fixture A');

        write('ai/env.mjs', `export const BOUND_ENV = 'NEO_BOUND_B';\n`);
        write('ai/configBase.mjs', configSource(`{
            stable: leaf('same', 'NEO_STABLE', 'string'),
            changed: leaf(42, 'NEO_NEW', 'number'),
            boundEnv: leaf(1, BOUND_ENV, 'number'),
            spacing: leaf(5*60, 'NEO_SPACING', 'number'),
            additions: {
                defaulted: leaf('d', 'NEO_DEFAULTED', 'string'),
                required: leaf('', 'NEO_REQUIRED', 'string', {
                    requiredFor: [{modes: ['prod'], reason: 'production needs it'}]
                }),
                excluded: leaf('', 'NEO_EXCLUDED', 'string', {
                    requiredFor: [{modes: ['dev'], reason: 'development only'}]
                }),
                unknown: leaf('', 'NEO_UNKNOWN', 'string', {
                    requiredFor: [{entrypoints: ['orchestrator-daemon'], reason: 'entrypoint-specific'}]
                }),
                claimsUnknown: leaf('', 'NEO_CLAIMS_UNKNOWN', 'string', {
                    requiredFor: [{consumerClaims: ['readiness'], reason: 'claim-specific'}]
                })
            },
            left: {duplicate: leaf(1, 'NEO_LEFT_DUP', 'number')},
            right: {duplicate: leaf(2, 'NEO_RIGHT_DUP', 'number')}
        }`, `import {BOUND_ENV} from './env.mjs';`));
        rmSync(path.join(repoRoot, 'ai/mcp/server/alpha'), {recursive: true, force: true});
        write('ai/mcp/server/beta/config.template.mjs', 'export default {};\n');
        write('ai/mcp/server/beta/env.mjs', `
            export const ENV_NAMES = Object.freeze({beta: 'NEO_BETA_ONLY'});
        `);
        write('ai/mcp/server/beta/configBase.mjs', configSource(`{
            beta: {
                onlyAtB: leaf(2, ENV_NAMES.beta, 'number')
            }
        }`, `import {ENV_NAMES} from './env.mjs';`));

        revisionB = commit('fixture B');

        write('ai/mcp/server/broken/config.template.mjs', 'export default {};\n');
        revisionBroken = commit('fixture with template but no config base');
    });

    test.afterAll(() => {
        rmSync(repoRoot, {recursive: true, force: true})
    });

    test('discovers each tree independently and treats whole-surface absence as a valid delta', () => {
        const atA = discoverRevisionConfigSurfaces({revision: revisionA, repoRoot}),
              atB = discoverRevisionConfigSurfaces({revision: revisionB, repoRoot});

        expect(atA.map(row => row.surface)).toEqual(['server:alpha', 'tier1']);
        expect(atB.map(row => row.surface)).toEqual(['server:beta', 'tier1']);

        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {mode: 'prod'}
        });

        expect(receipt.from.surfaces).toEqual(['server:alpha', 'tier1']);
        expect(receipt.to.surfaces).toEqual(['server:beta', 'tier1']);
        expect(receipt.removed).toContainEqual(expect.objectContaining({
            surface : 'server:alpha',
            leafPath: 'alpha.onlyAtA'
        }));
        expect(receipt.added).toContainEqual(expect.objectContaining({
            surface : 'server:beta',
            leafPath: 'beta.onlyAtB',
            env     : 'NEO_BETA_ONLY'
        }));
    });

    test('reports added, removed, and same-path default/env/type changes', () => {
        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {mode: 'prod'}
        });

        expect(receipt.added).toContainEqual(expect.objectContaining({
            surface : 'tier1',
            leafPath: 'additions.defaulted'
        }));
        expect(receipt.removed).toContainEqual(expect.objectContaining({
            surface : 'tier1',
            leafPath: 'removed',
            env     : 'NEO_REMOVED'
        }));
        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'changed',
            changes : {
                default: {from: "'old'", to: '42'},
                env    : {from: 'NEO_OLD', to: 'NEO_NEW'},
                type   : {from: 'string', to: 'number'}
            }
        });
        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'boundEnv',
            changes : {
                env: {from: 'NEO_BOUND_A', to: 'NEO_BOUND_B'}
            }
        });

        // Whitespace around an otherwise-identical expression is not a declaration change.
        expect(receipt.changed.some(row => row.leafPath === 'spacing')).toBe(false);
    });

    test('pins full nested identity so duplicate local keys cannot collide', () => {
        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {mode: 'prod'}
        });

        expect(receipt.added
            .filter(row => row.leafPath.endsWith('.duplicate'))
            .map(row => `${row.surface}:${row.leafPath}`)
        ).toEqual(['tier1:left.duplicate', 'tier1:right.duplicate']);
    });

    test('classifies each added leaf with the exact four-way target verdict', () => {
        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {mode: 'prod'}
        });
        const byPath = Object.fromEntries(receipt.added
            .filter(row => row.surface === 'tier1')
            .map(row => [row.leafPath, row.applicability]));

        expect(byPath['additions.defaulted']).toEqual({verdict: 'defaulted', unknownAxes: []});
        expect(byPath['additions.required']).toEqual({verdict: 'required', unknownAxes: []});
        expect(byPath['additions.excluded']).toEqual({verdict: 'not-required-for-target', unknownAxes: []});
        expect(byPath['additions.unknown']).toEqual({verdict: 'indeterminate', unknownAxes: ['entrypoints']});
        expect(byPath['additions.claimsUnknown']).toEqual({
            verdict    : 'indeterminate',
            unknownAxes: ['consumerClaims']
        });
        expect(receipt.target.consumerClaims, 'an omitted claim axis stays unknown').toBeNull();

        // Direct pure control: an applying requirement wins over an indeterminate sibling.
        expect(classifyAddedLeaf({requirements: [
            {modes: ['prod']},
            {entrypoints: ['unknown-entrypoint']}
        ]}, {mode: 'prod'})).toEqual({verdict: 'required', unknownAxes: []});

        // Programmatic callers can state an explicit empty claim set, which is different from omission.
        expect(classifyAddedLeaf({
            requirements: [{consumerClaims: ['readiness']}]
        }, {consumerClaims: []})).toEqual({verdict: 'not-required-for-target', unknownAxes: []})
    });

    test('composes diffCohortLeafSets once per unioned surface', () => {
        const from = load({revision: revisionA}),
              to   = load({revision: revisionB});
        let calls = 0;

        const result = diffDeclaredConfigSurfaces({
            fromSurfaces: from.surfaces,
            toSurfaces  : to.surfaces,
            target      : {mode: 'prod'},
            diffLeafSetsFn(options) {
                calls++;
                return diffCohortLeafSets(options)
            }
        });

        expect(calls).toBe(3); // alpha + beta + tier1
        expect(result.added.length).toBeGreaterThan(0);
        expect(result.removed.length).toBeGreaterThan(0);
    });

    test('ambient env values can neither manufacture nor mask a declared diff', () => {
        const previous = process.env.NEO_NEW;

        try {
            delete process.env.NEO_NEW;
            const withoutEnv = diff({
                fromRevision: revisionA,
                toRevision  : revisionB,
                target      : {mode: 'prod'}
            });

            process.env.NEO_NEW = 'a runtime value that must be irrelevant';
            const withEnv = diff({
                fromRevision: revisionA,
                toRevision  : revisionB,
                target      : {mode: 'prod'}
            });

            expect(withEnv).toEqual(withoutEnv)
        } finally {
            if (previous === undefined) delete process.env.NEO_NEW;
            else process.env.NEO_NEW = previous
        }
    });

    test('reads revision objects without executing a config module that cannot run standalone', () => {
        const directImport = spawnSync(process.execPath, [path.join(repoRoot, 'ai/configBase.mjs')], {
            cwd     : repoRoot,
            encoding: 'utf8'
        });

        expect(directImport.status).toBe(1);
        expect(directImport.stderr).toContain('leaf is not defined');

        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB
        });

        expect(receipt.from.resolved).toBe(revisionA);
        expect(receipt.to.resolved).toBe(revisionB)
    });

    test('bad refs and discovered templates without readable bases fail loud', () => {
        expect(() => diff({
            fromRevision: 'definitely-not-a-ref',
            toRevision  : revisionB
        })).toThrow(RevisionConfigDiffError);

        expect(() => diff({
            fromRevision: revisionB,
            toRevision  : revisionBroken
        })).toThrow(/declares .*broken\/config\.template\.mjs.*sibling .*broken\/configBase\.mjs is unreadable/);
    });

    test('distinguishes a pre-horizon range from a malformed current-model missing base', () => {
        let preHorizonError, missingBaseError;

        try {
            diffRevisionConfig({
                fromRevision         : revisionPreHorizon,
                toRevision           : revisionB,
                repoRoot,
                supportedFromRevision: revisionA
            })
        } catch (error) {
            preHorizonError = error
        }

        try {
            diff({fromRevision: revisionB, toRevision: revisionBroken})
        } catch (error) {
            missingBaseError = error
        }

        expect(preHorizonError).toBeInstanceOf(RevisionConfigDiffError);
        expect(preHorizonError.message).toContain('pre-horizon');
        expect(preHorizonError.message).toContain(revisionA);
        expect(preHorizonError.message).not.toContain('sibling');

        expect(REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION)
            .toBe('4749eef99e044afecae21c68be4ee8cf2f2f64d2');

        expect(missingBaseError).toBeInstanceOf(RevisionConfigDiffError);
        expect(missingBaseError.message).toContain('sibling');
        expect(missingBaseError.message).not.toContain('pre-horizon')
    });

    test('unsupported declaration shapes fail instead of silently dropping a leaf', () => {
        expect(() => parseDeclaredConfigSource({
            source  : configSource(`{dynamic: leaf(1, resolveEnv(), 'number')}`),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        })).toThrow(/unsupported static CallExpression metadata/);

        expect(() => parseDeclaredConfigSource({
            source  : configSource(`{...otherData}`),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        })).toThrow(/spread\/method in config\.data/);

        expect(() => parseDeclaredConfigSource({
            source: `
                const ENV_A = ENV_B;
                const ENV_B = ENV_A;
                ${configSource(`{cyclic: leaf(1, ENV_A, 'number')}`)}
            `,
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        })).toThrow(/cyclic static binding/);
    });

    test('the direct CLI emits the closed JSON receipt and uses exit 1 only for execution errors', () => {
        const successfulCli = runFixtureCli([
            '--from', revisionA,
            '--to', revisionB,
            '--mode', 'prod',
            '--consumer-claim', 'readiness'
        ]);

        expect(successfulCli.status).toBe(0);
        expect(successfulCli.stderr).toBe('');

        const receipt = JSON.parse(successfulCli.stdout);

        expect(receipt.schemaVersion).toBe(REVISION_CONFIG_DIFF_SCHEMA_VERSION);
        expect(receipt.target).toEqual({
            entrypoint    : null,
            mode          : 'prod',
            consumerClaims: ['readiness']
        });
        expect(receipt.added.length).toBeGreaterThan(0); // Non-empty is still a successful diff.

        const omittedClaims = runFixtureCli([
            '--from', revisionA,
            '--to', revisionB,
            '--mode', 'prod'
        ]);

        expect(omittedClaims.status).toBe(0);
        expect(JSON.parse(omittedClaims.stdout).target.consumerClaims,
            'CLI omission stays unknown rather than becoming an explicit empty claim set').toBeNull();

        const help = runFixtureCli(['--help']);

        expect(help.status).toBe(0);
        expect(help.stdout).toContain('Usage: node ai/scripts/setup/revisionConfigDiff.mjs');

        const failure = runFixtureCli([
            '--from', 'bad-ref',
            '--to', revisionB
        ]);

        expect(failure.status).toBe(1);
        expect(failure.stdout).toBe('');
        expect(failure.stderr).toContain('git rev-parse failed');
    });
});
