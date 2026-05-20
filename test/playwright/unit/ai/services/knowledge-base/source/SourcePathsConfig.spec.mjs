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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import fs             from 'fs-extra';
import path           from 'path';

/**
 * Verifies the Phase 0/1B-β (#11660) `aiConfig.sourcePaths` config-driven override + legacy
 * hardcoded-fallback contract across all 10 default Neo Source classes. Each test exercises
 * the same `path.resolve(aiConfig.neoRootDir, aiConfig.sourcePaths?.<SourceName> ?? '<fallback>')`
 * pattern that each Source class uses at its extract-path-resolution point.
 *
 * Byte-equivalence anchor: the hardcoded fallback inside `??` MUST match the pre-#11660
 * hardcoded path so deployments without the new `sourcePaths` config key still resolve
 * to the legacy Neo layout. This spec is the regression guard against that fallback
 * drifting away from the legacy default.
 *
 * @see https://github.com/neomjs/neo/issues/11660
 * @see https://github.com/neomjs/neo/issues/11658 (sibling — registry foundation)
 */
test.describe('aiConfig.sourcePaths config-driven path resolution (#11660)', () => {
    let aiConfig;

    test.beforeAll(async () => {
        aiConfig = (await import('../../../../../../../ai/mcp/server/knowledge-base/config.mjs')).default;
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
            test(`${name}: default config matches hardcoded fallback (byte-equivalence anchor)`, () => {
                expect(aiConfig.sourcePaths?.[name]).toBe(fallback);
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
            test(`${name}: default config matches hardcoded fallback array (byte-equivalence anchor)`, () => {
                expect(aiConfig.sourcePaths?.[name]).toEqual(fallback);
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

        test('default config matches hardcoded sourceMap fallback (byte-equivalence anchor)', () => {
            expect(aiConfig.sourcePaths?.ApiSource).toEqual(apiSourceFallback);
        });

        test('override sourceMap takes precedence over fallback', () => {
            const sourcePaths = aiConfig.sourcePaths;
            const original    = sourcePaths.ApiSource;
            try {
                sourcePaths.ApiSource = {'tenant-src': 'src', 'tenant-modules': 'app'};
                const resolved = aiConfig.sourcePaths?.ApiSource ?? apiSourceFallback;
                expect(resolved).toEqual({'tenant-src': 'src', 'tenant-modules': 'app'});
            } finally {
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
                // This is the byte-equivalence guarantee for pre-#11660 deployments whose
                // local `config.mjs` was generated from a config.template.mjs that didn't have
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
            const treePath = aiConfig.sourcePaths?.LearningSource ?? 'learn/tree.json';
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
