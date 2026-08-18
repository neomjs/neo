import {setup} from '../../../../../../setup.mjs';

const appName = 'ResolvedConfigDisclosureTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';

// The module under test is a pure function and needs none of this. The shared `setup()` harness does:
// it touches `Neo.ns` while wiring the main-thread mock, so a spec that imports no framework leaves
// `Neo` unpopulated and setup throws before any assertion runs. Import hoisting is what makes this
// work despite sitting below the `setup()` call.
import Neo from '../../../../../../../../src/Neo.mjs';

/**
 * Disclosure-boundary coverage: which resolved config values a service may publish about itself.
 *
 * **Every fixture here holds a credential beside the allowlisted knobs, deliberately.** A fixture
 * containing only safe values cannot distinguish a working allowlist from a full-subtree dump — both
 * produce an identical, passing projection. The secret is what makes the assertion able to fail, and
 * an assertion that cannot fail is the failure mode this boundary exists to prevent.
 *
 * The four clauses under test, each with the reason it is a clause rather than a preference:
 *
 * 1. no environment access — the module is a pure function over a config object handed in, so there
 *    is no path from disclosure to `process.env` for a filter to miss
 * 2. allowlist, never denylist — a denylist fails open on every key added after it was written
 * 3. literal dot-paths only — `embedding.*` would silently admit a future `embedding.apiKey`
 * 4. declared disclosure kinds — a value that moved behind an allowlisted path fails its kind
 *    instead of publishing, and there is no free `string` kind because a credential is a free string
 */
test.describe.configure({mode: 'serial'});

