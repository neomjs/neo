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
 * **Compression Support:**
 * You can configure the proxy to use `DecompressionStream` (gzip/deflate) by setting the `compression` config.
 * This allows serving pre-compressed files (`.jsonl.gz`), significantly reducing network transfer size
 * (often >60% reduction) while keeping the client-side parsing logic identical.
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
         * Set the compression algorithm to use for the stream.
         * Valid values: 'gzip', 'deflate', null.
         *
         * Uses the browser's `DecompressionStream` API to transparently unzip data on the fly.
         * This can reduce bandwidth usage by 60-80% for JSONL data, enabling significantly larger datasets.
         *
         * @member {String|null} compression=null
         */
        compression: null,
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
        initialChunkSize: 100,
        /**
         * True to automatically increase the chunkSize based on the total number of loaded items.
         *
         * **Progressive Enhancement Strategy:**
         * When loading large datasets (e.g., 30k+ records), the cost of `store.add()` (sorting + event propagation)
         * becomes the dominant bottleneck. However, the user needs immediate feedback.
         *
         * - **Phase 1 (Start):** Small chunks (100-250) for immediate "Time to First Content" and frequent UI updates.
         * - **Phase 2 (Ramp):** Medium chunks (500-1500) as the user processes the initial data.
         * - **Phase 3 (Bulk):** Massive chunks (2500-10000) for the tail end of the dataset. At this point,
         *   throughput matters more than interactivity, as the user already has a screen full of data.
         *
         * This mode overrides `initialBurstCount` and `chunkSize`.
         *
         * @member {Boolean} progressiveChunkSize=false
         */
        progressiveChunkSize: false
    }

    /**
     * @member {AbortController|null} abortController=null
     * @protected
     */
    abortController = null

    /**
     * Aborts the current stream request.
     */
    abort() {
        this.abortController?.abort()
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    async read(operation) {
        let me               = this,
            chunk            = [],
            {chunkSize, progressiveChunkSize} = me,
            currentChunkSize = me.initialChunkSize || chunkSize,
            burstCount       = 0,
            count            = 0,
            url              = me.url || operation.url;

        if (!url) {
            throw new Error('No URL specified')
        }

        me.abortController = new AbortController();
        me.store.isStreaming = true;

        try {
            const response = await fetch(url, {signal: me.abortController.signal});

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            if (!response.body) {
                throw new Error('ReadableStream not supported in this environment.')
            }

            let stream = response.body;

            if (me.compression) {
                if (typeof DecompressionStream === 'undefined') {
                    throw new Error('DecompressionStream not supported in this environment.')
                }
                stream = stream.pipeThrough(new DecompressionStream(me.compression))
            }

            const reader = stream.getReader();
            const decoder = new TextDecoder();

            let buffer = '';
            let loaded = 0;
            const total = parseInt(response.headers.get('content-length') || 0, 10);

            while (true) {
                const {value, done} = await reader.read();

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

                            if (progressiveChunkSize) {
                                currentChunkSize = me.getProgressiveChunkSize(count);
                            } else if (burstCount >= me.initialBurstCount) {
                                currentChunkSize = chunkSize
                            }

                            // Give the App Worker a minimal amount of time to breathe,
                            // so that logic can act upon events (e.g. sending out vdom updates).
                            await me.timeout(1);

                            chunk = []
                        }
                    }
                }
            }

            return {success: true, count}
        } catch (e) {
            if (e.name === 'AbortError') {
                console.log('Stream request aborted');
                me.store.isStreaming = false;
                // Treat abort as a valid "partial success"
                return {success: true, count, aborted: true}
            }
            throw e
        } finally {
            me.abortController = null
        }
    }

    /**
     * Calculates the next chunk size based on the total number of records processed so far.
     * Implements a tiered ramping strategy to balance initial responsiveness with long-term throughput.
     *
     * @param {Number} total The total number of records processed
     * @returns {Number} The recommended chunk size for the next batch
     */
    getProgressiveChunkSize(total) {
        if (total < 100)   return 100;
        if (total < 250)   return 150;
        if (total < 500)   return 250;
        if (total < 1000)  return 500;
        if (total < 2500)  return 1500;
        if (total < 10000) return 2500;
        if (total < 20000) return 5000;
        return 10000
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
