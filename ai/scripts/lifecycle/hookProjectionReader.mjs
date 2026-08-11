/**
 * @module ai/scripts/lifecycle/hookProjectionReader
 * @summary Pure bounded reader for the typed live-lane-awareness projection consumed by Stop hooks.
 *
 * This is the hook-side half of the typed live-lane-awareness contract. It reads one already-trusted
 * local `current.json`, validates the published target and categorical consumer binding, validates each
 * typed channel independently, and renders a byte/row-bounded informational block in the fixed order
 * lifecycle → route → context references. It never calls Memory Core, GitHub, a graph, an LLM, or a
 * ranking surface.
 *
 * The policy boundary is explicit in every result: `admissionEffect: 'none'`. A missing, unreadable, or
 * invalid projection returns an empty render and the existing bare Stop policy stays untouched.
 * Fail-open therefore applies to the independent hook policy; it never licenses malformed, foreign,
 * stale, or degraded facts to render as current rows.
 * @plane in-plane
 */

import fs from 'node:fs';

import {normalizeAgentIdentityNodeId} from '../../graph/normalizeAgentIdentityNodeId.mjs';
import {validateComputedRouteResult}  from '../../services/graph/computedRouteResult.mjs';
import {validateLifecycleFrontier}    from '../../services/graph/lifecycleFrontier.mjs';

export const HOOK_PROJECTION_SCHEMA_VERSION = 'live-lane-awareness-projection.v1';

const POLICY = Object.freeze({
          admissionEffect: 'none',
          fallback       : 'existing-bare-policy'
      }),
      BINDING_STATUSES = Object.freeze(new Set(['attested', 'unverified', 'conflicted', 'stale'])),
      BINDING_SCOPES   = Object.freeze(new Set(['agent-instance', 'agent', 'route-only'])),
      CHANNEL_STATUSES = Object.freeze(new Set(['fresh', 'missing', 'stale', 'degraded'])),
      FRONTIER_NON_ROW_STATUSES = Object.freeze(new Set(['missing', 'stale', 'degraded'])),
      RENDER_HEADER = 'Live lane awareness — source data only; informational, no admission change:';

/**
 * @summary Returns whether a value is a non-array object.
 * @param {*} value
 * @returns {Boolean}
 */
function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * @summary Returns whether a value is a non-empty string.
 * @param {*} value
 * @returns {Boolean}
 */
function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0
}

/**
 * @summary Converts an ISO/date/epoch input to epoch milliseconds without guessing on failure.
 * @param {*} value
 * @returns {Number}
 */
function toEpoch(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value === 'string') return Date.parse(value);
    return NaN
}

/**
 * @summary Collapses control/newline whitespace so projection data cannot create synthetic hook lines.
 * @param {*} value
 * @returns {String}
 */
function oneLine(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * @summary Quotes external text as data rather than allowing it to read as a hook instruction.
 * @param {*} value
 * @returns {String}
 */
function quoteData(value) {
    return JSON.stringify(oneLine(value))
}

/**
 * @summary Creates a total, policy-preserving empty result for absent or invalid enrichment.
 * @param {String} status
 * @param {String[]} [diagnostics]
 * @returns {Object}
 */
function bareResult(status, diagnostics = []) {
    return {
        status,
        render      : '',
        policy      : POLICY,
        rowsRendered: 0,
        rowsOmitted : 0,
        truncated   : false,
        diagnostics : [...diagnostics]
    }
}

/**
 * @summary Validates the two mandatory config-owned render budgets.
 * @param {*} budget
 * @returns {Object} Validation result with normalized budgets or a failure reason.
 */
function validateBudget(budget) {
    if (!isPlainObject(budget)) {
        return {valid: false, reason: 'budget must be a plain object'}
    }

    const {maxRows, maxBytes} = budget;

    if (!Number.isInteger(maxRows) || maxRows <= 0) {
        return {valid: false, reason: 'budget.maxRows must be a positive integer from config'}
    }
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
        return {valid: false, reason: 'budget.maxBytes must be a positive integer from config'}
    }

    return {valid: true, maxRows, maxBytes}
}

/**
 * @summary Composes bounded rows and reserves room for an explicit truncation marker.
 * @param {String[]} rows Ordered logical render rows.
 * @param {{maxRows: Number, maxBytes: Number}} budget
 * @returns {{render: String, rowsRendered: Number, rowsOmitted: Number, truncated: Boolean}}
 */
