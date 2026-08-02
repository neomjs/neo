import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';
import {
    censusServer,
    classify,
    describeParams,
    extractOperations,
    parseModule,
    resolveHandlerParams,
    extractServiceMapping
} from '../../../../../../ai/scripts/diagnostics/mcpHandlerSignatureCensus.mjs';

/**
 * @summary Contract suite for the MCP handler-signature census. Pins the mechanical
 * layers the ticket's ACs stand on: the runtime-mirrored contract extraction, the parameter
 * descriptor shapes, every classification arm (classes 1 / 2 / 2M / 3 + suspect forms), the
 * serviceMapping resolution shapes (bind-chain, inline arrow, local identifier), and an
 * end-to-end fixture server carrying the two known-positive shapes proven against the live
 * dispatcher — a census instrument that cannot catch its own known positives has not been
 * validated.
 */

const A = (name, type, properties = []) => ({name, type, properties});
const P = name => ({kind: 'positional', name, keys: [], hasDefault: false});
const D = (keys, hasDefault = false) => ({kind: 'destructure', keys, hasDefault});

test.describe('mcp-handler-signature census', () => {

    test.describe('extractOperations mirrors the runtime derivation', () => {
        const doc = {
            paths: {
                '/a': {get: {
                    operationId: 'with_params',
                    parameters : [{name: 'pr_number', schema: {type: 'integer'}}],
                    requestBody: {content: {'application/json': {schema: {properties: {
                        file: {type: 'string'},
                        sha : {type: 'string'}
                    }}}}}
                }},
                '/b': {post: {
                    operationId       : 'with_ref',
                    'x-pass-as-object': true,
                    requestBody       : {content: {'application/json': {schema: {$ref: '#/components/schemas/Body'}}}}
                }},
                '/c': {get: {operationId: 'nullary'}}
            },
            components: {schemas: {Body: {properties: {
                verbose: {type: 'boolean'},
                opts   : {type: 'object', properties: {deep: {type: 'string'}}}
            }}}}
        };

        const ops = Object.fromEntries(extractOperations(doc).map(o => [o.operationId, o]));

        test('parameters + inline requestBody properties concatenate in declaration order', () => {
            expect(ops.with_params.args.map(a => a.name)).toEqual(['pr_number', 'file', 'sha']);
            expect(ops.with_params.args[0].type).toBe('integer');
            expect(ops.with_params.passAsObject).toBe(false);
        });

        test('$ref request bodies resolve one level, exactly like the runtime', () => {
            expect(ops.with_ref.args.map(a => a.name)).toEqual(['verbose', 'opts']);
            expect(ops.with_ref.args[1].properties).toEqual(['deep']);
            expect(ops.with_ref.passAsObject).toBe(true);
        });

        test('operations without inputs census as zero-arg, unannotated', () => {
            expect(ops.nullary.args).toEqual([]);
            expect(ops.nullary.passAsObject).toBe(false);
        });
    });

    test.describe('describeParams', () => {
        const fn = source => {
            const ast  = parseModule(`const f = ${source};`);
            const decl = ast.body[0].declarations[0].init;
            return describeParams(decl.params);
        };

        test('positional, destructure (with/without default), rest, defaulted positional', () => {
            expect(fn('(a, b) => {}')).toEqual([P('a'), P('b')]);
            expect(fn('({x, y}) => {}')).toEqual([{kind: 'destructure', keys: ['x', 'y'], hasDefault: false}]);
            expect(fn('({x} = {}) => {}')).toEqual([{kind: 'destructure', keys: ['x'], hasDefault: true}]);
            expect(fn('(...rest) => {}')).toEqual([{kind: 'rest', name: 'rest', keys: [], hasDefault: false}]);
            expect(fn('(a = 1) => {}')).toEqual([{...P('a'), hasDefault: true}]);
        });
    });

    test.describe('classify — the defect taxonomy', () => {
        test('class 1: positional params in contract order', () => {
            const v = classify({passAsObject: false, args: [A('pr_number', 'integer'), A('file', 'string')], params: [P('pr_number'), P('file')]});
            expect(v.klass).toBe(1);
            expect(v.form).toBe('positional');
        });

        test('class 1: single-arg rename cannot misorder — there is one value and one slot', () => {
            // the get_local_issue_by_id shape: contract 'issue_number', handler '(issueNumber)'
            const v = classify({passAsObject: false, args: [A('issue_number', 'string')], params: [P('issueNumber')]});
            expect(v.klass).toBe(1);
            expect(v.form).toBe('positional-rename');
        });

        test('suspect: a generic bag name under single-arg positional dispatch', () => {
            const v = classify({passAsObject: false, args: [A('staleAfterMs', 'integer')], params: [P('args')]});
            expect(v.klass).toBe('suspect');
            expect(v.form).toBe('bag-or-rename');
        });

        test('suspect: multi-arg order mismatch needs human eyes', () => {
            const v = classify({passAsObject: false, args: [A('a'), A('b')], params: [P('b'), P('a')]});
            expect(v.klass).toBe('suspect');
            expect(v.form).toBe('order-mismatch');
        });

        test('class 2: destructuring under positional dispatch degrades silently', () => {
            // the pre-fix get_ingestion_progress shape
            const v = classify({passAsObject: false, args: [A('staleAfterMs', 'integer')], params: [D(['staleAfterMs'], true)]});
            expect(v.klass).toBe(2);
            expect(v.form).toBe('destructure-under-positional');
            expect(v.detail).toContain('undefined');
        });

        test('class 2: zero-arg contract + bare destructure throws on every call (loud variant)', () => {
            const v = classify({passAsObject: false, args: [], params: [D(['x'])]});
            expect(v.klass).toBe(2);
            expect(v.form).toBe('destructure-nullary-throws');
        });

        test('class 1: zero-arg contract + defaulted destructure has nothing to lose', () => {
            const v = classify({passAsObject: false, args: [], params: [D(['x'], true)]});
            expect(v.klass).toBe(1);
            expect(v.form).toBe('nullary-destructure-defaulted');
        });

        test('class 1: nested-object destructure of a single object arg is correct', () => {
            const v = classify({passAsObject: false, args: [A('config', 'object', ['a', 'b'])], params: [D(['a', 'b'])]});
            expect(v.klass).toBe(1);
            expect(v.form).toBe('nested-object-destructure');
        });

        test('suspect: nested-object destructure naming keys the contract does not declare', () => {
            const v = classify({passAsObject: false, args: [A('config', 'object', ['a'])], params: [D(['a', 'zzz'])]});
            expect(v.klass).toBe('suspect');
            expect(v.form).toBe('nested-object-destructure-unverified');
        });

        test('class 3: fewer handler params than contract args truncates silently', () => {
            // the pre-fix get_pull_request_diff shape: 1 param for 4 contract args
            const v = classify({passAsObject: false,
                args  : [A('pr_number', 'integer'), A('file', 'string'), A('sha', 'string'), A('files_only', 'boolean')],
                params: [P('options')]});
            expect(v.klass).toBe(3);
            expect(v.form).toBe('truncation');
            expect(v.detail).toContain('file,sha,files_only');
        });

        test('class 1: superset prefix-aligned extras are unreachable, not broken', () => {
            const v = classify({passAsObject: false, args: [A('id', 'string')], params: [P('id'), {...P('fallback'), hasDefault: true}]});
            expect(v.klass).toBe(1);
            expect(v.form).toBe('positional-superset');
        });

        test('annotated: destructure and single-bag forms are correct', () => {
            expect(classify({passAsObject: true, args: [A('a')], params: [D(['a'])]}).klass).toBe(1);
            expect(classify({passAsObject: true, args: [A('a')], params: [P('options')]}).form).toBe('annotated-bag');
        });

        test('annotated: injectable extra params are fine; contract-shadowing extras are class 2M', () => {
            // the getConversationRouter shape: (options, identityOptions = {})
            const ok = classify({passAsObject: true, args: [A('pr_number')], params: [P('options'), {...P('identityOptions'), hasDefault: true}]});
            expect(ok.klass).toBe(1);
            expect(ok.form).toBe('annotated-bag+injectables');

            const bad = classify({passAsObject: true, args: [A('pr_number')], params: [P('options'), P('pr_number')]});
            expect(bad.klass).toBe('2M');
            expect(bad.form).toBe('annotation-mismatch');
        });
    });

    test.describe('resolveHandlerParams — the binding shapes', () => {
        const ctxFor = (source, files = {}) => {
            const dir  = fs.mkdtempSync(path.join(os.tmpdir(), 'census-ts-'));
            const file = path.join(dir, 'toolService.mjs');
            fs.writeFileSync(file, source);
            for (const [name, content] of Object.entries(files)) {
                fs.writeFileSync(path.join(dir, name), content);
            }
            const ast       = parseModule(source);
            const {imports} = extractServiceMapping(ast);
            return {imports, filePath: file, root: dir, fileCache: new Map(), ast, dir};
        };

        test('Service.method.bind(Service) resolves into the imported module', () => {
            const ctx = ctxFor(
                `import Svc from './Svc.mjs';\nconst serviceMapping = {op: Svc.run.bind(Svc)};`,
                {'Svc.mjs': `class Svc { async run(one, two) { return one; } }\nexport default Svc;`}
            );
            const valueNode = extractServiceMapping(ctx.ast).entries.get('op');
            const resolved  = resolveHandlerParams(valueNode, ctx);
            expect(resolved.via).toBe('Svc.run');
            expect(resolved.params.map(p => p.name)).toEqual(['one', 'two']);
        });

        test('inline arrows answer in place', () => {
            const ctx  = ctxFor(`const serviceMapping = {op: toolId => handbook(toolId)};`);
            const node = extractServiceMapping(ctx.ast).entries.get('op');
            expect(resolveHandlerParams(node, ctx).params.map(p => p.name)).toEqual(['toolId']);
        });

        test('local identifiers resolve to their declarations', () => {
            const ctx      = ctxFor(`async function router(options, extra = {}) {}\nconst serviceMapping = {op: router};`);
            const node     = extractServiceMapping(ctx.ast).entries.get('op');
            const resolved = resolveHandlerParams(node, ctx);
            expect(resolved.params.map(p => p.name)).toEqual(['options', 'extra']);
        });

        test('unresolvable shapes are named, never dropped', () => {
            const ctx  = ctxFor(`const serviceMapping = {op: build()};`);
            const node = extractServiceMapping(ctx.ast).entries.get('op');
            expect(resolveHandlerParams(node, ctx).unresolved).toContain('unhandled mapping value shape');
        });
    });

    test.describe('end-to-end fixture server (AC4 shapes)', () => {
        test('a fixture server carrying both known-positive shapes censuses correctly', () => {
            const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'census-e2e-')), 'srv');
            fs.mkdirSync(dir, {recursive: true});

            fs.writeFileSync(path.join(dir, 'openapi.yaml'), [
                'openapi: 3.0.0',
                'paths:',
                '  /progress:',
                '    get:',
                '      operationId: get_progress',
                '      parameters:',
                '        - name: staleAfterMs',
                '          schema: {type: integer}',
                '  /diff:',
                '    get:',
                '      operationId: get_diff',
                '      parameters:',
                '        - {name: pr_number, schema: {type: integer}}',
                '        - {name: file, schema: {type: string}}',
                '  /ok:',
                '    get:',
                '      operationId: get_ok',
                '      parameters:',
                '        - {name: toolId, schema: {type: string}}',
                '  /annotated:',
                '    get:',
                '      operationId: get_annotated',
                '      x-pass-as-object: true',
                '      parameters:',
                '        - {name: verbose, schema: {type: boolean}}'
            ].join('\n'));

            fs.writeFileSync(path.join(dir, 'toolService.mjs'), [
                `import Svc from './Svc.mjs';`,
                `const serviceMapping = {`,
                `    get_progress : Svc.progress.bind(Svc),`,
                `    get_diff     : Svc.diff.bind(Svc),`,
                `    get_ok       : toolId => Svc.handbook(toolId),`,
                `    get_annotated: Svc.annotated.bind(Svc)`,
                `};`
            ].join('\n'));

            fs.writeFileSync(path.join(dir, 'Svc.mjs'), [
                `class Svc {`,
                `    progress({staleAfterMs = 60000} = {}) {}`,
                `    diff(options) {}`,
                `    handbook(toolId) {}`,
                `    annotated({verbose} = {}) {}`,
                `}`,
                `export default Svc;`
            ].join('\n'));

            const server = {id: 'fixture', openApi: 'openapi.yaml', toolService: 'toolService.mjs'};
            const rows   = Object.fromEntries(censusServer(dir, server).map(r => [r.operationId, r]));

            expect(rows.get_progress.klass).toBe(2);   // destructure-under-positional
            expect(rows.get_diff.klass).toBe(3);       // 1 param for 2 contract args
            expect(rows.get_ok.klass).toBe(1);         // inline positional
            expect(rows.get_annotated.klass).toBe(1);  // annotated destructure
        });
    });
});
