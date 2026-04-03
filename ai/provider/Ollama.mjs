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
         * @member {String} modelName='gemma-4'
         */
        modelName: 'gemma-4',
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

            const result = await response.json();

            return {
                content: result.message?.content || '',
                raw    : result
            };
        } catch (error) {
            console.error('[Neo.ai.provider.Ollama] Generation failed:', error);
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
            console.error('[Neo.ai.provider.Ollama] Stream failed:', error);
            throw error;
        }
    }
}

export default Neo.setupClass(OllamaProvider);
