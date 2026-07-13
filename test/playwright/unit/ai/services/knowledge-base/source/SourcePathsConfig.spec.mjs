import {setup} from '../../../../../setup.mjs';

const appName = 'SourcePathsConfigTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: false,
        unitTestMode           : true,
        useDomApiRenderer      : false
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                            from '@playwright/test';
import Neo                                       from '../../../../../../../src/Neo.mjs';
import * as core                                 from '../../../../../../../src/core/_export.mjs';
import ConfigProvider, {createConfigProxy, leaf} from '../../../../../../../ai/ConfigProvider.mjs';
import path                                      from 'path';

/**
 * Creates a disposable ConfigProvider that is not installed as a realm singleton.
 * `undefined` deliberately omits the entire `sourcePaths` leaf; an object (including `{}`)
 * declares that leaf with exactly the requested keys. Tests can therefore exercise overrides
 * and missing-key fallbacks without writing to the imported template singleton.
 * @param {Object|undefined} sourcePaths
 * @returns {Neo.ai.ConfigProvider}
 */
function createSourcePathsConfig(sourcePaths) {
    const data = sourcePaths === undefined ? {} : {sourcePaths: leaf(sourcePaths)};

    return createConfigProxy(Neo.create(ConfigProvider, {data}));
}

/**
 * Verifies the `aiConfig.sourcePaths` config-driven override + legacy hardcoded-fallback contract
 * across all 10 default Neo Source classes. Each test exercises
 * the same `path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths?.<SourceName> ?? '<fallback>')`
 * pattern that each Source class uses at its extract-path-resolution point.
 *
 * Byte-equivalence anchor: the hardcoded fallback inside `??` MUST match the pre-config
 * hardcoded path so deployments without the new `sourcePaths` config key still resolve
 * to the legacy Neo layout. This spec is the regression guard against that fallback
 * drifting away from the legacy default.
 */

