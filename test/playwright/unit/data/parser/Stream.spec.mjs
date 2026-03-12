import {setup} from '../../../setup.mjs';

const appName = 'StreamParserTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import StreamParser   from '../../../../../src/data/parser/Stream.mjs';

/**
 * @summary Tests for Neo.data.parser.Stream
 */
test.describe.serial('Neo.data.parser.Stream', () => {
    let parser;

    // Mock global fetch and streams for Node environment if needed
    // In Playwright Node environment, ReadableStream/TextDecoderStream should be available.
    
    test.beforeEach(() => {
        parser = Neo.create(StreamParser, {
            store: {}
        });
    });

    test('read() should stream and parse NDJSON data', async () => {
        const mockData = [
            {id: 1, name: 'Item 1'},
            {id: 2, name: 'Item 2'},
            {id: 3, name: 'Item 3'}
        ];

        const ndjson = mockData.map(JSON.stringify).join('\n');
        
        // Mock fetch
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            return {
                headers: {
                    get: () => 0
                },
                ok: true,
                body: new ReadableStream({
                    start(controller) {
                        const encoder = new TextEncoder();
                        // Send data in chunks to simulate streaming
                        const chunk1 = encoder.encode(ndjson.substring(0, 10)); // Partial first line
                        const chunk2 = encoder.encode(ndjson.substring(10));    // Rest

                        controller.enqueue(chunk1);
                        controller.enqueue(chunk2);
                        controller.close();
                    }
                })
            };
        };

        const items = [];
        parser.on('data', (data) => {
            // data is now an array
            items.push(...data);
        });

        const result = await parser.read({url: 'http://test.com/data.jsonl'});

        expect(result.success).toBe(true);
        expect(result.count).toBe(3);
        expect(items.length).toBe(3);
        expect(items[0]).toMatchObject(mockData[0]);
        expect(items[1]).toMatchObject(mockData[1]);
        expect(items[2]).toMatchObject(mockData[2]);

        // Restore fetch
        globalThis.fetch = originalFetch;
    });

    test('read() should handle empty lines and whitespace', async () => {
        const mockData = [{id: 1}, {id: 2}];
        const ndjson = `
${JSON.stringify(mockData[0])}

${JSON.stringify(mockData[1])}
        `; // Leading/trailing newlines and empty lines

        // Mock fetch
        const originalFetch = globalThis.fetch;
        globalThis.fetch = async (url) => {
            return {
                headers: {
                    get: () => 0
                },
                ok: true,
                body: new ReadableStream({
                    start(controller) {
                        const encoder = new TextEncoder();
                        controller.enqueue(encoder.encode(ndjson));
                        controller.close();
                    }
                })
            };
        };

        const items = [];
        parser.on('data', (data) => {
            items.push(...data);
        });

        const result = await parser.read({url: 'http://test.com/data.jsonl'});

        expect(result.count).toBe(2);
        expect(items.length).toBe(2);
        expect(items[0]).toMatchObject(mockData[0]);
        expect(items[1]).toMatchObject(mockData[1]);

        globalThis.fetch = originalFetch;
    });

    test('read() should throw on HTTP error', async () => {
         const originalFetch = globalThis.fetch;
         globalThis.fetch = async () => ({ ok: false, status: 404 });

         await expect(parser.read({url: 'http://test.com/404'})).rejects.toThrow('HTTP error! status: 404');

         globalThis.fetch = originalFetch;
    });
});
