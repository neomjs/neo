import Base from './Base.mjs';

/**
 * @class Neo.data.proxy.Stream
 * @extends Neo.data.proxy.Base
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
        chunkSize: 500
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    async read(operation) {
        let me        = this,
            chunk     = [],
            chunkSize = me.chunkSize,
            count     = 0,
            url       = me.url || operation.url;

        if (!url) {
            throw new Error('No URL specified');
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (!response.body) {
            throw new Error('ReadableStream not supported in this environment.');
        }

        const reader = response.body
            .pipeThrough(new TextDecoderStream())
            .getReader();

        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();

            if (done) {
                // Process any remaining buffer
                if (buffer.trim()) {
                    me.processLine(buffer, chunk);
                    count++;
                }
                // Flush remaining chunk
                if (chunk.length > 0) {
                    me.fire('data', chunk);
                }
                break;
            }

            buffer += value;
            const lines = buffer.split('\n');
            // Keep the last partial line in the buffer
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) {
                    me.processLine(line, chunk);
                    count++;

                    if (chunk.length >= chunkSize) {
                        me.fire('data', chunk);
                        chunk = [];
                    }
                }
            }
        }

        return {success: true, count};
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
