/**
 * @module ai/daemons/wake/localWakeAdapters
 * @summary Graphless local adapter boundary for the signed host wake receiver.
 *
 * Every route resolves from host-local metadata or a live local process/session envelope. There
 * is no GraphService, SQLite, graph query, Memory Core config, or database path in this dependency
 * closure. Unknown/missing/stale local authority fails closed and leaves the mailbox authoritative.
 * Container Memory Core remains the owner of graph-resident presence and wake-policy decisions.
 */
import fs                 from 'fs-extra';
import os                 from 'node:os';
import path               from 'node:path';
import {spawn, spawnSync} from 'node:child_process';

import {applyHarnessMetadataDefaults} from './hostHarnessMetadata.mjs';
import {
    getDefaultInstanceTarget,
    resolveGuiInstancePid
} from './instanceResolver.mjs';
import {withOutboxLock}      from './outboxLock.mjs';
import {WAKE_LANE_DIRECTIVE} from './wakeLaneDirective.mjs';

const LOOPBACK_HOSTS     = new Set(['127.0.0.1', 'localhost', '::1']);
const ABORTABLE_ADAPTERS = new Set([
    'opencode-server',
    'kimi-server',
    'webhook',
    'test-hang-abortable'
]);
const OPENCODE_REBIND_SETTLE_MS = 50;
let   deliveryPromise           = Promise.resolve();

/**
 * @summary Formats the structured Shape-B digest into the resident wake prompt.
 * @param {Object} envelope Signed wake/digest envelope.
 * @returns {String}
 */
export function formatLocalWakeDigest(envelope = {}) {
    const payload       = envelope.payload || {};
    const breakdown     = payload.breakdown || {};
    const total         = Number(payload.totalEvents) || 0;
    const identity      = envelope.agentIdentity || 'unknown';
    const latestMessage = breakdown.sent_to_me?.latest || {};
    const priority      = normalizeWakePriority(
        breakdown.sent_to_me?.highestPriority || latestMessage.priority
    );
    const lines = [`[WAKE][priority:${priority}] ${total} events for ${identity}:`];

    if (breakdown.sent_to_me?.count > 0) {
        const latestPriority = normalizeWakePriority(latestMessage.priority);
        const prioritySuffix = latestPriority === priority ? '' : `, latest priority: ${latestPriority}`;
        const latest         = latestMessage.subject
            ? `"${latestMessage.subject}"${latestMessage.from ? ` from ${latestMessage.from}` : ''}${prioritySuffix}`
            : latestMessage.messageId || 'mailbox event';
        // COUNTS QUEUED EVENTS, and says so. Nothing on this path consults read-state - grep this
        // file and `wakeDigestBuilder.mjs` for readAt/unread and both return zero. A message
        // delivered, read and acted on hours ago still contributes its queued event here, so
        // "new messages" named a number this code cannot produce. Renaming is the honest half of
        // the repair; reconciling against the unread set is the other half and is not this change.
        lines.push(`- ${breakdown.sent_to_me.count} message events (latest: ${latest})`);
    }
    if (breakdown.task_state_changed?.count > 0) {
        const latest = breakdown.task_state_changed.latest || {};
        lines.push(`- ${breakdown.task_state_changed.count} task state changes` +
            `${latest.taskId ? ` (latest: ${latest.taskId} → ${latest.newState || 'changed'})` : ''}`);
    }
    if (breakdown.permission_granted?.count > 0) {
        lines.push(`- ${breakdown.permission_granted.count} permission grants`);
    }
    if (breakdown.heartbeat_pulse?.count > 0) {
        const latest  = breakdown.heartbeat_pulse.latest || {};
        const summary = decodeHeartbeatPulseSummary(latest.pulseId);
        let   extra   = '';

        if (summary?.source === 'github-notification') {
            extra = `; latest GitHub ${summary.latest?.reason || 'notification'}: ` +
                `"${summary.latest?.title || summary.latest?.id || 'untitled'}"` +
                `${formatPullRequestStateEcho(summary)}` +
                `${summary.latest?.url ? ` (${summary.latest.url})` : ''}`;
        } else if (summary?.source === 'idle-out-nudge') {
            extra = `; idle-out nudge — ${summary.reason || 'idle'}; ` +
                `next: ${summary.nextAction || 'claim a lane'}`;
        }

        lines.push(`- ${breakdown.heartbeat_pulse.count} heartbeat pulses${extra}`);
    }

    const isPureHeartbeat = breakdown.heartbeat_pulse?.count > 0 &&
        !breakdown.sent_to_me?.count &&
        !breakdown.task_state_changed?.count &&
        !breakdown.permission_granted?.count;

    if (isPureHeartbeat) {
        lines.push('', WAKE_LANE_DIRECTIVE);
    }

    return lines.join('\n');
}

/**
 * @summary Normalizes a digest priority to the A2A mailbox vocabulary.
 * @param {String} priority
 * @returns {'low'|'normal'|'high'}
 * @private
 */
function normalizeWakePriority(priority) {
    return ['low', 'normal', 'high'].includes(priority) ? priority : 'normal';
}

/**
 * @summary Decodes a bounded structured heartbeat summary embedded in a pulse id.
 * @param {String} pulseId
 * @returns {Object|null}
 * @private
 */
