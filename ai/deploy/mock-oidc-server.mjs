import http from 'node:http';

const host           = process.env.NEO_TEST_OIDC_HOST || '0.0.0.0';
const port           = Number(process.env.NEO_TEST_OIDC_PORT || 4000);
const validAudiences = [
    'http://127.0.0.1:13002',
    'http://127.0.0.1:13003',
    'http://127.0.0.1:13090'
];

/**
 * @summary Reads a form-urlencoded request body.
 * Reads a form-urlencoded request body.
 * @param {http.IncomingMessage} request The incoming HTTP request.
 * @returns {Promise<URLSearchParams>} The parsed payload.
 */
function readFormUrlEncoded(request) {
    return new Promise((resolve, reject) => {
        let body = '';

        request.on('data', chunk => body += chunk);
        request.on('error', reject);
        request.on('end', () => {
            try {
                resolve(new URLSearchParams(body));
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

const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, {status: 'ok'});
        return;
    }

    if (request.method === 'GET' && request.url === '/.well-known/openid-configuration') {
        const reqHost = request.headers.host || `127.0.0.1:${port}`;
        sendJson(response, 200, {
            issuer                : `http://${reqHost}`,
            introspection_endpoint: `http://${reqHost}/introspect`
        });
        return;
    }

    if (request.url === '/oauth2/auth') {
        const
            authenticatedUser = request.headers['x-test-authenticated-user'],
            authMode          = request.headers['x-test-auth-mode'];

        // Integration-only control: a successful auth decision with no user claim lets the
        // reference-ingress test prove that caller-supplied identity headers were stripped.
        if (authMode === 'allow-without-identity') {
            response.writeHead(200);
            response.end();
            return
        }

        if (typeof authenticatedUser === 'string' && /^[A-Za-z0-9._-]+$/.test(authenticatedUser)) {
            response.writeHead(200, {
                'x-auth-request-preferred-username': authenticatedUser
            });
            response.end();
            return
        }

        sendJson(response, 401, {error: 'Authentication required'});
        return
    }

    if (request.method === 'POST' && request.url === '/introspect') {
        try {
            const params = await readFormUrlEncoded(request);
            const token  = params.get('token');

            if (token === 'valid-test-token') {
                sendJson(response, 200, {
                    active            : true,
                    aud               : validAudiences,
                    exp               : Math.floor(Date.now() / 1000) + 3600,
                    preferred_username: 'neo-test-oidc-user',
                    client_id         : params.get('client_id')
                });
                return;
            }

            if (token === 'valid-test-token-bob') {
                sendJson(response, 200, {
                    active            : true,
                    aud               : validAudiences,
                    exp               : Math.floor(Date.now() / 1000) + 3600,
                    preferred_username: 'neo-test-oidc-bob',
                    client_id         : params.get('client_id')
                });
                return;
            }

            if (token === 'valid-test-token-no-username') {
                sendJson(response, 200, {
                    active   : true,
                    aud      : validAudiences,
                    exp      : Math.floor(Date.now() / 1000) + 3600,
                    sub      : 'neo-test-oidc-sub',
                    client_id: params.get('client_id')
                });
                return;
            }

            if (token === 'wrong-audience-token') {
                sendJson(response, 200, {
                    active            : true,
                    aud               : ['http://evil-server:13002'],
                    exp               : Math.floor(Date.now() / 1000) + 3600,
                    preferred_username: 'neo-test-oidc-user',
                    client_id         : params.get('client_id')
                });
                return;
            }

            // Fallback: invalid token
            sendJson(response, 200, {
                active: false
            });
        } catch (error) {
            sendJson(response, 400, {error: error.message});
        }
        return;
    }

    sendJson(response, 404, {error: 'Not found'});
});

server.listen(port, host, () => {
    console.log(`[mock-oidc-server] listening on ${host}:${port}`);
});
