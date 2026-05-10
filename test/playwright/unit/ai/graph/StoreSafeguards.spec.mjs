import {setup} from '../../../setup.mjs';

const appName = 'AiStoreSafeguardsTest';

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
import Store          from '../../../../../ai/graph/Store.mjs';
import NodeModel      from '../../../../../ai/graph/NodeModel.mjs';

test.describe('Neo.ai.graph.Store Safeguards', () => {

    test('should block clear() on a production database path', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: '/Users/user/db/production.sqlite'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clear();
        } catch(e) {
            errorThrown = true;
            expect(e.message).toContain('FATAL: Attempted to clear()');
        }
        expect(errorThrown).toBe(true);
        store.destroy();
    });

    test('should allow clear() on a memory database path', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: ':memory:'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clear();
        } catch(e) {
            errorThrown = true;
        }
        expect(errorThrown).toBe(false);
        store.destroy();
    });

    test('should allow clear() on a test database path', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: 'tmp/test.sqlite'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clear();
        } catch(e) {
            errorThrown = true;
        }
        expect(errorThrown).toBe(false);
        store.destroy();
    });

    test('should block clearSilent() on a production database path', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: '/Users/user/db/production.sqlite'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clearSilent();
        } catch(e) {
            errorThrown = true;
            expect(e.message).toContain('FATAL: Attempted to clear()');
        }
        expect(errorThrown).toBe(true);
        store.destroy();
    });

    test('should block clear() on a production database path containing tmp substring', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: '/var/db/tmp-data.sqlite'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clear();
        } catch(e) {
            errorThrown = true;
            expect(e.message).toContain('FATAL: Attempted to clear()');
        }
        expect(errorThrown).toBe(true);
        store.destroy();
    });

    test('should block clear() on a production database path containing test substring', async () => {
        let store = Neo.create(Store, {
            model   : NodeModel,
            database: {
                storage: {
                    dbPath: '/var/db/testing.sqlite'
                }
            }
        });

        let errorThrown = false;
        try {
            store.clear();
        } catch(e) {
            errorThrown = true;
            expect(e.message).toContain('FATAL: Attempted to clear()');
        }
        expect(errorThrown).toBe(true);
        store.destroy();
    });
});
