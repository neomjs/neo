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
 * - Writes are same-directory atomic (tmp file + rename) with an explicit `chmod 0600`
 *   AFTER the rename — `{mode}` on `writeFile` only applies at creation and leaves a
 *   pre-existing 0644 file permissive; the rename also closes torn reads.
 * - Only OPERATOR-seat sessions refresh the envelope: `session.created` events whose
 *   session carries a parent id (child/subagent sessions) are ignored, so a spawned
 *   subagent can never retarget the seat's wake route to its own session.
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

    const writeEnvelope = async (sessionId) => {
        const port = await resolvePort();

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

        // Atomic write: tmp file + same-directory rename (no torn reads), then an explicit
        // chmod AFTER the rename — writeFile's mode option does not tighten a pre-existing file.
        const tmpPath = `${envelopePath}.${process.pid}.tmp`;
        await fs.writeFile(tmpPath, JSON.stringify(envelope, null, 2) + '\n');
        await fs.rename(tmpPath, envelopePath);
        await fs.chmod(envelopePath, 0o600);

        await log('info', `wake envelope written for session ${sessionId} (port ${port})`);
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
                await writeEnvelope(sessionId);
            } catch (err) {
                await log('error', `envelope write failed: ${err.message}`);
            }
        }
    };
};

export default NeoWakeEnvelope;