test.describe('aiConfig.sourcePaths config-driven path resolution (#11660)', () => {
    let templateConfig;
    let originalTier1Config;
    let originalTier1ClassHierarchy;
    let originalConfig;
    let originalClassHierarchy;

    test.beforeAll(async () => {
        originalTier1Config         = Neo.ai?.Config;
        originalTier1ClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.Config'];
        originalConfig         = Neo.ai?.mcp?.server?.['knowledge-base']?.Config;
        originalClassHierarchy = Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config'];

        if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }
        if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'];
        }

        templateConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
    });

    test.afterAll(() => {
        if (originalTier1Config !== undefined) {
            Neo.ai.Config = originalTier1Config;
        } else if (Neo.ai?.Config) {
            delete Neo.ai.Config;
        }

        if (originalTier1ClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.Config'] = originalTier1ClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.Config'];
        }

        if (originalConfig !== undefined) {
            Neo.ai.mcp.server['knowledge-base'].Config = originalConfig;
        } else if (Neo.ai?.mcp?.server?.['knowledge-base']?.Config) {
            delete Neo.ai.mcp.server['knowledge-base'].Config;
        }

        if (originalClassHierarchy !== undefined) {
            Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'] = originalClassHierarchy;
        } else if (Neo.classHierarchyMap?.['Neo.ai.mcp.server.knowledge-base.Config']) {
            delete Neo.classHierarchyMap['Neo.ai.mcp.server.knowledge-base.Config'];
        }
    });

    test.describe('Single-path Source classes', () => {
        const singlePathSources = [
            {name: 'AdrSource',          fallback: 'learn/agentos/decisions'},
            {name: 'ConceptSource',      fallback: 'resources/content/concepts'},
            {name: 'ReleaseNotesSource', fallback: '.github/RELEASE_NOTES'},
            {name: 'SkillSource',        fallback: '.agents/skills'},
            {name: 'TestSource',         fallback: 'test/playwright'},
            {name: 'LearningSource',     fallback: 'learn/tree.json'}
        ];

        for (const {name, fallback} of singlePathSources) {
            test(`${name}: template default matches Source-class hardcoded fallback (byte-equivalence anchor)`, () => {
                expect(templateConfig.sourcePaths[name]).toBe(fallback);
            });

            test(`${name}: override path takes precedence over fallback`, () => {
                const
                    override = `tenant-override/${name.toLowerCase()}`,
                    config   = createSourcePathsConfig({[name]: override});

                try {
                    const resolved = config.sourcePaths?.[name] ?? fallback;

                    expect(resolved).toBe(override);
                } finally {
                    config.destroy();
                }
            });

            test(`${name}: missing config key falls through to hardcoded fallback`, () => {
                const config = createSourcePathsConfig({});

                try {
                    const resolved = config.sourcePaths?.[name] ?? fallback;

                    expect(resolved).toBe(fallback);
                } finally {
                    config.destroy();
                }
            });
        }
    });

    test.describe('Multi-path (array) Source classes', () => {
        const arrayPathSources = [
            {name: 'DiscussionSource',  fallback: ['resources/content/discussions', 'resources/content/archive/discussions']},
            {name: 'PullRequestSource', fallback: ['resources/content/pulls',       'resources/content/archive/pulls']},
            {name: 'TicketSource',      fallback: ['resources/content/issues',      'resources/content/archive/issues']}
        ];

        for (const {name, fallback} of arrayPathSources) {
            test(`${name}: template default matches Source-class hardcoded fallback array (byte-equivalence anchor)`, () => {
                expect(templateConfig.sourcePaths[name]).toEqual(fallback);
            });

            test(`${name}: override array takes precedence over fallback`, () => {
                const
                    override = ['tenant-primary', 'tenant-archive'],
                    config   = createSourcePathsConfig({[name]: override});

                try {
                    const resolved = config.sourcePaths?.[name] ?? fallback;

                    expect(resolved).toEqual(override);
                } finally {
                    config.destroy();
                }
            });

            test(`${name}: missing config key falls through to hardcoded fallback`, () => {
                const config = createSourcePathsConfig({});

                try {
                    const resolved = config.sourcePaths?.[name] ?? fallback;

                    expect(resolved).toEqual(fallback);
                } finally {
                    config.destroy();
                }
            });

            test(`${name}: single-element override array works (cloud deployment without archive subdir)`, () => {
                const
                    override = ['tenant-only-primary'],
                    config   = createSourcePathsConfig({[name]: override});

                try {
                    const resolved = config.sourcePaths?.[name] ?? fallback;

                    expect(resolved).toEqual(override);
                } finally {
                    config.destroy();
                }
            });
        }
    });

    test.describe('ApiSource sourceMap (path → type object)', () => {
        const apiSourceFallback = {
            'src'     : 'src',
            'apps'    : 'app',
            'examples': 'example',
            'docs/app': 'app',
            'ai'      : 'ai-infrastructure'
        };

        test('template default matches Source-class hardcoded sourceMap fallback (byte-equivalence anchor)', () => {
            for (const [pathKey, typeValue] of Object.entries(apiSourceFallback)) {
                expect(templateConfig.sourcePaths.ApiSource[pathKey]).toBe(typeValue);
            }
        });

        test('override sourceMap takes precedence over fallback', () => {
            // Reactive-config semantics (ConfigProvider extends Neo.state.Provider):
            // assigning an OBJECT to a config leaf routes through the Provider's `setData`, which
            // drills into the supplied nested keys and MERGES them onto the existing sub-keys —
            // override values WIN on a conflicting key; keys the override omits keep their default.
            // This is NOT the pre-migration wholesale object replace. The override-precedence
            // contract this test guards is therefore "operator-supplied values win", asserted
            // against the live merged map rather than exact-equality of the whole object.
            //
            // Use a disposable Provider seeded with the canonical fallback map. This keeps the
            // reactive merge assertion while ensuring the registered template singleton is read-only.
            const config = createSourcePathsConfig({ApiSource: apiSourceFallback});

            try {
                // Re-target two existing path-keys to tenant directories with distinct types.
                config.sourcePaths.ApiSource = {'src': 'tenant-app', 'apps': 'tenant-example'};
                const resolved = config.sourcePaths?.ApiSource ?? apiSourceFallback;

                // Override-precedence: operator values win on the keys they target.
                expect(resolved.src).toBe('tenant-app');
                expect(resolved.apps).toBe('tenant-example');
                // Sanity: the override values genuinely displaced the curated defaults.
                expect(resolved.src).not.toBe(apiSourceFallback.src);
                expect(resolved.apps).not.toBe(apiSourceFallback.apps);
                // Keys the override omitted retain their default (reactive-merge, not replace).
                expect(resolved.examples).toBe(apiSourceFallback.examples);
            } finally {
                config.destroy();
            }
        });

        test('missing ApiSource key falls through to hardcoded fallback', () => {
            const config = createSourcePathsConfig({});

            try {
                const resolved = config.sourcePaths?.ApiSource ?? apiSourceFallback;

                expect(resolved).toEqual(apiSourceFallback);
            } finally {
                config.destroy();
            }
        });
    });

    test.describe('Defensive fallback — entire sourcePaths object missing', () => {
        test('entire aiConfig.sourcePaths object can be absent; all 10 sources fall through to hardcoded defaults', () => {
            const config = createSourcePathsConfig();

            try {
                // Verify each Source class's resolution path still works via the `??` fallback.
                expect(config.sourcePaths?.AdrSource          ?? 'learn/agentos/decisions').toBe('learn/agentos/decisions');
                expect(config.sourcePaths?.ConceptSource      ?? 'resources/content/concepts').toBe('resources/content/concepts');
                expect(config.sourcePaths?.ReleaseNotesSource ?? '.github/RELEASE_NOTES').toBe('.github/RELEASE_NOTES');
                expect(config.sourcePaths?.SkillSource        ?? '.agents/skills').toBe('.agents/skills');
                expect(config.sourcePaths?.TestSource         ?? 'test/playwright').toBe('test/playwright');
                expect(config.sourcePaths?.LearningSource     ?? 'learn/tree.json').toBe('learn/tree.json');
                expect(config.sourcePaths?.DiscussionSource   ?? ['resources/content/discussions', 'resources/content/archive/discussions']).toEqual(['resources/content/discussions', 'resources/content/archive/discussions']);
                expect(config.sourcePaths?.PullRequestSource  ?? ['resources/content/pulls',       'resources/content/archive/pulls']).toEqual(['resources/content/pulls', 'resources/content/archive/pulls']);
                expect(config.sourcePaths?.TicketSource       ?? ['resources/content/issues',      'resources/content/archive/issues']).toEqual(['resources/content/issues', 'resources/content/archive/issues']);
                expect(config.sourcePaths?.ApiSource          ?? {'src': 'src', 'apps': 'app', 'examples': 'example', 'docs/app': 'app', 'ai': 'ai-infrastructure'}).toEqual({'src': 'src', 'apps': 'app', 'examples': 'example', 'docs/app': 'app', 'ai': 'ai-infrastructure'});
            } finally {
                config.destroy();
            }
        });
    });

    test.describe('LearningSource — base directory derived from tree path', () => {
        test('default learn/tree.json → base directory is learn/', () => {
            const treePath = templateConfig.sourcePaths.LearningSource;
            const basePath = path.dirname(treePath);
            expect(basePath).toBe('learn');
        });

        test('override docs/guides/tree.json → base directory is docs/guides', () => {
            const config = createSourcePathsConfig({LearningSource: 'docs/guides/tree.json'});

            try {
                const treePath = config.sourcePaths?.LearningSource ?? 'learn/tree.json';
                const basePath = path.dirname(treePath);
                expect(basePath).toBe('docs/guides');
            } finally {
                config.destroy();
            }
        });
    });
});
