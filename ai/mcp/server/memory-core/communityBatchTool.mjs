import aiConfig                       from './config.mjs';
import CommunityBatchAdmissionService from '../../../services/memory-core/CommunityBatchAdmissionService.mjs';
import {
    carriesCredentialMaterial,
    carriesHostedAuthority,
    validateHostedEnvelope
} from '../../../services/memory-core/communityBatchContract.mjs';

const hostedCommunityToolNames = new Set([
    'admit_community_batch',
    'get_community_source_health'
]);

/**
 * @summary Normalizes optional MCP server prefixes before transport-gating tool names.
 * @param {String} toolName
 * @returns {String}
 */
const getEffectiveToolName = toolName => {
    const index = toolName.lastIndexOf('__');

    return index === -1 ? toolName : toolName.substring(index + 2)
};

/**
 * @summary Returns true when hosted community tools belong on the current MCP surface.
 * @param {String} [transport=aiConfig.transport]
 * @returns {Boolean}
 */
const areHostedCommunityToolsVisible = (transport=aiConfig.transport) => transport === 'streamable-http';

/**
 * @summary Fails closed when a local stdio client invokes the hosted connector facade.
 * @param {String} toolName
 * @param {String} [transport=aiConfig.transport]
 * @returns {void}
 */
const assertHostedCommunityToolAllowed = (toolName, transport=aiConfig.transport) => {
    if (hostedCommunityToolNames.has(getEffectiveToolName(toolName)) && !areHostedCommunityToolsVisible(transport)) {
        throw new Error(
            'Hosted community connector tools require the Memory Core streamable-http transport. ' +
            'Local workflows call CommunityBatchAdmissionService directly.'
        )
    }
};

/**
 * @summary Dispatches one authority-free connector envelope to server-resolved admission.
 * @param {Object} args
 * @returns {Object}
 */
const admitCommunityBatch = args => {
    const validation = validateHostedEnvelope(args);

    if (!validation.valid) {
        return {
            status: 'conflict',
            reason: 'HOSTED_BOUNDARY_REJECTED',
            code  : validation.errors.some(error => error.endsWith('_EXCEEDED'))
                ? 'COMMUNITY_BATCH_VOLUME_EXCEEDED'
                : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
            errors: validation.errors,
            volume: validation.volume
        }
    }

    return CommunityBatchAdmissionService.admitHostedBatch(args)
};

/**
 * @summary Validates the raw hosted tool arguments before OpenAPI normalization can strip unknown keys.
 *
 * Nested additional-properties handling is intentionally not trusted for authority: a caller that
 * submits tenantId/sourceInstanceId/registrationEpoch must receive a refusal, not have the field
 * silently removed and the remainder admitted.
 * @param {String} toolName
 * @param {Object} args
 * @returns {Object|null} Structured refusal, or null when dispatch may continue.
 */
const getHostedCommunityBoundaryRejection = (toolName, args) => {
    const effectiveToolName = getEffectiveToolName(toolName);

    if (effectiveToolName === 'get_community_source_health') {
        return carriesHostedAuthority(args) || carriesCredentialMaterial(args)
            ? {ready: false, code: 'COMMUNITY_SOURCE_IDENTITY_INVALID'}
            : null
    }

    if (effectiveToolName !== 'admit_community_batch') return null;

    const validation = validateHostedEnvelope(args);

    if (validation.valid) return null;

    return {
        status: 'conflict',
        reason: 'HOSTED_BOUNDARY_REJECTED',
        code  : validation.errors.some(error => error.endsWith('_EXCEEDED'))
            ? 'COMMUNITY_BATCH_VOLUME_EXCEEDED'
            : 'COMMUNITY_BATCH_ENVELOPE_INVALID',
        errors: validation.errors,
        volume: validation.volume
    }
};

/**
 * @summary Reads bounded readiness for one server-resolved community source.
 * @param {Object} args
 * @returns {Object}
 */
const getCommunitySourceHealth = args => CommunityBatchAdmissionService.getHostedSourceHealth(args);

export {
    admitCommunityBatch,
    areHostedCommunityToolsVisible,
    assertHostedCommunityToolAllowed,
    getHostedCommunityBoundaryRejection,
    getCommunitySourceHealth,
    hostedCommunityToolNames
};
