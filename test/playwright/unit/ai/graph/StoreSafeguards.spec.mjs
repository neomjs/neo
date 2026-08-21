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
import * as core      from '../../../../../src/core/_export.mjs';
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

    test('distinguishes an unavailable index from a configured index with no matching value', () => {
        const store = Neo.create(Store, {
            autoInitRecords: false,
            indices        : [{property: 'source'}],
            model          : NodeModel
        });

        store.add({id: 'edge-1', source: 'message-1', target: 'recipient-1'}, false);

        expect(store.getByIndex('source', 'message-1')).toHaveLength(1);
        expect(store.getByIndex('source', 'missing-message')).toEqual([]);
        expect(() => store.getByIndex('target', 'recipient-1'))
            .toThrow(/secondary index unavailable.*target/i);

        store.destroy()
    });

    test('fails explicitly when a configured index map disappears after construction', () => {
        const store = Neo.create(Store, {
            autoInitRecords: false,
            indices        : [{property: 'source'}, {property: 'target'}],
            model          : NodeModel
        });

        expect(() => store.assertIndices(['source', 'target'])).not.toThrow();

        store.indexMaps.delete('target');

        expect(() => store.assertIndices(['source', 'target']))
            .toThrow(/secondary index unavailable.*target/i);
        expect(() => store.getByIndex('target', 'recipient-1'))
            .toThrow(/secondary index unavailable.*target/i);

        store.destroy()
    });
});