function renderBounded(rows, {maxRows, maxBytes}) {
    if (!rows.length) {
        return {render: '', rowsRendered: 0, rowsOmitted: 0, truncated: false}
    }

    let selected = rows.slice(0, maxRows),
        omitted  = rows.length - selected.length;

    const compose = () => {
        const marker = omitted > 0
            ? `\n[projection truncated: ${omitted} row${omitted === 1 ? '' : 's'} omitted by configured row/byte budget]`
            : '';

        return `${RENDER_HEADER}\n${selected.join('\n')}${marker}`
    };

    while (selected.length > 0 && Buffer.byteLength(compose(), 'utf8') > maxBytes) {
        selected.pop();
        omitted++
    }

    let render = compose();

    if (Buffer.byteLength(render, 'utf8') > maxBytes) {
        const marker = '[projection truncated by configured byte budget]';

        render = Buffer.byteLength(marker, 'utf8') <= maxBytes ? marker : '';
        omitted = rows.length
    }

    return {
        render,
        rowsRendered: selected.length,
        rowsOmitted : omitted,
        truncated   : omitted > 0
    }
}

/**
 * @summary Validates the projection-wide shape and its trusted target id.
 * @param {*} projection
 * @param {Object} attestedBinding
 * @returns {{valid: Boolean, errors: String[]}}
 */
function validateProjectionEnvelope(projection, attestedBinding) {
    const errors = [];

    if (!isPlainObject(projection)) {
        return {valid: false, errors: ['projection is not a plain object']}
    }
    if (projection.schemaVersion !== HOOK_PROJECTION_SCHEMA_VERSION) {
        errors.push(`schemaVersion must be ${HOOK_PROJECTION_SCHEMA_VERSION}`)
    }
    if (projection.notAuthority !== true) {
        errors.push('notAuthority must be true')
    }

    const publication = projection.publication;

    if (!isPlainObject(publication)) {
        errors.push('publication is required')
    } else {
        if (!isNonEmptyString(publication.targetId) || publication.targetId !== attestedBinding.targetId) {
            errors.push(`publication.targetId does not match trusted target ${quoteData(attestedBinding.targetId)}`)
        }
        if (!Number.isInteger(Number(publication.fencingEpoch)) || Number(publication.fencingEpoch) < 1) {
            errors.push('publication.fencingEpoch must be a positive integer')
        }
        if (!Number.isFinite(toEpoch(publication.generatedAt))) {
            errors.push('publication.generatedAt must be a parseable time')
        }
        if (!isPlainObject(publication.producerWatermarks) ||
            Object.values(publication.producerWatermarks).some(value => !isNonEmptyString(value))) {
            errors.push('publication.producerWatermarks must be a string-valued object')
        }
    }

    if (!isPlainObject(projection.consumerBinding)) {
        errors.push('consumerBinding is required')
    }
    if (!Array.isArray(projection.contextViews)) {
        errors.push('contextViews must be an array')
    }
    if (!isPlainObject(projection.coverage) ||
        !Array.isArray(projection.coverage.sources) ||
        !Array.isArray(projection.coverage.degradedSources) ||
        [...(projection.coverage?.sources || []), ...(projection.coverage?.degradedSources || [])]
            .some(value => typeof value !== 'string')) {
        errors.push('coverage must carry string-valued sources and degradedSources arrays')
    }

    return {valid: errors.length === 0, errors}
}

/**
 * @summary Assesses categorical binding without ever deriving identity from a path, session, or title.
 *
 * A binding that explicitly resolves `route-only` may still expose the independent global route.
 * A binding that CLAIMS agent/instance scope but names a foreign categorical recipient is refused as
 * foreign in full; a tampered file does not get to downgrade itself after making the stronger claim.
 *
 * @param {Object} binding Published consumer binding.
 * @param {Object} attested Reader-owned categorical binding.
 * @param {Number} now Reader clock.
 * @returns {{mode: ('lifecycle'|'route-only'|'foreign'), reason: String}}
 */
