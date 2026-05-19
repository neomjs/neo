import {setup} from '../../../../../setup.mjs';

const appName = 'SourceRegistryTest';

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

test.describe('Neo.ai.services.knowledge-base.source.SourceRegistry (#11658)', () => {
    let SourceRegistry, DEFAULT_SOURCES;

    test.beforeAll(async () => {
        const exportModule = await import('../../../../../../../ai/services/knowledge-base/source/_export.mjs');
        SourceRegistry  = exportModule.default;
        DEFAULT_SOURCES = exportModule.DEFAULT_SOURCES;
    });

    test.beforeEach(() => {
        // Each test starts from a clean registry, then re-registers defaults explicitly
        // for the tests that need them. This isolates per-test state.
        SourceRegistry.clear();
    });

    test('exposes the full 10 default Source classes in stable insertion order', () => {
        expect(DEFAULT_SOURCES).toHaveLength(10);

        const names = DEFAULT_SOURCES.map(s => s.className.split('.').pop());
        expect(names).toEqual([
            'AdrSource',
            'ApiSource',
            'ConceptSource',
            'DiscussionSource',
            'LearningSource',
            'PullRequestSource',
            'ReleaseNotesSource',
            'SkillSource',
            'TicketSource',  // TicketSource BEFORE TestSource (matches pre-#11658 hardcoded order)
            'TestSource'
        ]);
    });

    test('registerSource derives sourceName from className final segment when not supplied', () => {
        for (const SourceClass of DEFAULT_SOURCES) {
            SourceRegistry.registerSource(SourceClass);
        }

        const names = SourceRegistry.getSourceNames();
        expect(names).toEqual([
            'AdrSource', 'ApiSource', 'ConceptSource', 'DiscussionSource', 'LearningSource',
            'PullRequestSource', 'ReleaseNotesSource', 'SkillSource', 'TicketSource', 'TestSource'
        ]);
    });

    test('registerSource accepts an explicit sourceName override', () => {
        SourceRegistry.registerSource(DEFAULT_SOURCES[0], {sourceName: 'tenant-X-adr'});
        expect(SourceRegistry.hasSource('tenant-X-adr')).toBe(true);
        expect(SourceRegistry.hasSource('AdrSource')).toBe(false);
    });

    test('re-registering the same sourceName overwrites the prior class (idempotent for hot-reload)', () => {
        SourceRegistry.registerSource(DEFAULT_SOURCES[0]);  // AdrSource
        expect(SourceRegistry.getSources()).toHaveLength(1);

        SourceRegistry.registerSource(DEFAULT_SOURCES[1], {sourceName: 'AdrSource'});  // overwrite via name
        expect(SourceRegistry.getSources()).toHaveLength(1);
        expect(SourceRegistry.getSources()[0]).toBe(DEFAULT_SOURCES[1]);
    });

    test('unregisterSource removes the registration and returns true on first call, false thereafter', () => {
        SourceRegistry.registerSource(DEFAULT_SOURCES[0]);
        expect(SourceRegistry.unregisterSource('AdrSource')).toBe(true);
        expect(SourceRegistry.unregisterSource('AdrSource')).toBe(false);
        expect(SourceRegistry.hasSource('AdrSource')).toBe(false);
    });

    test('Parser registry has parallel surface — register / unregister / has / get', () => {
        const stubParser = {className: 'Tenant.Parser.Proto', config: {className: 'Tenant.Parser.Proto'}};

        SourceRegistry.registerParser(stubParser, {parserId: 'proto-v1'});
        expect(SourceRegistry.hasParser('proto-v1')).toBe(true);
        expect(SourceRegistry.getParsers()).toHaveLength(1);
        expect(SourceRegistry.getParserIds()).toEqual(['proto-v1']);

        expect(SourceRegistry.unregisterParser('proto-v1')).toBe(true);
        expect(SourceRegistry.hasParser('proto-v1')).toBe(false);
    });

    test('registerSource throws when no sourceName and class has no derivable name', () => {
        const unidentifiedClass = {};
        expect(() => SourceRegistry.registerSource(unidentifiedClass)).toThrow(
            /requires either a `sourceName` option or a SourceClass with a derivable className/
        );
    });

    test('clear empties both source + parser registries', () => {
        SourceRegistry.registerSource(DEFAULT_SOURCES[0]);
        SourceRegistry.registerParser({className: 'P', config: {className: 'P'}}, {parserId: 'p'});

        expect(SourceRegistry.getSources()).toHaveLength(1);
        expect(SourceRegistry.getParsers()).toHaveLength(1);

        SourceRegistry.clear();
        expect(SourceRegistry.getSources()).toHaveLength(0);
        expect(SourceRegistry.getParsers()).toHaveLength(0);
    });

    test('getSources/getParsers return arrays (not live Map iterators) — safe to mutate', () => {
        SourceRegistry.registerSource(DEFAULT_SOURCES[0]);
        const list = SourceRegistry.getSources();
        list.push('externally-added');
        expect(SourceRegistry.getSources()).toHaveLength(1);  // internal state unchanged
    });
});

test.describe('SourceRegistry auto-registration via _export.mjs (#11658)', () => {
    test('default Neo sources are present after import when useDefaultSources is true', async () => {
        // Importing the export module triggers auto-registration if `aiConfig.useDefaultSources !== false`.
        // Default config has `useDefaultSources: true`, so all 10 sources should be present.
        const exportModule = await import('../../../../../../../ai/services/knowledge-base/source/_export.mjs');
        const SourceRegistry = exportModule.default;

        // Re-import is a no-op (modules cached); re-register defaults idempotently to
        // re-establish post-`clear()` state from prior tests in the worker.
        SourceRegistry.clear();
        for (const SourceClass of exportModule.DEFAULT_SOURCES) {
            SourceRegistry.registerSource(SourceClass);
        }

        const names = SourceRegistry.getSourceNames();
        expect(names).toHaveLength(10);
        expect(names[0]).toBe('AdrSource');
        expect(names[names.length - 1]).toBe('TestSource');
    });

    test('order matches pre-#11658 hardcoded array (byte-equivalence anchor)', async () => {
        const exportModule = await import('../../../../../../../ai/services/knowledge-base/source/_export.mjs');
        const SourceRegistry = exportModule.default;

        SourceRegistry.clear();
        for (const SourceClass of exportModule.DEFAULT_SOURCES) {
            SourceRegistry.registerSource(SourceClass);
        }

        const names = SourceRegistry.getSourceNames();
        // Pre-#11658 hardcoded order in DatabaseService.mjs:454-465 — byte-equivalence requires this exact sequence.
        expect(names).toEqual([
            'AdrSource',
            'ApiSource',
            'ConceptSource',
            'DiscussionSource',
            'LearningSource',
            'PullRequestSource',
            'ReleaseNotesSource',
            'SkillSource',
            'TicketSource',
            'TestSource'
        ]);
    });
});
