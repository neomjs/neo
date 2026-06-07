import path from 'path';
import Base from '../../../../../src/core/Base.mjs';

/**
 * @summary Error thrown when an MCP policy guard refuses a tool call.
 *
 * Carries a stable `POLICY_REFUSED` code plus a machine-readable `reason` so
 * `BaseServer.formatToolError()` can emit a structured refusal envelope while
 * preserving the normal MCP `isError: true` response contract.
 *
 * @class PolicyRefusedError
 * @extends Error
 */
export class PolicyRefusedError extends Error {
    /**
     * @param {Object} options
     * @param {String} options.reason Human-readable refusal reason.
     * @param {String} [options.policyId] Stable policy identifier.
     * @param {String} [options.action] Tool action being refused.
     * @param {String} [options.tenet] Optional tenet/source identifier.
     * @param {Object} [options.details] Optional diagnostic details for tests/operators.
     */
    constructor({reason, policyId, action, tenet, details} = {}) {
        super(`POLICY_REFUSED: ${reason || 'Tool call refused by policy'}`);

        this.name     = 'PolicyRefusedError';
        this.code     = 'POLICY_REFUSED';
        this.reason   = reason || 'Tool call refused by policy';
        this.policyId = policyId;
        this.action   = action;
        this.tenet    = tenet;
        this.details  = details;
    }
}

/**
 * @summary Shared MCP tool-boundary policy helpers.
 *
 * This is intentionally a tiny hardcoded v0 policy helper, not a runtime policy
 * config substrate. If future policy needs operator-configurable leaves, add
 * them to AiConfig and read resolved leaves at the use site.
 *
 * @class Neo.ai.mcp.server.shared.services.PolicyService
 * @extends Neo.core.Base
 * @singleton
 */
class PolicyService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.mcp.server.shared.services.PolicyService'
         * @protected
         */
        className: 'Neo.ai.mcp.server.shared.services.PolicyService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Throws a structured policy-refusal error.
     *
     * @param {Object} options
     * @throws {PolicyRefusedError}
     */
    refuse(options = {}) {
        throw new PolicyRefusedError(options);
    }

    /**
     * @summary Refuses an exact repo-root file write through the MCP file-system server.
     *
     * The guard compares resolved absolute paths through a case-normalized
     * policy key. This keeps macOS/Windows case-insensitive filesystems from
     * allowing case-variant writes to the same protected file while preserving
     * the original resolved paths in refusal diagnostics. Missing path
     * arguments fall through to the normal OpenAPI/Zod validation layer instead
     * of being misclassified as policy.
     *
     * @param {Object} options
     * @param {String} options.toolName The incoming MCP tool name.
     * @param {Object} options.args Incoming tool arguments.
     * @param {String} [options.expectedToolName='write_file'] Tool name to guard.
     * @param {String} [options.pathArg='absolutePath'] Argument containing the target path.
     * @param {String} options.protectedRelativePath Repo-root relative protected path.
     * @param {String} [options.repoRoot=process.cwd()] Repository root.
     * @param {String} options.policyId Stable policy identifier.
     * @param {String} options.reason Human-readable refusal reason.
     * @param {String} [options.tenet] Optional tenet/source identifier.
     * @throws {PolicyRefusedError} When the call targets the protected path.
     */
    assertProtectedRepoRootWrite({
        toolName,
        args,
        expectedToolName = 'write_file',
        pathArg = 'absolutePath',
        protectedRelativePath,
        repoRoot = process.cwd(),
        policyId,
        reason,
        tenet
    } = {}) {
        if (toolName !== expectedToolName || !args?.[pathArg] || !protectedRelativePath) {
            return;
        }

        const protectedPath    = path.resolve(repoRoot, protectedRelativePath);
        const targetPath       = path.resolve(args[pathArg]);
        const protectedPathKey = protectedPath.toLowerCase();
        const targetPathKey    = targetPath.toLowerCase();

        if (targetPathKey !== protectedPathKey) {
            return;
        }

        this.refuse({
            policyId,
            reason,
            tenet,
            action : toolName,
            details: {
                pathArg,
                protectedPath,
                targetPath
            }
        });
    }
}

export default Neo.setupClass(PolicyService);