function assessBinding(binding, attested, now) {
    const structural   = [],
          mismatches   = [],
          bindingAgent = normalizeAgentIdentityNodeId(binding.agentId),
          readerAgent  = normalizeAgentIdentityNodeId(attested.agentId);

    if (!isNonEmptyString(binding.capability)) structural.push('capability missing');
    if (!isNonEmptyString(binding.agentId)) structural.push('agentId missing');
    if (!isNonEmptyString(binding.harnessType)) structural.push('harnessType missing');
    if (!BINDING_STATUSES.has(binding.status)) structural.push(`unsupported status ${quoteData(binding.status)}`);
    if (!BINDING_SCOPES.has(binding.scopeResolution)) structural.push(`unsupported scopeResolution ${quoteData(binding.scopeResolution)}`);
    if (!isPlainObject(binding.provenance) || !isNonEmptyString(binding.provenance.producer)) {
        structural.push('provenance.producer missing')
    }
    if (!Array.isArray(binding.conflicts)) structural.push('conflicts must be an array');

    const assertedAt = toEpoch(binding.assertedAt),
          expiresAt  = toEpoch(binding.expiresAt);

    if (!Number.isFinite(assertedAt)) structural.push('assertedAt is not parseable');
    if (!Number.isFinite(expiresAt)) structural.push('expiresAt is not parseable');
    if (Number.isFinite(assertedAt) && Number.isFinite(expiresAt) && expiresAt <= assertedAt) {
        structural.push('expiresAt is not after assertedAt')
    }

    if (binding.capability !== attested.capability) {
        mismatches.push(`capability ${quoteData(binding.capability)} != ${quoteData(attested.capability)}`)
    }
    if (bindingAgent !== readerAgent) {
        mismatches.push(`agentId ${quoteData(bindingAgent)} != ${quoteData(readerAgent)}`)
    }
    if (binding.harnessType !== attested.harnessType) {
        mismatches.push(`harnessType ${quoteData(binding.harnessType)} != ${quoteData(attested.harnessType)}`)
    }
    if (binding.workspaceKeyDigest !== attested.workspaceKeyDigest) {
        mismatches.push('workspaceKeyDigest differs')
    }
    if (binding.scopeResolution !== 'agent' &&
        binding.instanceKeyDigest !== attested.instanceKeyDigest) {
        mismatches.push('instanceKeyDigest differs')
    }

    if (binding.scopeResolution !== 'route-only' && mismatches.length > 0) {
        return {mode: 'foreign', reason: `consumer binding mismatch: ${mismatches.join('; ')}`}
    }

    const expired = Number.isFinite(expiresAt) && expiresAt <= now;

    if (binding.scopeResolution === 'route-only' ||
        binding.status !== 'attested' ||
        expired ||
        structural.length > 0 ||
        (Array.isArray(binding.conflicts) && binding.conflicts.length > 0)) {
        const reasons = [
            ...(binding.status && binding.status !== 'attested' ? [`status ${binding.status}`] : []),
            ...(expired ? [`binding expired at ${binding.expiresAt}`] : []),
            ...(Array.isArray(binding.conflicts) && binding.conflicts.length
                ? [`conflicted (${binding.conflicts.map(oneLine).join(', ')})`]
                : []),
            ...structural,
            ...mismatches
        ];

        return {
            mode  : 'route-only',
            reason: reasons.join('; ') || 'binding resolved route-only'
        }
    }

    return {mode: 'lifecycle', reason: 'attested categorical recipient'}
}

/**
 * @summary Validates one writer-owned channel wrapper and independently enforces its expiry.
 * @param {*} wrapper
 * @param {Number} now
 * @param {String} expectedWatermark Publication-level watermark for this channel.
 * @returns {Object} Channel assessment with a typed envelope only when usable.
 */
