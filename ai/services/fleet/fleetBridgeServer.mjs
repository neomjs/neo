import http                   from 'http';
import {dispatchFleetRequest} from './dispatchFleetRequest.mjs';

/**
 * @summary Start the Node end of the Option-B (dev-server) app↔fleet transport: a minimal HTTP server
 * that exposes the fleet control surface to the browser agentos app. Every `POST /fleet` body
 * `{method, params}` is routed through {@link dispatchFleetRequest} (the wire allowlist) and the
 * `{ok, result|error}` envelope is returned as JSON. CORS is opened so the App Worker's cross-origin
 * `fetch` (served from the dev-server origin) can reach it.
 *
 * Deliberately transport-swappable: the browser side (`createFleetRegistryBridge`) only needs a
 * `send({method, params}) => Promise<envelope>`, so this HTTP channel can later be replaced by a
 * WebSocket (for cockpit status-push) or the Electron shell's in-process inject (Option A) without
 * touching the pane. Dev-server only — never a production surface (the PAT boundary is enforced Node-
 * side by the registry + the wire allowlist, but this server has no auth of its own yet, so it binds
 * loopback by default).
 *
 * @param {Object}   [opts]
 * @param {Number}   [opts.port=8083]           `0` selects an ephemeral port (tests).
 * @param {String}   [opts.host='127.0.0.1']    Loopback by default — never bind a public interface.
 * @param {Function} [opts.dispatch=dispatchFleetRequest] Injectable request router (a stub in tests).
 * @param {Number}   [opts.maxBodyBytes=1048576] Request-body cap; oversized bodies are dropped.
 * @returns {Promise<http.Server>} resolves once the server is listening.
 */
export function startFleetBridgeServer({port = 8083, host = '127.0.0.1', dispatch = dispatchFleetRequest, maxBodyBytes = 1024 * 1024} = {}) {
    const server = http.createServer((req, res) => {
        // dev-only CORS: the App Worker fetches this cross-origin from the dev-server origin
        res.setHeader('Access-Control-Allow-Origin',  '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            return res.end()
        }

        // Exact-path match — a sibling path like /fleetx must fail closed, never reach dispatch. Parse
        // the pathname so a query string (/fleet?x=1) still routes, but /fleetx does not.
        const {pathname} = new URL(req.url, 'http://127.0.0.1');

        if (req.method !== 'POST' || pathname !== '/fleet') {
            res.writeHead(404, {'Content-Type': 'application/json'});
            return res.end(JSON.stringify({ok: false, error: 'fleet: POST /fleet only'}))
        }

        let body = '';

        req.on('data', chunk => {
            body += chunk;
            if (body.length > maxBodyBytes) req.destroy()
        });

        req.on('end', async () => {
            let request;

            try {
                request = JSON.parse(body || '{}')
            } catch {
                res.writeHead(400, {'Content-Type': 'application/json'});
                return res.end(JSON.stringify({ok: false, error: 'fleet: invalid JSON body'}))
            }

            // dispatch never throws (it returns a fail-closed envelope), but guard the transport anyway
            let envelope;
            try {
                envelope = await dispatch(request)
            } catch (error) {
                envelope = {ok: false, error: error?.message || String(error)}
            }

            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(envelope))
        })
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => resolve(server))
    })
}
