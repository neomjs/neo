import {test, expect}  from '@playwright/test';
import * as acorn      from 'acorn';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

// The RUNTIME authority, imported under a DISTINCT name. Importing it as bare `camelToSnake` would
// collide with the lint's export of the same name below and make this guard compare the mirror to
// itself — a tautology that passes forever, which is the exact vacuity class this test exists to
// prevent. It became importable when the machinery moved to a plain, Neo-free shared module; before
// that it was private to `ai/services.mjs` and had to be regex-extracted from source and rebuilt.
import {camelToSnake as runtimeCamelToSnake} from '../../../../../../ai/services/shared/serviceProxy.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');

import {
    PARITY_BASELINE,
    camelToSnake,
    collectMethods,
    consumedNames,
    declaredNames,
    extractWrappedServices,
    lintOpenApiServiceParity
} from '../../../../../../ai/scripts/lint/lint-openapi-service-parity.mjs';

/**
 * @summary The gate for the silent-strip bug class: a service method that CONSUMES a parameter its
 * OpenAPI operation does not DECLARE gets that parameter stripped by the Zod facade in
 * `ai/services.mjs`, and reads `undefined` in production while every direct-construction unit test
 * passes.
 *
 * The detection mechanism is the thing most worth pinning. `ingest_source_files` — the operation that
 * motivated this guard — is `ingestSourceFiles(payload = {})`: a bag that destructures nothing, so
 * its signature carries no parameter names at all. A signature-based checker finds nothing there.
 * Consumption (`payload.X` member reads) is the signal, and the bag-style test below is the negative
 * control for the mechanism itself rather than for one operation.
 */