function assessChannel(wrapper, now, expectedWatermark) {
    if (!isPlainObject(wrapper)) {
        return {usable: false, status: 'missing', reason: 'channel wrapper missing'}
    }
    if (!CHANNEL_STATUSES.has(wrapper.status)) {
        return {usable: false, status: 'degraded', reason: `unsupported channel status ${quoteData(wrapper.status)}`}
    }
    if (wrapper.status !== 'fresh') {
        return {
            usable: false,
            status: wrapper.status,
            reason: oneLine(wrapper.degradedReason) || `channel status ${wrapper.status}`
        }
    }
    if (!isNonEmptyString(wrapper.sourceWatermark)) {
        return {usable: false, status: 'degraded', reason: 'channel provenance watermark missing'}
    }
    if (!isNonEmptyString(expectedWatermark) || wrapper.sourceWatermark !== expectedWatermark) {
        return {usable: false, status: 'degraded', reason: 'channel provenance watermark does not match publication'}
    }
    if (!Array.isArray(wrapper.citations) ||
        wrapper.citations.some(citation => typeof citation !== 'string')) {
        return {usable: false, status: 'degraded', reason: 'channel citations provenance is invalid'}
    }

    const capturedAt = toEpoch(wrapper.capturedAt),
          expiresAt  = toEpoch(wrapper.expiresAt);

    if (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) || expiresAt <= capturedAt) {
        return {usable: false, status: 'degraded', reason: 'channel capture/expiry window is invalid'}
    }
    if (expiresAt <= now) {
        return {usable: false, status: 'stale', reason: `channel expired at ${wrapper.expiresAt}`}
    }
    if (!isPlainObject(wrapper.envelope)) {
        return {usable: false, status: 'degraded', reason: 'typed channel envelope missing'}
    }

    return {usable: true, status: 'fresh', reason: '', envelope: wrapper.envelope}
}

/**
 * @summary Renders lifecycle rows or one honest channel-state marker.
 * @param {*} wrapper
 * @param {Object} attested
 * @param {Number} now
 * @param {{mode: String, reason: String}} bindingState
 * @param {String} expectedWatermark
 * @returns {String[]}
 */
function renderLifecycle(wrapper, attested, now, bindingState, expectedWatermark) {
    if (bindingState.mode !== 'lifecycle') {
        return [`Lifecycle unavailable — ${oneLine(bindingState.reason)}`]
    }

    const channel = assessChannel(wrapper, now, expectedWatermark);

    if (!channel.usable) {
        return [`Lifecycle ${channel.status} — ${oneLine(channel.reason)}`]
    }

    const frontier  = channel.envelope,
          validated = validateLifecycleFrontier(frontier, {
              now,
              agentId: normalizeAgentIdentityNodeId(attested.agentId)
          });

    if (!validated.valid) {
        const reason = validated.errors.join('; '),
              status = /expired at/.test(reason) ? 'stale' : 'degraded';

        return [`Lifecycle ${status} — ${oneLine(reason)}`]
    }

    if (!Array.isArray(frontier.coverage?.sources) || frontier.coverage.sources.length === 0) {
        return ['Lifecycle degraded — channel provenance names no source']
    }
    if (frontier.sourceWatermark !== wrapper.sourceWatermark) {
        return ['Lifecycle degraded — typed envelope watermark does not match channel provenance']
    }
    if (FRONTIER_NON_ROW_STATUSES.has(frontier.status)) {
        return [`Lifecycle ${frontier.status} — no response-required rows rendered (as of ${frontier.capturedAt})`]
    }
    if (frontier.status === 'empty' || frontier.items.length === 0) {
        return [`Lifecycle empty — no response-required rows (as of ${frontier.capturedAt})`]
    }

    return frontier.items.map(item =>
        `Lifecycle ${oneLine(item.id)} [${oneLine(item.stage)}/${oneLine(item.state)}] ` +
        `${oneLine(item.subjectId)} — actionable since ${oneLine(item.actionableSince)} ` +
        `(as of ${oneLine(frontier.capturedAt)})`
    )
}

/**
 * @summary Performs the route validations not owned by the base structural guard.
 * @param {Object} route
 * @param {Number} now
 * @returns {{valid: Boolean, status: String, reason: String}}
 */
function validateRouteAtReadTime(route, now) {
    const base = validateComputedRouteResult(route);

    if (!base.valid) {
        return {valid: false, status: 'degraded', reason: base.errors.join('; ')}
    }
    if (!isPlainObject(route.provenance) || !isNonEmptyString(route.provenance.producer)) {
        return {valid: false, status: 'degraded', reason: 'provenance.producer missing'}
    }

    const capturedAt = toEpoch(route.capturedAt),
          expiresAt  = toEpoch(route.expiresAt);

    if (!Number.isFinite(capturedAt) || !Number.isFinite(expiresAt) || expiresAt <= capturedAt) {
        return {valid: false, status: 'degraded', reason: 'route capture/expiry window is invalid'}
    }
    if (expiresAt <= now || route.status === 'stale' || route.freshness?.status === 'stale') {
        return {valid: false, status: 'stale', reason: `route expired or declared stale at ${route.expiresAt}`}
    }
    if (!isPlainObject(route.freshness) || route.freshness.status !== 'fresh') {
        return {valid: false, status: 'degraded', reason: 'route freshness is not fresh'}
    }

    return {valid: true, status: route.status, reason: ''}
}

