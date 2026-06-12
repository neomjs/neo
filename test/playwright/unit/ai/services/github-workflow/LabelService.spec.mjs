import {setup} from '../../../../setup.mjs';

const appName = 'LabelServiceTest';

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

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../../../src/Neo.mjs';
import * as core       from '../../../../../../src/core/_export.mjs';
import InstanceManager from '../../../../../../src/manager/Instance.mjs';

/**
 * @summary Contract coverage for `LabelService.listLabels` error propagation (#10112).
 *
 * Prior to #10112, `listLabels` caught GraphQL failures internally and returned an
 * `{error, message, code}` wrapper object alongside the happy-path `{count, labels}` —
 * a union-typed return that hid the real HTTP status + GraphQL error body from callers
 * (build scripts, CLI, the data-sync-pipeline CI workflow). Non-MCP callers lost diagnostics;
 * the MCP tool boundary at `Server.mjs:150-222` already catches thrown exceptions, so the
 * in-service wrap was redundant for its original protocol purpose.
 *
 * These tests lock the new throwing contract in place:
 * 1. Happy path returns `{count, labels}` with aggregated pagination.
 * 2. Underlying GraphQL errors propagate unmodified — no wrapper, no swallow.
 */
test.describe('Neo.ai.services.github-workflow.LabelService', () => {
    let LabelService;
    let GraphqlService;
    let originalQuery;

    test.beforeAll(async () => {
        GraphqlService = (await import('../../../../../../ai/services/github-workflow/GraphqlService.mjs')).default;
        LabelService   = (await import('../../../../../../ai/services/github-workflow/LabelService.mjs')).default;

        originalQuery = GraphqlService.query.bind(GraphqlService);
    });

    test.afterAll(() => {
        GraphqlService.query = originalQuery;
    });

    test('listLabels returns {count, labels} on success and aggregates across pages', async () => {
        const PAGE_ONE = [
            {name: 'bug',         color: 'd73a4a', description: "Something isn't working"},
            {name: 'enhancement', color: 'a2eeef', description: 'New feature or request'}
        ];
        const PAGE_TWO = [
            {name: 'ai',   color: '0e5ca2', description: null},
            {name: 'core', color: '000000', description: 'Core framework functionality'}
        ];

        let callCount = 0;

        GraphqlService.query = async (query, variables) => {
            callCount++;
            if (callCount === 1) {
                return {
                    repository: {
                        labels: {
                            nodes   : PAGE_ONE,
                            pageInfo: {hasNextPage: true, endCursor: 'cursor-page-1'}
                        }
                    }
                };
            }
            if (callCount === 2) {
                return {
                    repository: {
                        labels: {
                            nodes   : PAGE_TWO,
                            pageInfo: {hasNextPage: false, endCursor: null}
                        }
                    }
                };
            }
            throw new Error('Unexpected extra GraphQL call in happy-path test');
        };

        const result = await LabelService.listLabels();

        expect(result.count).toBe(4);
        expect(result.labels).toHaveLength(4);
        expect(result.labels.map(l => l.name)).toEqual(['bug', 'enhancement', 'ai', 'core']);
        expect(callCount).toBe(2);
    });

    test('listLabels propagates GraphQL exceptions unmodified (no wrapper object) — #10112', async () => {
        const underlyingError = new Error('GitHub API request failed: 429 Too Many Requests');

        GraphqlService.query = async () => {
            throw underlyingError;
        };

        // Assert the exception propagates verbatim — not caught and returned as
        // {error, message, code}, which was the pre-#10112 anti-pattern that hid
        // the real HTTP status from CI logs.
        await expect(LabelService.listLabels()).rejects.toBe(underlyingError);
    });

    test('listLabels does not mask non-Error throwables (malformed GraphQL responses)', async () => {
        // Even for non-Error throwables (e.g., a String thrown directly, or a GraphQL
        // errors-array dumped verbatim), the contract is propagation without wrapping.
        const thrownValue = 'Synthetic non-Error payload';

        GraphqlService.query = async () => {
            throw thrownValue;
        };

        await expect(LabelService.listLabels()).rejects.toBe(thrownValue);
    });
});
