import Base from './Base.mjs';

/**
 * Concrete AI provider for a local MLX-native or any OpenAI-compatible API server.
 * Uses the native JS Fetch API. Defaults to http://127.0.0.1:8000.
 *
 * @class Neo.ai.provider.OpenAiCompatible
 * @extends Neo.ai.provider.Base
 */
class OpenAiCompatibleProvider extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.provider.OpenAiCompatible'
         * @protected
         */
        className: 'Neo.ai.provider.OpenAiCompatible',
        /**
         * Default API endpoint for OpenAI Compatible API.
         * @member {String} host='http://127.0.0.1:8000'
         */
        host: 'http://127.0.0.1:8000',
        /**
         * @member {String} modelName='gemma4:31b'
         */
        modelName: 'gemma4:31b',
        /**
         * @member {String} systemPrompt=''
         */
        systemPrompt: '',
        /**
         * @member {String[]} requiredEnv=[]
         */
        requiredEnv: []
    }

    /**
     * Helper to prepare the payload for the OpenAI compatible format.
     * @param {String|Array} input 
     * @param {Object} options 
     * @param {Boolean} stream 
     * @returns {Object}
     * @protected
     */
    preparePayload(input, options, stream) {
        let messages = [];

        // Apply global system prompt if set
        if (this.systemPrompt) {
            messages.push({
                role   : 'system',
                content: this.systemPrompt
            });
        }

        if (typeof input === 'string') {
            messages.push({
                role   : 'user',
                content: input
            });
        } else if (Array.isArray(input)) {
            input.forEach(msg => {
                messages.push({
                    role   : msg.role === 'model' ? 'assistant' : msg.role,
                    content: String(msg.content)
                });
            });
        }

        const payload = {
            model: this.modelName,
            messages,
            stream
        };

        const clonedOptions = { ...options };

        // Handle JSON extraction
        if (clonedOptions.responseMimeType === 'application/json' || clonedOptions.response_mime_type === 'application/json' || clonedOptions.response_format?.type === 'json_object') {
            payload.response_format = { type: 'json_object' };
            delete clonedOptions.responseMimeType;
            delete clonedOptions.response_mime_type;
            delete clonedOptions.response_format;
        }

        if (clonedOptions.tools?.length > 0) {
            payload.tools = clonedOptions.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description || '',
                    parameters: tool.inputSchema || { type: 'object', properties: {} }
                }
            }));
            delete clonedOptions.tools;
        }

        // Merge any other remaining options
        if (Object.keys(clonedOptions).length > 0) {
            Object.assign(payload, clonedOptions);
        }

        return payload;
    }

    /**
     * @summary Natively wraps the streaming generator to bypass internal serialization locks on local LLM servers.
     * Generates text completion natively.
     *
     * @param {String|Array} input Prompt string or message history array.
     * @param {Object} [options]
     * @returns {Promise<{content: String, raw: Object}>}
     */
    async generate(input, options = {}) {
        let fullContent = '';

        try {
            // Internally delegate to the streaming API to bypass LM Studio/llama.cpp 
            // monolithic buffer serialization penalties (~30% faster on Apple Silicon)
            for await (const chunk of this.stream(input, options)) {
                fullContent += chunk;
            }

            return {
                content: fullContent,
                // Simulate the raw message expected by upstream callers
                raw: { message: { content: fullContent } }
            };
        } catch (error) {
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
        const cleanOptions = { ...options };
        delete cleanOptions.num_ctx;

        const payload = this.preparePayload(input, cleanOptions, true);

        try {
            const response = await fetch(`${this.host}/v1/chat/completions`, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`OpenAI-Compatible API error: ${response.status} - ${text}`);
            }

            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, {stream: true});
                const lines = buffer.split('\n');
                
                // Keep the last partial line in the buffer for the next chunk
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;

                    try {
                        const jsonStr = trimmed.replace(/^data:\s*/, '');
                        if (!jsonStr) continue;

                        const data = JSON.parse(jsonStr);
                        const delta = data.choices?.[0]?.delta;
                        if (typeof delta?.content === 'string') {
                            yield delta.content;
                        }
                    } catch (e) {
                        // Safe to ignore if JSON.parse fails on malformed LLM outputs
                        // We have handled TCP boundaries via the buffer!
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}

export default Neo.setupClass(OpenAiCompatibleProvider);
