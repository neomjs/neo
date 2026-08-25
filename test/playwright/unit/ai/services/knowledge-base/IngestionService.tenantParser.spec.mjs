import {setup} from '../../../../setup.mjs';

const appName = 'IngestionServiceTenantParserTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import aiConfig       from '../../../../../../ai/mcp/server/knowledge-base/config.template.mjs';

/**
 * The AC this file exists for is the one a loader unit test cannot reach.
 *
 * `tenantParserLoader.spec.mjs` proves the containment predicate against a real filesystem. It says
 * nothing about whether anything CALLS it — and the defect this ticket fixed was exactly that: a
 * `customParsers` entry resolved through `getTenantConfig` and then consumed by nobody. So the
 * observable here is deliberately the parser's OUTPUT arriving out of `resolveFileChunks`, never the
 * config object that declared it. Asserting the declaration round-trips would re-certify the bug.
 *
 * Two things only an end-to-end run can check, both of which a green loader suite hid:
 *
 * - **`aiConfig.tenantParserRoot` names a real leaf.** A typo resolves to `undefined`, the loader
 *   refuses with `ROOT_NOT_SET`, and the feature is inert on every correct deployment — the same
 *   silent-disable shape as a hidden default, arrived at from the opposite direction.
 * - **The registry hands back CLASSES, not instances.** `SourceRegistry.getParsers()` returns
 *   `Array.from(this._parsers.values())`, so `parseIngestionFile` is invoked statically. A loader
 *   returning a class is correct only because of that; the fixtures below are static to match, and
 *   an instance-based registry would have made this wiring fail at the call, not at the load.
 *
 * The root is set through `setEnvOverride` — the Provider's own bounded re-resolution handle — and
 * never by assigning `aiConfig.<path> = value`. That assignment routes through the proxy's set-trap
 * to the OWNING provider, i.e. the shared singleton, which is the mechanism by which test state
 * reaches live databases; isolation belongs to the env layer, not to a write.
 *
 * `config.template.mjs` and the `config.mjs` the service imports are distinct proxies over one
 * shared provider, so an override placed here is what the service reads. That was measured rather
 * than assumed, because comparing the two exports for identity reports `false` and would talk you
 * out of a mechanism that works.
 */
test.describe.configure({mode: 'serial'});

const PARSER_ONE = `export default class ParserOne {
    static async parseIngestionFile(file) {
        return [{producedBy: 'ParserOne', sourcePath: file.sourcePath}]
    }
}
`;

const PARSER_TWO = `export default class ParserTwo {
    static async parseIngestionFile(file) {
        return [{producedBy: 'ParserTwo', sourcePath: file.sourcePath}]
    }
}
`;

const PARSER_NAMED = `export class Custom {
    static async parseIngestionFile(file) {
        return [{producedBy: 'Custom', sourcePath: file.sourcePath}]
    }
}
export default null;
`;

// The broken shape. The method is present the whole time — it lives on `prototype`, so
// `ParserClass.parseIngestionFile` reads `undefined` while the class itself stays truthy.
const PARSER_INSTANCE_METHOD = `export default class ParserInstance {
    async parseIngestionFile(file) {
        return [{producedBy: 'ParserInstance', sourcePath: file.sourcePath}]
    }
}
`;

// `parse` is the second probe in the dispatch chain, so an instance-only `parse` degrades the same
// way. The refusal must not be written against `parseIngestionFile` alone.
const PARSER_INSTANCE_PARSE = `export default class ParserInstanceParse {
    async parse(file) {
        return [{producedBy: 'ParserInstanceParse', sourcePath: file.sourcePath}]
    }
}
`;

// The shape a tenant reaches for when they read the contract as data rather than as a class.
const PARSER_OBJECT_LITERAL = `export default {
    async parseIngestionFile(file) {
        return [{producedBy: 'ParserLiteral', sourcePath: file.sourcePath}]
    }
};
`;