function decodeHeartbeatPulseSummary(pulseId = '') {
    const separator = pulseId.indexOf('.');
    if (separator <= 0) return null;

    const source = pulseId.slice(0, separator);
    if (!['github-notification', 'idle-out-nudge'].includes(source)) return null;

    try {
        const parsed = JSON.parse(Buffer.from(pulseId.slice(separator + 1), 'base64url').toString('utf8'));
        return parsed?.source === source ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * @summary Formats the optional live pull-request state echo in a heartbeat summary.
 * @param {Object} summary
 * @returns {String}
 * @private
 */
function formatPullRequestStateEcho(summary = {}) {
    const pullRequest = summary.latest?.pullRequest;
    if (!pullRequest?.state || !pullRequest?.number) return '';

    const mergedAt  = pullRequest.mergedAt  ? `, mergedAt ${pullRequest.mergedAt}`   : '';
    const checkedAt = pullRequest.checkedAt ? `, checkedAt ${pullRequest.checkedAt}` : '';
    return ` [PR #${pullRequest.number}: ${pullRequest.state}${mergedAt}${checkedAt}]`;
}

/**
 * @summary Dispatches one accepted receiver record through its selected local adapter.
 *
 * Calls are globally serialized to preserve GUI focus safety. The attempt-bound caller may return
 * `unknown` for a non-abortable adapter while the underlying serialized promise settles; later
 * dispatches still remain queued behind that real completion.
 *
 * @param {Object} record Durable receiver record.
 * @param {Object} [dependencies] Injectable host effects for tests.
 * @returns {Promise<'delivered'|'skipped'|'failed'|'unknown'|{outcome:'failed',outcomeReason:String}>}
 *   A bare outcome string, or `{outcome, outcomeReason}` when a cause was captured. The receiver
 *   accepts either, so the reason channel is additive and no caller needs updating to keep working.
 */
export async function dispatchLocalWake(record, dependencies = {}) {
    const meta           = record?.route?.harnessTargetMetadata || {};
    const adapterConfig  = record?.route?.adapterConfig || {};
    const defaultAdapter = process.platform === 'darwin' ? 'osascript' : 'tmux';
    const adapter        = meta.adapter || defaultAdapter;
    const timeoutMs      = adapterConfig.attemptTimeoutMs;
    const controller     = new AbortController();
    const digest         = formatLocalWakeDigest(record?.envelope);
    const abortable      = meta.addressType === 'webhookUrl' || ABORTABLE_ADAPTERS.has(adapter);

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('local wake adapter requires positive adapterConfig.attemptTimeoutMs');
    }

    const attempt = deliveryPromise.then(() => performDispatch({
        adapter,
        adapterConfig,
        digest,
        meta,
        record,
        signal: controller.signal,
        dependencies
    }));
    deliveryPromise = attempt.catch(() => {});

    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => {
            controller.abort();
            resolve(abortable ? 'failed' : 'unknown');
        }, timeoutMs);
    });

    try {
        return await Promise.race([attempt, timeout]);
    } catch (error) {
        // The SHARED boundary — every adapter's errors arrive here, not only osascript's. Discarding
        // the cause at this catch loses it for opencode-server, tmux, codex-app-server and the webhook
        // path alike, which is the same defect the osascript branch fixes one level down.
        return {outcome: 'failed', outcomeReason: String(error?.message || error?.code || 'adapter-error')}
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @summary Performs one adapter attempt after the global delivery owner is acquired.
 * @private
 */
async function performDispatch({adapter, adapterConfig, digest, meta, record, signal, dependencies}) {
    const effects = {
        fetch           : globalThis.fetch,
        fs,
        getDefaultTarget: getDefaultInstanceTarget,
        homedir         : os.homedir,
        log             : console,
        platform        : process.platform,
        resolveGuiInstancePid,
        spawnAsync,
        ...dependencies
    };

    if (adapter === 'test') {
        effects.log.log?.(`[Wake Receiver Test Adapter] ${record.subscriptionId}: ${digest}`);
        return 'delivered';
    }
    if (adapter === 'test-fail') return 'failed';
    if (adapter === 'test-hang') {
        await new Promise(resolve => setTimeout(resolve, timeoutForTest(adapterConfig)));
        return 'delivered';
    }
    if (adapter === 'test-hang-abortable') {
        if (signal.aborted) throw new Error('test-hang-abortable adapter: aborted before dispatch');
        await new Promise((resolve, reject) => {
            signal.addEventListener(
                'abort',
                () => reject(new Error('test-hang-abortable adapter: aborted by attempt bound')),
                {once: true}
            );
        });
        return 'delivered';
    }
    if (meta.addressType === 'webhookUrl' && meta.instanceAddress) {
        await deliverWebhook({digest, effects, meta, signal});
        return 'delivered';
    }
    if (adapter === 'codex-app-server') {
        if (meta.appName !== 'Codex' || typeof adapterConfig.codexBinary !== 'string') return 'skipped';
        await effects.spawnAsync(adapterConfig.codexBinary, ['debug', 'app-server', 'send-message-v2', digest]);
        return 'delivered';
    }
    if (adapter === 'opencode-server') {
        await deliverOpenCode({digest, effects, meta, record, signal});
        return 'delivered';
    }
    if (adapter === 'kimi-server') {
        await deliverKimiServer({digest, effects, meta, signal});
        return 'delivered';
    }
    if (adapter === 'kimi-pull-bridge') {
        await deliverKimiPullBridge({digest, effects, meta, record});
        return 'delivered';
    }
    if (adapter === 'tmux') {
        const session = meta.addressType === 'tmuxSession'
            ? meta.instanceAddress
            : meta.tmuxSession;
        if (typeof session !== 'string' || session.length === 0) return 'skipped';
        await effects.spawnAsync('tmux', ['send-keys', '-t', session, digest, 'C-m']);
        return 'delivered';
    }
    if (adapter === 'webhook') {
        await deliverWebhook({digest, effects, meta, signal});
        return 'delivered';
    }
    if (adapter === 'osascript') {
        return deliverOsascript({digest, effects, meta, record});
    }

    return 'skipped';
}

/**
 * @summary Delivers into one live OpenCode session using its 0600 loopback envelope.
 * @private
 */
async function deliverOpenCode({digest, effects, meta, record, signal}) {
    const envelopePath = meta.envelopePath
        || path.join(effects.homedir(), '.local', 'share', 'opencode', 'wake-envelope.json');
    const first = await readOpenCodeEnvelope(effects, envelopePath);

    // Before the first POST, never after: the point is that no request is issued against a session
    // this wake does not own.
    assertOpenCodeEnvelopeOwner(first, record);

    try {
        await postOpenCodeDigest(effects, first, digest, signal);
    } catch (error) {
        if (!isConnectionRefused(error) || signal.aborted) throw error;

        await new Promise(resolve => setTimeout(resolve, OPENCODE_REBIND_SETTLE_MS));

        const rebound = await readOpenCodeEnvelope(effects, envelopePath);

        // Re-checked rather than assumed: a rebind re-reads the file, and the seat that rewrote it
        // in between is exactly the case this guard exists for. The tuple check below compares the
        // envelope against ITSELF across the retry and cannot see an owner change.
        assertOpenCodeEnvelopeOwner(rebound, record);

        if (
            rebound.sessionId !== first.sessionId ||
            rebound.projectId !== first.projectId ||
            rebound.directory !== first.directory
        ) {
            throw new Error('opencode-server authority tuple changed during coordinate rebind; refusing session retarget');
        }
        if (
            rebound.hostname === first.hostname &&
            rebound.port === first.port &&
            rebound.username === first.username &&
            rebound.password === first.password
        ) {
            const unchanged = new Error('opencode-server coordinates did not change after connection refusal');
            unchanged.code  = 'ECONNREFUSED';
            throw unchanged;
        }

        await postOpenCodeDigest(effects, rebound, digest, signal);
    }
}

/**
 * @summary Reads and validates the OpenCode seat envelope used as route authority.
 * @private
 */
async function readOpenCodeEnvelope(effects, envelopePath) {
    const envelope                                                                             = await readJson(effects.fs, envelopePath, 'opencode-server seat envelope');
    const {agentIdentity, hostname, port, sessionId, projectId, directory, username, password} = envelope;

    for (const [key, value] of Object.entries({
        agentIdentity,
        hostname,
        sessionId,
        projectId,
        directory,
        username,
        password
    })) {
        if (typeof value !== 'string' || value.length === 0) {
            throw new Error(`opencode-server envelope requires '${key}'`);
        }
    }
    if (!path.isAbsolute(directory)) throw new Error('opencode-server envelope requires an absolute directory');
    if (!validPort(port)) throw new Error('opencode-server envelope requires a valid port');
    if (!LOOPBACK_HOSTS.has(hostname)) throw new Error('opencode-server envelope requires loopback');

    return {agentIdentity, hostname, port, sessionId, projectId, directory, username, password};
}

/**
 * @summary Refuses an OpenCode envelope written by a different seat.
 *
 * The envelope path is per-seat BY DESIGN — the generated boot hook writes
 * `<XDG_DATA_HOME>/opencode/wake-envelope.json`. Two seats sharing one `HOME` with no per-seat
 * `XDG_DATA_HOME` resolve to the SAME file, and then whichever seat booted last silently owns wake
 * delivery for every OpenCode seat on that host. Nothing on the path noticed, because the reader
 * above validated six coordinate fields and never the owner.
 *
 * `deliverKimiPullBridge` already performs exactly this check against `record.route.agentIdentity`;
 * the OpenCode adapter is the sibling that was missing it, so this restores a contract the file
 * already keeps rather than introducing a new one.
 *
 * Fail CLOSED. A wake is a turn-creation primitive, not a notification, so a misdelivered one does
 * not merely surface in the wrong place — it starts a turn on somebody else's lane. Queued beats
 * delivered-to-the-wrong-seat.
 *
 * @param {Object} envelope Already-validated envelope.
 * @param {Object} record   Durable receiver record, carrying the route's target identity.
 * @private
 */
function assertOpenCodeEnvelopeOwner(envelope, record) {
    const expected = record?.route?.agentIdentity;

    if (typeof expected === 'string' && expected.length > 0 && envelope.agentIdentity !== expected) {
        throw new Error('opencode-server envelope does not match the configured seat owner');
    }
}

/**
 * @summary Posts one digest against already-validated OpenCode coordinates.
 * @private
 */
async function postOpenCodeDigest(effects, envelope, digest, signal) {
    const {hostname, port, sessionId, username, password} = envelope;
    const deliverySignal                                  = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const response                                        = await effects.fetch(
        `http://${hostname}:${port}/session/${encodeURIComponent(sessionId)}/prompt_async`,
        {
            method : 'POST',
            headers: {
                'content-type' : 'application/json',
                'authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
            },
            body    : JSON.stringify({parts: [{type: 'text', text: digest}]}),
            redirect: 'error',
            signal  : deliverySignal
        }
    );

    if (response.status !== 204) {
        throw new Error(`opencode-server prompt_async expected HTTP 204, received ${response.status}`);
    }
}

/**
 * @summary True only when transport coordinates refused the connection.
 * @private
 */
function isConnectionRefused(error) {
    return error?.code === 'ECONNREFUSED' || error?.cause?.code === 'ECONNREFUSED';
}

/**
 * @summary Delivers into one live Kimi session through its loopback server.
 * @private
 */
async function deliverKimiServer({digest, effects, meta, signal}) {
    const envelopePath     = meta.envelopePath || path.join(effects.homedir(), '.kimi-code', 'wake-envelope.json');
    const tokenPath        = meta.tokenPath    || path.join(effects.homedir(), '.kimi-code', 'server.token');
    const envelope         = await readJson(effects.fs, envelopePath, 'kimi-server wake envelope');
    const {sessionId, cwd} = envelope;

    if (typeof sessionId !== 'string' || typeof cwd !== 'string' || (meta.cwd && meta.cwd !== cwd)) {
        throw new Error('kimi-server envelope does not match the configured seat');
    }

    const {host, port} = await resolveKimiCoordinates(effects, meta);
    const token        = String(await effects.fs.readFile(tokenPath, 'utf8')).trim();

    if (!LOOPBACK_HOSTS.has(host) || !validPort(port) || token.length === 0) {
        throw new Error('kimi-server has invalid loopback coordinates or token');
    }

    const deliverySignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
    const response       = await effects.fetch(
        `http://${host}:${port}/api/v1/sessions/${encodeURIComponent(sessionId)}/prompts`,
        {
            method  : 'POST',
            headers : {'content-type': 'application/json', 'authorization': `Bearer ${token}`},
            body    : JSON.stringify({content: [{type: 'text', text: digest}]}),
            redirect: 'error',
            signal  : deliverySignal
        }
    );
    if (response.status !== 200) {
        throw new Error(`kimi-server submitPrompt expected HTTP 200, received ${response.status}`);
    }
    const body = await response.json();
    if (body?.code !== 0) {
        throw new Error(`kimi-server submitPrompt expected code 0, received ${JSON.stringify(body?.code ?? null)}`);
    }
}

/**
 * @summary Resolves one unambiguous live Kimi loopback coordinate source.
 * @private
 */
async function resolveKimiCoordinates(effects, meta) {
    if (meta.lockPath) {
        return readJson(effects.fs, meta.lockPath, 'kimi-server lock override');
    }

    const legacyPath = path.join(effects.homedir(), '.kimi-code', 'server', 'lock');
    try {
        return await readJson(effects.fs, legacyPath, 'kimi-server legacy lock');
    } catch {
        // v0.28+ has no legacy lock.
    }

    const instancesDir = path.join(effects.homedir(), '.kimi-code', 'server', 'instances');
    const live         = [];

    for (const entry of await effects.fs.readdir(instancesDir)) {
        if (!entry.endsWith('.json')) continue;
        try {
            const candidate = await readJson(effects.fs, path.join(instancesDir, entry), 'kimi-server instance');
            if (Number.isInteger(candidate.pid) && isProcessAlive(candidate.pid)) live.push(candidate);
        } catch {
            // Malformed/stale candidates are not coordinate authority.
        }
    }

    if (live.length !== 1) {
        throw new Error(`kimi-server requires exactly one live instance, found ${live.length}`);
    }
    return live[0];
}

/**
 * @summary Queues a pull-bridge wake under the existing strict outbox lock.
 * @private
 */
async function deliverKimiPullBridge({digest, effects, meta, record}) {
    const envelopePath                                                     = meta.envelopePath || path.join(effects.homedir(), '.kimi-code', 'wake-envelope.json');
    const outboxPath                                                       = path.resolve(meta.outboxPath || path.join(effects.homedir(), '.kimi-code', 'wake-outbox.jsonl'));
    const envelope                                                         = await readJson(effects.fs, envelopePath, 'kimi-pull-bridge wake envelope');
    const {agentIdentity, sessionId, cwd, pid: processEpoch, pidStartedAt} = envelope;

    if (agentIdentity !== record.route.agentIdentity ||
        typeof sessionId !== 'string' ||
        typeof cwd !== 'string' ||
        !Number.isInteger(processEpoch) ||
        typeof pidStartedAt !== 'string' ||
        (meta.cwd && meta.cwd !== cwd)
    ) {
        throw new Error('kimi-pull-bridge envelope does not match the configured seat owner');
    }
    if (!isProcessAlive(processEpoch) || readProcessStartTime(processEpoch) !== pidStartedAt) {
        throw new Error('kimi-pull-bridge envelope names a stale owner process');
    }

    const seatDir      = path.dirname(path.resolve(envelopePath));
    const realSeatDir  = await effects.fs.realpath(seatDir);
    const outboxParent = path.dirname(outboxPath);

    if (!outboxPath.startsWith(seatDir + path.sep) && !outboxPath.startsWith(realSeatDir + path.sep)) {
        throw new Error('kimi-pull-bridge outbox escapes the seat authority');
    }
    await effects.fs.ensureDir(outboxParent, {mode: 0o700});
    const realParent = await effects.fs.realpath(outboxParent);
    if (realParent !== realSeatDir && !realParent.startsWith(realSeatDir + path.sep)) {
        throw new Error('kimi-pull-bridge outbox resolves outside the seat authority');
    }
    if (await effects.fs.pathExists(outboxPath)) {
        if ((await effects.fs.lstat(outboxPath)).isSymbolicLink()) {
            throw new Error('kimi-pull-bridge refuses a symbolic-link outbox');
        }
        await effects.fs.chmod(outboxPath, 0o600);
    }

    const entry = {
        wakeId        : record.recordKey.slice(0, 16),
        subscriptionId: record.subscriptionId,
        agentIdentity,
        sessionId,
        processEpoch,
        pidStartedAt,
        digest,
        writtenAt     : new Date().toISOString()
    };

    await withOutboxLock(outboxPath, () =>
        effects.fs.appendFile(outboxPath, JSON.stringify(entry) + '\n', {mode: 0o600})
    );
}

/**
 * @summary Delivers through a configured loopback webhook adapter.
 * @private
 */
async function deliverWebhook({digest, effects, meta, signal}) {
    const url = new URL(meta.instanceAddress || meta.url || '');
    if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error('local webhook adapter requires loopback');

    const response = await effects.fetch(url, {
        method : 'POST',
        headers: {'content-type': 'application/json'},
        body   : JSON.stringify({digest}),
        signal
    });
    if (!response.ok) throw new Error(`local webhook adapter failed with HTTP ${response.status}`);
}

/**
 * @summary Builds the dialog-gate probe argv: one read-only System Events query that asks
 * whether the target seat's focused UI element is a text-entry field.
 *
 * A pending interactive prompt (selection dialog, permission sheet) moves focus off the composer's
 * text area; injecting keystrokes then feeds the wake TO the dialog, which submits it as the
 * operator's answer — the destroyed-intent failure this gate exists to prevent. Reading before
 * writing is the smallest delta that honors the temporal half of the verified-process invariant.
 *
 * Failure semantics are deliberately split:
 * - readable role that is NOT a text field → `interactive dialog pending` error → the caller DEFERS;
 * - unreadable state (`missing value`) or any probe throw that does not name a dialog → the caller
 *   FAILS OPEN and delivers, because silent non-delivery is the dead-realm failure mode and the
 *   mailbox stays authoritative.
 *
 * The `-- interactiveDialogProbe` comment is load-bearing twice over: it marks the emitted argv for
 * red-capable fixtures, and it names the gate for receiver logs triaging a deferred wake.
 *
 * @param {Object} config
 * @param {String} config.appName     Canonical harness app name.
 * @param {Number|null} config.instancePid Resolved seat pid when addressType is pid/userDataDir.
 * @returns {String[]} `osascript` argv fragments.
 * @private
 */
function buildDialogGateArgs({appName, instancePid}) {
    const escapedAppName = escapeAppleScript(appName);
    const targetPid      = instancePid ? String(instancePid) : '';

    return [
        '-e', `  set targetAppName to "${escapedAppName}"`,
        '-e', '  set targetBundleId to ""',
        '-e', '  try',
        '-e', `    set targetBundleId to id of application "${escapedAppName}"`,
        '-e', '  end try',
        '-e', `  set targetProcessId to "${targetPid}"`,
        '-e', '  -- interactiveDialogProbe: readable non-text focus means a prompt owns the input path',
        '-e', '  tell application "System Events"',
        ...resolveTargetProcessLines('    '),
        '-e', '    tell targetProcess',
        '-e', '      set focusedRole to missing value',
        '-e', '      try',
        '-e', '        set focusedRole to role of focused element of window 1',
        '-e', '      end try',
        '-e', '      if focusedRole is not missing value and focusedRole is not in {"AXTextArea", "AXTextField"} then',
        '-e', '        error "interactive dialog pending at phase before input"',
        '-e', '      end if',
        '-e', '    end tell',
        '-e', '  end tell'
    ];
}

/**
 * @summary Delivers through the existing draft-preserving, frontmost-verified macOS path.
 * @private
 */
async function deliverOsascript({digest, effects, meta, record}) {
    if (effects.platform !== 'darwin') return 'skipped';

    const resolvedMeta = applyHarnessMetadataDefaults(meta);
    const appName      = resolvedMeta.appName;
    if (!['Antigravity', 'Claude', 'Codex', 'OpenCode'].includes(appName)) return 'skipped';
    if (appName === 'Codex' && !resolvedMeta.focusSeedKey) return 'skipped';

    let   instancePid     = null;
    const addressType     = resolvedMeta.addressType || (resolvedMeta.userDataDir ? 'userDataDir' : null);
    const instanceAddress = resolvedMeta.instanceAddress
        || (addressType === 'userDataDir' ? resolvedMeta.userDataDir : null);

    if (addressType === 'pid' || addressType === 'userDataDir') {
        try {
            instancePid = await effects.resolveGuiInstancePid({
                instanceAddress,
                addressType,
                deploymentMode: 'local',
                target        : 'wake receiver',
                appName
            });
        } catch {
            return 'skipped';
        }
    } else {
        const target = await effects.getDefaultTarget({appName});
        if (['ambiguous', 'probe-failed'].includes(target.status)) return 'skipped';
        instancePid = target.pid;
    }

    // Dialog gate — read before writing. A readable non-text focus means a pending
    // interactive prompt owns the input path: defer (the receiver parks and reschedules under a
    // bound) rather than type the wake into the operator's dialog. Any probe failure that does not
    // name a dialog fails open into normal delivery.
    try {
        await effects.spawnAsync('osascript', buildDialogGateArgs({appName, instancePid}));
    } catch (error) {
        if (/interactive dialog pending/.test(String(error?.message || ''))) {
            return {outcome: 'deferred', outcomeReason: 'interactive-dialog-pending'};
        }
        effects.log.warn?.(
            `[Wake Receiver] dialog gate could not probe ${record.subscriptionId}; delivering fail-open`
        );
    }

    const args = buildOsascriptArgs({
        appName,
        digest,
        focusSeedKey     : resolvedMeta.focusSeedKey,
        focusSeedSequence: resolvedMeta.focusSeedSequence,
        instancePid,
        tabShortcut      : resolvedMeta.tabShortcut
    });
    const outcome = await deliverOsascriptWithRetry(effects, args, record.subscriptionId);
    return outcome;
}

/**
 * @summary AppleScript lines binding `targetProcess` to the seat we are delivering to, by IDENTITY.
 *
 * Every keystroke block used to open with `first application process whose frontmost is true` — a
 * second, independent read taken *after* `assertTargetFrontmost` had already approved the target.
 * The check proved the target held focus; the next statement discarded that and asked the system
 * again, so the payload went wherever focus had drifted to by then. With the 0.2s–1.0s delays in
 * the sequences below, focus has hundreds of milliseconds to move WHILE text is being typed.
 *
 * That is why a misrouted wake could report success. Losing focus BEFORE a check aborts loudly —
 * the `Target app lost frontmost status` errors in the receiver log are that guard working. Losing
 * it AFTER a check raised nothing at all: one seat's wake was typed into another seat's window, and
 * on the restore path the OPERATOR'S OWN recovered draft was pasted into whichever window had taken
 * focus. The check was never the weak part; discarding its result one line later was.
 *
 * Resolution follows the same precedence the assertion uses — pid, then bundle id, then name — so a
 * route that identifies its target one way is delivered to the target identified the same way.
 *
 * @param {String} indent AppleScript indentation for the emitted block.
 * @returns {String[]} `osascript` argv fragments.
 * @private
 */
function resolveTargetProcessLines(indent) {
    return [
        '-e', `${indent}if targetProcessId is not "" then`,
        '-e', `${indent}  set targetProcess to first application process whose unix id is (targetProcessId as integer)`,
        '-e', `${indent}else if targetBundleId is not "" then`,
        '-e', `${indent}  set targetProcess to first application process whose bundle identifier is targetBundleId`,
        '-e', `${indent}else`,
        '-e', `${indent}  set targetProcess to first application process whose name is targetAppName`,
        '-e', `${indent}end if`
    ]
}

/**
 * @summary Builds the draft-preserving AppleScript argument vector.
 * @private
 */
function buildOsascriptArgs({appName, digest, focusSeedKey, focusSeedSequence, instancePid, tabShortcut}) {
    const escapedAppName        = escapeAppleScript(appName);
    const targetPid             = instancePid ? String(instancePid) : '';
    const appActivateLine       = `  tell application "${escapedAppName}" to activate`;
    const instanceFrontmostLine = instancePid
        ? `  tell application "System Events" to set frontmost of (first process whose unix id is ${instancePid}) to true`
        : null;
    const args = [
        '-e', 'on assertTargetFrontmost(appName, targetBundleId, targetProcessId, phase)',
        '-e', '  tell application "System Events"',
        '-e', '    set frontmostProcess to first application process whose frontmost is true',
        '-e', '    if targetProcessId is not "" then',
        '-e', '      set currentPid to (unix id of frontmostProcess) as string',
        '-e', '      if currentPid is not targetProcessId then',
        '-e', '        set currentBundleId to ""',
        '-e', '        try',
        '-e', '          set currentBundleId to (bundle identifier of frontmostProcess) as string',
        '-e', '        end try',
        '-e', '        if currentBundleId is not targetBundleId then error "Target app lost frontmost status " & phase',
        '-e', '      end if',
        '-e', '    else if targetBundleId is not "" then',
        '-e', '      set currentBundleId to ""',
        '-e', '      try',
        '-e', '        set currentBundleId to (bundle identifier of frontmostProcess) as string',
        '-e', '      end try',
        '-e', '      if currentBundleId is not targetBundleId then error "Target app lost frontmost status " & phase',
        '-e', '    else if (name of frontmostProcess) is not appName then',
        '-e', '      error "Target app lost frontmost status " & phase',
        '-e', '    end if',
        '-e', '  end tell',
        '-e', 'end assertTargetFrontmost',
        '-e', 'on run argv',
        '-e', '  set wakePayload to (item 1 of argv)',
        '-e', `  set targetAppName to "${escapedAppName}"`,
        '-e', '  set targetBundleId to ""',
        '-e', '  try',
        '-e', `    set targetBundleId to id of application "${escapedAppName}"`,
        '-e', '  end try',
        '-e', `  set targetProcessId to "${targetPid}"`,
        '-e', '  try',
        '-e', '    set savedClipboard to the clipboard as string',
        '-e', '  on error',
        '-e', '    set savedClipboard to ""',
        '-e', '  end try',
        '-e', '  try',
        '-e', '  set targetRaised to false',
        '-e', '  repeat 12 times',
        '-e', appActivateLine,
        ...(instanceFrontmostLine ? ['-e', instanceFrontmostLine] : []),
        '-e', '    delay 0.25',
        '-e', '    try',
        '-e', '      my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "after activation")',
        '-e', '      set targetRaised to true',
        '-e', '      exit repeat',
        '-e', '    end try',
        '-e', '  end repeat',
        '-e', '  if not targetRaised then my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "after activation")',
        '-e', '  tell application "System Events"',
        ...resolveTargetProcessLines('    '),
        '-e', '    tell targetProcess'
    ];

    if (tabShortcut) {
        const shifted = String(tabShortcut).startsWith('shift+');
        const key     = shifted ? String(tabShortcut).slice(6) : String(tabShortcut);
        args.push('-e', shifted
            ? `      keystroke "${escapeAppleScript(key)}" using {command down, shift down}`
            : `      keystroke "${escapeAppleScript(key)}" using command down`);
        args.push('-e', '      delay 0.5');
    }
    if (focusSeedSequence === 'r-undo') {
        args.push('-e', '      keystroke "r"', '-e', '      delay 0.2', '-e', '      keystroke "z" using command down', '-e', '      delay 0.2');
    } else if (focusSeedKey) {
        args.push('-e', focusSeedKey === 'space' || focusSeedKey === ' '
            ? '      key code 49'
            : `      keystroke "${escapeAppleScript(focusSeedKey)}"`);
        args.push('-e', '      delay 0.2');
        if (appName === 'Codex' && focusSeedKey === 'r') {
            args.push('-e', '      keystroke "z" using command down', '-e', '      delay 0.2');
        }
    }

    args.push(
        '-e', '      my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before prompt clear")',
        '-e', '      set the clipboard to ""',
        '-e', '      keystroke "a" using command down',
        '-e', '      delay 0.2',
        '-e', '      keystroke "x" using command down',
        '-e', '      delay 0.2',
        '-e', '    end tell',
        '-e', '  end tell',
        '-e', '  try',
        '-e', '    set userInput to the clipboard as string',
        '-e', '  on error',
        '-e', '    set userInput to ""',
        '-e', '  end try',
        '-e', '  my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake clipboard set")',
        '-e', '  set the clipboard to wakePayload',
        '-e', '  delay 0.2',
        '-e', '  my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before wake paste")',
        '-e', '  tell application "System Events"',
        ...resolveTargetProcessLines('    '),
        '-e', '    tell targetProcess',
        '-e', '      keystroke "v" using command down',
        '-e', '      delay 0.5',
        ...(appName === 'Codex' ? ['-e', '      key code 53', '-e', '      delay 0.45'] : []),
        '-e', '      key code 36',
        '-e', '      delay 1.0',
        '-e', '    end tell',
        '-e', '  end tell',
        '-e', '  if userInput is not "" then',
        '-e', '    my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before user input restore clipboard set")',
        '-e', '    set the clipboard to userInput',
        '-e', '    delay 0.2',
        '-e', '    my assertTargetFrontmost(targetAppName, targetBundleId, targetProcessId, "before user input restore paste")',
        '-e', '    tell application "System Events"',
        ...resolveTargetProcessLines('      '),
        '-e', '      tell targetProcess',
        '-e', '        keystroke "v" using command down',
        '-e', '      end tell',
        '-e', '    end tell',
        '-e', '  end if',
        '-e', '  delay 0.5',
        '-e', '  set the clipboard to savedClipboard',
        '-e', '  on error errMsg',
        '-e', '    set the clipboard to savedClipboard',
        '-e', '    error errMsg',
        '-e', '  end try',
        '-e', 'end run',
        digest
    );
    return args;
}

/**
 * @summary Retries only pre-submit frontmost races; post-submit restore races count delivered.
 * @private
 */
async function deliverOsascriptWithRetry(effects, args, subscriptionId) {
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            await effects.spawnAsync('osascript', args);
            return 'delivered';
        } catch (error) {
            const message = String(error.message || '');
            const race    = /lost frontmost status|-2700/.test(message);
            if (race && /user input restore/.test(message)) return 'delivered';
            if (race && attempt < 4) {
                await new Promise(resolve => setTimeout(resolve, 800));
                continue;
            }
            // The captured stderr is the only in-band account of WHY this failed — a TCC denial, a
            // missing target process, a script error. Reporting the id alone leaves an operator with
            // a confident line and no cause, which is harder to notice than silence. Carried on the
            // record too: a receiver under launchd writes stdout where nobody reads it.
            effects.log.error?.(`[Wake Receiver] osascript failed for ${subscriptionId}: ${message}`);
            return {outcome: 'failed', outcomeReason: message};
        }
    }
    return 'failed';
}

