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
 * What it does: on every `session.created` event, writes the seat's wake envelope to
 * `~/.local/share/opencode/wake-envelope.json` (mode 0600):
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
 * discipline as the rest of the seat substrate; the envelope file is mode 0600 beside the
 * desktop's own `auth.json`.
 *
 * Port discovery: the plugin runs inside the seat's embedded-server process, so the
 * process's own TCP listener IS the server address — no config, no guessing.
 *
 * NOTE: the envelope is written on `session.created`; a session already open when the
 * plugin is first planted re-writes it at the next session start (or immediately on
 * restart of the seat).
 *
 * @summary OpenCode plugin that writes the wake-daemon seat envelope on session.created.
 * @see ai/daemons/wake/daemon.mjs deliverViaOpencodeServer (the consuming route)
 */
export const NeoWakeEnvelope = async ({ project, client, $, directory }) => {
    const fs   = await import('node:fs/promises');
    const os   = await import('node:os');
    const path = await import('node:path');

    const envelopePath = path.join(os.homedir(), '.local', 'share', 'opencode', 'wake-envelope.json');

    const log = async (level, message) => {
        try {
            await client?.app?.log?.({ body: { service: 'neo-wake-envelope', level, message } });
        } catch (_) { /* logging must never break the envelope writer */ }
    };

    const writeEnvelope = async (sessionId) => {
        const lsof = await $`lsof -nP -iTCP -sTCP:LISTEN -a -p ${process.pid}`.text();
        const port = Number(lsof.match(/:(\d+)\s+\(LISTEN\)/)?.[1]);

        if (!Number.isInteger(port)) {
            throw new Error(`no TCP listener found on pid ${process.pid}`);
        }

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
        await fs.writeFile(envelopePath, JSON.stringify(envelope, null, 2) + '\n', { mode: 0o600 });

        await log('info', `wake envelope written for session ${sessionId} (port ${port})`);
    };

    return {
        event: async ({ event }) => {
            if (event?.type !== 'session.created') {
                return;
            }

            const sessionId = event.properties?.info?.id;

            if (!sessionId) {
                return;
            }

            try {
                await writeEnvelope(sessionId);
            } catch (err) {
                await log('error', `envelope write failed: ${err.message}`);
            }
        }
    };
};

export default NeoWakeEnvelope;
