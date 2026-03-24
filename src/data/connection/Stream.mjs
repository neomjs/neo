import Base from './Base.mjs';

/**
 * @class Neo.data.connection.Stream
 * @extends Neo.data.connection.Base
 */
class Stream extends Base {
    static config = {
        /**
         * @member {String} className='Neo.data.connection.Stream'
         * @protected
         */
        className: 'Neo.data.connection.Stream',
        /**
         * @member {String} ntype='connection-stream'
         * @protected
         */
        ntype: 'connection-stream',
        /**
         * Set the compression algorithm to use for the stream.
         * Valid values: 'gzip', 'deflate', null.
         * @member {String|null} compression=null
         */
        compression: null
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
        this.abortController?.abort();
    }

    /**
     * @param {Object} [params]
     * @returns {Promise<Object>}
     */
    async read(params) {
        let me  = this,
            url = me.url || params?.url;

        if (!url) {
            throw new Error('No URL specified for connection.Stream')
        }

        me.abortController = new AbortController();

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

            return {
                response,
                stream,
                total: parseInt(response.headers.get('content-length') || 0, 10)
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                return { aborted: true }
            }
            throw e
        }
    }
}

export default Neo.setupClass(Stream);
