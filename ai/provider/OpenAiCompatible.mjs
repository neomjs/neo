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
                role: 'system',
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
            model   : this.modelName,
            messages: messages,
            stream  : stream
        };

        const clonedOptions = { ...options };

        // Handle JSON extraction
        if (clonedOptions.responseMimeType === 'application/json' || clonedOptions.response_mime_type === 'application/json' || (clonedOptions.response_format && clonedOptions.response_format.type === 'json_object')) {
            payload.response_format = { type: 'json_object' };
            delete clonedOptions.responseMimeType;
            delete clonedOptions.response_mime_type;
            delete clonedOptions.response_format;
        }

        if (clonedOptions.tools && clonedOptions.tools.length > 0) {
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
     * Generates text completion natively.
     *
     * @param {String|Array} input Prompt string or message history array.
     * @param {Object} [options]
     * @returns {Promise<{content: String, raw: Object}>}
     */
    async generate(input, options = {}) {
        // Explicity strip out any legacy Ollama context parameters as MLX manages this internally via paging
        const cleanOptions = { ...options };
        delete cleanOptions.num_ctx;

        const payload = this.preparePayload(input, cleanOptions, false);

        try {
            const parsedUrl = new URL(`${this.host}/v1/chat/completions`);
            const httpModule = parsedUrl.protocol === 'https:' ? await import('https') : await import('http');

            let resolveFunc, rejectFunc;
            const responsePromise = new Promise((res, rej) => {
                resolveFunc = res;
                rejectFunc = rej;
            });

            const req = httpModule.request(parsedUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 60 * 60 * 1000 // 1 hour timeout
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        rejectFunc(new Error(`OpenAI-Compatible API error: ${res.statusCode} - ${body}`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveFunc(result);
                        } catch (e) {
                            rejectFunc(new Error(`Failed to parse OpenAI-Compatible response: ${e.message}`));
                        }
                    }
                });
            });

            req.on('error', (err) => {
                rejectFunc(err);
            });

            req.on('timeout', () => {
                req.destroy();
                rejectFunc(new Error('API request timed out after 1 hour'));
            });

            req.write(JSON.stringify(payload));
            req.end();

            const result = await responsePromise;
            
            // OpenAI completions format returns choices array
            const message = result.choices && result.choices.length > 0 ? result.choices[0].message : result.message;

            const resultPayload = {
                content: message?.content || '',
                raw    : result
            };

            if (message?.tool_calls && message.tool_calls.length > 0) {
                resultPayload.toolCalls = message.tool_calls.map(c => ({
                    function: {
                        name     : c.function.name,
                        arguments: c.function.arguments
                    }
                }));
            }

            return resultPayload;
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

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, {stream: true});
                const lines = chunkText.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
                
                for (const line of lines) {
                    try {
                        const jsonStr = line.replace(/^data:\s*/, '');
                        if (!jsonStr) continue;

                        const data = JSON.parse(jsonStr);
                        const delta = data.choices && data.choices[0] && data.choices[0].delta;
                        if (delta && typeof delta.content === 'string') {
                            yield delta.content;
                        }
                    } catch (e) {
                         // Ignore incomplete JSON chunks boundary issues
                    }
                }
            }
        } catch (error) {
            throw error;
        }
    }
}

export default Neo.setupClass(OpenAiCompatibleProvider);
