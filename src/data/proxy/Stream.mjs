import Base from './Base.mjs';

/**
 * @class Neo.data.proxy.Stream
 * @extends Neo.data.proxy.Base
 *
 * @summary A Proxy implementation for streaming newline-delimited JSON (NDJSON/JSONL).
 *
 * This proxy uses the modern `fetch` and `ReadableStream` APIs to process data incrementally.
 * Unlike standard JSON parsing (which requires the entire file to be downloaded and parsed at once),
 * this proxy yields records as they arrive.
 *
 * **Performance & Batching:**
 * To avoid overwhelming the main thread (App Worker) with thousands of micro-events, this class
 * implements a buffering strategy. It accumulates parsed records into a chunk (defined by `chunkSize`)
 * and fires a single `data` event containing the array of records. This allows the consumer (Store)
 * to perform bulk updates, drastically reducing overhead.
 *
 * **Requirements:**
 * - The backend must serve data in NDJSON format (one valid JSON object per line).
 * - The environment must support `TextDecoderStream` (Modern Browsers, Workers).
 */
class Stream extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.proxy.Stream'
         * @protected
         */
        className: 'Neo.data.proxy.Stream',
        /**
         * @member {String} ntype='proxy-stream'
         * @protected
         */
        ntype: 'proxy-stream',
        /**
         * Number of records to batch before firing a 'data' event.
         * @member {Number} chunkSize=500
         */
        chunkSize: 500,
        /**
         * How many chunks to send at initialChunkSize before switching to chunkSize.
         * @member {Number} initialBurstCount=5
         */
        initialBurstCount: 5,
        /**
         * The chunk size for the first few batches.
         * Useful to speed up the initial render (Time To First Content).
         * @member {Number|null} initialChunkSize=100
         */
        initialChunkSize: 100
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    async read(operation) {
        let me               = this,
            chunk            = [],
            {chunkSize}      = me,
            currentChunkSize = me.initialChunkSize || chunkSize,
            burstCount       = 0,
            count            = 0,
            url              = me.url || operation.url;

        if (!url) {
            throw new Error('No URL specified')
        }

        me.store.isStreaming = true;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`)
        }

        if (!response.body) {
            throw new Error('ReadableStream not supported in this environment.')
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        let loaded = 0;
        const total = parseInt(response.headers.get('content-length') || 0, 10);

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                // Process any remaining buffer
                if (buffer.trim()) {
                    me.processLine(buffer, chunk);
                    count++
                }
                // Flush remaining chunk
                if (chunk.length > 0) {
                    me.fire('data', chunk);
                    me.store.isStreaming = false
                }
                break
            }

            loaded += value.byteLength;
            me.fire('progress', {loaded, total});

            buffer += decoder.decode(value, {stream: true});
            const lines = buffer.split('\n');
            // Keep the last partial line in the buffer
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) {
                    me.processLine(line, chunk);
                    count++;

                    if (chunk.length >= currentChunkSize) {
                        me.fire('data', chunk);

                        burstCount++;

                        if (burstCount >= me.initialBurstCount) {
                            currentChunkSize = chunkSize
                        }

                        // Give the App Worker 5ms time to breathe, so that logic can act upon events.
                        // E.g., sending out vdom updates.
                        await me.timeout(5);

                        chunk = []
                    }
                }
            }
        }

        return {success: true, count}
    }

    /**
     * @param {String} line
     * @param {Array} chunk
     */
    processLine(line, chunk) {
        try {
            chunk.push(JSON.parse(line));
        } catch (e) {
            console.warn('JSON parse error in Stream proxy:', e, line);
        }
    }
}

export default Neo.setupClass(Stream);
