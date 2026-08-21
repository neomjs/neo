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
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';
import {
    REVISION_CONFIG_DIFF_SCHEMA_VERSION,
    REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION,
    assertSupportedRevision,
    classifyAddedLeaf,
    diffDeclaredConfigSurfaces,
    diffLoadedRevisionConfigs,
    diffRevisionConfig,
    loadRevisionConfig,
    parseDeclaredConfigSource
} from '../../../../../../ai/scripts/setup/revisionConfigDiff.mjs';

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

    const load = options => loadRevisionConfig({...options, repoRoot});
    const diff = ({fromRevision, toRevision, target = {}}) => diffLoadedRevisionConfigs({
        from: load({revision: fromRevision}),
        to  : load({revision: toRevision}),
        target
    });

    const git = args => execFileSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'pipe']
    }).trim();

    const runDirectCli = argv => spawnSync(process.execPath, [MODULE_PATH, ...argv], {
        cwd     : repoRoot,
        encoding: 'utf8'
    });

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

        write('ai/env.mjs', `
            import path from 'node:path';
            export const BOUND_DEFAULT = 'default-a';
            export const BOUND_ENV = 'NEO_BOUND_A';
            export const DEPENDENCY_DEFAULT = path.resolve('/dependency-a');
            const PARSER_IMPL = value => String(value);
            export const PARSER = PARSER_IMPL;
            export const PARSER_A = value => value;
            export const PARSER_B = value => value;
        `);
        write('ai/configBase.mjs', configSource(`{
            stable: leaf('same', 'NEO_STABLE', 'string'),
            removed: leaf(1, 'NEO_REMOVED', 'number'),
            changed: leaf('old', 'NEO_OLD', 'string'),
            boundEnv: leaf(1, BOUND_ENV, 'number'),
            boundDefault: leaf(BOUND_DEFAULT, 'NEO_BOUND_DEFAULT', 'string'),
            dependencyDefault: leaf(DEPENDENCY_DEFAULT, 'NEO_DEPENDENCY_DEFAULT', 'string'),
            requirednessChange: leaf('', 'NEO_REQUIREDNESS_CHANGE', 'string', {
                requiredFor: [{modes: ['dev'], reason: 'development only'}]
            }),
            requirednessEquivalent: leaf('', 'NEO_REQUIREDNESS_EQUIVALENT', 'string', {
                requiredFor: {modes: 'prod', reason: 'same contract'}
            }),
            decoderBodyChange: leaf('', 'NEO_DECODER_BODY_CHANGE', 'string', {parse: PARSER}),
            decoderRebound: leaf('', 'NEO_DECODER_REBOUND', 'string', {parse: PARSER_A}),
            spacing: leaf(5 * 60, 'NEO_SPACING', 'number')
        }`, `import {BOUND_DEFAULT, BOUND_ENV, DEPENDENCY_DEFAULT, PARSER, PARSER_A} from './env.mjs';`));
        write('ai/mcp/server/alpha/config.template.mjs', 'export default {};\n');
        write('ai/mcp/server/alpha/configBase.mjs', configSource(`{
            alpha: {
                onlyAtA: leaf(true, 'NEO_ALPHA_ONLY', 'boolean')
            }
        }`));
        write('ai/mcp/server/gamma/config.template.mjs', 'export default {};\n');
        write('ai/mcp/server/gamma/configBase.mjs', configSource(`{
            gamma: {
                decoderBodyChange: leaf('', 'NEO_GAMMA_DECODER_BODY_CHANGE', 'string', {parse: PARSER})
            }
        }`, `import {PARSER} from '../../../env.mjs';`));

        revisionA = commit('fixture A');

        write('ai/env.mjs', `
            import path from 'node:path';
            export const BOUND_DEFAULT = 'default-b';
            export const BOUND_ENV = 'NEO_BOUND_B';
            export const DEPENDENCY_DEFAULT = path.resolve('/dependency-b');
            const PARSER_IMPL = value => value.trim();
            export const PARSER = PARSER_IMPL;
            export const PARSER_A = value => value;
            export const PARSER_B = value => value;
        `);
        write('ai/configBase.mjs', configSource(`{
            stable: leaf('same', 'NEO_STABLE', 'string'),
            changed: leaf(42, 'NEO_NEW', 'number'),
            boundEnv: leaf(1, BOUND_ENV, 'number'),
            boundDefault: leaf(BOUND_DEFAULT, 'NEO_BOUND_DEFAULT', 'string'),
            dependencyDefault: leaf(DEPENDENCY_DEFAULT, 'NEO_DEPENDENCY_DEFAULT', 'string'),
            requirednessChange: leaf('', 'NEO_REQUIREDNESS_CHANGE', 'string', {
                requiredFor: [{modes: ['prod'], reason: 'production only'}]
            }),
            requirednessEquivalent: leaf('', 'NEO_REQUIREDNESS_EQUIVALENT', 'string', {
                requiredFor: [
                    {modes: ['prod'], reason: 'same contract'},
                    {modes: 'prod', reason: 'same contract'}
                ]
            }),
            decoderBodyChange: leaf('', 'NEO_DECODER_BODY_CHANGE', 'string', {parse: PARSER}),
            decoderRebound: leaf('', 'NEO_DECODER_REBOUND', 'string', {parse: PARSER_B}),
            spacing: leaf(300, 'NEO_SPACING', 'number'),
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
        }`, `import {BOUND_DEFAULT, BOUND_ENV, DEPENDENCY_DEFAULT, PARSER, PARSER_B} from './env.mjs';`));
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
        const atA = load({revision: revisionA}),
              atB = load({revision: revisionB});

        expect([...atA.surfaces.keys()]).toEqual(['server:alpha', 'server:gamma', 'tier1']);
        expect([...atB.surfaces.keys()]).toEqual(['server:beta', 'server:gamma', 'tier1']);

        const receipt = diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {mode: 'prod'}
        });

        expect(receipt.from.surfaces).toEqual(['server:alpha', 'server:gamma', 'tier1']);
        expect(receipt.to.surfaces).toEqual(['server:beta', 'server:gamma', 'tier1']);
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

    test('reports added, removed, and every operational same-path declaration axis', () => {
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
                default: {
                    basis       : 'expression',
                    from        : "'old'",
                    fromResolved: 'old',
                    to          : '42',
                    toResolved  : 42
                },
                env : {from: 'NEO_OLD', to: 'NEO_NEW'},
                type: {from: 'string', to: 'number'}
            }
        });
        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'boundEnv',
            changes : {
                env: {from: 'NEO_BOUND_A', to: 'NEO_BOUND_B'}
            }
        });
        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'boundDefault',
            changes : {default: {
                basis       : 'dependency',
                from        : 'BOUND_DEFAULT',
                fromResolved: 'default-a',
                to          : 'BOUND_DEFAULT',
                toResolved  : 'default-b'
            }}
        });
        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'dependencyDefault',
            changes : {default: {
                basis: 'dependency',
                from : 'DEPENDENCY_DEFAULT',
                to   : 'DEPENDENCY_DEFAULT'
            }}
        });
        const requirednessChange = receipt.changed.find(row => row.leafPath === 'requirednessChange'),
              decoderBodyChange  = receipt.changed.find(row => row.leafPath === 'decoderBodyChange');

        expect(requirednessChange.changes).toEqual({requiredFor: {
            from: [{modes: ['dev'], reason: 'development only'}],
            to  : [{modes: ['prod'], reason: 'production only'}]
        }});
        expect(decoderBodyChange.changes.decoder).toMatchObject({
            kind         : 'DECODER_BODY_CHANGED',
            decoder      : 'PARSER',
            evidenceBound: 'decoder-own-source-text; imports excluded; formatting-sensitive'
        });
        expect(decoderBodyChange.changes.decoder.fromDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(decoderBodyChange.changes.decoder.toDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
        expect(decoderBodyChange.changes.decoder.fromDigest).not.toBe(decoderBodyChange.changes.decoder.toDigest);
        expect(Object.keys(decoderBodyChange.changes)).toEqual(['decoder']);

        const sharedDecoderRows = receipt.changed.filter(row =>
            row.changes.decoder?.kind === 'DECODER_BODY_CHANGED' && row.changes.decoder.decoder === 'PARSER'
        );

        expect(sharedDecoderRows.map(row => `${row.surface}:${row.leafPath}`)).toEqual([
            'server:gamma:gamma.decoderBodyChange',
            'tier1:decoderBodyChange'
        ]);

        expect(receipt.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'decoderRebound',
            changes : {decoder: {
                kind: 'DECODER_REBOUND',
                from: 'PARSER_A',
                to  : 'PARSER_B'
            }}
        });

        // Statically equivalent default expressions are not a runtime declaration change.
        expect(receipt.changed.some(row => row.leafPath === 'spacing')).toBe(false);
        expect(receipt.changed.some(row => row.leafPath === 'requirednessEquivalent')).toBe(false);
        expect(receipt.changed.find(row => row.leafPath === 'changed').changes.decoder).toBeUndefined();
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

    test('dependency projection preserves an outer binding across nested shadowing', () => {
        const source = outer => `
            const OUTER = ${JSON.stringify(outer)};
            const DEFAULT = (() => {
                const nested = () => {
                    const OUTER = 'nested-shadow';
                    return OUTER
                };
                nested;
                return OUTER
            })();
            ${configSource(`{scoped: leaf(DEFAULT, 'NEO_SCOPED', 'string')}`)}
        `;
        const parse = value => parseDeclaredConfigSource({
            source  : source(value),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        });
        const result = diffDeclaredConfigSurfaces({
            fromSurfaces: new Map([['tier1', parse('outer-a')]]),
            toSurfaces  : new Map([['tier1', parse('outer-b')]])
        });

        expect(result.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'scoped',
            changes : {default: {
                basis: 'dependency',
                from : 'DEFAULT',
                to   : 'DEFAULT'
            }}
        })
    });

    test('dependency projection includes the imported package symbol, not only its package', () => {
        const parse = imported => parseDeclaredConfigSource({
            source: configSource(
                `{external: leaf(HELPER('/value'), 'NEO_EXTERNAL', 'string')}`,
                `import {${imported} as HELPER} from 'node:path';`
            ),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        });
        const result = diffDeclaredConfigSurfaces({
            fromSurfaces: new Map([['tier1', parse('resolve')]]),
            toSurfaces  : new Map([['tier1', parse('join')]])
        });

        expect(result.changed).toContainEqual({
            surface : 'tier1',
            leafPath: 'external',
            changes : {default: {
                basis: 'dependency',
                from : "HELPER('/value')",
                to   : "HELPER('/value')"
            }}
        })
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
        }, {consumerClaims: []})).toEqual({verdict: 'not-required-for-target', unknownAxes: []});

        expect(() => diff({
            fromRevision: revisionA,
            toRevision  : revisionB,
            target      : {consumerClaims: 'readiness'}
        })).toThrow(/consumerClaims must be an array/)
    });

    test('retains the existing leaf-set semantics across every unioned surface', () => {
        const from = load({revision: revisionA}),
              to   = load({revision: revisionB});

        const result = diffDeclaredConfigSurfaces({
            fromSurfaces: from.surfaces,
            toSurfaces  : to.surfaces,
            target      : {mode: 'prod'},
            // Former test seam: a caller-supplied differ could forge a valid-looking empty receipt.
            // It is now an ignored unknown option; the imported SSOT always runs.
            diffLeafSetsFn: () => ({introduced: [], retired: []})
        });

        expect(result.added).toContainEqual(expect.objectContaining({
            surface : 'server:beta',
            leafPath: 'beta.onlyAtB'
        }));
        expect(result.removed).toContainEqual(expect.objectContaining({
            surface : 'server:alpha',
            leafPath: 'alpha.onlyAtA'
        }))
    });

    test('the authoritative receipt closes over the production horizon', () => {
        expect(diff({fromRevision: revisionA, toRevision: revisionB}).schemaVersion,
            'lower-level synthetic diff payloads cannot mint an authoritative schema').toBeUndefined();

        expect(() => diffRevisionConfig({
            fromRevision         : revisionA,
            toRevision           : revisionB,
            repoRoot,
            supportedFromRevision: revisionA
        })).toThrow(new RegExp(REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION))
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
        })).toThrow(/git rev-parse failed/);

        expect(() => diff({
            fromRevision: revisionB,
            toRevision  : revisionBroken
        })).toThrow(/declares .*broken\/config\.template\.mjs.*sibling .*broken\/configBase\.mjs is unreadable/);
    });

    test('distinguishes a pre-horizon range from a malformed current-model missing base', () => {
        let preHorizonError, missingBaseError;

        try {
            assertSupportedRevision({
                repoRoot,
                revision             : revisionPreHorizon,
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

        expect(preHorizonError).toMatchObject({code: 'REVISION_CONFIG_DIFF_FAILED'});
        expect(preHorizonError.message).toContain('pre-horizon');
        expect(preHorizonError.message).toContain(revisionA);
        expect(preHorizonError.message).not.toContain('sibling');

        expect(REVISION_CONFIG_DIFF_SUPPORTED_FROM_REVISION)
            .toBe('4749eef99e044afecae21c68be4ee8cf2f2f64d2');

        expect(missingBaseError).toMatchObject({code: 'REVISION_CONFIG_DIFF_FAILED'});
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

        expect(() => parseDeclaredConfigSource({
            source: configSource(
                `{missingObject: leaf(MISSING_DEFAULT, 'NEO_MISSING_OBJECT', 'string')}`,
                `import {MISSING_DEFAULT} from './missing-default.mjs';`
            ),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1',
            state   : {modules: new Map(), repoRoot, revision: revisionB}
        })).toThrow(/git show failed/);

        expect(() => parseDeclaredConfigSource({
            source  : configSource(`{missingBinding: leaf(MISSING_DEFAULT, 'NEO_MISSING_BINDING', 'string')}`),
            filePath: 'ai/configBase.mjs',
            surface : 'tier1'
        })).toThrow(/cannot statically resolve identifier MISSING_DEFAULT/)
    });

    test('the direct CLI owns help and one-line coded refusal output', () => {
        expect(REVISION_CONFIG_DIFF_SCHEMA_VERSION).toBe('revision-config-diff.v1');

        const help = runDirectCli(['--help']);

        expect(help.status).toBe(0);
        expect(help.stdout).toContain('Usage: node ai/scripts/setup/revisionConfigDiff.mjs');

        const failure = runDirectCli([
            '--from', 'bad-ref',
            '--to', revisionB
        ]);

        expect(failure.status).toBe(1);
        expect(failure.stdout).toBe('');
        expect(failure.stderr).toContain('git rev-parse failed');

        const unknown = runDirectCli(['--unknown']);
        const missing = runDirectCli(['--from']);

        expect(unknown.status).toBe(1);
        expect(unknown.stderr).toContain('unknown argument --unknown');
        expect(missing.status).toBe(1);
        expect(missing.stderr).toContain('--from requires a value')
    });
});
