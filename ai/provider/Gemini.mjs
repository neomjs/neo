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
     * Helper to map MCP JSON Schema into Gemini's expected FunctionDeclaration syntax.
     * @param {Object} tool The generic tool object.
     * @protected
     */
    mapToolSchema(tool) {
        // Deep clone to avoid mutating original schema
        const parameters = JSON.parse(JSON.stringify(tool.inputSchema || { type: 'object', properties: {} }));

        // Gemini requires type names to be uppercase (e.g. 'OBJECT', 'STRING')
        const uppercaseTypes = (obj) => {
            if (obj && typeof obj === 'object') {
                if (typeof obj.type === 'string') {
                    obj.type = obj.type.toUpperCase();
                }
                for (const key in obj) {
                    uppercaseTypes(obj[key]);
                }
            }
        };
        uppercaseTypes(parameters);

        return {
            name: tool.name,
            description: tool.description || '',
            parameters
        };
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

        const modelConfig = {
            model: this.modelName,
            systemInstruction: systemInstruction
        };

        if (options.tools && options.tools.length > 0) {
            modelConfig.tools = [{
                functionDeclarations: options.tools.map(t => this.mapToolSchema(t))
            }];
            delete options.tools; // ensure it doesn't leak into generationConfig
        }

        modelConfig.generationConfig = options;

        const model = this.client.getGenerativeModel(modelConfig);

        try {
            const result   = await model.generateContent({contents});
            const response = result.response;
            
            // Extract text (might be empty if model just chose a tool)
            let text = '';
            try { text = response.text(); } catch(e) {} 

            const functionCalls = response.functionCalls();

            const payload = {
                content: text,
                raw    : response
            };

            if (functionCalls && functionCalls.length > 0) {
                payload.toolCalls = functionCalls.map(c => ({
                    function: {
                        name     : c.name,
                        arguments: c.args
                    }
                }));
            }

            return payload;
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
