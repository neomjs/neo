/**
 * OpenCode seat-side wake-envelope writer (the seat half of the `opencode-server` wake-daemon
 * delivery route — the consuming route + its envelope contract live in the daemon's route JSDoc).
 *
 * PLANT ME: copy this file into the seat's GLOBAL OpenCode plugins directory as
 * `~/.config/opencode/plugins/neo-wake-envelope.mjs`. OpenCode auto-loads plugin files from
 * that directory at startup (per https://opencode.ai/docs/plugins/). Project-level
 * (`.opencode/plugins/`) works too, but the seat checkout is itself a git repo — the global
 * dir keeps the plant out of the tracked tree.
 *
 * What it does: on every operator-seat `session.created` event, atomically writes the seat's
 * wake envelope to `$XDG_DATA_HOME/opencode/wake-envelope.json` (fallback
 * `~/.local/share/opencode/wake-envelope.json`), mode 0600:
 *
 * ```json
 * {
 *   "hostname" : "127.0.0.1",
 *   "port"     : 55673,
 *   "sessionId": "ses_…",
 *   "projectId": "…",
 *   "directory": "…",
 *   "username" : "…",
 *   "password" : "…",
 *   "updatedAt": "…"
 * }
 * ```
 *
 * The wake daemon's `deliverViaOpencodeServer` (`ai/daemons/wake/daemon.mjs`) re-reads this
 * envelope on every delivery, so the embedded server's random per-boot port and the live
 * session id never need a graph write. Credentials come from the seat's own spawn env
 * (`OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD`) — the same env-only secret
 * discipline as the rest of the seat substrate; the envelope file is chmod 0600 beside the
 * desktop's own `auth.json`.
 *
 * Seat-isolation + correctness disciplines (learned from review falsifiers):
 * - The embedded server's address comes from the plugin input's authoritative `serverUrl`
 *   (when present); the `lsof`-on-own-pid scan is only a fallback — with multiple listeners
 *   on the process, the first `lsof` row is not guaranteed to be the API server.
 * - The envelope root honors `XDG_DATA_HOME`, so per-seat XDG isolation (Fleet launch
 *   specs) keeps each seat's envelope on its own path instead of collapsing onto the
 *   shared default.
 * - Writes are same-directory atomic (tmp file + rename). The credential-bearing tmp is
 *   created with mode 0600 and explicitly tightened before rename; a final `chmod 0600`
 *   also repairs a pre-existing permissive destination. The rename closes torn reads.
 * - Only OPERATOR-seat sessions refresh the envelope: `session.created` events whose
 *   session carries a parent id (child/subagent sessions) are ignored, so a spawned
 *   subagent can never retarget the seat's wake route to its own session.
 * - Every write is followed by a mandatory probe of the envelope's OWN coordinates
 *   (resolved port + env credentials + the event-supplied exact session id): the outcome
 *   is `written-probed` only when the route verifies end-to-end, otherwise a loud
 *   `written-probe-failed`. The envelope stays written either way, but an unverified
 *   envelope is a degraded result, never a silent success.
 *
 * NOTE: the envelope is written on `session.created`; a session already open when the
 * plugin is first planted re-writes it at the next session start (or immediately on
 * restart of the seat).
 *
 * @summary OpenCode plugin that writes the wake-daemon seat envelope on operator-seat session.created.
 * @see ai/daemons/wake/daemon.mjs deliverViaOpencodeServer (the consuming route)
 */