test.describe('resolvedConfigDisclosure — the disclosure boundary (#17356)', () => {
    let assertDisclosureAllowlist, projectDisclosedConfig, DISCLOSURE_KINDS, MAX_ENUM_VALUE_LENGTH;

    /** A resolved config shaped like a real one: reportable knobs, and credentials beside them. */
    const configWithSecrets = () => ({
        embedding: {
            batchSize : 1,
            batchDelay: 10000,
            maxRetries: 5,
            apiKey    : 'glpat-SECRET-must-never-appear'
        },
        transport: 'http',
        debug    : false,
        nested   : {token: 'sk-live-also-secret'}
    });

    const seedAllowlist = () => assertDisclosureAllowlist([
        {path: 'embedding.batchSize',  kind: 'number'},
        {path: 'embedding.batchDelay', kind: 'number'},
        {path: 'embedding.maxRetries', kind: 'number'},
        {path: 'transport',            kind: 'enum'},
        {path: 'debug',                kind: 'boolean'}
    ]);

    test.beforeAll(async () => {
        ({assertDisclosureAllowlist, projectDisclosedConfig, DISCLOSURE_KINDS, MAX_ENUM_VALUE_LENGTH} =
            await import('../../../../../../../../ai/mcp/server/shared/helpers/resolvedConfigDisclosure.mjs'));
    });

    test('SECURITY: no unallowlisted value reaches the projection, in any field', () => {
        const {disclosed, omitted} = projectDisclosedConfig({
                  config   : configWithSecrets(),
                  allowlist: seedAllowlist()
              }),
              // Serialized, because a secret could ride in `disclosed`, in an `omitted` reason, or in
              // a future field nobody thought to assert on individually. The whole envelope is the
              // disclosure, so the whole envelope is what gets searched.
              serialized = JSON.stringify({disclosed, omitted});

        expect(serialized, 'no credential substring may appear anywhere in the envelope').not.toContain('glpat-');
        expect(serialized, 'no credential substring may appear anywhere in the envelope').not.toContain('sk-live');

        expect(Object.keys(disclosed)).not.toContain('embedding.apiKey');
        expect(Object.keys(disclosed)).not.toContain('nested.token');

        // The control that stops the above from passing vacuously: if the projection returned nothing
        // at all, every assertion so far would hold and the feature would be broken.
        expect(disclosed['embedding.batchSize']).toEqual({value: 1, kind: 'number'});
        expect(disclosed['transport']).toEqual({value: 'http', kind: 'enum'});
        expect(Object.keys(disclosed)).toHaveLength(5);
    });

    test('SECURITY: the assertion above is load-bearing — a full-subtree dump fails it', () => {
        // The mutation this boundary exists to reject, run as a fixture rather than described in a
        // comment. A reviewer trimming the secret out of the fixtures above would turn those
        // assertions green against this shape, so the shape is pinned here as the thing that must
        // stay detectable.
        const naiveDump  = {disclosed: configWithSecrets(), omitted: []},
              serialized = JSON.stringify(naiveDump);

        expect(serialized, 'a whole-subtree projection MUST be caught by the substring assertion').toContain('glpat-');
    });

    test('SECURITY: a denylist cannot hold this invariant — it fails open on a later-added key', () => {
        // Why clause 2 is allowlist-only, as evidence rather than as an opinion. This denylist was
        // written when `apiKey` was the only secret; `nested.token` arrived afterwards.
        const config     = configWithSecrets(),
              denylisted = JSON.parse(JSON.stringify(config));

        delete denylisted.embedding.apiKey;

        expect(
            JSON.stringify(denylisted),
            'a denylist written before a key existed leaks that key — which is why the boundary is an allowlist'
        ).toContain('sk-live');
    });

    test('a wildcard or malformed path is refused at load, not at first disclosure', () => {
        // `embedding.*` is the entry a well-meaning author adds for convenience, and it is the one
        // that silently admits `embedding.apiKey`. Refusing at load means review is not the only
        // thing standing between the convenience and the leak.
        for (const path of ['embedding.*', 'embedding*', '*', 'embedding..batchSize', 'embedding.', '.embedding', 'embed[a-z]+', '']) {
            expect(
                () => assertDisclosureAllowlist([{path, kind: 'number'}]),
                `path ${JSON.stringify(path)} must be refused`
            ).toThrow();
        }

        // The control: a legitimate literal dot-path is accepted, so the guard is not refusing
        // everything and passing for the wrong reason.
        expect(() => assertDisclosureAllowlist([{path: 'embedding.batchSize', kind: 'number'}])).not.toThrow();
    });

    test('a value that moved behind an allowlisted path fails its kind instead of publishing', () => {
        // The refactor case: a path stays allowlisted while what sits behind it changes. The kind is
        // the second floor precisely because path review happens once and refactors happen forever.
        const {disclosed, omitted} = projectDisclosedConfig({
            config   : {embedding: {batchSize: 'glpat-token-moved-here'}},
            allowlist: assertDisclosureAllowlist([{path: 'embedding.batchSize', kind: 'number'}])
        });

        expect(disclosed).toEqual({});
        expect(omitted[0].reason).toBe('kind-mismatch-expected-finite-number');
        expect(JSON.stringify({disclosed, omitted})).not.toContain('glpat-');
    });

    test('there is no free `string` kind, because a credential is a free string', () => {
        expect(DISCLOSURE_KINDS).toEqual(['number', 'boolean', 'enum']);
        expect(() => assertDisclosureAllowlist([{path: 'apiKey', kind: 'string'}])).toThrow();

        // `enum` is the only string-bearing kind and it is length-bounded, so a token behind an
        // enum-declared path is still refused.
        const {disclosed, omitted} = projectDisclosedConfig({
            config   : {transport: 'x'.repeat(MAX_ENUM_VALUE_LENGTH + 1)},
            allowlist: assertDisclosureAllowlist([{path: 'transport', kind: 'enum'}])
        });

        expect(disclosed).toEqual({});
        expect(omitted[0].reason).toBe('kind-mismatch-enum-too-long');
    });

    test('HONESTY: an absent path is reported with a reason and never defaulted', () => {
        // The over-claim guard, twin of the over-disclose one above. A reader who cannot separate
        // "not reported" from "reported the default" will read the second when only the first is
        // true — and a wrong value is worse than a missing one, because a missing value gets checked
        // and an answered one does not.
        const {disclosed, omitted} = projectDisclosedConfig({
            config   : {embedding: {}},
            allowlist: assertDisclosureAllowlist([{path: 'embedding.batchSize', kind: 'number'}])
        });

        expect(disclosed).toEqual({});
        expect(omitted).toEqual([{path: 'embedding.batchSize', kind: 'number', reason: 'path-absent'}]);

        // Specifically NOT the shipped default (50) and specifically not `null` — either would read
        // as an answer. The reason field is the answer.
        expect(omitted[0]).not.toHaveProperty('value');
    });

    test('an unavailable config omits every entry with a reason rather than throwing', () => {
        for (const config of [null, undefined, 'not-an-object']) {
            const {disclosed, omitted} = projectDisclosedConfig({config, allowlist: seedAllowlist()});

            expect(disclosed).toEqual({});
            expect(omitted).toHaveLength(5);
            expect(omitted.every(entry => entry.reason === 'config-unavailable')).toBe(true);
        }
    });

    test('the allowlist is frozen, and duplicates are refused', () => {
        const allowlist = seedAllowlist();

        expect(Object.isFrozen(allowlist)).toBe(true);
        expect(Object.isFrozen(allowlist[0])).toBe(true);

        // A deployment that can extend the list can name a credential path, so the list is code and
        // immutable at runtime.
        expect(() => assertDisclosureAllowlist([
            {path: 'embedding.batchSize', kind: 'number'},
            {path: 'embedding.batchSize', kind: 'number'}
        ])).toThrow();
    });
});