/**
 * @summary Renders computed route rows or one honest channel-state marker.
 * @param {*} wrapper
 * @param {Number} now
 * @param {String} expectedWatermark
 * @returns {String[]}
 */
function renderRoute(wrapper, now, expectedWatermark) {
    const channel = assessChannel(wrapper, now, expectedWatermark);

    if (!channel.usable) {
        return [`Route ${channel.status} — ${oneLine(channel.reason)}`]
    }

    const route     = channel.envelope,
          validated = validateRouteAtReadTime(route, now);

    if (!validated.valid) {
        return [`Route ${validated.status} — ${oneLine(validated.reason)}`]
    }
    if (route.sourceWatermark !== wrapper.sourceWatermark) {
        return ['Route degraded — typed envelope watermark does not match channel provenance']
    }
    if (FRONTIER_NON_ROW_STATUSES.has(route.status)) {
        return [`Route ${route.status} — no ranked rows rendered (as of ${route.capturedAt})`]
    }
    if (route.status === 'empty' || route.route.items.length === 0) {
        const advisoryCount = Array.isArray(route.advisoryFallback?.items)
            ? route.advisoryFallback.items.length
            : 0;

        return [
            `Route ${oneLine(route.routeVersion)} empty (as of ${oneLine(route.capturedAt)}); ` +
            `declared-intent advisory remains non-executable (${advisoryCount} item${advisoryCount === 1 ? '' : 's'})`
        ]
    }

    return route.route.items.map((item, index) =>
        `Route ${oneLine(route.routeVersion)} #${index + 1} ${oneLine(item.id)} — ${quoteData(item.title)} ` +
        `(as of ${oneLine(route.capturedAt)}; advisory, no automatic action)`
    )
}

/**
 * @summary Validates and renders fixed context-view invocation references, never their narratives/results.
 * @param {*} contextViews
 * @param {Number} now
 * @param {Object} producerWatermarks
 * @returns {String[]}
 */
function renderContextViews(contextViews, now, producerWatermarks) {
    const rows = [];

    for (const entry of contextViews) {
        if (!isPlainObject(entry) ||
            !isNonEmptyString(entry.channel) ||
            !entry.channel.startsWith('context-view:') ||
            !Object.hasOwn(entry, 'envelope')) {
            rows.push('Context view degraded — invalid channel wrapper');
            continue
        }

        const channel = assessChannel(entry, now, producerWatermarks[entry.channel]);

        if (!channel.usable) {
            rows.push(`Context view ${channel.status} — ${oneLine(channel.reason)}`);
            continue
        }

        const descriptor = channel.envelope;

        if (!isPlainObject(descriptor) ||
            !isNonEmptyString(descriptor.operationId) ||
            !isNonEmptyString(descriptor.schemaVersion) ||
            !isNonEmptyString(descriptor.targetScope) ||
            !isPlainObject(descriptor.presetArgs) ||
            !isNonEmptyString(descriptor.capabilityStatus) ||
            !isNonEmptyString(descriptor.purpose)) {
            rows.push('Context view degraded — invalid invocation reference');
            continue
        }

        if (descriptor.capabilityStatus !== 'available') {
            rows.push(`Context view ${oneLine(descriptor.operationId)} unavailable — capability ${oneLine(descriptor.capabilityStatus)}`);
            continue
        }

        rows.push(
            `Context view ${oneLine(descriptor.operationId)} — ${quoteData(descriptor.purpose)} ` +
            `(invoke explicitly; scope ${oneLine(descriptor.targetScope)})`
        )
    }

    return rows
}

/**
 * @summary Reads, validates, bounds, and renders one trusted hook projection.
 *
 * The caller supplies the already-trusted absolute path and its own attested categorical binding.
 * This function never derives either from the path/session and never changes hook admission.
 *
 * @param {Object} params
 * @param {String} params.projectionPath Trusted local `current.json` path.
 * @param {Object} params.attestedBinding `{targetId, capability, agentId, harnessType,
 *   instanceKeyDigest, workspaceKeyDigest}` from the hook's boot/config boundary.
 * @param {Object} params.budget `{maxRows, maxBytes}` from AiConfig; no primitive defaults.
 * @param {Date|Number|String} params.now Injected reader clock.
 * @returns {Object} Bounded `{render, policy, status, rowsRendered, rowsOmitted, truncated, diagnostics}`.
 */
