import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'DevIndexUpdaterGraphqlBudgetTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import config         from '../../../../../apps/devindex/services/config.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';
import Storage        from '../../../../../apps/devindex/services/Storage.mjs';
import Updater        from '../../../../../apps/devindex/services/Updater.mjs';

test.describe.serial('DevIndex Updater GraphQL budget (#15745)', () => {
    let originalFetchUserData,
        originalGetAllowlist,
        originalGetLowestContributionThreshold,
        originalGetUsers,
        originalQuery,
        originalRateLimit,
        originalRefreshGraphqlRateLimit,
        originalRest,
        originalUpdateFailed,
        originalUpdateTracker,
        originalUpdateUsers,
        originalDeleteUsers,
        originalConcurrency,
        originalDownstreamReserve,
        originalUserReservation,
        calls;

    test.beforeEach(() => {
        originalFetchUserData                   = Updater.fetchUserData;
        originalGetAllowlist                    = Storage.getAllowlist;
        originalGetLowestContributionThreshold = Storage.getLowestContributionThreshold;
        originalGetUsers                        = Storage.getUsers;
        originalQuery                           = GitHub.query;
        originalRateLimit                       = GitHub.rateLimit;
        originalRefreshGraphqlRateLimit         = GitHub.refreshGraphqlRateLimit;
        originalRest                            = GitHub.rest;
        originalUpdateFailed                    = Storage.updateFailed;
        originalUpdateTracker                   = Storage.updateTracker;
        originalUpdateUsers                     = Storage.updateUsers;
        originalDeleteUsers                     = Storage.deleteUsers;
        originalConcurrency                     = config.updater.concurrency;
        originalDownstreamReserve               = config.github.graphqlDownstreamReserve;
        originalUserReservation                 = config.github.graphqlUserReservation;

        calls = {
            failedUpdates: [],
            fetched      : [],
            tracker      : [],
            users        : []
        };

        config.updater.concurrency              = 8;
        config.github.graphqlDownstreamReserve  = 100;
        config.github.graphqlUserReservation    = 32;
        GitHub.rateLimit                        = {
            core: {
                limit    : 5000,
                remaining: 5000,
                reset    : null
            },
            graphql: {
                cost        : 0,
                limit       : 1000,
                observedCost: 0,
                remaining   : 1000,
                reserved    : 0,
                reset       : null
            }
        };
        GitHub.refreshGraphqlRateLimit           = async () => GitHub.rateLimit.graphql;
        Storage.getAllowlist                    = async () => new Set();
        Storage.getLowestContributionThreshold = async () => 0;
        Storage.getUsers                        = async () => [];
        Storage.updateFailed                    = async (logins, add) => calls.failedUpdates.push({logins, add});
        Storage.updateTracker                   = async updates => calls.tracker.push(...updates);
        Storage.updateUsers                     = async records => calls.users.push(...records);
        Storage.deleteUsers                     = async () => {};
    });

    test.afterEach(() => {
        Updater.fetchUserData                   = originalFetchUserData;
        GitHub.query                            = originalQuery;
        GitHub.rateLimit                        = originalRateLimit;
        GitHub.refreshGraphqlRateLimit          = originalRefreshGraphqlRateLimit;
        GitHub.rest                             = originalRest;
        Storage.getAllowlist                    = originalGetAllowlist;
        Storage.getLowestContributionThreshold = originalGetLowestContributionThreshold;
        Storage.getUsers                        = originalGetUsers;
        Storage.updateFailed                    = originalUpdateFailed;
        Storage.updateTracker                   = originalUpdateTracker;
        Storage.updateUsers                     = originalUpdateUsers;
        Storage.deleteUsers                     = originalDeleteUsers;
        config.updater.concurrency              = originalConcurrency;

        if (originalDownstreamReserve === undefined) {
            delete config.github.graphqlDownstreamReserve
        } else {
            config.github.graphqlDownstreamReserve = originalDownstreamReserve
        }

        if (originalUserReservation === undefined) {
            delete config.github.graphqlUserReservation
        } else {
            config.github.graphqlUserReservation = originalUserReservation
        }
    });

    test('high REST capacity cannot admit work when GraphQL capacity is below reserve', async () => {
        GitHub.rateLimit.graphql.remaining = 120;
        Updater.fetchUserData = async login => {
            calls.fetched.push(login);
            return {l: login, lu: '2026-07-23T09:00:00.000Z', tc: 2000}
        };

        await Updater.processBatch(['alpha', 'beta']);

        expect(GitHub.rateLimit.core.remaining).toBe(5000);
        expect(calls.fetched).toEqual([]);
        expect(calls.users).toEqual([]);
        expect(calls.tracker).toEqual([]);
    });

    test('capacity-derived admission stays below the CLI candidate ceiling and checkpoints admitted users', async () => {
        GitHub.rateLimit.graphql.remaining = 164;
        Updater.fetchUserData = async login => {
            calls.fetched.push(login);
            GitHub.rateLimit.graphql.remaining -= 32;

            return {
                l : login,
                lu: `2026-07-23T09:00:0${calls.fetched.length}.000Z`,
                tc: 2000
            }
        };

        await Updater.processBatch(['alpha', 'beta', 'gamma', 'delta']);

        expect(calls.fetched).toEqual(['alpha', 'beta']);
        expect(calls.users.map(user => user.l)).toEqual(['alpha', 'beta']);
        expect(calls.tracker.map(update => update.login)).toEqual(['alpha', 'beta']);
        expect(GitHub.rateLimit.graphql.remaining).toBe(100);
        expect(GitHub.rateLimit.graphql.reserved).toBe(0);
    });

    test('resource-limit fallback is bounded to single years and requests response cost', async () => {
        const contributionQueries = [];

        GitHub.rest = async () => [];
        GitHub.query = async query => {
            expect(query).toContain('rateLimit { cost remaining limit resetAt }');

            if (query.includes('socialAccounts')) {
                return {
                    rateLimit: {cost: 1, limit: 1000, remaining: 999, resetAt: '2026-07-23T10:00:00Z'},
                    user     : {
                        createdAt               : '2023-01-01T00:00:00Z',
                        followers               : {totalCount: 0},
                        socialAccounts          : {nodes: []},
                        sponsorshipsAsMaintainer: {totalCount: 0}
                    }
                }
            }

            contributionQueries.push(query);

            if (contributionQueries.length === 1) {
                const error = new Error('GraphQL Query Errors: Resource limits for this query exceeded.');
                error.code  = 'GRAPHQL_RESOURCE_LIMIT';
                throw error
            }

            const year = query.match(/y(\d{4}):/)?.[1];

            return {
                rateLimit: {cost: 1, limit: 1000, remaining: 998, resetAt: '2026-07-23T10:00:00Z'},
                user     : {
                    [`y${year}`]: {
                        restrictedContributionsCount       : 0,
                        totalCommitContributions           : 1,
                        totalIssueContributions            : 0,
                        totalPullRequestContributions      : 0,
                        totalPullRequestReviewContributions: 0,
                        totalRepositoryContributions       : 0,
                        commitContributionsByRepository    : []
                    }
                }
            }
        };

        await expect(originalFetchUserData.call(Updater, 'resource-heavy')).resolves.toMatchObject({
            l : 'resource-heavy',
            tc: 4
        });
        expect(contributionQueries).toHaveLength(5);
    });

    test('primary exhaustion never fans out into single-year fallback requests', async () => {
        const contributionQueries = [];

        GitHub.rest = async () => [];
        GitHub.query = async query => {
            if (query.includes('socialAccounts')) {
                return {
                    rateLimit: {cost: 1, limit: 1000, remaining: 9, resetAt: '2026-07-23T10:00:00Z'},
                    user     : {
                        createdAt               : '2023-01-01T00:00:00Z',
                        followers               : {totalCount: 0},
                        socialAccounts          : {nodes: []},
                        sponsorshipsAsMaintainer: {totalCount: 0}
                    }
                }
            }

            contributionQueries.push(query);

            const error = new Error('GraphQL Query Errors: API rate limit already exceeded for site ID installation.');
            error.code  = 'GRAPHQL_PRIMARY_RATE_LIMIT';
            throw error
        };

        await expect(originalFetchUserData.call(Updater, 'quota-exhausted'))
            .rejects.toMatchObject({code: 'GRAPHQL_PRIMARY_RATE_LIMIT'});
        expect(contributionQueries).toHaveLength(1);
    });
});
