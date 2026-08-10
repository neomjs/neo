import crypto from 'node:crypto';
import http   from 'node:http';

const host       = process.env.NEO_TEST_EMBEDDING_HOST || '0.0.0.0';
const port       = Number(process.env.NEO_TEST_EMBEDDING_PORT || 11434);
const dimensions = Number(process.env.NEO_TEST_EMBEDDING_DIMENSIONS || 4096);
const modelName  = process.env.NEO_TEST_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-8b';
const chatModel  = process.env.NEO_TEST_CHAT_MODEL || process.env.NEO_OPENAI_COMPATIBLE_MODEL || 'google/gemma-4-26b-a4b';

/**
 * @summary Reads a JSON request body.
 * Reads a JSON request body.
 * @param {http.IncomingMessage} request The incoming HTTP request.
 * @returns {Promise<Object>} The parsed JSON payload.
 */
function readJson(request) {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', chunk => body += chunk);
        request.on('error', reject);
        request.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * @summary Sends a JSON response.
 * Sends a JSON response.
 * @param {http.ServerResponse} response The outgoing HTTP response.
 * @param {Number} statusCode The HTTP status code.
 * @param {Object} payload The JSON payload.
 * @returns {void}
 */
function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, {'content-type': 'application/json'});
    response.end(JSON.stringify(payload));
}

/**
 * @summary Builds a deterministic embedding vector for integration tests.
 * Builds a deterministic embedding vector for integration tests.
 * @param {String} text The input text.
 * @returns {Number[]} A vector matching the configured embedding dimensions.
 */
function buildEmbedding(text) {
    const digest = crypto.createHash('sha256').update(String(text)).digest();

    return Array.from({length: dimensions}, (_, index) => {
        const byte = digest[index % digest.length];

        return Number((((byte / 255) * 2 - 1) / Math.sqrt(dimensions)).toFixed(8));
    });
}

/**
 * @summary Extracts a deterministic chat response from an OpenAI-compatible payload.
 * Extracts a deterministic chat response from an OpenAI-compatible payload.
 * @param {Object} payload The OpenAI-compatible chat completion payload.
 * @returns {String} A deterministic response body.
 */
function buildChatResponse(payload) {
    const messages = Array.isArray(payload.messages) ? payload.messages : [];
    const lastUser = [...messages].reverse().find(message => message.role === 'user');
    const content  = lastUser?.content || messages.at(-1)?.content || '';
    const fullPrompt = messages.map(message => message.content).join('\n');

    if (fullPrompt.includes('session_artifact') && fullPrompt.includes('cloud-readiness-graph-sentinel')) {
        return JSON.stringify({
            a2a_version: '1.0',
            agent_id   : 'neo-integration',
            session_artifact: {
                graph: {
                    nodes: [{
                        id         : 'CONCEPT:cloud-readiness-graph-sentinel',
                        type       : 'CONCEPT',
                        name       : 'cloud-readiness-graph-sentinel',
                        description: 'Deterministic provider-readiness node emitted by the mock OpenAI-compatible server.'
                    }],
                    edges: []
                }
            }
        });
    }

    return JSON.stringify({
        provider: 'openAiCompatible',
        model   : payload.model || chatModel,
        echo    : String(content).slice(0, 240)
    });
}

/**
 * @summary Sends a streaming OpenAI-compatible chat completion response.
 * Sends a streaming OpenAI-compatible chat completion response.
 * @param {http.ServerResponse} response The outgoing HTTP response.
 * @param {String} content The deterministic completion content.
 * @returns {void}
 */
function sendChatStream(response, content) {
    response.writeHead(200, {
        'content-type' : 'text/event-stream',
        'cache-control': 'no-cache',
        connection     : 'keep-alive'
    });
    response.write(`data: ${JSON.stringify({choices: [{delta: {content}}]})}\n\n`);
    response.write('data: [DONE]\n\n');
    response.end();
}

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, {status: 'ok', dimensions, embeddingModel: modelName, chatModel});
        return;
    }

    if (request.method !== 'POST') {
        sendJson(response, 404, {error: 'Not found'});
        return;
    }

    try {
        const payload = await readJson(request);

        if (request.url === '/v1/embeddings') {
            const inputs = Array.isArray(payload.input) ? payload.input : [payload.input ?? ''];

            sendJson(response, 200, {
                object: 'list',
                model : payload.model || modelName,
                data  : inputs.map((input, index) => ({
                    object   : 'embedding',
                    index,
                    embedding: buildEmbedding(input)
                })),
                usage : {
                    prompt_tokens: 0,
                    total_tokens : 0
                }
            });
            return;
        }

        if (request.url === '/v1/chat/completions') {
            const content = buildChatResponse(payload);

            if (payload.stream !== false) {
                sendChatStream(response, content);
                return;
            }

            sendJson(response, 200, {
                id     : 'chatcmpl-neo-integration',
                object : 'chat.completion',
                model  : payload.model || chatModel,
                choices: [{
                    index  : 0,
                    message: {
                        role: 'assistant',
                        content
                    },
                    finish_reason: 'stop'
                }]
            });
            return;
        }

        sendJson(response, 404, {error: 'Not found'});
    } catch (error) {
        sendJson(response, 400, {error: error.message});
    }
});

server.listen(port, host, () => {
    console.log(`[mock-openai-compatible-server] listening on ${host}:${port}`);
});
