import {setup} from '../../../setup.mjs';

const appName = 'RevalidationSweepTest';

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
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import {
    SWEEP_VERSION,
    bodyMatches,
    buildNotificationBody,
    parseArgs,
    resolveIdentityForFamily,
    revalidationSweep
} from '../../../../../ai/scripts/revalidationSweep.mjs';

test.describe('Neo.ai.scripts.revalidationSweep', () => {
    test.describe('parseArgs', () => {
        test('defaults to dry-run with neomjs/neo repo', () => {
            const args = parseArgs(['--family', 'gemini']);
            expect(args.family).toBe('gemini');
            expect(args.dryRun).toBe(true);
            expect(args.repo).toBe('neomjs/neo');
        });

        test('--apply flips dryRun to false', () => {
            const args = parseArgs(['--family', 'gemini', '--apply']);
            expect(args.dryRun).toBe(false);
        });

        test('parses since / until / repo / help', () => {
            const args = parseArgs([
                '--family', 'gpt',
                '--since', '2026-01-01T00:00:00.000Z',
                '--until', '2026-02-01T00:00:00.000Z',
                '--repo', 'foo/bar',
                '--help'
            ]);
            expect(args.family).toBe('gpt');
            expect(args.since).toBe('2026-01-01T00:00:00.000Z');
            expect(args.until).toBe('2026-02-01T00:00:00.000Z');
            expect(args.repo).toBe('foo/bar');
            expect(args.help).toBe(true);
        });
    });

    test.describe('bodyMatches', () => {
        test('matches body with Unresolved Liveness section naming the family', () => {
            const body = [
                '## Some Section',
                '...',
                '## Unresolved Liveness',
                '- `gemini`: participationStatus operator_benched since 2026-05-18T00:00:00.000Z ...',
                '',
                '## Next Section'
            ].join('\n');
            expect(bodyMatches(body, 'gemini')).toBe(true);
        });

        test('does not match when family is only in Signal Ledger, not Liveness', () => {
            const body = [
                '## Signal Ledger',
                '- `gemini`: APPROVED by @neo-gemini-3-1-pro',
                '',
                '## Unresolved Liveness',
                '(empty)'
            ].join('\n');
            expect(bodyMatches(body, 'gemini')).toBe(false);
        });

        test('does not match when no Unresolved Liveness section exists', () => {
            expect(bodyMatches('## Some Section\nblah\n## Other\ncontent', 'gemini')).toBe(false);
        });

        test('does not match empty / null body', () => {
            expect(bodyMatches('',   'gemini')).toBe(false);
            expect(bodyMatches(null, 'gemini')).toBe(false);
        });

        test('matches gpt family in Liveness section without spilling onto gemini', () => {
            const body = '## Unresolved Liveness\n- `gpt`: operator_benched ...';
            expect(bodyMatches(body, 'gpt')).toBe(true);
            expect(bodyMatches(body, 'gemini')).toBe(false);
        });
    });

    test.describe('resolveIdentityForFamily', () => {
        test('resolves gemini family to @neo-gemini-3-1-pro', () => {
            const identity = resolveIdentityForFamily('gemini');
            expect(identity.id).toBe('@neo-gemini-3-1-pro');
            expect(identity.properties.modelFamily).toBe('gemini');
        });

        test('resolves claude family to @neo-opus-4-7', () => {
            const identity = resolveIdentityForFamily('claude');
            expect(identity.id).toBe('@neo-opus-4-7');
        });

        test('throws on unknown family', () => {
            expect(() => resolveIdentityForFamily('unknown-family')).toThrow(/No AgentIdentity/);
        });
    });

    test.describe('buildNotificationBody', () => {
        test('includes identity + family + since + signal options + version', () => {
            const body = buildNotificationBody({
                family       : 'gemini',
                identityLogin: '@neo-gemini-3-1-pro',
                since        : '2026-05-18T00:00:00.000Z',
                sweepAt      : '2026-06-01T12:00:00.000Z'
            });
            expect(body).toContain('@neo-gemini-3-1-pro');
            expect(body).toContain('`gemini`');
            expect(body).toContain('2026-05-18T00:00:00.000Z');
            expect(body).toContain('2026-06-01T12:00:00.000Z');
            expect(body).toContain('[GRADUATION_APPROVED');
            expect(body).toContain('[GRADUATION_DEFERRED');
            expect(body).toContain('[GRADUATION_ABSTAIN');
            expect(body).toContain('Epic #11796 AC6');
            expect(body).toContain(`v${SWEEP_VERSION}`);
        });
    });

    test.describe('revalidationSweep end-to-end (mock io)', () => {
        test('emits DRY_RUN_WOULD_NOTIFY for matching candidates without posting', async () => {
            const fakeIo = {
                searchIssues: () => [
                    { number: 11796, title: 'Epic A', body: '## Unresolved Liveness\n- `gemini`: bench since X' },
                    { number: 12000, title: 'No-match', body: '## Signal Ledger\n- `gemini`: APPROVED' }
                ],
                postComment: () => { throw new Error('should not post during dry-run'); }
            };
            const result = await revalidationSweep({
                family : 'gemini',
                since  : '2026-05-18T00:00:00.000Z',
                until  : '2026-06-01T00:00:00.000Z',
                dryRun : true,
                io     : fakeIo
            });
            expect(result.candidates).toBe(2);
            expect(result.matches).toBe(1);
            expect(result.results.length).toBe(1);
            expect(result.results[0].action).toBe('DRY_RUN_WOULD_NOTIFY');
            expect(result.results[0].number).toBe(11796);
        });

        test('calls postComment and emits NOTIFIED when not dry-run', async () => {
            const postedNumbers = [];
            const fakeIo = {
                searchIssues: () => [
                    { number: 11796, title: 'Epic A', body: '## Unresolved Liveness\n- `gemini`: bench since X' }
                ],
                postComment : ({ number, body }) => {
                    postedNumbers.push(number);
                    expect(body).toContain('@neo-gemini-3-1-pro');
                }
            };
            const result = await revalidationSweep({
                family : 'gemini',
                since  : '2026-05-18T00:00:00.000Z',
                until  : '2026-06-01T00:00:00.000Z',
                dryRun : false,
                io     : fakeIo
            });
            expect(postedNumbers).toEqual([11796]);
            expect(result.results[0].action).toBe('NOTIFIED');
        });

        test('falls back to identityRoots.mjs since when --since omitted', async () => {
            let captured = null;
            const fakeIo = {
                searchIssues: (args) => { captured = args; return []; },
                postComment : () => {}
            };
            await revalidationSweep({
                family : 'gemini',
                until  : '2026-06-01T00:00:00.000Z',
                dryRun : true,
                io     : fakeIo
            });
            expect(captured.since).toBe('2026-05-18T00:00:00.000Z');
        });

        test('throws when family is omitted', async () => {
            await expect(revalidationSweep({ since: '2026-01-01T00:00:00.000Z' }))
                .rejects.toThrow(/requires --family/);
        });

        test('throws when neither --since nor identityRoots since is present (active family)', async () => {
            // claude is currently `active` → properties.since is null
            await expect(revalidationSweep({ family: 'claude', io: { searchIssues: () => [], postComment: () => {} } }))
                .rejects.toThrow(/no participationStatus\.since/);
        });

        test('returns empty results when no candidates match', async () => {
            const fakeIo = {
                searchIssues: () => [
                    { number: 1, title: 'No liveness', body: '## Other\nbody' }
                ],
                postComment : () => { throw new Error('should not post'); }
            };
            const result = await revalidationSweep({
                family : 'gemini',
                since  : '2026-05-18T00:00:00.000Z',
                dryRun : true,
                io     : fakeIo
            });
            expect(result.candidates).toBe(1);
            expect(result.matches).toBe(0);
            expect(result.results).toEqual([]);
        });
    });
});
