import crypto from 'node:crypto';
import http   from 'node:http';

const host       = process.env.NEO_TEST_EMBEDDING_HOST || '0.0.0.0';
const port       = Number(process.env.NEO_TEST_EMBEDDING_PORT || 11434);
const dimensions = Number(process.env.NEO_TEST_EMBEDDING_DIMENSIONS || 4096);
const modelName  = process.env.NEO_TEST_EMBEDDING_MODEL || 'text-embedding-qwen3-embedding-8b';

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

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, {status: 'ok', dimensions, model: modelName});
        return;
    }

    if (request.method !== 'POST' || request.url !== '/v1/embeddings') {
        sendJson(response, 404, {error: 'Not found'});
        return;
    }

    try {
        const payload = await readJson(request);
        const inputs  = Array.isArray(payload.input) ? payload.input : [payload.input ?? ''];

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
    } catch (error) {
        sendJson(response, 400, {error: error.message});
    }
});

server.listen(port, host, () => {
    console.log(`[mock-openai-embedding-server] listening on ${host}:${port}`);
});