function createGraphStub() {
    const store = new Map();

    return {
        store,
        async ready() {},
        getNodeRecord({id}) {
            return store.has(id) ? {...store.get(id)} : null
        },
        async upsertNode({id, type, properties}) {
            store.set(id, {id, type, properties: {...properties}})
        }
    }
}

function sourceFile({parserId, sourcePath = 'src/index.js'} = {}) {
    return {content: 'export const value = 1;', parserId, sourcePath}
}

test.describe('IngestionService — a tenant-declared parser reaches dispatch (#17294)', () => {
    let Service, graphStub, originals, tmpRoot, parserRoot;

    test.beforeAll(async () => {
        Service = (await import('../../../../../../ai/services/knowledge-base/IngestionService.mjs')).default;

        // One stable root for the whole file. The pinned root is a deployment leaf resolved once at
        // boot, so the parser cache deliberately does not key on it; a per-test root would make these
        // tests share cache entries across differing trees for no production reason.
        tmpRoot    = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-tenant-parser-'));
        parserRoot = path.join(tmpRoot, 'kb-parsers');

        fs.mkdirSync(parserRoot, {recursive: true});
        fs.mkdirSync(path.join(tmpRoot, 'outside'), {recursive: true});

        fs.writeFileSync(path.join(parserRoot, 'ParserOne.mjs'), PARSER_ONE);
        fs.writeFileSync(path.join(parserRoot, 'ParserTwo.mjs'), PARSER_TWO);
        fs.writeFileSync(path.join(parserRoot, 'Named.mjs'), PARSER_NAMED);
        fs.writeFileSync(path.join(parserRoot, 'Instance.mjs'), PARSER_INSTANCE_METHOD);
        fs.writeFileSync(path.join(parserRoot, 'InstanceParse.mjs'), PARSER_INSTANCE_PARSE);
        fs.writeFileSync(path.join(parserRoot, 'Literal.mjs'), PARSER_OBJECT_LITERAL);
        fs.writeFileSync(path.join(tmpRoot, 'outside', 'Evil.mjs'), PARSER_ONE);
    });

    test.afterAll(() => {
        // Restore by SETTING, not by deleting: `#applyEnvLayer` skips a leaf whose decoded env value
        // is undefined, so an unset var leaves the last value in place. A runtime override restores
        // the declared default deterministically.
        aiConfig.setEnvOverride('NEO_KB_TENANT_PARSER_ROOT', '');
        fs.rmSync(tmpRoot, {recursive: true, force: true});
    });

    test.beforeEach(() => {
        graphStub = createGraphStub();
        originals = {
            graphService         : Service.graphService,
            readKbConfigBootstrap: Service.readKbConfigBootstrap,
            requestContextService: Service.requestContextService
        };

        Service.graphService          = graphStub;
        Service.readKbConfigBootstrap = () => null;
        Service.requestContextService = {
            getAgentIdentityNodeId: () => '@tenant-a',
            getUserId             : () => 'tenant-a'
        };

        aiConfig.setEnvOverride('NEO_KB_TENANT_PARSER_ROOT', parserRoot);
    });

    test.afterEach(() => {
        Object.assign(Service, originals);
    });

    test('POSITIVE CONTROL: a data-tier declaration is DISPATCHED, witnessed by the parser output', async () => {
        // The whole ticket in one assertion. `kb-config.yaml` and the graph node hold strings, never
        // class references, so `parserModule` is the only shape a data tier can declare — and before
        // this change it was inert by construction rather than misconfigured.
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac1-dispatch', parserModule: 'ParserOne.mjs'}]}
        });

        const chunks = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac1-dispatch'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(chunks).toEqual([{producedBy: 'ParserOne', sourcePath: 'src/index.js'}]);
    });

    test('the resolution root comes from the DEPLOYMENT leaf — a typo would read undefined, not empty', () => {
        // `resolveTenantParser` passes `aiConfig.tenantParserRoot` to the loader. That one line is
        // invisible to every other test here: a misspelled path yields `undefined`, the loader
        // refuses ROOT_NOT_SET, and tenant parsers are permanently disabled on a CORRECT deployment.
        // `undefined !== ''` is what discriminates, so the declared default is asserted directly.
        expect(aiConfig.tenantParserRoot).toBe(parserRoot);

        aiConfig.setEnvOverride('NEO_KB_TENANT_PARSER_ROOT', '');
        expect(aiConfig.tenantParserRoot).toBe('');
        expect(aiConfig.tenantParserRoot).not.toBeUndefined();

        aiConfig.setEnvOverride('NEO_KB_TENANT_PARSER_ROOT', parserRoot);
    });

    test('two tenants declaring the SAME parserId get their OWN parser, and the global registry gets neither', async () => {
        const registryIdsBefore = [...Service.sourceRegistry.getParserIds()];

        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac2-shared-id', parserModule: 'ParserOne.mjs'}]}
        });

        // A cross-tenant write is refused by the RLS gate, so tenant-b declares under its own identity.
        Service.requestContextService = {
            getAgentIdentityNodeId: () => '@tenant-b',
            getUserId             : () => 'tenant-b'
        };

        await Service.setTenantConfig({
            tenantId: 'tenant-b',
            config  : {customParsers: [{parserId: 'ac2-shared-id', parserModule: 'ParserTwo.mjs'}]}
        });

        const forA = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac2-shared-id'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });
        const forB = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac2-shared-id'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-b'}
        });

        expect(forA[0].producedBy).toBe('ParserOne');
        expect(forB[0].producedBy).toBe('ParserTwo');

        // The isolation is structural rather than guarded: `SourceRegistry` keys on `parserId` alone
        // and overwrites on re-registration, so routing tenant parsers through it would be
        // last-tenant-wins. Nothing tenant-declared may appear here.
        expect(Service.sourceRegistry.getParserIds()).toEqual(registryIdsBefore);
        expect(Service.sourceRegistry.getParserIds()).not.toContain('ac2-shared-id');
    });

    test('a tenant that RE-DECLARES parserModule gets the new class, not a cached stale one', async () => {
        // The graph tier is writable at runtime with no restart, so a parser cache keyed only on
        // `<tenantId>::<parserId>` pins the first class loaded for that id forever. The digest-based
        // checkpoint invalidation would then correctly re-materialize the repo THROUGH THE OLD PARSER.
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-restale', parserModule: 'ParserOne.mjs'}]}
        });

        const first = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac-restale'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(first[0].producedBy).toBe('ParserOne');

        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-restale', parserModule: 'ParserTwo.mjs'}]}
        });

        const second = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac-restale'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(second[0].producedBy).toBe('ParserTwo');
    });

    test('a declared-but-missing module FAILS LOUDLY — it must not degrade to a raw-text chunk', async () => {
        // The degradation is the dangerous outcome, not the error. A missing parser falling through to
        // `raw-text` INGESTS SUCCESSFULLY: whole-file chunks, no error raised, retrieval quietly
        // worse, and not even an anomalous count to notice.
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac4-absent', parserModule: 'Absent.mjs'}]}
        });

        let error;

        try {
            await Service.resolveFileChunks({
                file         : sourceFile({parserId: 'ac4-absent'}),
                fileIndex    : 0,
                tenantContext: {tenantId: 'tenant-a'}
            })
        } catch (caught) {
            error = caught
        }

        expect(error?.code).toBe('KB_TENANT_PARSER_NOT_FOUND');
        expect(error.code).not.toBe('KB_PARSER_NOT_REGISTERED');
    });

    test('an escape attempt arriving through the TENANT TIER is refused at the service boundary', async () => {
        // The loader spec proves the predicate. This proves the predicate is on the production path
        // that a tenant can actually reach, which is a different claim.
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac3-escape', parserModule: '../outside/Evil.mjs'}]}
        });

        let error;

        try {
            await Service.resolveFileChunks({
                file         : sourceFile({parserId: 'ac3-escape'}),
                fileIndex    : 0,
                tenantContext: {tenantId: 'tenant-a'}
            })
        } catch (caught) {
            error = caught
        }

        expect(error?.code).toBe('KB_TENANT_PARSER_SPECIFIER_ESCAPES_ROOT');
    });

    test('a named export is dispatched when the declaration asks for one', async () => {
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-named', parserModule: 'Named.mjs', exportName: 'Custom'}]}
        });

        const chunks = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac-named'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(chunks[0].producedBy).toBe('Custom');
    });

    test('a live ParserClass entry still wins — the JS-config tier is untouched by this path', async () => {
        class InlineParser {
            static async parseIngestionFile(file) {
                return [{producedBy: 'InlineParser', sourcePath: file.sourcePath}]
            }
        }

        // Written straight into the tier: `setTenantConfig` persists JSON properties, which cannot
        // carry a class — that asymmetry is the reason `parserModule` exists at all.
        graphStub.store.set('kb-config:tenant-a', {
            id        : 'kb-config:tenant-a',
            type      : 'KnowledgeBaseTenantConfig',
            properties: {version: 1, customParsers: [{parserId: 'ac-inline', ParserClass: InlineParser}]}
        });

        const chunks = await Service.resolveFileChunks({
            file         : sourceFile({parserId: 'ac-inline'}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(chunks[0].producedBy).toBe('InlineParser');
    });

    test('NEGATIVE CONTROL: with no tenant declaration the registry is untouched and the global path answers', async () => {
        // AC5/AC6 — a zero-config deployment must behave exactly as before. The loader existing is
        // not allowed to change what an undeclared tenant resolves.
        const registryIdsBefore = [...Service.sourceRegistry.getParserIds()];

        await Service.setTenantConfig({tenantId: 'tenant-a', config: {}});

        const chunks = await Service.resolveFileChunks({
            file         : sourceFile(),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        // No `parserId` on the payload and nothing declared: the raw-file record, exactly as before.
        expect(chunks).toHaveLength(1);
        expect(chunks[0].parserId).toBe('raw-text');
        expect(Service.sourceRegistry.getParserIds()).toEqual(registryIdsBefore);
    });

    test('an unset deployment root disables the feature rather than guessing one', async () => {
        aiConfig.setEnvOverride('NEO_KB_TENANT_PARSER_ROOT', '');

        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-noroot', parserModule: 'ParserOne.mjs'}]}
        });

        let error;

        try {
            await Service.resolveFileChunks({
                file         : sourceFile({parserId: 'ac-noroot'}),
                fileIndex    : 0,
                tenantContext: {tenantId: 'tenant-a'}
            })
        } catch (caught) {
            error = caught
        }

        expect(error?.code).toBe('KB_TENANT_PARSER_ROOT_NOT_SET');
        expect(error.message).toContain('NEO_KB_TENANT_PARSER_ROOT');
    });

    /**
     * Dispatch reads `parseIngestionFile` / `parse` off the resolved value itself, so a class
     * carrying either on `prototype` is truthy while both probes read `undefined`: the
     * `KB_PARSER_NOT_REGISTERED` throw is skipped, and the file degrades to a whole-file `raw-text`
     * chunk. Green load, green sweep, quietly worse corpus, and no anomalous count to notice.
     *
     * The observable is deliberately the coded refusal AND the absence of a raw-text chunk. Asserting
     * only that it throws would pass against a deployment that threw for any other reason.
     */
    test('an instance-method parser is REFUSED with a coded reason, not degraded to raw-text', async () => {
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-instance', parserModule: 'Instance.mjs'}]}
        });

        let chunks, error;

        try {
            chunks = await Service.resolveFileChunks({
                file         : sourceFile({parserId: 'ac-instance'}),
                fileIndex    : 0,
                tenantContext: {tenantId: 'tenant-a'}
            })
        } catch (caught) {
            error = caught
        }

        expect(chunks, 'the file must not silently become a whole-file chunk').toBeUndefined();
        expect(error?.code).toBe('KB_TENANT_PARSER_NOT_DISPATCHABLE');

        // The remediation is the entire defect and is invisible from the symptom, so the message has
        // to carry the static-vs-instance distinction rather than just naming the module.
        expect(error.message).toContain('Instance.mjs');
        expect(error.message).toMatch(/static/i);
        expect(error.message).toMatch(/instance method|prototype/i);
    });

    test('the refusal covers the `parse` probe too, not just `parseIngestionFile`', async () => {
        await Service.setTenantConfig({
            tenantId: 'tenant-a',
            config  : {customParsers: [{parserId: 'ac-instance-parse', parserModule: 'InstanceParse.mjs'}]}
        });

        let chunks, error;

        try {
            chunks = await Service.resolveFileChunks({
                file         : sourceFile({parserId: 'ac-instance-parse'}),
                fileIndex    : 0,
                tenantContext: {tenantId: 'tenant-a'}
            })
        } catch (caught) {
            error = caught
        }

        expect(chunks).toBeUndefined();
        expect(error?.code).toBe('KB_TENANT_PARSER_NOT_DISPATCHABLE');
    });

    /**
     * The three declared shapes as one table. Only the lookup surface differs between them — the
     * method is present in all three — so a test that exercised only the corrected shapes would prove
     * nothing: they already pass today.
     */
    for (const {shape, module: parserModule, dispatches, producedBy} of [
        {shape: 'static-method class', module: 'ParserOne.mjs', dispatches: true,  producedBy: 'ParserOne'},
        {shape: 'object literal',      module: 'Literal.mjs',   dispatches: true,  producedBy: 'ParserLiteral'},
        {shape: 'instance-method class', module: 'Instance.mjs', dispatches: false, producedBy: null}
    ]) {
        test(`shape table: a ${shape} ${dispatches ? 'dispatches' : 'is refused'}`, async () => {
            const parserId = `ac-table-${parserModule}`;

            await Service.setTenantConfig({
                tenantId: 'tenant-a',
                config  : {customParsers: [{parserId, parserModule}]}
            });

            let chunks, error;

            try {
                chunks = await Service.resolveFileChunks({
                    file         : sourceFile({parserId}),
                    fileIndex    : 0,
                    tenantContext: {tenantId: 'tenant-a'}
                })
            } catch (caught) {
                error = caught
            }

            if (dispatches) {
                expect(error).toBeUndefined();
                expect(chunks[0].producedBy).toBe(producedBy)
            } else {
                expect(error?.code).toBe('KB_TENANT_PARSER_NOT_DISPATCHABLE');
                expect(chunks).toBeUndefined()
            }
        });
    }

    test('NEGATIVE CONTROL: a zero-tenant deployment is untouched by the refusal', async () => {
        // The refusal is scoped to tenant-declared parsers. The global registry is populated once at
        // import time from static declarations, so a deployment that declares no tenant parser must
        // resolve exactly as before — including the raw-text fallback for an unparsed file, which
        // stays correct when nothing was declared.
        const registryIdsBefore = [...Service.sourceRegistry.getParserIds()];

        await Service.setTenantConfig({tenantId: 'tenant-a', config: {customParsers: []}});

        const chunks = await Service.resolveFileChunks({
            file         : sourceFile({parserId: undefined}),
            fileIndex    : 0,
            tenantContext: {tenantId: 'tenant-a'}
        });

        expect(chunks).toHaveLength(1);
        expect(chunks[0].producedBy).toBeUndefined();
        expect(Service.sourceRegistry.getParserIds()).toEqual(registryIdsBefore);
    });
});
