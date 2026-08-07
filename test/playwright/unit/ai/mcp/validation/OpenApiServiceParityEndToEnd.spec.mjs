import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {describeViolation, lintOpenApiServiceParity, lintParity, lintToolServiceParity} from '../../../../../../ai/scripts/lint/lint-openapi-service-parity.mjs';

/**
 * End-to-end fixtures for the OpenAPI ↔ service parity lint: a synthetic repo root is built on
 * disk, the real `lintOpenApiServiceParity` runs against it, and the assertion is on its verdict.
 *
 * **Why this file exists separately from the helper specs.** The sibling suite proves
 * `consumedNames` and `declaredNames` behave on AST nodes handed to them directly. That is
 * necessary and it is not sufficient: it cannot fail if the *lint* stops discovering services,
 * stops resolving module paths, stops joining method names to operation ids, or stops reporting
 * what it found. Every one of those is a silent-pass failure mode, and a helper-only suite would
 * stay green through all of them.
 *
 * The fixtures are deliberately built from the outside in: `ai/services.mjs` with a `safeLoadYaml`
 * + `makeSafe` pair, a spec under `ai/mcp/server/<id>/openapi.yaml`, and a service module under
 * `ai/services/<id>/`. That is the real discovery contract, so a change to it fails here rather
 * than silently narrowing what the gate covers.
 *
 * Every positive fixture is paired with a **negative control**. A fixture that only proves the
 * lint fails on bad input cannot distinguish a working gate from one that fails on everything.
 */

let tmpRoot;

test.beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `parity-e2e-${process.pid}-`));
});

test.afterEach(() => {
    if (tmpRoot && fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, {recursive: true, force: true});
});

/**
 * Builds a synthetic repo root the lint can discover.
 *
 * @param {Object} options
 * @param {String} options.serverId    Owning server directory name.
 * @param {String} options.operationId The operation the method must join to.
 * @param {Object} options.operation   The OpenAPI operation object (parameters / requestBody).
 * @param {String} options.methodSrc   The service method source, e.g. `async doThing(options) {...}`.
 * @param {Boolean} [options.exported=false] Emit `export const X = makeSafe(…)` instead of the bare
 *     `const X = makeSafe(…)`. Defaults to the BARE form because that is what all 40 live bindings
 *     use — a fixture built on the other shape would exercise a branch production never takes, and
 *     prove the fixture rather than the gate.
 * @returns {String} The fixture root path.
 */
function seedRoot({serverId, operationId, operation, methodSrc, exported = false}) {
    const serviceDir = path.join(tmpRoot, 'ai', 'services', serverId),
          serverDir  = path.join(tmpRoot, 'ai', 'mcp', 'server', serverId);

    fs.mkdirSync(serviceDir, {recursive: true});
    fs.mkdirSync(serverDir, {recursive: true});

    // The discovery shape the lint actually parses: a `safeLoadYaml` binding whose first string
    // literal is the spec path, and a `makeSafe(service, spec)` pair. Written as real source rather
    // than mocked, so a change to `extractWrappedServices` is caught here.
    fs.writeFileSync(path.join(tmpRoot, 'ai', 'services.mjs'), [
        `import FixtureService from './services/${serverId}/FixtureService.mjs';`,
        `const fixtureSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/${serverId}/openapi.yaml'));`,
        `${exported ? 'export ' : ''}const Fixture_Service = makeSafe(FixtureService, fixtureSpec);`,
        exported ? '' : 'export {Fixture_Service};',
        ''
    ].join('\n'));

    fs.writeFileSync(path.join(serviceDir, 'FixtureService.mjs'), [
        'class FixtureService {',
        `    ${methodSrc}`,
        '}',
        'export default FixtureService;',
        ''
    ].join('\n'));

    fs.writeFileSync(path.join(serverDir, 'openapi.yaml'), JSON.stringify({
        openapi: '3.0.0',
        info   : {title: 'fixture', version: '1.0.0'},
        paths  : {'/fixture': {post: {operationId, ...operation}}}
    }, null, 2));

    return tmpRoot;
}

