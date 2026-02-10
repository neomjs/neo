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
        ntype: 'proxy-stream'
    }

    /**
     * @param {Object} operation
     * @returns {Promise}
     */
    async read(operation) {
        let me  = this,
            url = me.url || operation.url,
            count = 0;

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
                    me.processLine(buffer);
                    count++;
                }
                break;
            }

            buffer += value;
            const lines = buffer.split('\n');
            // Keep the last partial line in the buffer
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) {
                    me.processLine(line);
                    count++;
                }
            }
        }

        return {success: true, count};
    }

    /**
     * @param {String} line
     */
    processLine(line) {
        try {
            const data = JSON.parse(line);
            this.fire('data', data);
        } catch (e) {
            console.warn('JSON parse error in Stream proxy:', e, line);
        }
    }
}

export default Neo.setupClass(Stream);
