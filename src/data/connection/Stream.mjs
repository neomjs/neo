import Base from './Base.mjs';

/**
 * @class Neo.data.connection.Stream
 * @extends Neo.data.connection.Base
 *
 * @summary A Transport Layer implementation that initiates a network request and returns a raw byte stream.
 *
 * `connection.Stream` is strictly responsible for the **Transport** phase of the Data Pipeline.
 * It uses the native `fetch` API to open a connection, handle optional `DecompressionStream` logic
 * (like gzip or deflate), and returns the raw `ReadableStream`.
 *
 * **Crucial Architectural Boundary:**
 * This class knows nothing about the format of the data (JSON, CSV, XML) or how it translates
 * to records. It simply provides the byte pipe. A downstream Parser (e.g., {@link Neo.data.parser.Stream})
 * must be used in the Pipeline to deserialize the byte stream into structured JavaScript objects.
 * This separation adheres to the single responsibility principle and allows this connection to be
 * reused for entirely different streaming data formats.
 *
 * @see Neo.data.Pipeline
 * @see Neo.data.parser.Stream
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