/** A request body declaring the given property names. */
const bodyWith = (...names) => ({
    requestBody: {content: {'application/json': {schema: {
        type      : 'object',
        properties: Object.fromEntries(names.map(name => [name, {type: 'string'}]))
    }}}}
});

test.describe('parity lint end-to-end — the FAILING direction', () => {
    test('a dotted bag read of an undeclared key is reported as a violation', async () => {
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('declaredOne'),
            // Reads `secretKey`, which the spec does not declare — the exact production shape that
            // shipped twice on `ingest_source_files`.
            methodSrc  : 'async doThing(payload) { return payload.declaredOne + payload.secretKey }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.servicesScanned, 'the fixture service must be DISCOVERED — a zero here means the lint scanned nothing and would pass on anything').toBe(1);
        expect(result.operationsMatched, 'the method must JOIN to its operation via camelToSnake').toBe(1);
        expect(result.violations).toHaveLength(1);
        expect(result.violations[0].param).toBe('secretKey');
        expect(result.violations[0].operationId).toBe('do_thing');
    });

    test('NEGATIVE CONTROL: declaring the same key makes the identical fixture clean', async () => {
        // Byte-identical to the fixture above except that `secretKey` is declared. Without this the
        // suite could not distinguish a working gate from one that reports a violation for every
        // fixture it is handed.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('declaredOne', 'secretKey'),
            methodSrc  : 'async doThing(payload) { return payload.declaredOne + payload.secretKey }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.servicesScanned).toBe(1);
        expect(result.operationsMatched).toBe(1);
        expect(result.violations, 'a fully-declared contract must produce no violation').toHaveLength(0);
    });

    test('body destructuring is reached too — the form whose absence was a false green on real code', async () => {
        // `PullRequestService#getPullRequestDiff` uses exactly this shape and the first walker
        // reported ZERO consumed names for it while CI was green. Asserted end-to-end so the
        // regression cannot come back through the lint even if the helper keeps passing.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('declaredOne'),
            methodSrc  : 'async doThing(options) { const {declaredOne, undeclaredTwo} = options || {}; return declaredOne ?? undeclaredTwo }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.violations.map(v => v.param)).toEqual(['undeclaredTwo']);
    });

    test('an EXPORTED makeSafe binding is discovered too — a form no live service uses yet', async () => {
        // Every one of the 40 live bindings is a bare `const` with a separate export, so this shape
        // is currently unreachable in production. It is covered because discovery that silently
        // skipped a declaration form would drop a whole service from the gate and report the
        // omission as a pass — the exact false-green class this lint exists to close, one layer
        // below the parameters it checks.
        //
        // Found by writing this fixture in the wrong shape: the suite reported clean on a method
        // that reads an undeclared key, and the only tell was that `servicesScanned` was 0.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('declaredOne'),
            methodSrc  : 'async doThing(payload) { return payload.declaredOne + payload.secretKey }',
            exported   : true
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.servicesScanned, 'the exported form must not vanish from discovery').toBe(1);
        expect(result.violations.map(v => v.param)).toEqual(['secretKey']);
    });

    test('a rest element suppresses the verdict rather than passing it', async () => {
        // A rest element re-admits every key, so absence cannot be proven. The requirement is that
        // the lint stays SILENT, not that it reports clean for a good reason — the operation is
        // still matched, it simply yields no claim.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('declaredOne'),
            methodSrc  : 'async doThing({declaredOne, ...rest}) { return declaredOne ?? rest }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.operationsMatched, 'the operation is matched — the suppression is about provability, not discovery').toBe(1);
        expect(result.violations).toHaveLength(0);
    });
});