/**
 * @summary Probes the target session's current context occupancy for the receiver's context gate,
 * without disturbing the session.
 *
 * Returns `{contextTokens, lastActivityAt, sessionId}` — the newest assistant turn's
 * `input + cache.read` (the context the next injected turn would re-process) plus the newest
 * activity stamp — or `null` when the adapter has no readable local authority. `null` is the
 * fail-open signal: the gate delivers with a loud warn rather than ever silently withholding a
 * wake. Probe failures are deliberately swallowed into `null`; the receiver's
 * warn line carries the subscription id, and the mailbox stays authoritative throughout.
 *
 * @param {Object} record Durable receiver record (carries its route snapshot).
 * @param {Object} [dependencies] Injectable host effects for tests.
 * @returns {Promise<{contextTokens: Number, lastActivityAt: Number|null, sessionId: String}|null>}
 */
export async function probeSessionContext(record, dependencies = {}) {
    const meta    = record?.route?.harnessTargetMetadata || {};
    const adapter = meta.adapter || (process.platform === 'darwin' ? 'osascript' : 'tmux');
    const effects = {
        fetch  : globalThis.fetch,
        fs,
        homedir: os.homedir,
        ...dependencies
    };

    try {
        if (adapter === 'opencode-server') {
            return await probeOpenCodeSession({effects, meta, record});
        }
        if (adapter === 'kimi-server' || adapter === 'kimi-pull-bridge') {
            return await probeKimiWireSession({effects, meta});
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * @summary Reads the OpenCode session's context size through its own loopback server — the same
 * 0600 envelope authority the delivery path uses, so a session rotation automatically re-points
 * the probe at the fresh (cheap) session.
 * @private
 */
async function probeOpenCodeSession({effects, meta, record}) {
    const envelopePath = meta.envelopePath
        || path.join(effects.homedir(), '.local', 'share', 'opencode', 'wake-envelope.json');
    const envelope = await readOpenCodeEnvelope(effects, envelopePath);

    // The probe READS another session's messages, so a misrouted one leaks a peer's transcript
    // rather than merely misplacing a wake. Same guard, same reason.
    assertOpenCodeEnvelopeOwner(envelope, record);

    const {hostname, port, sessionId, username, password} = envelope;

    const response = await effects.fetch(
        `http://${hostname}:${port}/session/${encodeURIComponent(sessionId)}/message?limit=30`,
        {
            headers: {'authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')},
            signal : AbortSignal.timeout(4000)
        }
    );
    if (!response.ok) return null;

    const messages = await response.json();
    if (!Array.isArray(messages) || messages.length === 0) return null;

    let contextTokens  = null,
        lastActivityAt = null;

    for (let i = messages.length - 1; i >= 0; i--) {
        const info    = messages[i]?.info || messages[i];
        const created = info?.time?.created;

        if (lastActivityAt === null && Number.isFinite(created)) lastActivityAt = created;

        const tokens = info?.tokens;
        if (info?.role === 'assistant' && tokens && Number.isFinite(tokens.input)) {
            contextTokens = (tokens.input || 0) + (tokens.cache?.read || 0);
            break;
        }
    }

    if (!Number.isFinite(contextTokens)) return null;

    return {contextTokens, lastActivityAt, sessionId};
}

/**
 * @summary Reads the Kimi session's context size from the tail of its `wire.jsonl` usage ledger —
 * the same harness-side telemetry the flatrate forensics were computed from. The session id comes
 * from the seat's wake envelope (rotation-safe); the working-dir bucket is discovered, never
 * assumed.
 * @private
 */
async function probeKimiWireSession({effects, meta}) {
    const envelopePath = meta.envelopePath || path.join(effects.homedir(), '.kimi-code', 'wake-envelope.json');
    const envelope     = await readJson(effects.fs, envelopePath, 'kimi wake envelope');
    const {sessionId}  = envelope;

    if (typeof sessionId !== 'string' || sessionId.length === 0) return null;

    const sessionsRoot = path.join(effects.homedir(), '.kimi-code', 'sessions');

    for (const bucket of await effects.fs.readdir(sessionsRoot)) {
        const wirePath = path.join(sessionsRoot, bucket, sessionId, 'agents', 'main', 'wire.jsonl');

        if (!await effects.fs.pathExists(wirePath)) continue;

        // Tail-read only: these ledgers reach tens of MB inside a single session.
        const {size} = await effects.fs.stat(wirePath);
        const start  = Math.max(0, size - 262_144);
        const handle = await effects.fs.open(wirePath, 'r');
        let   chunk;

        try {
            const buffer = Buffer.alloc(size - start);
            await handle.read(buffer, 0, buffer.length, start);
            chunk = buffer.toString('utf8');
        } finally {
            await handle.close();
        }

        const lines = chunk.split('\n');

        for (let i = lines.length - 1; i >= 0; i--) {
            if (!lines[i].includes('"usage"')) continue;

            let parsed;
            try { parsed = JSON.parse(lines[i]) } catch { continue; } // a tail-sliced first line is partial

            const usage = parsed?.usage;
            if (!usage || !Number.isFinite(usage.inputOther)) continue;

            let lastActivityAt = parsed.timestamp ?? parsed.time ?? null;
            if (Number.isFinite(lastActivityAt) && lastActivityAt < 1e11) lastActivityAt *= 1000;

            return {
                contextTokens : (usage.inputOther || 0) + (usage.inputCacheRead || 0),
                lastActivityAt: Number.isFinite(lastActivityAt) ? lastActivityAt : null,
                sessionId
            };
        }

        return null; // the located wire ledger has no usable usage line yet
    }

    return null;
}

/**
 * @summary Injection-safe child-process wrapper.
 * @private
 */
function spawnAsync(command, args) {
    return new Promise((resolve, reject) => {
        const child  = spawn(command, args, {stdio: ['ignore', 'ignore', 'pipe']});
        let   stderr = '';
        child.stderr.on('data', value => { stderr += value.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) return resolve();
            reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
        });
    });
}

/**
 * @summary Reads one JSON authority file with an adapter-scoped error.
 * @private
 */
async function readJson(fsImpl, filePath, label) {
    try {
        return JSON.parse(await fsImpl.readFile(filePath, 'utf8'));
    } catch (error) {
        throw new Error(`${label} '${filePath}' is unreadable (${error.message})`);
    }
}

/**
 * @summary Returns whether a candidate is a valid TCP port.
 * @param {*} value
 * @returns {Boolean}
 * @private
 */
function validPort(value) {
    return Number.isInteger(value) && value > 0 && value <= 65535;
}

/**
 * @summary Probes whether a host-local process id still exists.
 * @param {Number} pid
 * @returns {Boolean}
 * @private
 */
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

/**
 * @summary Reads the operating-system process start stamp used as a PID-reuse fence.
 * @param {Number} pid
 * @returns {String|null}
 * @private
 */
function readProcessStartTime(pid) {
    try {
        return spawnSync('ps', ['-p', String(pid), '-o', 'lstart=']).stdout?.toString().trim() || null;
    } catch {
        return null;
    }
}

/**
 * @summary Escapes a value for interpolation inside an AppleScript string literal.
 * @param {*} value
 * @returns {String}
 * @private
 */
function escapeAppleScript(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * @summary Extends a synthetic hang beyond its configured test attempt bound.
 * @param {Object} adapterConfig
 * @returns {Number}
 * @private
 */
function timeoutForTest(adapterConfig) {
    return Math.max(adapterConfig.attemptTimeoutMs * 2, 50);
}
