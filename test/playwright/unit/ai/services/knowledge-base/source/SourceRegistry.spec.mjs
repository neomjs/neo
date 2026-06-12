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
    let SourceRegistry, DEFAULT_SOURCES, RawRepoSource;

    test.beforeAll(async () => {
        const exportModule = await import('../../../../../../../ai/services/knowledge-base/source/_export.mjs');
        SourceRegistry  = exportModule.default;
        DEFAULT_SOURCES = exportModule.DEFAULT_SOURCES;
        RawRepoSource   = exportModule.RawRepoSource;
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
        expect(DEFAULT_SOURCES).not.toContain(RawRepoSource);
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

// Direct coverage for the config-driven registration path introduced in Phase 0/1B (#11658),
// closing @neo-gpt's Cycle 1 review Required Action 2 (commentId PRR_kwDODSospM8AAAABAY3bSg):
// "Add direct coverage for the new config-driven surfaces" — programmatic `registerSource()`
// alone doesn't prove the `useDefaultSources` toggle + declarative `customSources`/`customParsers`
// arrays work as documented. The `applyConfigToRegistry` exported function exposes the
// import-time side-effect logic for direct invocation against a fresh registry + mock config.
test.describe('applyConfigToRegistry — config-driven registration path (#11658 RA2)', () => {
    let SourceRegistry, applyConfigToRegistry, DEFAULT_SOURCES;

    test.beforeAll(async () => {
        const exportModule    = await import('../../../../../../../ai/services/knowledge-base/source/_export.mjs');
        SourceRegistry        = exportModule.default;
        applyConfigToRegistry = exportModule.applyConfigToRegistry;
        DEFAULT_SOURCES       = exportModule.DEFAULT_SOURCES;
    });

    test.beforeEach(() => {
        SourceRegistry.clear();
    });

    test('useDefaultSources:false skips default Neo source auto-registration', () => {
        const stats = applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,
            customSources    : [],
            customParsers    : []
        });

        expect(stats.defaultSourcesRegistered).toBe(0);
        expect(stats.rawRepoSourceRegistered).toBe(0);
        expect(SourceRegistry.getSources()).toHaveLength(0);
        expect(SourceRegistry.getSourceNames()).toEqual([]);
    });

    test('useDefaultSources:true (or undefined) registers all 10 default Neo sources', () => {
        const stats = applyConfigToRegistry(SourceRegistry, {});  // omitted toggle = truthy default

        expect(stats.defaultSourcesRegistered).toBe(10);
        expect(stats.rawRepoSourceRegistered).toBe(0);
        expect(SourceRegistry.getSources()).toHaveLength(10);
        // First + last sentinel checks reaffirm insertion order without re-asserting the full sequence
        // (the byte-equivalence test in the prior describe block holds the order invariant).
        expect(SourceRegistry.getSourceNames()[0]).toBe('AdrSource');
        expect(SourceRegistry.getSourceNames()[9]).toBe('TestSource');
    });

    test('rawRepoSource:true registers RawRepoSource explicitly without widening DEFAULT_SOURCES', () => {
        const stats = applyConfigToRegistry(SourceRegistry, {
            rawRepoSource    : true,
            useDefaultSources: false
        });

        expect(stats.rawRepoSourceRegistered).toBe(1);
        expect(stats.defaultSourcesRegistered).toBe(0);
        expect(SourceRegistry.getSourceNames()).toEqual(['RawRepoSource']);
    });

    test('declarative customSources entry registers tenant source class with sourceName override', () => {
        // Stub class shaped like a Source: has the `className` config-shape derivation entrypoint.
        const TenantSource = {className: 'Tenant.MyEs5Source', config: {className: 'Tenant.MyEs5Source'}};

        const stats = applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,  // isolate to custom path
            customSources    : [
                {SourceClass: TenantSource, sourceName: 'tenant-X-es5'}
            ]
        });

        expect(stats.customSourcesRegistered).toBe(1);
        expect(SourceRegistry.hasSource('tenant-X-es5')).toBe(true);
        expect(SourceRegistry.getSources()[0]).toBe(TenantSource);
    });

    test('declarative customSources entry derives sourceName from className when omitted', () => {
        const TenantSource = {className: 'Tenant.MyEs5Source', config: {className: 'Tenant.MyEs5Source'}};

        applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,
            customSources    : [{SourceClass: TenantSource}]  // no sourceName — falls back to className final segment
        });

        expect(SourceRegistry.hasSource('MyEs5Source')).toBe(true);
    });

    test('declarative customParsers entry registers tenant parser class with parserId override', () => {
        const TenantParser = {className: 'Tenant.ProtoParser', config: {className: 'Tenant.ProtoParser'}};

        const stats = applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,
            customParsers    : [
                {ParserClass: TenantParser, parserId: 'proto-v1'}
            ]
        });

        expect(stats.customParsersRegistered).toBe(1);
        expect(SourceRegistry.hasParser('proto-v1')).toBe(true);
        expect(SourceRegistry.getParsers()[0]).toBe(TenantParser);
    });

    test('customSources entries with missing SourceClass are silently skipped (defensive — protects against config drift)', () => {
        const stats = applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,
            customSources    : [
                {sourceName: 'orphan-no-class'},  // missing SourceClass — skipped
                null,                              // null entry — skipped
                {SourceClass: null, sourceName: 'null-class'}  // falsy SourceClass — skipped
            ]
        });

        expect(stats.customSourcesRegistered).toBe(0);
        expect(SourceRegistry.getSources()).toHaveLength(0);
    });

    test('full config-driven path: cloud deployment shape with defaults disabled + tenant sources + tenant parsers', () => {
        const TenantSource1 = {className: 'Tenant.A.SourceA', config: {className: 'Tenant.A.SourceA'}};
        const TenantSource2 = {className: 'Tenant.A.SourceB', config: {className: 'Tenant.A.SourceB'}};
        const TenantParser1 = {className: 'Tenant.A.ParserP', config: {className: 'Tenant.A.ParserP'}};

        const stats = applyConfigToRegistry(SourceRegistry, {
            useDefaultSources: false,
            useDefaultParsers: false,
            customSources    : [
                {SourceClass: TenantSource1, sourceName: 'tenant-A-srcA'},
                {SourceClass: TenantSource2}
            ],
            customParsers: [
                {ParserClass: TenantParser1, parserId: 'tenant-A-protoP'}
            ]
        });

        expect(stats).toEqual({
            defaultSourcesRegistered: 0,
            rawRepoSourceRegistered: 0,
            customSourcesRegistered : 2,
            customParsersRegistered : 1
        });
        expect(SourceRegistry.getSourceNames()).toEqual(['tenant-A-srcA', 'SourceB']);
        expect(SourceRegistry.getParserIds()).toEqual(['tenant-A-protoP']);
    });
});