test.describe('parity lint end-to-end — the ADVISORY direction', () => {
    test('a declared key nothing reads is reported as advisory, and does NOT become a violation', async () => {
        // The emission path for the non-failing direction. Verified end-to-end because the live tree
        // currently reports ZERO advisory rows: without this fixture a permanently-silent advisory
        // would be indistinguishable from a working one.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('usedOne', 'strandedTwo'),
            methodSrc  : 'async doThing({usedOne}) { return usedOne }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.unusedDeclarations.map(row => row.param)).toEqual(['strandedTwo']);
        expect(result.violations, 'the advisory direction must never escalate into the failing one').toHaveLength(0);
    });

    test('a FORWARDED bag yields no advisory — a lower bound cannot support an absence claim', async () => {
        // `consumedNames` is a lower bound on reads by construction, which is what makes it sound
        // for the failing direction and useless for its complement. Here the bag travels into a
        // helper, so `strandedTwo` may well be read where no AST walk can see it. Claiming it unused
        // would be a fabricated absence — the defect that produced 14 false findings before the
        // completeness gate existed.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('usedOne', 'strandedTwo'),
            methodSrc  : 'async doThing(payload) { return this.helper(payload) + payload.usedOne }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.unusedDeclarations, 'a forwarded bag must silence the advisory entirely').toHaveLength(0);
        // And the failing direction is unaffected: `usedOne` is declared, so still no violation.
        expect(result.violations).toHaveLength(0);
    });

    test('the advisory is decided per OPERATION, not per method — a sibling read counts', async () => {
        // `get_conversation` is served by three services, each destructuring only its own keys.
        // Judged per method, every sibling's parameters looked dead: this is that shape, minimised.
        // `secondOnly` is read by the second method alone, so nothing here is unused.
        const serviceDir = path.join(tmpRoot, 'ai', 'services', 'fixture-server'),
              serverDir  = path.join(tmpRoot, 'ai', 'mcp', 'server', 'fixture-server');

        fs.mkdirSync(serviceDir, {recursive: true});
        fs.mkdirSync(serverDir, {recursive: true});

        fs.writeFileSync(path.join(tmpRoot, 'ai', 'services.mjs'), [
            `import AlphaService from './services/fixture-server/AlphaService.mjs';`,
            `import BetaService  from './services/fixture-server/BetaService.mjs';`,
            `const fixtureSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/fixture-server/openapi.yaml'));`,
            `const Alpha = makeSafe(AlphaService, fixtureSpec);`,
            `const Beta  = makeSafe(BetaService,  fixtureSpec);`,
            `export {Alpha, Beta};`,
            ''
        ].join('\n'));

        fs.writeFileSync(path.join(serviceDir, 'AlphaService.mjs'),
            'class AlphaService {\n    async doThing({firstOnly}) { return firstOnly }\n}\nexport default AlphaService;\n');
        fs.writeFileSync(path.join(serviceDir, 'BetaService.mjs'),
            'class BetaService {\n    async doThing({secondOnly}) { return secondOnly }\n}\nexport default BetaService;\n');

        fs.writeFileSync(path.join(serverDir, 'openapi.yaml'), JSON.stringify({
            openapi: '3.0.0',
            info   : {title: 'fixture', version: '1.0.0'},
            paths  : {'/fixture': {post: {operationId: 'do_thing', ...bodyWith('firstOnly', 'secondOnly')}}}
        }, null, 2));

        const result = lintOpenApiServiceParity({rootDir: tmpRoot});

        expect(result.operationsMatched, 'both methods bind to the one operation').toBe(2);
        expect(
            result.unusedDeclarations,
            'each key is read by exactly one implementation, so the UNION covers both and nothing is unused'
        ).toHaveLength(0);
    });

    test('POSITIVE CONTROL for the union: a key NO sibling reads is still reported', async () => {
        // The control for the test above. Without it, "per-operation union" would be
        // indistinguishable from "advisory permanently disabled whenever two methods share an id".
        const serviceDir = path.join(tmpRoot, 'ai', 'services', 'fixture-server'),
              serverDir  = path.join(tmpRoot, 'ai', 'mcp', 'server', 'fixture-server');

        fs.mkdirSync(serviceDir, {recursive: true});
        fs.mkdirSync(serverDir, {recursive: true});

        fs.writeFileSync(path.join(tmpRoot, 'ai', 'services.mjs'), [
            `import AlphaService from './services/fixture-server/AlphaService.mjs';`,
            `import BetaService  from './services/fixture-server/BetaService.mjs';`,
            `const fixtureSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/fixture-server/openapi.yaml'));`,
            `const Alpha = makeSafe(AlphaService, fixtureSpec);`,
            `const Beta  = makeSafe(BetaService,  fixtureSpec);`,
            `export {Alpha, Beta};`,
            ''
        ].join('\n'));

        fs.writeFileSync(path.join(serviceDir, 'AlphaService.mjs'),
            'class AlphaService {\n    async doThing({firstOnly}) { return firstOnly }\n}\nexport default AlphaService;\n');
        fs.writeFileSync(path.join(serviceDir, 'BetaService.mjs'),
            'class BetaService {\n    async doThing({secondOnly}) { return secondOnly }\n}\nexport default BetaService;\n');

        fs.writeFileSync(path.join(serverDir, 'openapi.yaml'), JSON.stringify({
            openapi: '3.0.0',
            info   : {title: 'fixture', version: '1.0.0'},
            paths  : {'/fixture': {post: {operationId: 'do_thing', ...bodyWith('firstOnly', 'secondOnly', 'readByNobody')}}}
        }, null, 2));

        const result = lintOpenApiServiceParity({rootDir: tmpRoot});

        expect(result.unusedDeclarations.map(row => row.param)).toEqual(['readByNobody']);
        expect(result.unusedDeclarations[0].methods, 'the row names every contributor, so a reader can see the denominator').toHaveLength(2);
    });
});

