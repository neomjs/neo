import {test, expect}          from '@playwright/test';
import {claimsNeoIsAFramework} from '../../../../../../ai/scripts/lint/lint-identity-vocabulary.mjs';

/**
 * The guard's carve-out IS the policy, and a clean-tree run cannot exercise it — every draft passed
 * green against a tree with nothing to find. Two drafts each shipped a hole that only a case matrix
 * exposed: the first read sentence-initial "The framework" as an external product name, and the
 * second exempted "Neo framework" itself, because `Neo` is capitalized and is not a determiner.
 *
 * The second is the one worth pinning hardest. A guard whose escape hatch admits its own subject is
 * worse than no guard: it certifies the exact claim it was built to stop, and it does so silently.
 */
test.describe('lint-identity-vocabulary carve-out', () => {
    test('flags framework-category claims about Neo', () => {
        [
            'The framework evolves rapidly',
            'This framework is fast',
            'Our framework ships weekly',
            'to access frontier-quality framework knowledge',
            'query: "framework benefits and architecture"',
            'configuration of the framework at runtime'
        ].forEach(line => expect(claimsNeoIsAFramework(line), line).toBe(true));
    });

    test('flags Neo named explicitly — the escape hatch must not admit its own subject', () => {
        [
            'Neo framework',
            'Neo.mjs framework',
            'the Neo framework',
            'NeoMjs framework',
            'the Neo.mjs framework internals'
        ].forEach(line => expect(claimsNeoIsAFramework(line), line).toBe(true));
    });

    test('a legal mention does NOT launder a Neo claim beside it on the same line', () => {
        // The carve-out is per-occurrence, not per-line. Judging the line let the first legal match
        // exempt every token after it, so a description could name React once and then say anything.
        [
            'React framework interop, and the framework evolves rapidly',
            'Vue framework adapter; Neo.mjs framework internals',
            'compatible with the Express framework — our framework differs'
        ].forEach(line => expect(claimsNeoIsAFramework(line), line).toBe(true));
    });

    test('importing the predicate has no side effect', () => {
        // The module scans and process.exit(1)s when run as an entrypoint. If that ran at import,
        // this spec would die inside the runner exactly when the tree had a real violation — the
        // guard's own coverage would fail at the only moment it mattered.
        expect(typeof claimsNeoIsAFramework).toBe('function');
    });

    test('permits a NAMED external framework', () => {
        [
            'React framework interop',
            'the Playwright framework',
            'Vue framework adapter',
            'compatible with the Express framework'
        ].forEach(line => expect(claimsNeoIsAFramework(line), line).toBe(false));
    });

    test('silent on lines with no framework token', () => {
        [
            'Reports per-maintainer live availability',
            'the engine evolves rapidly',
            ''
        ].forEach(line => expect(claimsNeoIsAFramework(line), line).toBe(false));
    });
});
