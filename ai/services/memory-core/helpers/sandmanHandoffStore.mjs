import fs from 'fs-extra';

const DEFAULT_STALE_AFTER_MS = 36 * 60 * 60 * 1000; // nightly cadence + slack
const DEFAULT_MAX_BYTES      = 256 * 1024;

/**
 * @summary Reads the Sandman handoff (`sandman_handoff.md`) with freshness metadata.
 *
 * The handoff is the Dream Pipeline's morning surface (typed gaps + Golden Path
 * recommendations), written nightly by the DreamService at the resolved `handoffFilePath`
 * config leaf. Local agents read it as a repo file; remote/container agents have no
 * filesystem access to it — this reader is the file-contract half of the
 * `get_sandman_handoff` MCP tool that serves them.
 *
 * Missing or unreadable files are an explicit payload, never a throw and never a silent
 * empty string: a cloud deployment whose writer persistence is not wired yet must get a
 * machine-readable reason its agents can react to.
 *
 * @param {Object} options
 * @param {String} options.filePath Resolved handoff path (`AiConfig.handoffFilePath`).
 * @param {Number} [options.now=Date.now()] Current time in epoch ms.
 * @param {Number} [options.staleAfterMs=129600000] Freshness window; <=0 disables stale classification.
 * @param {Number} [options.maxBytes=262144] Hard read-size cap.
 * @returns {Promise<Object>} `{content, path, mtimeMs, ageMs, staleAfterMs, stale, reason}`
 *          or a `content: null` envelope carrying a stable `reason` code.
 */
export async function readSandmanHandoff({
    filePath,
    now         = Date.now(),
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    maxBytes     = DEFAULT_MAX_BYTES
} = {}) {
    if (!filePath) {
        return unavailable({reason: 'handoff-path-unconfigured', staleAfterMs});
    }

    try {
        const stat = await fs.stat(filePath);

        if (stat.size > maxBytes) {
            return unavailable({filePath, reason: 'handoff-too-large', details: {size: stat.size, maxBytes}, staleAfterMs});
        }

        const content = await fs.readFile(filePath, 'utf8'),
              mtimeMs = stat.mtimeMs,
              ageMs   = Math.max(0, now - mtimeMs),
              stale   = staleAfterMs > 0 && ageMs > staleAfterMs;

        return {
            content,
            path  : filePath,
            mtimeMs,
            ageMs,
            staleAfterMs,
            stale,
            reason: null
        };
    } catch (error) {
        if (error.code === 'ENOENT') {
            return unavailable({filePath, reason: 'handoff-not-found', staleAfterMs});
        }

        return unavailable({filePath, reason: 'handoff-read-failed', details: {message: error.message}, staleAfterMs});
    }
}

function unavailable({filePath = null, reason, details = null, staleAfterMs}) {
    return {
        content: null,
        path   : filePath,
        mtimeMs: null,
        ageMs  : null,
        staleAfterMs,
        stale  : true,
        reason,
        details
    };
}
