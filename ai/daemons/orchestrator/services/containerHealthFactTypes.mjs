/**
 * @module ai/daemons/orchestrator/services/containerHealthFactTypes
 * @summary The container-health fact and action vocabularies, Neo-free on purpose.
 *
 * These live apart from `ContainerHealthDiagnosisService` so a PURE consumer can name a fact type
 * without importing a `Neo.core.Base` subclass. The service re-exports both, so every existing
 * importer is unaffected and there is still exactly one definition.
 *
 * The alternative was a consumer re-typing `'memory-saturation'` as a literal, which is a second
 * declaration of the vocabulary that drifts silently the first time a name changes — and a helper
 * that pulls the whole class graph in just to compare a string pays a Neo bootstrap for a constant.
 */

export const CONTAINER_HEALTH_FACT_TYPES = Object.freeze({
    configDrift               : 'config-drift',
    containerDown             : 'container-down',
    containerUnhealthy        : 'container-unhealthy',
    endpointProbeFailed       : 'endpoint-probe-failed',
    evalContention            : 'ollama-eval-contention',
    heapObservationUnavailable: 'heap-observation-unavailable',
    memorySaturation          : 'memory-saturation',
    ollamaResidualLoad        : 'ollama-residual-load',
    providerLaneShape         : 'provider-lane-shape-diverged',
    providerResidency         : 'provider-residency-degraded',
    resourceSaturation        : 'resource-saturation',
    restartChurn              : 'restart-churn',
    runtimeReadFailed         : 'runtime-read-failed'
});

export const CONTAINER_HEALTH_ACTION_CLASSES = Object.freeze({
    raiseCeiling: 'raise-ceiling',
    record      : 'record',
    restart     : 'restart',
    throttleShed: 'throttle-shed',
    warmProvider: 'warm-provider'
});
