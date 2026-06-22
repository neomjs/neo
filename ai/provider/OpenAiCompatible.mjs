import Base                 from './Base.mjs';
import {createTimeoutError} from './createTimeoutError.mjs';

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
         * @summary Optional bearer token for OpenAI-compatible API servers that require one.
         *
         * @member {String} apiKey=''
         */
        apiKey: '',
        /**
         * @summary Provider keep-alive retention hint for OpenAI-compatible servers that
         * honor Ollama-style cache-retention extensions.
         *
         * `-1` requests resident model/cache retention; unsupported servers ignore the
         * non-standard payload field.
         * @member {Number|String} keepAlive=-1
         */
        keepAlive: -1,
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
        delete clonedOptions.operationLabel;
        delete clonedOptions.signal;
        delete clonedOptions.timeoutMs;

        // Structured output: LM Studio + the OpenAI spec require `response_format.type` to be
        // 'json_schema' or 'text' — the older 'json_object' form is REJECTED. When a caller supplies a
        // JSON schema we emit grammar-constrained `json_schema` (guaranteed valid, fence-free,
        // schema-correct output — works even with LM Studio's GUI "Structured Output" toggle off).
        // JSON-requested-without-schema falls back to prompt-driven (no `response_format`) rather than
        // the rejected `json_object`. `reasoning_effort` (the no-think toggle) needs no handling here —
        // it rides the generic option-merge below.
        const responseSchema = clonedOptions.responseSchema || clonedOptions.response_format?.json_schema?.schema;
        if (responseSchema) {
            payload.response_format = {
                type       : 'json_schema',
                json_schema: {
                    name  : clonedOptions.responseSchemaName   || clonedOptions.response_format?.json_schema?.name   || 'structured_output',
                    strict: clonedOptions.responseSchemaStrict ?? clonedOptions.response_format?.json_schema?.strict ?? false,
                    schema: responseSchema
                }
            };
        } else if (clonedOptions.responseMimeType === 'application/json' || clonedOptions.response_mime_type === 'application/json' || clonedOptions.response_format?.type === 'json_object') {
            // Backward-compat JSON mode for callers without a schema. LM Studio rejects json_object —
            // those callers should migrate to `responseSchema`; preserved for other
            // OpenAI-compatible endpoints + the prior contract.
            payload.response_format = { type: 'json_object' };
        }
        delete clonedOptions.responseMimeType;
        delete clonedOptions.response_mime_type;
        delete clonedOptions.response_format;
        delete clonedOptions.responseSchema;
        delete clonedOptions.responseSchemaName;
        delete clonedOptions.responseSchemaStrict;

        if (clonedOptions.tools?.length > 0) {
            payload.tools = clonedOptions.tools.map(tool => ({
                type    : 'function',
                function: {
                    name       : tool.name,
                    description: tool.description || '',
                    parameters : tool.inputSchema || { type: 'object', properties: {} }
                }
            }));
            delete clonedOptions.tools;
        }

        if (clonedOptions.keep_alive === undefined) {
            payload.keep_alive = this.keepAlive;
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
     * @summary Extracts generated content from OpenAI-compatible chat completion chunks.
     *
     * Streaming SSE frames expose text as `choices[0].delta.content`; non-SSE
     * JSON chat-completions responses expose the final text as
     * `choices[0].message.content`.
     *
     * @param {Object} data Parsed OpenAI-compatible response payload.
     * @returns {String|null}
     * @private
     */
    #getChoiceContent(data) {
        const choice = data?.choices?.[0],
              deltaContent = choice?.delta?.content,
              messageContent = choice?.message?.content;

        if (typeof deltaContent === 'string') {
            return deltaContent;
        }

        return typeof messageContent === 'string' ? messageContent : null;
    }

    /**
     * @summary Parses one streaming line or a complete single-line JSON response.
     *
     * @param {String} line SSE `data:` line or JSON response line.
     * @returns {String|null}
     * @private
     */
    #parseCompletionLine(line) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') {
            return null;
        }

        try {
            const jsonStr = trimmed.replace(/^data:\s*/, '');
            return jsonStr ? this.#getChoiceContent(JSON.parse(jsonStr)) : null;
        } catch (e) {
            // Safe to ignore if JSON.parse fails on malformed LLM outputs.
            return null;
        }
    }

    /**
     * @summary Parses a plain JSON chat-completions body after the stream ends.
     *
     * Pretty-printed JSON can span multiple lines, so this fallback operates on
     * the full body only when no content has already been yielded.
     *
     * @param {String} bodyText Full decoded response body.
     * @returns {String|null}
     * @private
     */
    #parseCompletionBody(bodyText) {
        const trimmed = bodyText.trim();
        if (!trimmed || trimmed.startsWith('data:')) {
            return null;
        }

        try {
            return this.#getChoiceContent(JSON.parse(trimmed));
        } catch (e) {
            return null;
        }
    }

    /**
     * Streams text completion.
     *
     * @param {String|Array} input
     * @param {Object} [options]
     * @param {Number} [options.timeoutMs] Abort the provider request after this many milliseconds.
     * @param {String} [options.operationLabel] Safe diagnostic label for timeout errors.
     * @param {AbortSignal} [options.signal] Optional upstream cancellation signal.
     * @returns {AsyncGenerator<String>} Yields text chunks.
     */
    async *stream(input, options = {}) {
        const cleanOptions = { ...options };
        const rawTimeoutMs  = Number(cleanOptions.timeoutMs),
              timeoutMs     = Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0 ? rawTimeoutMs : null,
              operationLabel = cleanOptions.operationLabel || 'OpenAI-compatible chat completion',
              upstreamSignal = cleanOptions.signal;

        delete cleanOptions.num_ctx;
        delete cleanOptions.operationLabel;
        delete cleanOptions.signal;
        delete cleanOptions.timeoutMs;

        const payload = this.preparePayload(input, cleanOptions, true);
        const controller = timeoutMs || upstreamSignal ? new AbortController() : null;
        let timeoutId, upstreamAbortListener, timedOut = false;

        if (controller && upstreamSignal) {
            if (upstreamSignal.aborted) {
                controller.abort(upstreamSignal.reason);
            } else {
                upstreamAbortListener = () => controller.abort(upstreamSignal.reason);
                upstreamSignal.addEventListener('abort', upstreamAbortListener, {once: true});
            }
        }

        if (controller && timeoutMs && !controller.signal.aborted) {
            timeoutId = setTimeout(() => {
                timedOut = true;
                controller.abort(createTimeoutError({
                    provider : 'OpenAiCompatible',
                    operationLabel,
                    timeoutMs,
                    host     : this.host,
                    modelName: this.modelName
                }));
            }, timeoutMs);
        }

        try {
            const response = await fetch(`${this.host}/v1/chat/completions`, {
                method : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? {Authorization: `Bearer ${this.apiKey}`} : {})
                },
                body: JSON.stringify(payload),
                ...(controller ? {signal: controller.signal} : {})
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`OpenAI-Compatible API error: ${response.status} - ${text}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '',
                bodyText = '',
                yieldedContent = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunkText = decoder.decode(value, { stream: true });
                bodyText += chunkText;
                buffer += chunkText;
                const lines = buffer.split('\n');

                // Keep the last partial line in the buffer for the next chunk
                buffer = lines.pop();

                for (const line of lines) {
                    const content = this.#parseCompletionLine(line);
                    if (content) {
                        yieldedContent = true;
                        yield content;
                    }
                }
            }

            const flushText = decoder.decode();
            if (flushText) {
                bodyText += flushText;
                buffer += flushText;
            }

            const finalContent = this.#parseCompletionLine(buffer);
            if (finalContent) {
                yieldedContent = true;
                yield finalContent;
            }

            if (!yieldedContent) {
                const bodyContent = this.#parseCompletionBody(bodyText);
                if (bodyContent) {
                    yield bodyContent;
                }
            }
        } catch (error) {
            if (timedOut) {
                const timeoutError = createTimeoutError({
                    provider : 'OpenAiCompatible',
                    operationLabel,
                    timeoutMs,
                    host     : this.host,
                    modelName: this.modelName
                });
                timeoutError.cause = error;
                throw timeoutError;
            }
            throw error;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (upstreamSignal && upstreamAbortListener) {
                upstreamSignal.removeEventListener('abort', upstreamAbortListener);
            }
        }
    }
}

export default Neo.setupClass(OpenAiCompatibleProvider);
