import Base from '../../src/core/Base.mjs';

/**
 * Abstract base class for AI model providers.
 * Defines the standard interface for interacting with LLMs (Gemini, OpenAI, etc.).
 *
 * @class Neo.ai.provider.Base
 * @extends Neo.core.Base
 * @abstract
 */
class BaseProvider extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.provider.Base'
         * @protected
         */
        className: 'Neo.ai.provider.Base',
        /**
         * The default model name to use.
         * @member {String|null} modelName=null
         */
        modelName: null,
        /**
         * List of required environment variables for this provider.
         * @member {String[]} requiredEnv=[]
         */
        requiredEnv: []
    }

    /**
     * Validates that all required environment variables are present.
     * @param {Object} config
     * @throws {Error} If any required variable is missing.
     */
    construct(config) {
        super.construct(config);

        if (this.requiredEnv.length > 0) {
            const missing = this.requiredEnv.filter(key => !process.env[key]);
            if (missing.length > 0) {
                throw new Error(`[${this.className}] Missing required environment variables: ${missing.join(', ')}`);
            }
        }
    }

    /**
     * Generates a text completion for the given prompt.
     * Must be implemented by subclasses.
     *
     * @param {String|Object|Array} input The prompt or message history.
     * @param {Object} [options] Additional generation options (temperature, maxTokens, etc.).
     * @returns {Promise<Object>} The provider response (standardized).
     * @abstract
     */
    async generate(input, options) {
        throw new Error('Abstract method generate() must be implemented by subclass.');
    }

    /**
     * Streams text completion for the given prompt.
     * Must be implemented by subclasses.
     *
     * @param {String|Object|Array} input The prompt or message history.
     * @param {Object} [options] Additional generation options.
     * @returns {AsyncGenerator} An async generator yielding chunks of the response.
     * @abstract
     */
    async *stream(input, options) {
        throw new Error('Abstract method stream() must be implemented by subclass.');
    }
}

export default Neo.setupClass(BaseProvider);
