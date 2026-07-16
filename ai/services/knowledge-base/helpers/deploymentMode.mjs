/**
 * @summary Returns true when the Knowledge Base server is running in a remote tenant-ingestion profile.
 *
 * Remote deployments expose the push-based `ingest_source_files` facade and need remote
 * ingestion-state diagnostics for empty collections. The transport spelling is an implementation
 * detail; call sites depend on this semantic deployment predicate.
 *
 * @param {Object} aiConfig Resolved Knowledge Base MCP config.
 * @returns {Boolean} True when remote tenant-ingestion behavior should be enabled.
 */
export function isRemoteKnowledgeBaseDeployment(aiConfig) {
    return aiConfig.transport === 'streamable-http'
}
