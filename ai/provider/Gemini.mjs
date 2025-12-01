import {GoogleGenerativeAI} from '@google/generative-ai';
import Base                 from './Base.mjs';

/**
 * Concrete AI provider for Google's Gemini API.
 * Uses the @google/generative-ai SDK.
 *
 * @class Neo.ai.provider.Gemini
 * @extends Neo.ai.provider.Base
 */
class GeminiProvider extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.provider.Gemini'
         * @protected
         */
        className: 'Neo.ai.provider.Gemini',
        /**
         * @member {String} modelName='gemini-2.5-flash'
         */
        modelName: 'gemini-2.5-flash',
        /**
         * @member {String[]} requiredEnv=['GEMINI_API_KEY']
         */
        requiredEnv: ['GEMINI_API_KEY']
    }

    /**
     * @member {GoogleGenerativeAI|null} client=null
     * @protected
     */
    client = null

    /**
     * Initialize the GoogleGenerativeAI client.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        this.client = new GoogleGenerativeAI(process.env[this.requiredEnv[0]]);
    }

    /**
     * Generates text completion.
     *
     * @param {String|Array} input Prompt string or message history array.
     * @param {Object} [options]
     * @returns {Promise<{content: String, raw: Object}>}
     */
    async generate(input, options = {}) {
        if (!this.client) {
            throw new Error('Gemini API client not initialized. Missing API key?');
        }

        let contents          = [],
            systemInstruction = undefined;

        if (typeof input === 'string') {
            contents.push({
                role : 'user',
                parts: [{text: input}]
            });
        } else if (Array.isArray(input)) {
            input.forEach(msg => {
                if (msg.role === 'system') {
                    systemInstruction = msg.content;
                } else {
                    contents.push({
                        role : msg.role === 'assistant' ? 'model' : 'user',
                        parts: [{text: msg.content}]
                    });
                }
            });
        }

        const model = this.client.getGenerativeModel({
            model: this.modelName,
            generationConfig: options,
            systemInstruction: systemInstruction
        });

        try {
            const result   = await model.generateContent({contents});
            const response = await result.response;
            const text     = response.text();

            return {
                content: text,
                raw    : response
            };
        } catch (error) {
            console.error('[Neo.ai.provider.Gemini] Generation failed:', error);
            throw error;
        }
    }

    /**
     * Streams text completion.
     *
     * @param {String|Array} input
     * @param {Object} [options]
     * @returns {AsyncGenerator<String>} Yields text chunks.
     */
    async *stream(input, options = {}) {
        if (!this.client) {
            throw new Error('Gemini API client not initialized. Missing API key?');
        }

        const model = this.client.getGenerativeModel({
            model           : this.modelName,
            generationConfig: options
        });

        try {
            const result = await model.generateContentStream(input);

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                yield chunkText;
            }
        } catch (error) {
            console.error('[Neo.ai.provider.Gemini] Stream failed:', error);
            throw error;
        }
    }
}

export default Neo.setupClass(GeminiProvider);
