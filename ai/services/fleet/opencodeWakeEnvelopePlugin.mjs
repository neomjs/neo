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
 * `~/.local/share/opencode/wake-envelope.json`), mode 0600. A desktop restart with a
 * RESTORED session never fires `session.created`, so the first qualifying `session.updated`
 * of a restored top-level session re-binds the envelope through the same write+probe
 * discipline (the restore gap this writer exists to close; identity always comes from an
 * owner event's exact id, never from a listing heuristic). A load-time log line records
 * that the plugin armed at all — after a restart, that line is what distinguishes
 * "plugin never loaded" from "loaded but no qualifying event yet".
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
 * NOTE: the envelope is written on `session.created` and re-bound on the first qualifying
 * `session.updated` of a restored session. A session already open when the plugin is first
 * planted re-writes it at the next session start; after a desktop restart with a restored
 * session, the write lands on that session's first qualifying update event (restores do
 * not fire `session.created`). Within one plugin lifetime the server's port cannot change,
 * so a once-written session id is the whole freshness check the frequent `session.updated`
 * events need.
 *
 * @summary OpenCode plugin that writes the wake-daemon seat envelope on operator-seat session.created and re-binds it on a restored session's first qualifying session.updated, with a load-time armament log.
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
        // DELIBERATELY NOT the shared write-temp-then-rename primitive, and this one is not a
        // semantic objection — it is a LOCATION one. This file is a PLANT: it is copied to
        // `~/.config/opencode/plugins/` on the seat machine and executes OUTSIDE this repo, so a
        // relative import of anything in `ai/` would fail to resolve at load time and take the whole
        // wake-envelope route down. The hand-rolled pair is the price of being self-contained.
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
     * The probe is bounded in time because it runs inside an event hook: a blackholed listener
     * (a firewall drop, a filtered port) makes an unbounded fetch hang forever, which would let
     * the feature fail silently in exactly the state it exists to detect. A loopback answer is
     * milliseconds; anything past the budget is wrong coordinates, not a slow route. The budget
     * defaults to 3000ms and is tunable per seat via `NEO_WAKE_PROBE_TIMEOUT_MS`.
     *
     * @param {Object} options
     * @param {Number} options.port The resolved server port written into the envelope.
     * @param {String} options.sessionId The exact session id from the qualifying session event.
     * @returns {Promise<Object>} Resolves with the server's own session payload; throws (with the cause) otherwise.
     */
    const getSession = async ({port, sessionId}) => {
        const username = process.env.OPENCODE_SERVER_USERNAME;
        const password = process.env.OPENCODE_SERVER_PASSWORD;

        const timeoutMs  = Number(process.env.NEO_WAKE_PROBE_TIMEOUT_MS) || 3000,
              controller = new AbortController(),
              timer      = setTimeout(() => controller.abort(), timeoutMs);

        let response;

        try {
            response = await fetch(`http://127.0.0.1:${port}/session/${sessionId}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
                },
                signal: controller.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') {
                throw new Error(`probe timed out after ${timeoutMs}ms — a loopback route that hangs is wrong coordinates or a blackholed listener, not a slow one`);
            }

            throw err;
        } finally {
            clearTimeout(timer);
        }

        if (response.status !== 200) {
            throw new Error(`probe GET /session/${sessionId} -> ${response.status}`);
        }

        const session = await response.json();

        if (session?.id !== sessionId) {
            throw new Error(`probe id mismatch: asked ${sessionId}, got ${session?.id}`);
        }

        return session;
    };

    const probeEnvelopeRoute = async (options) => {
        await getSession(options);
    };

    // The (sessionId, port) pair this plugin instance already wrote this boot. Within one
    // plugin lifetime the server's port cannot change, so a sessionId hit alone is proof the
    // envelope is current — this keeps the high-frequency `session.updated` path fetch-free
    // and lsof-free in the common case. Note there is deliberately NO on-disk adoption
    // shortcut: two matching cached fields are not route authority (stale credentials,
    // project, directory, or file mode could ride along), so a first-seen session always
    // pays the full validate-write-probe sequence exactly once.
    let lastTarget = null;

    // Sessions already identified as child/subagent sessions. A busy subagent fires
    // `session.updated` constantly; without this set each one would cost an authoritative
    // parentage fetch.
    const ignoredSessions = new Set();

    // Decisive load-time instrument: after a desktop restart, this line in the seat log is
    // what distinguishes "plugin never loaded" from "loaded but no qualifying event yet" —
    // observability before trust (a quiet channel fails silently; instrument first).
    await log('info', `neo-wake-envelope plugin loaded (pid ${process.pid}, directory ${directory ?? 'unknown'}) — restore coverage armed`);

    return {
        event: async ({ event }) => {
            const type = event?.type;

            if (type !== 'session.created' && type !== 'session.updated') {
                return;
            }

            const info      = event.properties?.info ?? event.properties ?? {};
            const sessionId = info.id ?? info.sessionID ?? null;

            // Written or adopted this boot — within one plugin lifetime the port cannot
            // change, so this is the whole freshness check frequent `session.updated`
            // events need. Known child sessions are filtered without a fetch.
            if (!sessionId || lastTarget?.sessionId === sessionId || ignoredSessions.has(sessionId)) {
                return;
            }

            if (type === 'session.created') {
                // Child/subagent sessions never retarget the operator seat's wake route.
                const parentId = info.parentID ?? info.parent_id ?? null;

                if (parentId) {
                    ignoredSessions.add(sessionId);
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

                    lastTarget = {sessionId, port};
                } catch (err) {
                    await log('error', `envelope write failed: ${err.message}`);
                }

                return;
            }

            // `session.updated` — the restore path. A restored session never fires
            // `session.created`, so its first qualifying update is the owner event that
            // re-binds the envelope after a desktop restart. Identity comes from the
            // event's exact id, never from a listing heuristic — a listing cannot
            // distinguish which of two live top-level sessions is the operator's.
            try {
                const port = await resolvePort();

                // The updated event does not reliably carry parentage; the server's own
                // session resource is the authoritative source for the child filter.
                // On-disk envelope state is never consulted: matching cached coordinates
                // are not authority over credentials, project, directory, or file mode.
                const session = await getSession({port, sessionId});

                if (session?.parentID ?? session?.parent_id) {
                    ignoredSessions.add(sessionId);
                    await log('debug', `session.updated for child session ${sessionId} ignored — child sessions never retarget`);
                    return;
                }

                await writeEnvelope(sessionId, port);

                try {
                    await probeEnvelopeRoute({port, sessionId});
                    await log('info', `wake envelope written-probed for restored session ${sessionId} (port ${port})`);
                } catch (probeErr) {
                    // Same degraded-loud discipline as the created path.
                    await log('error', `written-probe-failed for restored session ${sessionId} (port ${port}): ${probeErr.message}`);
                }

                lastTarget = {sessionId, port};
            } catch (err) {
                await log('error', `restore-target failed for session ${sessionId}: ${err.message}`);
            }
        }
    };
};

export default NeoWakeEnvelope;
