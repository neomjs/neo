import {setup} from '../../setup.mjs';

const appName = 'StoreParserTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Store          from '../../../../src/data/Store.mjs';
import Model          from '../../../../src/data/Model.mjs';
import ParserBase     from '../../../../src/data/parser/Base.mjs';

class MockParser extends ParserBase {
    static config = {
        className: 'Test.MockParser',
        ntype: 'mock-parser'
    }

    async read(operation) {
        this.fire('data', [{id: '1', name: 'Mock 1'}, {id: '2', name: 'Mock 2'}]);
        return {success: true, count: 2};
    }
}

MockParser = Neo.setupClass(MockParser);

/**
 * @summary Tests for Neo.data.Store with Parser
 */
test.describe.serial('Neo.data.Store Parser Integration', () => {
    
    test('Store should create parser from config', () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            pipeline: {
                parser: {
                    module: MockParser
                }
            }
        });

        expect(store.pipeline).toBeDefined();
        expect(store.pipeline.parser).toBeDefined();
        expect(store.pipeline.parser.className).toBe('Test.MockParser');
        expect(store.pipeline.parser instanceof MockParser).toBe(true);
    });

    test('Store load() should use parser and progressive loading', async () => {
        const store = Neo.create(Store, {
            keyProperty: 'id',
            model: {
                module: Model,
                fields: [{name: 'id'}, {name: 'name'}]
            },
            pipeline: {
                parser: {
                    module: MockParser
                }
            }
        });

        let loadFiredCount = 0;
        store.on('load', () => loadFiredCount++);

        await store.load();

        // Should fire load at least once during stream (progressive) and once at end?
        // MockParser fires data once (2 items).
        // Store:
        // 1. onData -> add -> isLoading=false -> fire('load') (Count: 1)
        // 2. await parser.read -> success -> fire('load') (Count: 2)
        
        expect(loadFiredCount).toBeGreaterThanOrEqual(1);
        expect(store.count).toBe(2);
        expect(store.get('1').name).toBe('Mock 1');
        expect(store.get('2').name).toBe('Mock 2');
    });
});
