import Base from './Base.mjs';

/**
 * Concrete AI provider for a local Ollama daemon.
 * Uses the native JS Fetch API.
 *
 * @class Neo.ai.provider.Ollama
 * @extends Neo.ai.provider.Base
 */
class OllamaProvider extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.provider.Ollama'
         * @protected
         */
        className: 'Neo.ai.provider.Ollama',
        /**
         * Default API endpoint for Ollama.
         * @member {String} host='http://127.0.0.1:11434'
         */
        host: 'http://127.0.0.1:11434',
        /**
         * @member {String} modelName='gemma4'
         */
        modelName: 'gemma4',
        /**
         * @member {String[]} requiredEnv=[]
         */
        requiredEnv: []
    }

    /**
     * Helper to prepare the payload for Ollama.
     * @param {String|Array} input 
     * @param {Object} options 
     * @param {Boolean} stream 
     * @returns {Object}
     * @protected
     */
    preparePayload(input, options, stream) {
        let messages = [];

        if (typeof input === 'string') {
            messages.push({
                role   : 'user',
                content: input
            });
        } else if (Array.isArray(input)) {
            // Map Neo roles to Ollama roles (system, user, assistant)
            messages = input.map(msg => ({
                role   : msg.role === 'model' ? 'assistant' : msg.role,
                content: String(msg.content)
            }));
        }

        const payload = {
            model   : this.modelName,
            messages: messages,
            stream  : stream
        };

        const clonedOptions = { ...options };

        // Handle JSON extraction mirroring Gemini provider
        if (clonedOptions.responseMimeType === 'application/json' || clonedOptions.response_mime_type === 'application/json') {
            payload.format = 'json';
            delete clonedOptions.responseMimeType;
            delete clonedOptions.response_mime_type;
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

        if (Object.keys(clonedOptions).length > 0) {
            payload.options = clonedOptions;
        }

        return payload;
    }

    /**
     * Generates text completion.
     *
     * @param {String|Array} input Prompt string or message history array.
     * @param {Object} [options]
     * @returns {Promise<{content: String, raw: Object}>}
     */
    async generate(input, options = {}) {
        const payload = this.preparePayload(input, options, false);
        // Force long keep_alive for heavy tasks
        if (!payload.keep_alive) payload.keep_alive = "1h";

        try {
            const parsedUrl = new URL(`${this.host}/api/chat`);
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
                timeout: 60 * 60 * 1000 // 1 hour timeout natively
            }, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        rejectFunc(new Error(`Ollama API error: ${res.statusCode} - ${body}`));
                    } else {
                        try {
                            const result = JSON.parse(body);
                            resolveFunc(result);
                        } catch (e) {
                            rejectFunc(new Error(`Failed to parse Ollama response: ${e.message}`));
                        }
                    }
                });
            });

            req.on('error', (err) => {
                rejectFunc(err);
            });

            req.on('timeout', () => {
                req.destroy();
                rejectFunc(new Error('Ollama request timed out after 1 hour'));
            });

            req.write(JSON.stringify(payload));
            req.end();

            const result = await responsePromise;

            const resultPayload = {
                content: result.message?.content || '',
                raw    : result
            };

            if (result.message?.tool_calls && result.message.tool_calls.length > 0) {
                resultPayload.toolCalls = result.message.tool_calls.map(c => ({
                    function: {
                        name     : c.function.name,
                        arguments: c.function.arguments
                    }
                }));
            }

            return resultPayload;
        } catch (error) {
            // Re-throw to let the caller handle it or gracefully degrade
            // instead of vomiting a raw fetch trace if the daemon is offline
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
        const payload = this.preparePayload(input, options, true);

        try {
            const response = await fetch(`${this.host}/api/chat`, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Ollama API error: ${response.status} - ${text}`);
            }

            const reader  = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const {done, value} = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, {stream: true});
                
                // Ollama returns newline delimited JSON for streams
                const lines = chunkText.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    try {
                        const data = JSON.parse(line);
                        if (data.message && typeof data.message.content === 'string') {
                            yield data.message.content;
                        }
                    } catch (e) {
                         // Ignore incomplete JSON chunks boundary issues
                    }
                }
            }
        } catch (error) {
            // Re-throw to let the caller handle it or gracefully degrade
            throw error;
        }
    }
}

export default Neo.setupClass(OllamaProvider);
