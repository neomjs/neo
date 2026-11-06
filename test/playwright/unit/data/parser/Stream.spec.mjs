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
test.describe('Neo.data.parser.Stream', () => {
    let parser;

    test.beforeEach(() => {
        parser = Neo.create(StreamParser, {
            store: {}
        });
    });

    test.afterEach(() => parser.destroy());

    for (const failure of [new Error('chunk refused'), null]) {
        test(`a ${failure === null ? 'null' : 'Error'} chunk refusal cancels the reader and resets streaming`, async () => {
            const cancelled = [], stream = new ReadableStream({
                start(controller) {controller.enqueue(new TextEncoder().encode('{"id":1}\n{"id":2}\n'))},
                cancel(reason) {cancelled.push(reason); throw new Error('cancel also refused')}
            });
            parser.initialChunkSize = 1;
            const result = parser.read({stream, total: 0}, {transformChunk: () => {throw failure}});
            await expect(result).rejects.toBe(failure);
            expect(cancelled).toEqual([failure]);
            expect(parser.store.isStreaming).toBe(false)
        })
    }

    test('a reader failure resets streaming and preserves the original error if cancellation rejects', async () => {
        const failure = new Error('read refused'), cancelled = [],
              stream  = {getReader: () => ({
                  read  : async () => {throw failure},
                  cancel: async reason => {cancelled.push(reason); throw new Error('cancel refused')}
              })};
        await expect(parser.read({stream, total: 0})).rejects.toBe(failure);
        expect(cancelled).toEqual([failure]);
        expect(parser.store.isStreaming).toBe(false)
    });

    test('read() should stream and parse NDJSON data', async () => {
        const mockData = [
            {id: 1, name: 'Item 1'},
            {id: 2, name: 'Item 2'},
            {id: 3, name: 'Item 3'}
        ];

        const ndjson = mockData.map(JSON.stringify).join('\n');

        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                // Send data in chunks to simulate streaming
                const chunk1 = encoder.encode(ndjson.substring(0, 10)); // Partial first line
                const chunk2 = encoder.encode(ndjson.substring(10));    // Rest

                controller.enqueue(chunk1);
                controller.enqueue(chunk2);
                controller.close();
            }
        });

        const items = [];
        parser.on('data', (data) => {
            // data is now an array
            items.push(...data);
        });

        const result = await parser.read({stream, total: ndjson.length});

        expect(result.success).toBe(true);
        expect(result.count).toBe(3);
        expect(items.length).toBe(3);
        expect(items[0]).toMatchObject(mockData[0]);
        expect(items[1]).toMatchObject(mockData[1]);
        expect(items[2]).toMatchObject(mockData[2]);
    });

    test('read() should handle empty lines and whitespace', async () => {
        const mockData = [{id: 1}, {id: 2}];
        const ndjson   = `
${JSON.stringify(mockData[0])}

${JSON.stringify(mockData[1])}
        `; // Leading/trailing newlines and empty lines

        const stream = new ReadableStream({
            start(controller) {
                const encoder = new TextEncoder();
                controller.enqueue(encoder.encode(ndjson));
                controller.close();
            }
        });

        const items = [];
        parser.on('data', (data) => {
            items.push(...data);
        });

        const result = await parser.read({stream, total: ndjson.length});

        expect(result.count).toBe(2);
        expect(items.length).toBe(2);
        expect(items[0]).toMatchObject(mockData[0]);
        expect(items[1]).toMatchObject(mockData[1]);
    });

    test('read() should handle aborted stream gracefully', async () => {
         const items = [];
         parser.on('data', (data) => items.push(...data));

         const result = await parser.read({aborted: true});

         expect(result.success).toBe(true);
         expect(result.aborted).toBe(true);
         expect(result.count).toBe(0);
         expect(items.length).toBe(0);
    });
});