export function readHookProjection({projectionPath, attestedBinding, budget, now} = {}) {
    const checkedBudget = validateBudget(budget),
          readerNow     = toEpoch(now);

    if (!checkedBudget.valid) return bareResult('invalid-config', [checkedBudget.reason]);
    if (!isNonEmptyString(projectionPath)) return bareResult('absent', ['projection path is not configured']);
    if (!isPlainObject(attestedBinding)) return bareResult('invalid-config', ['attested binding is not configured']);

    const requiredAttestation = [
        'targetId',
        'capability',
        'agentId',
        'harnessType',
        'instanceKeyDigest',
        'workspaceKeyDigest'
    ];
    const missingAttestation = requiredAttestation.filter(field => !isNonEmptyString(attestedBinding[field]));

    if (missingAttestation.length > 0) {
        return bareResult('invalid-config', [`attested binding missing ${missingAttestation.join(', ')}`])
    }
    if (!Number.isFinite(readerNow)) {
        return bareResult('invalid-config', ['reader clock is not parseable'])
    }

    let projection;

    try {
        projection = JSON.parse(fs.readFileSync(projectionPath, 'utf8'))
    } catch (error) {
        return bareResult('absent', [error instanceof Error ? error.message : String(error)])
    }

    const envelope = validateProjectionEnvelope(projection, attestedBinding);

    if (!envelope.valid) return bareResult('invalid', envelope.errors);

    const bindingState = assessBinding(projection.consumerBinding, attestedBinding, readerNow);

    if (bindingState.mode === 'foreign') {
        const bounded = renderBounded(
            [`Lifecycle unavailable — ${oneLine(bindingState.reason)}; projection enrichment withheld`],
            checkedBudget
        );

        return {
            status     : 'binding-mismatch',
            policy     : POLICY,
            diagnostics: [bindingState.reason],
            ...bounded
        }
    }

    const producerWatermarks = projection.publication.producerWatermarks,
          rows               = [
        ...renderLifecycle(
            projection.lifecycleActions,
            attestedBinding,
            readerNow,
            bindingState,
            producerWatermarks['lifecycle-frontier']
        ),
        ...renderRoute(projection.computedRoute, readerNow, producerWatermarks['computed-route']),
        ...renderContextViews(projection.contextViews, readerNow, producerWatermarks)
    ];
    const bounded = renderBounded(rows, checkedBudget);

    return {
        status     : bounded.render ? 'rendered' : 'invalid',
        policy     : POLICY,
        diagnostics: [],
        ...bounded
    }
}

/**
 * @summary Maps the shared `AiConfig.stopHook.projection` subtree into the reader's explicit inputs.
 *
 * The config object is injected by a hook entrypoint after resolving the ConfigProvider SSOT. This
 * helper does not import config or read env, so tests and both harnesses exercise one identical seam.
 *
 * @param {Object} params
 * @param {Object} params.config Resolved `stopHook.projection` config subtree.
 * @param {Date|Number|String} params.now Injected reader clock.
 * @returns {Object} {@link readHookProjection} result.
 */
export function readConfiguredHookProjection({config, now} = {}) {
    return readHookProjection({
        projectionPath : config?.path,
        attestedBinding: {
            targetId          : config?.targetId,
            capability        : config?.capability,
            agentId           : config?.agentId,
            harnessType       : config?.harnessType,
            instanceKeyDigest : config?.instanceKeyDigest,
            workspaceKeyDigest: config?.workspaceKeyDigest
        },
        budget: {
            maxRows : config?.maxRows,
            maxBytes: config?.maxBytes
        },
        now
    })
}

/**
 * @summary Appends non-empty projection rendering without changing the existing hook directive.
 * @param {String} directive Existing Stop-hook reason/directive.
 * @param {String} projectionRender Bounded reader output.
 * @returns {String}
 */
export function appendHookProjection(directive, projectionRender) {
    return isNonEmptyString(projectionRender)
        ? `${directive}\n\n${projectionRender}`
        : directive
}
