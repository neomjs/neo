import {createHash}                     from 'node:crypto';
import {execFileSync}                   from 'node:child_process';
import fs                               from 'node:fs';
import os                               from 'node:os';
import path                             from 'node:path';
import {pathToFileURL}                  from 'node:url';
import {test, expect}                   from '@playwright/test';
import {classifyReferences, sourceHash} from '../../../../buildScripts/util/moveReferenceScopes.mjs';
import {rewriteModule}                  from '../../../../buildScripts/util/moveSourceTransforms.mjs';
import {planMove, applyMove}            from '../../../../buildScripts/util/movePlan.mjs';

const computed = 'export const load = () => import(modulePath);';

test.describe('moveReferenceScopes (#5086)', () => {
    let root;

    /** @summary Writes only inside this test's temporary repository. */
    const write = (name, code) => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, code)
    };

    /** @summary Runs the source parser and classifier with a fixed old/new subtree move. */
    const classify = (code, {file='src/loader.mjs', to=file, scopes=[], classNames=new Map()}={}) => {
        const from     = path.join(root, file), target = path.join(root, to),
            references = rewriteModule({code, from, to: target, mapPath: value => value, classNames}).unresolved;
        return classifyReferences({root, file: from, to: target, code, references, scopes,
            moves: [{from: path.join(root, 'src/old'), to: path.join(root, 'src/new')}]})
    };

    /** @summary Binds a scope to one emitted occurrence, without widening it to matching expressions. */
    const declaration = (reference, scope={roots: ['src/unrelated']}) => ({
        file : path.relative(root, reference.file).split(path.sep).join('/'),
        start: reference.start, expression: reference.expression, sourceHash: reference.sourceHash, ...scope
    });

    /** @summary Builds a minimal real planner fixture with an unchanged computed importer. */
    const fixture = (code=computed) => {
        write('src/old/Widget.mjs', 'export default class Widget { static config = {className: "Neo.old.Widget"} }');
        write('src/loader.mjs', code)
    };

    const plan = (referenceScopes=[]) => planMove({root, source: 'src/old', destination: 'src/new', referenceScopes});

    test.beforeEach(() => {
        root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-reference-scopes-'))
    });

    test.afterEach(() => fs.rmSync(root, {recursive: true, force: true}));

    test('emits exact expression positions and a hash of the complete original source', () => {
        const [reference] = classify(computed),
            start         = computed.indexOf('modulePath'),
            hash          = createHash('sha256').update(computed).digest('hex');

        expect(reference).toMatchObject({file: path.join(root, 'src/loader.mjs'), start,
            end: start + 'modulePath'.length, expression: 'modulePath', sourceHash: hash, status: 'blocked'});
        expect(sourceHash(computed)).toBe(hash);
        expect(sourceHash(Buffer.from(computed))).toBe(hash)
    });

    test('admits exact disjoint roots without treating adjacent directory names as overlapping', () => {
        const [reference] = classify(computed),
            scope         = declaration(reference, {roots: ['src/oldSibling', 'src/newSibling']});

        expect(classify(computed, {scopes: [scope]})[0]).toMatchObject({status: 'declared',
            scope: {roots: ['src/oldSibling', 'src/newSibling'], protocols: []}})
    });

    for (const directory of ['src/old', 'src/old/child', 'src/new', 'src/new/child', 'src']) {
        test(`refuses a declared root overlapping the source or destination: ${directory}`, () => {
            const scope = declaration(classify(computed)[0], {roots: [directory]});

            expect(classify(computed, {scopes: [scope]})[0]).toMatchObject({status: 'blocked',
                reason: expect.stringMatching(/intersects/)});
        })
    }

    test('refuses to move a computed importer even when its declared local roots are disjoint', () => {
        const options = {file: 'src/old/loader.mjs', to: 'src/new/loader.mjs'},
            scope     = declaration(classify(computed, options)[0]);

        expect(classify(computed, {...options, scopes: [scope]})[0]).toMatchObject({status: 'blocked',
            reason: expect.stringMatching(/origin-aware/)});
    });

    test('admits declared external protocols while rejecting unsupported local or executable protocols', () => {
        const [reference] = classify(computed),
            protocols     = ['https:', 'http:', 'data:', 'node:'];

        expect(classify(computed, {scopes: [declaration(reference, {protocols})]})[0])
            .toMatchObject({status: 'declared', scope: {roots: [], protocols}});
        for (const protocol of ['file:', 'ftp:', 'javascript:']) {
            expect(classify(computed, {scopes: [declaration(reference, {protocols: [protocol]})]})[0].status,
                protocol).toBe('blocked')
        }
    });

    test('refuses stale code, hashes, expressions and duplicate declarations', () => {
        const scope = declaration(classify(computed)[0]);

        expect(classify(computed + '\n// changed', {scopes: [scope]})[0].status).toBe('blocked');
        expect(classify(computed, {scopes: [{...scope, sourceHash: '0'.repeat(64)}]})[0].status).toBe('blocked');
        expect(classify(computed, {scopes: [{...scope, expression: 'anotherPath'}]})[0].status).toBe('blocked');
        expect(classify(computed, {scopes: [scope, {...scope}]})[0].status).toBe('blocked')
    });

    test('keeps fixed HTTP and node computed imports external without rewriting their expressions', () => {
        const code = 'const remote = import(`https://example.test/${name}.mjs`);\n' +
                'const builtin = import("node:" + name);\nconst unknown = import(protocol + name);',
            file = path.join(root, 'src/loader.mjs'),
            rewritten = rewriteModule({code, from: file, to: file, mapPath: value => value}),
            references = classify(code);

        expect(rewritten.code).toBe(code);
        expect(rewritten.unresolved.map(({externalProtocol}) => externalProtocol)).toEqual(['https:', 'node:', null]);
        expect(references.map(({status}) => status)).toEqual(['external', 'external', 'blocked']);
        expect(references.map(({expression}) => expression))
            .toEqual(['`https://example.test/${name}.mjs`', '"node:" + name', 'protocol + name'])
    });

    test('a reference declaration cannot waive a shadowed namespace reason', () => {
        const code      = 'function local(Neo) { return Neo.old.Widget; }',
            options     = {classNames: new Map([['Neo.old.Widget', 'Neo.new.Widget']])},
            [reference] = classify(code, options),
            scope       = declaration(reference, {protocols: ['https:']});

        expect(classify(code, {...options, scopes: [scope]})[0])
            .toMatchObject({status: 'blocked', reason: reference.reason});
        expect(reference.reason).toMatch(/local binding/)
    });

    test('applies an exact disjoint declaration through the planner and leaves the importer untouched', () => {
        fixture();
        const blocked = plan(), scope = declaration(blocked.referenceLedger[0]), accepted = plan([scope]);

        expect(blocked.blockers).toHaveLength(1);
        expect(accepted.blockers).toEqual([]);
        expect(accepted.referenceLedger[0].status).toBe('declared');
        applyMove(accepted);
        expect(fs.existsSync(path.join(root, 'src/old'))).toBe(false);
        expect(fs.readFileSync(path.join(root, 'src/new/Widget.mjs'), 'utf8')).toContain('Neo.new.Widget');
        expect(fs.readFileSync(path.join(root, 'src/loader.mjs'), 'utf8')).toBe(computed)
    });

    test('binds a declaration to only one of two identical expressions at different positions', () => {
        const code = 'const first = import(modulePath); const second = import(modulePath);';
        fixture(code);
        const references = plan().referenceLedger,
            first        = declaration(references[0]),
            partial      = plan([first]);

        expect(references[0].expression).toBe(references[1].expression);
        expect(references[0].start).not.toBe(references[1].start);
        expect(partial.referenceLedger.map(({status}) => status)).toEqual(['declared', 'blocked']);
        expect(() => applyMove(partial)).toThrow(/unresolved/);
        expect(fs.existsSync(path.join(root, 'src/old/Widget.mjs'))).toBe(true);
        expect(plan([first, declaration(references[1])]).blockers).toEqual([])
    });

    test('refuses an unused declaration instead of silently ignoring an incorrect source position', () => {
        fixture();
        const scope = declaration(plan().referenceLedger[0]),
            result  = plan([{...scope, start: scope.start + 1}]);

        expect(result.blockers.some(({reason}) => /no current expression/.test(reason))).toBe(true);
        expect(() => applyMove(result)).toThrow(/unresolved/);
        expect(fs.existsSync(path.join(root, 'src/old/Widget.mjs'))).toBe(true)
    });

    test('refuses a stale declaration when the same position becomes automatically external', () => {
        fixture();
        const scope = declaration(plan().referenceLedger[0]),
            changed = 'export const load = () => import(`https://example.test/${name}.mjs`);';
        write('src/loader.mjs', changed);
        const result = plan([scope]);

        expect(result.referenceLedger[0].start).toBe(scope.start);
        expect(result.blockers.length).toBeGreaterThan(0);
        expect(() => applyMove(result)).toThrow(/unresolved/);
        expect(fs.readFileSync(path.join(root, 'src/loader.mjs'), 'utf8')).toBe(changed);
        expect(fs.existsSync(path.join(root, 'src/old/Widget.mjs'))).toBe(true)
    });

    test('decodes a computed URL directory before comparing it with filesystem moves', () => {
        const code     = 'import(`./old%20folder/${name}.mjs`)', file = path.join(root, 'src/loader.mjs'),
            references = rewriteModule({code, from: file, to: file, mapPath: value => value}).unresolved,
            result     = classifyReferences({root, file, to: file, code, references,
                moves: [{from: path.join(root, 'src/old folder'), to: path.join(root, 'src/new folder')}]});
        expect(result[0].status).toBe('blocked')
        expect(path.resolve(result[0].candidateDirectory)).toBe(path.join(root, 'src/old folder'))
    });

    test('uses the runtime reader origin when a caller module moves independently', () => {
        const code     = '`../../resources/data/${name}.json`', file = path.join(root, 'apps/demo/View.mjs'),
            to         = path.join(root, 'apps/deeper/demo/View.mjs'), origin = path.join(root, 'src/worker/App.mjs'),
            references = [{start: 0, end: code.length, prefix: '../../resources/data/', origin}],
            first      = classifyReferences({root, file, to, code, references, moves: [{from: file, to}]}),
            scopes     = [declaration(first[0], {roots: ['resources/data']})],
            result     = classifyReferences({root, file, to, code, references, scopes, moves: [{from: file, to}]});
        expect(first[0].status).toBe('blocked');
        expect(result[0].status).toBe('declared')
    });

    test('does not prove a computed family disjoint when its owned value escapes the constant directory', () => {
        fixture('const name = "../old/Widget"; export const load = () => import(`./plugins/${name}.mjs`);');
        const loader = pathToFileURL(path.join(root, 'src/loader.mjs')).href,
            loaded   = execFileSync(process.execPath, ['--input-type=module', '-e',
                `const {load} = await import(${JSON.stringify(loader)}); console.log((await load()).default.config.className)`], {encoding: 'utf8'});
        expect(loaded.trim()).toBe('Neo.old.Widget');
        const result = plan();
        expect(result.blockers.length).toBeGreaterThan(0);
        expect(() => applyMove(result)).toThrow(/unresolved/);
        expect(fs.existsSync(path.join(root, 'src/old/Widget.mjs'))).toBe(true)
    })
});
