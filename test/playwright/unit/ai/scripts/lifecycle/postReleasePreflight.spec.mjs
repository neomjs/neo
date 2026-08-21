import {test, expect} from '@playwright/test';

import {
    assertAdmissibleStartingState,
    assertOnDevBranch,
    resolveReleaseVersion,
    SEMVER_PATTERN
} from '../../../../../../ai/scripts/lifecycle/postReleasePreflight.mjs';

/**
 * The split release protocol's fail-closed preflight. While KB upload, full sync,
 * and the archive commit ran inside `publish.mjs`, they inherited its branch check, its
 * `git checkout dev`, and a working tree the release itself had produced. As an independently
 * runnable command those preconditions are protocol fields — each arm here is one field, with the
 * refusal direction proven, since a preflight that cannot refuse is prose.
 */
test.describe('postReleasePreflight (#17239)', () => {
    test.describe('resolveReleaseVersion — manifest-only, strict semver before any shell string', () => {
        test('returns a valid manifest version', () => {
            expect(resolveReleaseVersion({readPackageJson: () => ({version: '13.2.0'})})).toBe('13.2.0');
            expect(resolveReleaseVersion({readPackageJson: () => ({version: '14.0.0-beta.1'})})).toBe('14.0.0-beta.1');
        });

        test('refuses non-semver, shell-metacharacter, and absent versions by naming the value', () => {
            for (const version of ['13.2', '13.2.0; rm -rf /', 'v13.2.0', undefined, 42]) {
                expect(() => resolveReleaseVersion({readPackageJson: () => ({version})}),
                    `version ${JSON.stringify(version)} must be refused`)
                    .toThrow(/not strict semver/);
            }
        });

        test('the pattern itself rejects command-injection shapes — the flag it replaces accepted them', () => {
            expect(SEMVER_PATTERN.test('13.2.0"; rm -rf "/')).toBe(false);
            expect(SEMVER_PATTERN.test('$(whoami)')).toBe(false);
        });
    });

    test.describe('assertOnDevBranch — the commit lands on the current branch, the push targets dev', () => {
        test('passes on dev', () => {
            expect(() => assertOnDevBranch({getCurrentBranch: () => 'dev'})).not.toThrow();
        });

        test('refuses any other branch, and a null branch reading', () => {
            for (const branch of ['main', 'vega/17239-class-a-severance', '', null]) {
                expect(() => assertOnDevBranch({getCurrentBranch: () => branch}),
                    `branch ${JSON.stringify(branch)} must be refused`)
                    .toThrow(/must run on 'dev'/);
            }
        });
    });

    test.describe('assertAdmissibleStartingState — only the release\'s own staging-note deletion may precede the broad stage', () => {
        const version = '13.2.0';

        test('a clean tree passes', () => {
            expect(() => assertAdmissibleStartingState({getPorcelainStatus: () => '', version})).not.toThrow();
        });

        test('a FAILED status probe is refused — unobservable is not clean', () => {
            // The status runner returns null on failure. The first version of this gate normalized
            // that to '' and its spec blessed the fail-open; round 2 caught it. Unobservable tree
            // state must refuse the broad stage, not admit it.
            for (const probe of [null, undefined]) {
                expect(() => assertAdmissibleStartingState({getPorcelainStatus: () => probe, version}),
                    `probe ${String(probe)} must be refused`)
                    .toThrow(/could not establish working-tree truth/);
            }
        });

        test('the staging note deletion passes in both porcelain forms (unstaged and staged)', () => {
            expect(() => assertAdmissibleStartingState({
                getPorcelainStatus: () => ` D resources/content/release-notes/v${version}.md`, version
            })).not.toThrow();
            expect(() => assertAdmissibleStartingState({
                getPorcelainStatus: () => `D  resources/content/release-notes/v${version}.md`, version
            })).not.toThrow();
        });

        test('a note deletion for a DIFFERENT version is refused — the admissible set is version-bound', () => {
            expect(() => assertAdmissibleStartingState({
                getPorcelainStatus: () => ' D resources/content/release-notes/v13.1.0.md', version
            })).toThrow(/refused/);
        });

        test('unrelated dirt is refused BY NAME, so the operator cleans deliberately', () => {
            expect(() => assertAdmissibleStartingState({
                getPorcelainStatus: () => ' M src/Neo.mjs', version
            })).toThrow(/src\/Neo\.mjs/);
        });

        test('mixed admissible + inadmissible refuses, naming only the inadmissible paths', () => {
            const run = () => assertAdmissibleStartingState({
                getPorcelainStatus: () => [
                    ` D resources/content/release-notes/v${version}.md`,
                    '?? scratch.mjs'
                ].join('\n'),
                version
            });

            expect(run).toThrow(/scratch\.mjs/);
            expect(run).not.toThrow(/release-notes\/v13\.2\.0\.md[\s\S]*release-notes\/v13\.2\.0\.md/);
        });
    });
});
