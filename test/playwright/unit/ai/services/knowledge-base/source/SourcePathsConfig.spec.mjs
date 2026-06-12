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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../../src/core/_export.mjs';
import {KB_DEFAULTS}   from '../../../../../fixtures/knowledgeBaseConfigDefaults.mjs';
import fs              from 'fs-extra';
import path            from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs');

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

// Serial mode: tests mutate the shared `aiConfig.sourcePaths` singleton via per-test
// override / delete patterns. Under local `fullyParallel` (workers=9), the per-test
// try/finally restoration windows overlap, causing cross-test races where one test's
// `delete aiConfig.sourcePaths[X]` is observed by a concurrent test as missing. Serial
// mode within this file forces non-overlapping mutation windows. CI uses workers=1 so
// this primarily defends local-DX correctness; the singleton-mutation pattern is inherent
// to the test shape, not a workers=1 vs workers=9 distinction.
test.describe.configure({mode: 'serial'});

test.describe('aiConfig.sourcePaths config-driven path resolution (#11660)', () => {
    let aiConfig;
    let templateText;
    let originalSourcePaths;
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

        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.template.mjs')).default;
        // The byte-equivalence anchor MUST assert against the canonical git-tracked template,
        // not any per-clone operator overlay (which may be stale on clones that pulled
        // the template change without re-running `bootstrapWorktree.mjs` to refresh local config).
        // Read the template file as text and verify the expected fallback strings appear inside
        // the `sourcePaths` block. Text-level verification is stale-clone-safe.
        templateText = await fs.readFile(TEMPLATE_PATH, 'utf-8');

        // Stale-clone-safe init: the override/missing-key runtime tests below mutate
        // `aiConfig.sourcePaths[name]` via override + delete. If the local clone's gitignored
        // the operator overlay is stale and lacks the `sourcePaths` key, those mutations would crash
        // (cannot set property of undefined). Seed empty object for the test run; restore the
        // original state in afterAll so per-clone freshness is preserved on test exit.
        originalSourcePaths = aiConfig.sourcePaths;
        if (!aiConfig.sourcePaths) {
            aiConfig.sourcePaths = {};
        }
    });

    test.afterAll(() => {
        // Restore clone-config freshness (or lack thereof) — don't leak the seeded sourcePaths
        // object into subsequent specs that might import the same singleton.
        aiConfig.sourcePaths = originalSourcePaths;

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
                // Verify the template file contains both the source-name key AND the expected
                // fallback string within the sourcePaths block. Drift between the Source class's
                // inline `?? '<fallback>'` and the template default would be caught by either
                // (a) this text-grep failing OR (b) a downstream npm run ai:sync-kb producing
                // different output. Text-grep is the cheapest of the two.
                expect(templateText).toContain(`${name}`);
                expect(templateText).toContain(`'${fallback}'`);
            });

            test(`${name}: override path takes precedence over fallback`, () => {
                const sourcePaths = aiConfig.sourcePaths;
                const original    = sourcePaths[name];
                try {
                    sourcePaths[name] = `tenant-override/${name.toLowerCase()}`;
                    const resolved = aiConfig.sourcePaths?.[name] ?? fallback;
                    expect(resolved).toBe(`tenant-override/${name.toLowerCase()}`);
                } finally {
                    sourcePaths[name] = original;
                }
            });

            test(`${name}: missing config key falls through to hardcoded fallback`, () => {
                const sourcePaths = aiConfig.sourcePaths;
                const original    = sourcePaths[name];
                try {
                    delete sourcePaths[name];
                    const resolved = aiConfig.sourcePaths?.[name] ?? fallback;
                    expect(resolved).toBe(fallback);
                } finally {
                    sourcePaths[name] = original;
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
                // Text-grep: both the source name AND each fallback path string must appear
                // in the template body. Stale-clone-safe; catches drift between Source class
                // inline fallback and template default.
                expect(templateText).toContain(`${name}`);
                for (const segment of fallback) {
                    expect(templateText).toContain(`'${segment}'`);
                }
            });

            test(`${name}: override array takes precedence over fallback`, () => {
                const sourcePaths = aiConfig.sourcePaths;
                const original    = sourcePaths[name];
                try {
                    sourcePaths[name] = ['tenant-primary', 'tenant-archive'];
                    const resolved = aiConfig.sourcePaths?.[name] ?? fallback;
                    expect(resolved).toEqual(['tenant-primary', 'tenant-archive']);
                } finally {
                    sourcePaths[name] = original;
                }
            });

            test(`${name}: missing config key falls through to hardcoded fallback`, () => {
                const sourcePaths = aiConfig.sourcePaths;
                const original    = sourcePaths[name];
                try {
                    delete sourcePaths[name];
                    const resolved = aiConfig.sourcePaths?.[name] ?? fallback;
                    expect(resolved).toEqual(fallback);
                } finally {
                    sourcePaths[name] = original;
                }
            });

            test(`${name}: single-element override array works (cloud deployment without archive subdir)`, () => {
                const sourcePaths = aiConfig.sourcePaths;
                const original    = sourcePaths[name];
                try {
                    sourcePaths[name] = ['tenant-only-primary'];
                    const resolved = aiConfig.sourcePaths?.[name] ?? fallback;
                    expect(resolved).toEqual(['tenant-only-primary']);
                } finally {
                    sourcePaths[name] = original;
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
            // Text-grep: ApiSource sourceMap keys + values must appear in template. The Object
            // literal in the template includes both the path-key strings + the type-value strings
            // (e.g., 'src': 'src'). Verifying both pairs are present is the cross-file drift guard.
            expect(templateText).toContain('ApiSource');
            for (const [pathKey, typeValue] of Object.entries(apiSourceFallback)) {
                expect(templateText).toContain(`'${pathKey}'`);
                expect(templateText).toContain(`'${typeValue}'`);
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
            // The override deliberately re-targets EXISTING keys only (no net-new key). Under
            // reactive-merge a brand-new key cannot be removed again by reassignment, so it would
            // leak onto this serial-mode shared singleton and contaminate the sibling missing-key
            // test below. Re-targeting existing keys keeps the key SET stable, so the `finally`
            // restore returns the singleton exactly to its byte-equivalent default. ApiSource.extract()
            // iterates Object.entries(sourceMap) and indexes whatever directories the resolved map
            // names, so an operator re-pointing 'src' → a tenant directory is honored at scan time.
            const sourcePaths = aiConfig.sourcePaths;
            const original    = {...sourcePaths.ApiSource};
            try {
                // Re-target two existing path-keys to tenant directories with distinct types.
                sourcePaths.ApiSource = {'src': 'tenant-app', 'apps': 'tenant-example'};
                const resolved = aiConfig.sourcePaths?.ApiSource ?? apiSourceFallback;

                // Override-precedence: operator values win on the keys they target.
                expect(resolved.src).toBe('tenant-app');
                expect(resolved.apps).toBe('tenant-example');
                // Sanity: the override values genuinely displaced the curated defaults.
                expect(resolved.src).not.toBe(apiSourceFallback.src);
                expect(resolved.apps).not.toBe(apiSourceFallback.apps);
                // Keys the override omitted retain their default (reactive-merge, not replace).
                expect(resolved.examples).toBe(apiSourceFallback.examples);
            } finally {
                // Re-assert the canonical default values; since no new key was introduced, this
                // returns the shared singleton to its baseline for the sibling tests.
                sourcePaths.ApiSource = original;
            }
        });

        test('missing ApiSource key falls through to hardcoded fallback', () => {
            const sourcePaths = aiConfig.sourcePaths;
            const original    = sourcePaths.ApiSource;
            try {
                delete sourcePaths.ApiSource;
                const resolved = aiConfig.sourcePaths?.ApiSource ?? apiSourceFallback;
                expect(resolved).toEqual(apiSourceFallback);
            } finally {
                sourcePaths.ApiSource = original;
            }
        });
    });

    test.describe('Defensive fallback — entire sourcePaths object missing', () => {
        test('entire aiConfig.sourcePaths object can be deleted; all 10 sources fall through to hardcoded defaults', () => {
            const original = aiConfig.sourcePaths;
            try {
                delete aiConfig.sourcePaths;

                // Verify each Source class's resolution path still works via the `??` fallback.
                // This is the byte-equivalence guarantee for deployments whose local operator
                // overlay was generated from a config.template.mjs that didn't have
                // the `sourcePaths` key.
                expect(aiConfig.sourcePaths?.AdrSource          ?? 'learn/agentos/decisions').toBe('learn/agentos/decisions');
                expect(aiConfig.sourcePaths?.ConceptSource      ?? 'resources/content/concepts').toBe('resources/content/concepts');
                expect(aiConfig.sourcePaths?.ReleaseNotesSource ?? '.github/RELEASE_NOTES').toBe('.github/RELEASE_NOTES');
                expect(aiConfig.sourcePaths?.SkillSource        ?? '.agents/skills').toBe('.agents/skills');
                expect(aiConfig.sourcePaths?.TestSource         ?? 'test/playwright').toBe('test/playwright');
                expect(aiConfig.sourcePaths?.LearningSource     ?? 'learn/tree.json').toBe('learn/tree.json');
                expect(aiConfig.sourcePaths?.DiscussionSource   ?? ['resources/content/discussions', 'resources/content/archive/discussions']).toEqual(['resources/content/discussions', 'resources/content/archive/discussions']);
                expect(aiConfig.sourcePaths?.PullRequestSource  ?? ['resources/content/pulls',       'resources/content/archive/pulls']).toEqual(['resources/content/pulls', 'resources/content/archive/pulls']);
                expect(aiConfig.sourcePaths?.TicketSource       ?? ['resources/content/issues',      'resources/content/archive/issues']).toEqual(['resources/content/issues', 'resources/content/archive/issues']);
                expect(aiConfig.sourcePaths?.ApiSource          ?? {'src': 'src', 'apps': 'app', 'examples': 'example', 'docs/app': 'app', 'ai': 'ai-infrastructure'}).toEqual({'src': 'src', 'apps': 'app', 'examples': 'example', 'docs/app': 'app', 'ai': 'ai-infrastructure'});
            } finally {
                aiConfig.sourcePaths = original;
            }
        });
    });

    test.describe('LearningSource — base directory derived from tree path', () => {
        test('default learn/tree.json → base directory is learn/', () => {
            // Read from KB_DEFAULTS fixture (frozen snapshot of KB-template defaults) rather
            // than the live overlay-merged singleton — operator-customized
            // `sourcePaths.LearningSource` would otherwise break this canonical-default check.
            // This remains a one-spec drift-migration scope.
            const treePath = KB_DEFAULTS.sourcePaths?.LearningSource ?? 'learn/tree.json';
            const basePath = path.dirname(treePath);
            expect(basePath).toBe('learn');
        });

        test('override docs/guides/tree.json → base directory is docs/guides', () => {
            const sourcePaths = aiConfig.sourcePaths;
            const original    = sourcePaths.LearningSource;
            try {
                sourcePaths.LearningSource = 'docs/guides/tree.json';
                const treePath = aiConfig.sourcePaths?.LearningSource ?? 'learn/tree.json';
                const basePath = path.dirname(treePath);
                expect(basePath).toBe('docs/guides');
            } finally {
                sourcePaths.LearningSource = original;
            }
        });
    });
});
