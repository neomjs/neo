import {test, expect} from '@playwright/test';
import {
    REPOSITORY_TARGET_INVALID,
    resolveRepositoryTarget
} from '../../../../../../ai/services/github-workflow/shared/repositoryTarget.mjs';

const HOME = Object.freeze({owner: 'neomjs', repo: 'neo'});

test.describe('github-workflow repositoryTarget (#17420)', () => {
    test('resolves omitted, bare, and full targets without changing the home default', () => {
        expect(resolveRepositoryTarget(undefined, HOME)).toEqual({
            owner   : 'neomjs',
            repo    : 'neo',
            fullName: 'neomjs/neo',
            explicit: false
        });

        expect(resolveRepositoryTarget('devindex', HOME)).toEqual({
            owner   : 'neomjs',
            repo    : 'devindex',
            fullName: 'neomjs/devindex',
            explicit: true
        });

        expect(resolveRepositoryTarget('octocat/hello-world', HOME)).toEqual({
            owner   : 'octocat',
            repo    : 'hello-world',
            fullName: 'octocat/hello-world',
            explicit: true
        });

        expect(resolveRepositoryTarget('.github', HOME).fullName).toBe('neomjs/.github');

        // Sequential explicit targets are request data, never writes to the home SSOT input.
        expect(resolveRepositoryTarget(undefined, HOME).fullName).toBe('neomjs/neo');
        expect(HOME).toEqual({owner: 'neomjs', repo: 'neo'});
    });

    test('rejects malformed explicit targets by value rather than normalizing them to home', () => {
        for (const value of [
            '',
            null,
            ' owner/repo',
            'owner/repo ',
            'owner/re po',
            'owner\\repo',
            'owner_name/repo',
            'owner-/repo',
            'owner?/repo',
            'owner/repo#fragment',
            '/repo',
            'owner/',
            'owner//repo',
            'owner/repo/extra',
            '.',
            '..',
            'owner/..',
            'a'.repeat(101)
        ]) {
            const result = resolveRepositoryTarget(value, HOME);

            expect(result).toMatchObject({
                error       : 'Invalid Repository Target',
                code        : REPOSITORY_TARGET_INVALID,
                rejectedRepo: value
            });
            expect(result.message).toContain(JSON.stringify(value));
            expect(result).not.toHaveProperty('owner');
            expect(result).not.toHaveProperty('repo');
        }
    });
});
