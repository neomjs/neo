import {setup} from '../../../setup.mjs';

const appName = 'DevIndexGitHubServiceTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import GitHub         from '../../../../../apps/devindex/services/GitHub.mjs';

test.describe('DevIndex GitHub service', () => {
    let originalRest;

    test.beforeEach(() => {
        originalRest = GitHub.rest;
    });

    test.afterEach(() => {
        GitHub.rest = originalRest;
    });

    test('getLoginByDatabaseId resolves the current login via REST account id lookup', async () => {
        let requestedEndpoint;
        let requestedContext;

        GitHub.rest = async (endpoint, logContext) => {
            requestedEndpoint = endpoint;
            requestedContext  = logContext;

            return {
                id   : 95193764,
                login: 'alleneubank',
                type : 'User'
            };
        };

        const login = await GitHub.getLoginByDatabaseId(95193764);

        expect(login).toBe('alleneubank');
        expect(requestedEndpoint).toBe('user/95193764');
        expect(requestedContext).toBe('DB_ID:95193764');
    });

    test('getLoginByDatabaseId returns null when GitHub cannot resolve the account id', async () => {
        GitHub.rest = async () => {
            throw new Error('REST Error: 404 Not Found');
        };

        await expect(GitHub.getLoginByDatabaseId(123)).resolves.toBeNull();
    });

    test('getLoginByDatabaseId rethrows transient REST failures', async () => {
        GitHub.rest = async () => {
            throw new Error('REST Error: 502 Bad Gateway');
        };

        await expect(GitHub.getLoginByDatabaseId(123)).rejects.toThrow('REST Error: 502 Bad Gateway');
    });
});