test.describe('openapi ↔ service parity — a consumed parameter must be declared (#16585)', () => {

    const fnFrom = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'})
        .body[0].declarations[0].init;

    test('a BAG-style method with no destructured params still reveals its reads', () => {
        // The negative control for the detection mechanism. This shape is exactly
        // `ingestSourceFiles(payload = {})`, and it is the shape a signature-only checker misses.
        const fn = fnFrom(`const f = async (payload = {}) => {
            const a = payload.materializationAttempt;
            return {viaMcp: payload.viaMcp !== false, a};
        }`);

        const {consumed, bagParam, destructured} = consumedNames(fn);

        expect(destructured, 'this shape destructures nothing — the point of the test').toBe(false);
        expect(bagParam).toBe('payload');
        expect([...consumed].sort()).toEqual(['materializationAttempt', 'viaMcp']);
    });

    test('BODY destructuring is consumption — the shape that made the first version a false green', () => {
        // @neo-gpt's exact-head falsification. `PullRequestService#getPullRequestDiff(options)` does
        // `const {pr_number, file, sha, files_only} = options || {}` and the first walker returned
        // ZERO consumed names for it — a real wrapped method consuming four parameters, invisible
        // while CI was fully green. Only parameter-position destructuring and dotted reads were seen.
        const viaOr      = fnFrom(`const f = async (options) => { const {pr_number, file} = options || {}; return pr_number + file; }`),
              viaBare    = fnFrom(`const f = async (options) => { const {sha} = options; return sha; }`),
              viaNullish = fnFrom(`const f = async (options) => { const {files_only} = options ?? {}; return files_only; }`);

        expect([...consumedNames(viaOr).consumed].sort()).toEqual(['file', 'pr_number']);
        expect([...consumedNames(viaBare).consumed]).toEqual(['sha']);
        expect([...consumedNames(viaNullish).consumed]).toEqual(['files_only']);

        // A rest element in a BODY destructure re-admits every key, exactly as in parameter position.
        expect(consumedNames(fnFrom(`const f = async (o) => { const {a, ...rest} = o || {}; return rest; }`)).rest).toBe(true);
    });

    test('a LITERAL computed read is consumption — decidable, and previously hidden behind "dynamic access"', () => {
        // The blind-spot list named "dynamic access" without separating a string literal from a
        // variable key, so a fully decidable form sat behind an honest-sounding caveat.
        const literal = fnFrom(`const f = async (payload = {}) => payload['file']`),
              dynamic = fnFrom(`const f = async (payload = {}) => { const k = 'x'; return payload[k]; }`);

        expect([...consumedNames(literal).consumed]).toEqual(['file']);
        // Still undecidable, and still unreported — the caveat is real, just narrower than claimed.
        expect([...consumedNames(dynamic).consumed], 'a variable key stays undecidable').toEqual([]);
    });

    test('a destructured method reveals its keys, and a rest element disables the claim', () => {
        const destructuredFn = fnFrom(`const f = async ({query, limit = 25, includeMetadata = false}) => query`);

        expect([...consumedNames(destructuredFn).consumed].sort()).toEqual(['includeMetadata', 'limit', 'query']);

        // `...rest` re-admits every key, so no name can be proven absent. Reporting nothing here is
        // correct; reporting a violation would be a false positive, and silently treating it as
        // "no reads" would be a false green — hence the explicit flag.
        const restFn = fnFrom(`const f = async ({query, ...rest}) => query`);

        expect(consumedNames(restFn).rest, 'a rest element must disable the absence claim').toBe(true);
    });

    test('member reads on something OTHER than the bag are not attributed to it', () => {
        // Without this, any `foo.bar` in the body would be read as a consumed parameter and the
        // checker would drown in false positives on its first real service.
        const fn = fnFrom(`const f = async (payload = {}) => {
            const other = {nope: 1};
            return other.nope + payload.real;
        }`);

        expect([...consumedNames(fn).consumed]).toEqual(['real']);
    });

    test('declaredNames unions parameters with request-body properties and resolves $ref', () => {
        const doc = {
            components: {schemas: {Body: {properties: {fromBody: {type: 'string'}}}}}
        };
        const operation = {
            parameters : [{name: 'fromParam'}],
            requestBody: {content: {'application/json': {schema: {$ref: '#/components/schemas/Body'}}}}
        };

        // A guard that stopped at the `$ref` would report a declared param as missing — the runtime
        // schema resolves it, so the guard must too.
        expect([...declaredNames(doc, operation)].sort()).toEqual(['fromBody', 'fromParam']);
    });

    test('the method→operationId join is DERIVED from the runtime authority, not restated', () => {
        // Two copied literals is what this asserted first, and @neo-gpt was right that it proves
        // nothing about agreement: both sides could drift together or the mirror could diverge on any
        // input not literally listed. So the authority itself is executed rather than mirrored.
        //
        // This used to read the function's SOURCE and rebuild it with `new Function`, because
        // `camelToSnake` was private to `ai/services.mjs` and importing that module booted the whole
        // SDK. It now lives in `services/shared/serviceProxy.mjs` — a plain module with no Neo
        // coupling — so the authority can simply be IMPORTED. Strictly stronger: a regex that stops
        // matching yields a null and, before this was noticed, would have taken the guard's own
        // vacuity assertion to find it. An import that stops resolving is a hard error.
        // `runtimeCamelToSnake` is the imported authority; `camelToSnake` is the lint's mirror. The
        // assertion below is authority-vs-mirror, which is the only comparison that means anything.

        // ── The corpus is now ACTUALLY drawn from reality ────────────────────────────────────────
        //
        // This block previously held a hardcoded twelve-name array under a comment claiming "a corpus
        // drawn from reality, so a divergence on any real method fails here rather than waiting for a
        // literal to be added to a list." The prose asserted a property the code did not have: a
        // divergence on the 400-odd method names NOT in that list passed silently, and the comment
        // made it worse than a plainly-fixed list would have been by telling a reader it was derived.
        // @neo-gpt flagged it as a still-fixed corpus and was right.
        //
        // Every method name on every wrapped service, harvested the same way the lint harvests them,
        // so the corpus grows and shrinks with the tree instead of with someone remembering to edit an
        // array. A new service method is covered the moment it exists.
        const realNames = new Set();

        for (const service of extractWrappedServices(repoRoot)) {
            if (!fs.existsSync(service.modulePath)) continue;

            for (const methodName of collectMethods(
                acorn.parse(fs.readFileSync(service.modulePath, 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'})
            ).keys()) {
                realNames.add(methodName);
            }
        }

        // A derived corpus can silently become empty — the exact false-green this test exists to
        // prevent, one level up. Asserted against a floor well below the ~400 observed, so an ordinary
        // refactor does not trip it but a broken harvest does.
        expect(realNames.size, 'the derived corpus must be non-trivial, or this guard proves nothing').toBeGreaterThan(100);

        // Synthetic EDGE shapes kept deliberately and labelled as synthetic: single char, all-caps,
        // already-snake, trailing capital. These are shapes the live tree may not contain, and their
        // absence from it is not evidence they transform correctly.
        const edgeShapes = ['a', 'ABC', 'alreadysnake', 'endsWithCapitalX', 'aB', 'ABc'];

        for (const name of [...realNames, ...edgeShapes]) {
            expect(camelToSnake(name), `divergence on ${name}`).toBe(runtimeCamelToSnake(name));
        }

        // And the anchor value, so a mirror that agreed with a BROKEN authority still fails.
        expect(camelToSnake('ingestSourceFiles')).toBe('ingest_source_files');
    });

    test('THE GATE: the live tree has no unbaselined consumed-but-undeclared parameter', () => {
        const result = lintOpenApiServiceParity();

        // Positive control FIRST. A checker that resolved zero methods would report zero violations
        // and look identical to a clean tree — the green has to prove it measured something.
        expect(result.servicesScanned, 'zero wrapped services means the resolver broke, not that the tree is clean').toBeGreaterThan(30);
        expect(result.operationsMatched, 'zero operation-bound methods means nothing was actually compared').toBeGreaterThan(100);

        const formatted = result.violations.map(v => `${v.operationId} reads \`${v.param}\` (${v.module} → ${v.method})`);

        expect(formatted, formatted.join('\n')).toEqual([]);
    });

    test('every baseline row carries a stated reason, so no suppression is silent', () => {
        const rows = Object.entries(PARITY_BASELINE);

        expect(rows.length, 'an empty baseline would make this vacuous').toBeGreaterThan(0);

        for (const [key, reason] of rows) {
            expect(typeof reason, `${key} must carry a reason string`).toBe('string');
            expect(reason.length, `${key}'s reason is too thin to audit`).toBeGreaterThan(40);
        }

        // The one permanent row, pinned by content: `now` is an injected clock, and a future sweep
        // "helpfully" declaring it would let a caller falsify peer liveness. The rationale has to
        // survive in the file, not only in the ticket that decided it.
        expect(PARITY_BASELINE['memory-core.who_is_online.now']).toMatch(/clock|liveness/i);
    });

    test('the baseline key is SERVER-scoped, not operation-scoped and never param-only', () => {
        // Three coordinates, each closing a different leak. `operationId` is unique per document, not
        // repository-global — `healthcheck` and `get_mcp_tool_handbook` exist on several servers — so
        // an operation-scoped key lets a suppression on one server absolve the same-named operation on
        // another. A param-only key is worse still: `viaMcp` has three live instances across two
        // operations, and one row would have hidden all of them.
        expect(PARITY_BASELINE['knowledge-base.manage_knowledge_base.viaMcp']).toBeTruthy();

        expect(PARITY_BASELINE['manage_knowledge_base.viaMcp'], 'an operation-scoped key crosses servers').toBeUndefined();
        expect(PARITY_BASELINE['viaMcp'], 'a bare param key would suppress across operations').toBeUndefined();

        // Every key carries all three coordinates, so a future row cannot be added at the wrong depth.
        for (const key of Object.keys(PARITY_BASELINE)) {
            expect(key.split('.').length, `${key} must be <server>.<operationId>.<param>`).toBe(3);
        }
    });
});
