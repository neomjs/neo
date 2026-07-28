/**
 * @module test/playwright/unit/hooks/fixtures/hookProjection
 * @summary Builds a fresh typed hook projection through the real lifecycle and route producers.
 */

import {buildComputedRouteResult} from '../../../../../ai/services/graph/computedRouteResult.mjs';
import {buildLifecycleFrontier}   from '../../../../../ai/services/graph/lifecycleFrontier.mjs';

/**
 * @summary Builds one fresh `live-lane-awareness-projection.v1` fixture for a spawned hook.
 * @param {Object} params
 * @param {String} params.harnessType Categorical harness binding (`claude-code` or `codex`).
 * @param {Number} [params.now=Date.now()] Fixture clock.
 * @returns {Object}
 */
export function makeHookProjectionFixture({harnessType, now = Date.now()} = {}) {
    const capturedAt = new Date(now - 1_000).toISOString(),
          expiresAt  = new Date(now + 60_000).toISOString(),
          lifecycle  = buildLifecycleFrontier({
              scope: {
                  agentId        : '@neo-gpt',
                  harnessInstance: 'hook-test-instance',
                  resolution     : 'agent-instance'
              },
              status         : 'fresh',
              capturedAt,
              sourceWatermark: 'hook-lifecycle-watermark',
              expiresAt,
              coverage       : {
                  sources        : ['a2a-message-store'],
                  degradedSources: []
              },
              items: [{
                  id             : 'hook-lifecycle-action',
                  stage          : 'direct-message',
                  kind           : 'a2a-message',
                  state          : 'unread',
                  source         : 'a2a-message-store',
                  subjectId      : 'MESSAGE:hook-reader-proof',
                  headSha        : null,
                  actionableSince: capturedAt,
                  checkedAt      : capturedAt,
                  citations      : []
              }]
          }),
          route = buildComputedRouteResult({
              status            : 'fresh',
              capturedAt,
              sourceWatermark   : 'hook-route-watermark',
              expiresAt,
              routeVersion      : 'hook-route-v1',
              sourceManifestHash: 'hook-source-manifest',
              provenance        : {
                  producer        : 'GoldenPathSynthesizer',
                  runId           : 'hook-fixture-run',
                  algorithmVersion: 'test-v1',
                  citations       : []
              },
              freshness: {
                  status   : 'fresh',
                  checkedAt: capturedAt,
                  expiresAt
              },
              route: {
                  kind : 'computed-ranked',
                  items: [{
                      id       : 'issue-15315',
                      title    : 'Render the bounded hook projection',
                      score    : 9.5,
                      rank     : 1,
                      citations: []
                  }]
              }
          });

    return {
        schemaVersion: 'live-lane-awareness-projection.v1',
        publication  : {
            targetId          : `hook-test-${harnessType}`,
            fencingEpoch      : 1,
            generatedAt       : capturedAt,
            producerWatermarks: {
                'lifecycle-frontier': lifecycle.sourceWatermark,
                'computed-route'    : route.sourceWatermark
            }
        },
        consumerBinding: {
            capability        : 'self-awareness',
            agentId           : '@neo-gpt',
            harnessType,
            instanceKeyDigest : 'hook-test-instance',
            workspaceKeyDigest: 'hook-test-workspace',
            sessionId         : 'correlation-only',
            status            : 'attested',
            provenance        : {producer: 'MemoryCoreProjectionBroker'},
            assertedAt        : capturedAt,
            expiresAt,
            conflicts         : [],
            scopeResolution   : 'agent-instance'
        },
        lifecycleActions: {
            status         : 'fresh',
            sourceWatermark: lifecycle.sourceWatermark,
            capturedAt,
            expiresAt,
            envelope       : lifecycle,
            citations      : [],
            degradedReason : null
        },
        computedRoute: {
            status         : 'fresh',
            sourceWatermark: route.sourceWatermark,
            capturedAt,
            expiresAt,
            envelope       : route,
            citations      : [],
            degradedReason : null
        },
        contextViews: [],
        coverage    : {
            sources        : ['lifecycle-frontier', 'computed-route'],
            degradedSources: []
        },
        notAuthority: true
    }
}
