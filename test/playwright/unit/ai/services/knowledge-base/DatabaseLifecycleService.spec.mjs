import {setup} from '../../../../setup.mjs';

const appName = 'KBDatabaseLifecycleServiceTest';

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

test.describe('Neo.ai.services.knowledge-base.DatabaseLifecycleService', () => {
    let DatabaseLifecycleService;
    let originalFire;
    let originalIsDbRunning;
    let originalWaitForHeartbeat;

    test.beforeAll(async () => {
        DatabaseLifecycleService = (await import('../../../../../../ai/services/knowledge-base/DatabaseLifecycleService.mjs')).default;

        originalFire             = DatabaseLifecycleService.fire;
        originalIsDbRunning      = DatabaseLifecycleService.isDbRunning;
        originalWaitForHeartbeat = DatabaseLifecycleService.waitForHeartbeat;
    });

    test.afterEach(() => {
        DatabaseLifecycleService.fire             = originalFire;
        DatabaseLifecycleService.isDbRunning      = originalIsDbRunning;
        DatabaseLifecycleService.waitForHeartbeat = originalWaitForHeartbeat;
    });

    test('manageDatabase dispatches start and stop actions', async () => {
        DatabaseLifecycleService.isDbRunning = async () => true;

        await expect(DatabaseLifecycleService.manageDatabase({action: 'start'}))
            .resolves.toEqual({
                status: 'already_running',
                pid   : null,
                detail: 'Server is managed by AgentOrchestrator.'
            });

        await expect(DatabaseLifecycleService.manageDatabase({action: 'stop'}))
            .resolves.toEqual({
                status: 'not_running',
                detail: 'Knowledge Base does not manage the ChromaDB daemon.'
            });
    });

    test('manageDatabase rejects unsupported actions', async () => {
        await expect(DatabaseLifecycleService.manageDatabase({action: 'restart'}))
            .rejects.toThrow("Invalid action: restart. Must be 'start' or 'stop'.");
    });

    test('startDatabase reports already_running when Chroma heartbeat is reachable', async () => {
        const events = [];

        DatabaseLifecycleService.fire        = (name, payload) => events.push({name, payload});
        DatabaseLifecycleService.isDbRunning = async () => true;

        const result = await DatabaseLifecycleService.startDatabase();

        expect(result).toEqual({
            status: 'already_running',
            pid   : null,
            detail: 'Server is managed by AgentOrchestrator.'
        });
        expect(events).toEqual([{
            name   : 'processActive',
            payload: {
                pid             : null,
                managedByService: false,
                detail          : 'Server is managed by AgentOrchestrator.'
            }
        }]);
    });

    test('startDatabase waits for the externally managed daemon when heartbeat is initially absent', async () => {
        const events = [];
        let waited = false;

        DatabaseLifecycleService.fire             = (name, payload) => events.push({name, payload});
        DatabaseLifecycleService.isDbRunning      = async () => false;
        DatabaseLifecycleService.waitForHeartbeat = async () => {
            waited = true;
        };

        const result = await DatabaseLifecycleService.startDatabase();

        expect(waited).toBe(true);
        expect(result).toEqual({
            status: 'started_externally',
            pid   : null
        });
        expect(events).toEqual([{
            name   : 'processActive',
            payload: {
                pid             : null,
                managedByService: false,
                detail          : 'started externally'
            }
        }]);
    });

    test('getDatabaseStatus exposes observability-only unified topology state', () => {
        expect(DatabaseLifecycleService.getDatabaseStatus()).toEqual({
            running: false,
            pid    : null,
            managed: false
        });
    });
});