test.describe('parity lint end-to-end — the TOOLSERVICE dispatch join', () => {
    /**
     * Seeds a server whose `toolService.mjs` carries a `serviceMapping` binding, which is the join
     * this direction walks — distinct from the `ai/services.mjs` `makeSafe` table above.
     *
     * @param {Object}  options
     * @param {Object}  options.operation      OpenAPI operation object.
     * @param {String}  options.handlerSrc     Handler source bound in the mapping.
     * @param {Boolean} [options.passAsObject] Emit `x-pass-as-object: true`.
     * @returns {String} fixture root
     */
    function seedToolService({operation, handlerSrc, passAsObject = true}) {
        // The census's SERVERS list is a fixed set of repo-relative paths, so the fixture must sit at
        // the coordinates of a real server id for the join to discover it.
        const serverDir = path.join(tmpRoot, 'ai', 'mcp', 'server', 'knowledge-base');

        fs.mkdirSync(serverDir, {recursive: true});
        fs.mkdirSync(path.join(tmpRoot, 'ai'), {recursive: true});
        fs.writeFileSync(path.join(tmpRoot, 'ai', 'services.mjs'), '// no makeSafe bindings in this fixture\n');

        fs.writeFileSync(path.join(serverDir, 'toolService.mjs'), [
            `const serviceMapping = {`,
            `    do_thing: ${handlerSrc}`,
            `};`,
            `export {serviceMapping};`,
            ''
        ].join('\n'));

        fs.writeFileSync(path.join(serverDir, 'openapi.yaml'), JSON.stringify({
            openapi: '3.0.0',
            info   : {title: 'fixture', version: '1.0.0'},
            paths  : {'/fixture': {post: {
                operationId: 'do_thing',
                ...(passAsObject ? {'x-pass-as-object': true} : {}),
                ...operation
            }}}
        }, null, 2));

        return tmpRoot;
    }

    test('an inline object-dispatch handler reading an undeclared key is reported', async () => {
        const rootDir = seedToolService({
            operation : bodyWith('declaredOne'),
            handlerSrc: 'args => svc.run({...args, extra: args.undeclaredTwo})'
        });

        const result = lintToolServiceParity({rootDir});

        expect(result.operationsChecked, 'the handler must be resolved and checked').toBe(1);
        expect(result.violations.map(v => v.param)).toEqual(['undeclaredTwo']);
    });

    test('NEGATIVE CONTROL: the identical handler is clean once the key is declared', async () => {
        const rootDir = seedToolService({
            operation : bodyWith('declaredOne', 'undeclaredTwo'),
            handlerSrc: 'args => svc.run({...args, extra: args.undeclaredTwo})'
        });

        const result = lintToolServiceParity({rootDir});

        expect(result.operationsChecked).toBe(1);
        expect(result.violations).toHaveLength(0);
    });

    test('a POSITIONAL handler is skipped and counted — the bag analysis would fabricate findings', async () => {
        // Without `x-pass-as-object`, arguments arrive positionally, so the first parameter is
        // `argNames[0]` rather than the args bag. Treating it as a bag would report `prNumber.detail`
        // as a consumed PARAMETER named `detail` — an invented violation. The requirement is that the
        // operation is skipped AND counted, so the omission is visible rather than silent.
        const rootDir = seedToolService({
            operation   : bodyWith('prNumber'),
            handlerSrc  : 'prNumber => svc.run(prNumber.detail)',
            passAsObject: false
        });

        const result = lintToolServiceParity({rootDir});

        expect(result.violations, 'no fabricated finding from positional dispatch').toHaveLength(0);
        expect(result.operationsChecked).toBe(0);
        expect(result.positionalSkipped, 'skipped operations are COUNTED, never silently dropped').toBe(1);
    });

    test('an UNRESOLVABLE handler is reported, not passed over', async () => {
        // A bare identifier with no local declaration and no import cannot be located. Silence here
        // would be indistinguishable from "checked and clean" — the false-green shape this whole
        // gate exists to remove, applied to its own coverage.
        const rootDir = seedToolService({
            operation : bodyWith('declaredOne'),
            handlerSrc: 'handlerDefinedNowhere'
        });

        const result = lintToolServiceParity({rootDir});

        expect(result.operationsChecked).toBe(0);
        expect(result.unresolved).toHaveLength(1);
        expect(result.unresolved[0].operationId).toBe('do_thing');
        expect(result.violations).toHaveLength(0);
    });
});

