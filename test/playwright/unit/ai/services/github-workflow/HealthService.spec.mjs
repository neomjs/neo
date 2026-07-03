import {setup} from '../../../../setup.mjs';

const appName = 'GithubWorkflowHealthServiceTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

test.describe.serial('Neo.ai.services.github-workflow.HealthService - runtimeFreshness (#12765)', () => {
    let HealthService;

    test.beforeAll(async () => {
        HealthService = (await import('../../../../../../ai/services/github-workflow/HealthService.mjs')).default;
    });

    test.afterEach(() => {
        HealthService.runtimeFreshnessReader = null;
        HealthService.clearCache();
    });

    test('classifies matching boot/current identity as current', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'abc123',
                openApiDigest: 'sha256:same'
            },
            current: {
                gitHead      : 'abc123',
                openApiDigest: 'sha256:same'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {
                gitHead      : false,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details).toContain('Runtime source/schema identity matches the current checkout.');
        expect(result.boot).toBeUndefined();
        expect(result.current).toBeUndefined();
    });

    test('classifies stale OpenAPI identity with restart guidance', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:old'
            },
            current: {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:new'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'stale',
            stale : {
                gitHead      : true,
                openApiDigest: true
            },
            hint: 'Restart or reconnect the GitHub Workflow MCP server to refresh cached tool definitions.'
        });
        expect(result.details[0]).toContain('Restart or reconnect the GitHub Workflow MCP server');
        expect(result.details[0]).toContain('openApiDigest');
        expect(result.details[1]).toContain('Contextual runtime identity differs (gitHead)');
    });

    test('keeps gitHead drift contextual when OpenAPI identity matches', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot: {
                gitHead      : 'old-head',
                openApiDigest: 'sha256:same'
            },
            current: {
                gitHead      : 'new-head',
                openApiDigest: 'sha256:same'
            }
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'current',
            stale : {
                gitHead      : true,
                openApiDigest: false
            },
            hint: null
        });
        expect(result.details[1]).toContain('informational');
    });

    test('classifies missing identity as unknown without throwing', async () => {
        HealthService.runtimeFreshnessReader = async () => ({
            boot   : {},
            current: {},
            errors : ['current gitHead unavailable: fixture']
        });

        const result = await HealthService.resolveRuntimeFreshness();

        expect(result).toMatchObject({
            status: 'unknown',
            stale : {
                gitHead      : null,
                openApiDigest: null
            },
            hint: null
        });
        expect(result.details).toContain('current gitHead unavailable: fixture');
    });
});

test.describe('Neo.ai.services.github-workflow.HealthService notification projection (#12937)', () => {
    let buildNotificationPreview;
    let getWakeRelevantNotifications;
    let GITHUB_WAKE_NOTIFICATION_REASONS;

    test.beforeAll(async () => {
        ({
            buildNotificationPreview,
            getWakeRelevantNotifications,
            GITHUB_WAKE_NOTIFICATION_REASONS
        } = await import('../../../../../../ai/services/github-workflow/HealthService.mjs'));
    });

    test('wake notification projection includes mentions and review requests only', () => {
        expect(GITHUB_WAKE_NOTIFICATION_REASONS).toEqual(['mention', 'review_requested']);

        const notifications = [{
            id     : 'ghn-mention',
            reason : 'mention',
            subject: {type: 'Issue', title: 'Mentioned', url: 'https://api.github.com/repos/acme/repo/issues/1'}
        }, {
            id     : 'ghn-review',
            reason : 'review_requested',
            subject: {type: 'PullRequest', title: 'Review requested', url: 'https://api.github.com/repos/acme/repo/pulls/2'}
        }, {
            id     : 'ghn-noise',
            reason : 'subscribed',
            subject: {type: 'Issue', title: 'Noise', url: 'https://api.github.com/repos/acme/repo/issues/3'}
        }];

        const relevant = getWakeRelevantNotifications(notifications);
        expect(relevant).toEqual([{
            id    : 'ghn-mention',
            reason: 'mention',
            type  : 'Issue',
            title : 'Mentioned',
            url   : 'https://api.github.com/repos/acme/repo/issues/1'
        }, {
            id    : 'ghn-review',
            reason: 'review_requested',
            type  : 'PullRequest',
            title : 'Review requested',
            url   : 'https://api.github.com/repos/acme/repo/pulls/2'
        }]);

        expect(buildNotificationPreview(notifications)).toEqual({
            unreadCount: 2,
            latest     : relevant
        });
    });
});
