/**
 * @module ai/services/knowledge-base/helpers/kbEmbeddingResumeStore
 * @summary Durable resume-state for the KB shadow-swap resume. A failed shadow-swap preserves its
 * partially-built shadow collection; this tiny JSON store remembers WHICH shadow holds that progress, the
 * corpus fingerprint it was built for (so a drifted corpus is never resumed into), and how many resume
 * attempts have been made (so a persistent failure eventually falls back to a clean rebuild). Mirrors the
 * `acceptedLossAuditStore` shape: a single small JSON file under the gitignored `.neo-ai-data` tree, written
 * on a preserve-on-failure and cleared on a successful promote. Chroma collection metadata is deliberately
 * NOT used (its `modify`-metadata path is unverified in this codebase).
 */

import fs   from 'fs/promises';
import path from 'path';

const RESUME_STATE_FILENAME = 'kb-embedding-resume-state.json';

/**
 * @summary The absolute path to the KB embedding resume-state file inside `dir`.
 * @param {String} dir State directory (e.g. `.neo-ai-data/kb-sync`).
 * @returns {String}
 */
export function getResumeStateFilePath(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getResumeStateFilePath: dir is required');
    }
    return path.join(dir, RESUME_STATE_FILENAME);
}

/**
 * @summary Reads the preserved resume-state, or null if none / unreadable (fail-safe → a clean rebuild).
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @returns {Promise<{fingerprint: String, shadowName: String, attempts: Number}|null>}
 */
export async function readResumeState({dir} = {}) {
    const filePath = getResumeStateFilePath(dir);

    let raw;
    try {
        raw = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        return null; // a corrupt/unreadable marker must degrade to a clean rebuild, never crash the sync
    }

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.fingerprint !== 'string' || typeof parsed.shadowName !== 'string') {
            return null;
        }
        return {
            fingerprint: parsed.fingerprint,
            shadowName : parsed.shadowName,
            attempts   : Number.isInteger(parsed.attempts) && parsed.attempts > 0 ? parsed.attempts : 1
        };
    } catch (error) {
        return null;
    }
}

/**
 * @summary Persists the resume-state (preserve-on-failure). Creates the dir if needed.
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @param {String} options.fingerprint Corpus fingerprint the preserved shadow was built for.
 * @param {String} options.shadowName The preserved resume-shadow collection name.
 * @param {Number} [options.attempts=1] Resume attempts so far.
 * @returns {Promise<String>} The written file path.
 */
export async function writeResumeState({dir, fingerprint, shadowName, attempts = 1} = {}) {
    if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
        throw new TypeError('writeResumeState: fingerprint is required');
    }
    if (typeof shadowName !== 'string' || shadowName.length === 0) {
        throw new TypeError('writeResumeState: shadowName is required');
    }

    const filePath = getResumeStateFilePath(dir);
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(filePath, `${JSON.stringify({schemaVersion: 1, fingerprint, shadowName, attempts}, null, 2)}\n`, 'utf8');
    return filePath;
}

/**
 * @summary Clears the resume-state (on a successful promote, or when discarding a stale/drifted shadow).
 * @param {Object} options
 * @param {String} options.dir State directory.
 * @returns {Promise<Boolean>} True if a marker was removed.
 */
export async function clearResumeState({dir} = {}) {
    const filePath = getResumeStateFilePath(dir);
    try {
        await fs.rm(filePath, {force: true});
        return true;
    } catch (error) {
        return false;
    }
}