test.describe('parity lint end-to-end — undecidable reads must silence the advisory', () => {
    test('a DYNAMIC computed key clears completeness, so no absence is claimed', async () => {
        // `payload[someVar]` is a read whose NAME cannot be determined. The module's blind-spot list
        // already named dynamic access — but named it for the FAILING direction, where it is harmless
        // because an unseen read merely keeps a lower bound lower. In the advisory direction the claim
        // is the complement, so an unnameable read must clear `complete` rather than simply be absent
        // from `consumed`. Before this, the shape reported `complete: true` with `consumed: []` and
        // every declared parameter would have been called unused.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('alpha', 'beta'),
            methodSrc  : 'async doThing(payload, key) { return payload[key] }'
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.unusedDeclarations, 'an unnameable read must silence the advisory entirely').toHaveLength(0);
        expect(result.violations, 'and it must not fabricate a violation either').toHaveLength(0);
    });

    test('CONTROL: a LITERAL computed key stays decidable and the advisory still speaks', async () => {
        // The control that keeps the fix above from degenerating into "any computed access disables
        // the advisory". `payload['alpha']` is a decidable read, so `beta` is still provably unused.
        const rootDir = seedRoot({
            serverId   : 'fixture-server',
            operationId: 'do_thing',
            operation  : bodyWith('alpha', 'beta'),
            methodSrc  : "async doThing(payload) { return payload['alpha'] }"
        });

        const result = lintOpenApiServiceParity({rootDir});

        expect(result.unusedDeclarations.map(row => row.param)).toEqual(['beta']);
    });
});