export const NeoWakeEnvelope = async (ctx) => {
    const { project, client, $, directory } = ctx;

    const fs   = await import('node:fs/promises');
    const os   = await import('node:os');
    const path = await import('node:path');

    const dataRoot     = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
    const envelopePath = path.join(dataRoot, 'opencode', 'wake-envelope.json');

    const log = async (level, message) => {
        try {
            await client?.app?.log?.({ body: { service: 'neo-wake-envelope', level, message } });
        } catch (_) { /* logging must never break the envelope writer */ }
    };

    const resolvePort = async () => {
        // Authoritative first: the plugin input's serverUrl (the exact URL the seat's
        // client/server pair is bound to). Shape-tolerant: ctx.serverUrl or client.serverUrl.
        const serverUrl = ctx.serverUrl ?? client?.serverUrl;

        if (serverUrl) {
            const port = Number(new URL(serverUrl).port);
            if (Number.isInteger(port) && port > 0) return port;
        }

        // Fallback: the plugin runs inside the seat's embedded-server process, so the
        // process's own TCP listener is the server address. With multiple listeners the
        // first row may not be the API server — hence serverUrl preferred.
        const lsof = await $`lsof -nP -iTCP -sTCP:LISTEN -a -p ${process.pid}`.text();
        const port = Number(lsof.match(/:(\d+)\s+\(LISTEN\)/)?.[1]);

        if (!Number.isInteger(port)) {
            throw new Error(`no serverUrl and no TCP listener found on pid ${process.pid}`);
        }

        return port;
    };

    const writeEnvelope = async (sessionId, port) => {
        const envelope = {
            hostname : '127.0.0.1',
            port,
            sessionId,
            projectId: project?.id ?? null,
            directory: directory ?? null,
            username : process.env.OPENCODE_SERVER_USERNAME,
            password : process.env.OPENCODE_SERVER_PASSWORD,
            updatedAt: new Date().toISOString()
        };

        await fs.mkdir(path.dirname(envelopePath), { recursive: true });

        // Atomic private write: the secret-bearing tmp is born 0600, explicitly tightened in
        // case a stale tmp already exists, then renamed without ever exposing a permissive window.
        // The final chmod remains defense-in-depth for a pre-existing permissive destination.
        const tmpPath = `${envelopePath}.${process.pid}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(envelope, null, 2) + '\n', {mode: 0o600});
        await fs.chmod(tmpPath, 0o600);
        await fs.rename(tmpPath, envelopePath);
        await fs.chmod(envelopePath, 0o600);

        await log('info', `wake envelope written for session ${sessionId} (port ${port})`);
    };

    /**
     * Verifies the just-written envelope end-to-end against its OWN coordinates: a GET on the
     * exact session resource at the resolved port, authenticated with the same env credentials
     * the envelope carries. This exercises precisely what the wake daemon will later consume —
     * address, credentials, and the owner-supplied session identity — including the lsof-fallback
     * port risk that the plugin's own bound `client` could never catch (it is bound correctly by
     * construction, so probing through it would test the client, not the envelope).
     *
     * Deliberately a GET, not the salvaged prompt self-injection: a prompt is steer-class, and on
     * `session.created` it would start a user-visible probe turn (and burn tokens) on every fresh
     * session. Server-wide Basic auth makes a 200 on the exact session resource sufficient proof
     * that the credentials and address are valid for the delivery route too. The id check guards
     * the split-brain case: a server answering 200 with a payload whose id is not the asked id is
     * not the owner of this session.
     *
     * @param {Object} options
     * @param {Number} options.port The resolved server port written into the envelope.
     * @param {String} options.sessionId The exact session id from the `session.created` event.
     * @returns {Promise<void>} Resolves when the route verifies; throws (with the cause) otherwise.
     */
    const probeEnvelopeRoute = async ({port, sessionId}) => {
        const username = process.env.OPENCODE_SERVER_USERNAME;
        const password = process.env.OPENCODE_SERVER_PASSWORD;

        const response = await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            }
        });

        if (response.status !== 200) {
            throw new Error(`probe GET /session/${sessionId} -> ${response.status}`);
        }

        const session = await response.json();

        if (session?.id !== sessionId) {
            throw new Error(`probe id mismatch: asked ${sessionId}, got ${session?.id}`);
        }
    };

    return {
        event: async ({ event }) => {
            if (event?.type !== 'session.created') {
                return;
            }

            const info      = event.properties?.info ?? {};
            const sessionId = info.id;
            const parentId  = info.parentID ?? info.parent_id ?? null;

            // Child/subagent sessions never retarget the operator seat's wake route.
            if (!sessionId || parentId) {
                return;
            }

            try {
                const port = await resolvePort();

                await writeEnvelope(sessionId, port);

                try {
                    await probeEnvelopeRoute({port, sessionId});
                    await log('info', `wake envelope written-probed for session ${sessionId} (port ${port})`);
                } catch (probeErr) {
                    // Degraded, loud, never fatal: the envelope stays written — an unverified
                    // envelope is still better than none, but it must not report success.
                    await log('error', `written-probe-failed for session ${sessionId} (port ${port}): ${probeErr.message}`);
                }
            } catch (err) {
                await log('error', `envelope write failed: ${err.message}`);
            }
        }
    };
};

export default NeoWakeEnvelope;