test.describe('parity lint — the COMPOSITE seam that merges both joins', () => {
    /**
     * Seeds a root carrying BOTH a `makeSafe` service defect and a `serviceMapping` handler defect,
     * so the composite's merge is what the assertion depends on rather than either child.
     * @returns {String} fixture root
     */
    function seedBothDefects() {
        const serverDir  = path.join(tmpRoot, 'ai', 'mcp', 'server', 'knowledge-base'),
              serviceDir = path.join(tmpRoot, 'ai', 'services', 'knowledge-base');

        fs.mkdirSync(serverDir, {recursive: true});
        fs.mkdirSync(serviceDir, {recursive: true});

        // services.mjs join defect: a wrapped method reading an undeclared key.
        fs.writeFileSync(path.join(tmpRoot, 'ai', 'services.mjs'), [
            `import FixtureService from './services/knowledge-base/FixtureService.mjs';`,
            `const fixtureSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/knowledge-base/openapi.yaml'));`,
            `const Fixture_Service = makeSafe(FixtureService, fixtureSpec);`,
            `export {Fixture_Service};`,
            ''
        ].join('\n'));
        fs.writeFileSync(path.join(serviceDir, 'FixtureService.mjs'),
            'class FixtureService {\n    async doThing(p) { return p.serviceOnlyLeak }\n}\nexport default FixtureService;\n');

        // ToolService join defect: an object-dispatch handler reading a different undeclared key.
        fs.writeFileSync(path.join(serverDir, 'toolService.mjs'), [
            'const serviceMapping = {',
            '    do_other: args => run(args.dispatchOnlyLeak)',
            '};',
            'export {serviceMapping};',
            ''
        ].join('\n'));

        fs.writeFileSync(path.join(serverDir, 'openapi.yaml'), JSON.stringify({
            openapi: '3.0.0',
            info   : {title: 'fixture', version: '1.0.0'},
            paths  : {
                '/a': {post: {operationId: 'do_thing', ...bodyWith('declared')}},
                '/b': {post: {operationId: 'do_other', 'x-pass-as-object': true, ...bodyWith('declared')}}
            }
        }, null, 2));

        return tmpRoot;
    }

    test('the composite merges BOTH joins into one fatal result', async () => {
        // The witness for the seam itself. Both child analyses are covered above; the step that
        // merges them was previously unreachable, living inside the CLI's `import.meta.url` guard.
        // Deleting the ToolService append would have left every child test green while the gate
        // silently stopped failing on half its surface — a false green BETWEEN two tested parts,
        // which is the one place per-part coverage cannot look.
        const result = lintParity({rootDir: seedBothDefects()});
        const params = result.violations.map(v => v.param).sort();

        expect(params, 'a violation from EACH join must reach the fatal result').toEqual(['dispatchOnlyLeak', 'serviceOnlyLeak']);
    });

    test('the composite preserves advisory, unresolved and coverage counts through the merge', async () => {
        // Recomputing these in the CLI instead of carrying them would let the printed summary drift
        // from the verdict a test can assert on. `do_thing` declares `declared` and the method never
        // reads it, so the advisory is non-empty and proves the field survives rather than being
        // dropped to an empty array.
        const result = lintParity({rootDir: seedBothDefects()});

        expect(result.unusedDeclarations.length, 'advisory rows must survive the merge').toBeGreaterThan(0);
        expect(result.operationsMatched, 'services.mjs coverage count preserved').toBe(1);
        expect(result.operationsChecked, 'ToolService coverage count preserved').toBe(1);
        expect(Array.isArray(result.unresolved), 'unresolved must be carried, not dropped').toBe(true);
    });

    test('a ToolService finding renders with its OWN coordinates, not undefined', async () => {
        // The two joins describe a handler differently and neither is a superset: `services.mjs`
        // knows module + method, the dispatch join knows serverId + via. Rendering both through the
        // first shape printed `undefined → undefined()` for every ToolService row — a finding a
        // reader cannot act on.
        const result = lintParity({rootDir: seedBothDefects()}),
              row    = result.violations.find(v => v.param === 'dispatchOnlyLeak'),
              lines  = describeViolation(row).join('\n');

        expect(lines).not.toContain('undefined');
        expect(lines).toContain('knowledge-base');
        expect(lines, 'the resolution path is what makes a dispatch finding actionable').toContain('serviceMapping');
    });
});
