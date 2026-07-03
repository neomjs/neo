# Concept Spine Alias Cluster Report - 2026-07-02

Generated: 2026-07-02T21:30:00.000Z
Source DB: /Users/Shared/codex/neomjs/neo/.neo-ai-data/sqlite/memory-core-graph.sqlite

Detection only: this artifact performs no graph writes and does not choose canonical merges.

## Summary

- Semantic nodes scanned: 25824
- Graph edges scanned: 69571
- Alias clusters found: 2705
- Semantic nodes inside clusters: 6651
- Largest cluster size: 32
- Size distribution: 2:2070, 3:377, 4:144, 5:41, 6:29, 7:16, 8:6, 9:7, 10:4, 11:4, 12:2, 13:2, 17:1, 19:1, 32:1

## Known Probe Clusters

- Golden Path: 9 nodes, 18 disjoint neighbor signatures, canonical candidate `golden-path`
  - Nodes: `CLASS:GoldenPath`, `CONCEPT:Golden Path`, `CONCEPT:Golden Path Synthesis`, `CONCEPT:Golden Path synthesis`, `CONCEPT:Golden-Path`, `CONCEPT:GoldenPath`, `CONCEPT:Golden_Path`, `CONCEPT:golden-path`, `golden-path`
- Dream Pipeline: 19 nodes, 35 disjoint neighbor signatures, canonical candidate `dream-pipeline`
  - Nodes: `CLASS:Dream Pipeline`, `CLASS:Dream Service`, `CLASS:Dream-Pipeline`, `CLASS:DreamPipeline`, `CLASS:DreamService`, `CLASS:Neo.ai.DreamService`, `CLASS:Neo.ai.daemons.DreamService`, `CLASS:REM_Pipeline`, `CLASS:Sandman`, `CLASS:dreamService`, `CONCEPT:Dream Pipeline`, `CONCEPT:DreamPipeline`, `CONCEPT:REM pipeline`, `CONCEPT:REM-Pipeline`, `CONCEPT:REM-pipeline`, `CONCEPT:REM_Pipeline`, `CONCEPT:dream_pipeline`, `PROCESS:Dream_Pipeline`, `dream-pipeline`

## Top 25 Clusters

| Rank | Canonical candidate | Nodes | Keys | Edge signatures | Disjoint signatures |
|---:|---|---:|---:|---:|---:|
| 1 | `identity-binding` | 32 | 20 | 62 | 55 |
| 2 | `dream-pipeline` | 19 | 9 | 35 | 35 |
| 3 | `memory-core` | 17 | 6 | 72 | 70 |
| 4 | `agent-os` | 13 | 3 | 23 | 23 |
| 5 | `mcp-server` | 13 | 6 | 20 | 20 |
| 6 | `bridge-daemon` | 12 | 4 | 14 | 14 |
| 7 | `merge-invariant` | 12 | 5 | 10 | 7 |
| 8 | `neural-link` | 11 | 5 | 12 | 11 |
| 9 | `identity-roots` | 11 | 6 | 10 | 8 |
| 10 | `contract-ledger` | 11 | 1 | 5 | 5 |
| 11 | `flat-peer-team` | 11 | 3 | 4 | 4 |
| 12 | `knowledge-base` | 10 | 4 | 13 | 13 |
| 13 | `agent-harness` | 10 | 4 | 2 | 2 |
| 14 | `human-merge-gate` | 10 | 3 | 2 | 2 |
| 15 | `pull-request-workflow` | 10 | 2 | 0 | 0 |
| 16 | `golden-path` | 9 | 4 | 19 | 18 |
| 17 | `agent-identity` | 9 | 4 | 10 | 10 |
| 18 | `lane-state` | 9 | 5 | 6 | 6 |
| 19 | `object-permanence` | 9 | 4 | 4 | 4 |
| 20 | `session-sunset` | 9 | 3 | 4 | 4 |
| 21 | `x-family-review` | 9 | 5 | 1 | 1 |
| 22 | `daemon-mjs` | 9 | 3 | 1 | 1 |
| 23 | `orchestrator` | 8 | 5 | 67 | 67 |
| 24 | `integration-unified` | 8 | 5 | 5 | 5 |
| 25 | `neural-link-bridge` | 8 | 2 | 4 | 4 |

## Cluster Details

### 1. `identity-binding`

- Node count: 32
- Key count: 20
- Neighbor signatures: 62
- Shared signatures: 7
- Disjoint signatures: 55
- Nodes: `CLASS:IdentityBinding`, `CLASS:IdentityMismatch`, `CLASS:identity_mismatch`, `CONCEPT:AuthConfigMismatch`, `CONCEPT:AuthEnvMismatch`, `CONCEPT:AuthIdentityMisalignment`, `CONCEPT:AuthIdentityMismatch`, `CONCEPT:AuthProxyMisconfiguration`, `CONCEPT:Auth_Config_Mismatch`, `CONCEPT:Auth_Misalignment`, `CONCEPT:CREDENTIAL_BINDING`, `CONCEPT:Credential-Binding`, `CONCEPT:CredentialBindingConflict`, `CONCEPT:Credential_Binding`, `CONCEPT:Credential_Binding_Conflict`, `CONCEPT:Identity Mismatch`, `CONCEPT:Identity-Binding`, `CONCEPT:Identity-Mismatch`, `CONCEPT:IdentityBinding`, `CONCEPT:IdentityMismatch`, ... +12
- Keys: `agent-identity-conflict`, `auth-config-mismatch`, `auth-env-mismatch`, `auth-identity-misalignment`, `auth-identity-mismatch`, `auth-misalignment`, `auth-proxy-identity-mismatch`, `auth-proxy-misconfiguration`, `auth-trust-proxy-identity-mismatch`, `credential-binding`, `credential-binding-conflict`, `credential-divergence`, `identity-binding`, `identity-binding-conflict`, `identity-binding-constraint`, `identity-binding-propagation`, `identity-mismatch`, `identity-mismatch-falsifier`, `identity-mismatch-neo-opus-ada-vs-neo-gpt`, `proxy-identity-auth-mismatch`

### 2. `dream-pipeline`

- Node count: 19
- Key count: 9
- Neighbor signatures: 35
- Shared signatures: 0
- Disjoint signatures: 35
- Nodes: `CLASS:Dream Pipeline`, `CLASS:Dream Service`, `CLASS:Dream-Pipeline`, `CLASS:DreamPipeline`, `CLASS:DreamService`, `CLASS:Neo.ai.DreamService`, `CLASS:Neo.ai.daemons.DreamService`, `CLASS:REM_Pipeline`, `CLASS:Sandman`, `CLASS:dreamService`, `CONCEPT:Dream Pipeline`, `CONCEPT:DreamPipeline`, `CONCEPT:REM pipeline`, `CONCEPT:REM-Pipeline`, `CONCEPT:REM-pipeline`, `CONCEPT:REM_Pipeline`, `CONCEPT:dream_pipeline`, `PROCESS:Dream_Pipeline`, `dream-pipeline`
- Keys: `dream-pipeline`, `dream-pipeline-rem-sandman`, `dream-service`, `dream-service-rem-cycle`, `neo-ai-daemons-dream-service`, `neo-ai-dream-service`, `rem-pipeline`, `sandman`, `tri-vector-session-ingestion`

### 3. `memory-core`

- Node count: 17
- Key count: 6
- Neighbor signatures: 72
- Shared signatures: 2
- Disjoint signatures: 70
- Nodes: `CLASS:Memory Core`, `CLASS:Memory Core server`, `CLASS:Memory-Core`, `CLASS:MemoryCore`, `CLASS:MemoryCoreServer`, `CLASS:Memory_Core`, `CLASS:Neo Memory Core`, `CLASS:Neo.Memory.Core`, `CLASS:memory core`, `CLASS:memory-core`, `CONCEPT:MEMORY_CORE`, `CONCEPT:Memory Core`, `CONCEPT:Memory-Core`, `CONCEPT:MemoryCore`, `CONCEPT:Memory_Core`, `CONCEPT:memory-core`, `memory-core`
- Keys: `gpt-memory-core`, `memory-core`, `memory-core-episodic-memory`, `memory-core-mc`, `memory-core-server`, `neo-memory-core`

### 4. `agent-os`

- Node count: 13
- Key count: 3
- Neighbor signatures: 23
- Shared signatures: 0
- Disjoint signatures: 23
- Nodes: `CLASS:Agent OS`, `CLASS:Agent-OS`, `CLASS:Agent-OS substrate`, `CLASS:AgentOS`, `CLASS:Agent_OS`, `CLASS:agent-os`, `CONCEPT:Agent OS`, `CONCEPT:Agent OS substrate`, `CONCEPT:Agent-OS`, `CONCEPT:AgentOS`, `CONCEPT:Agent_OS`, `CONCEPT:agent-os`, `agent-os`
- Keys: `agent-os`, `agent-os-substrate`, `ai-native-architecture-agent-os`

### 5. `mcp-server`

- Node count: 13
- Key count: 6
- Neighbor signatures: 20
- Shared signatures: 0
- Disjoint signatures: 20
- Nodes: `CLASS:KLARSO_MCP`, `CLASS:MCP server`, `CLASS:MCP-server`, `CLASS:McpServer`, `CLASS:klarso_mcp`, `CLASS:mcp-server`, `CLASS:mcp-server.mjs`, `CLASS:mcp__klarso_*`, `CLASS:mcp_server`, `CONCEPT:MCP Server`, `CONCEPT:MCP server`, `CONCEPT:MCP-server`, `CONCEPT:mcp-server`
- Keys: `klarso-mcp`, `klarso-mcp-namespace`, `klarso-mcp-server`, `mcp-klarso`, `mcp-server`, `mcp-server-mjs`

### 6. `bridge-daemon`

- Node count: 12
- Key count: 4
- Neighbor signatures: 14
- Shared signatures: 0
- Disjoint signatures: 14
- Nodes: `CLASS:Bridge Daemon`, `CLASS:Bridge daemon`, `CLASS:BridgeDaemon`, `CLASS:Bridge_Daemon`, `CLASS:bridge daemon`, `CLASS:bridge-daemon`, `CLASS:bridge-daemon.mjs`, `CLASS:bridge/daemon.mjs`, `CLASS:bridgeDaemon`, `CLASS:bridge_daemon`, `CONCEPT:bridge daemon`, `CONCEPT:bridge-daemon`
- Keys: `bridge-daemon`, `bridge-daemon-mjs`, `bridge-daemon-shape-c`, `bridge-daemon-v1`

### 7. `merge-invariant`

- Node count: 12
- Key count: 5
- Neighbor signatures: 10
- Shared signatures: 3
- Disjoint signatures: 7
- Nodes: `CONCEPT:HUMAN_MERGE_INVARIANT`, `CONCEPT:Human-Only Merge Invariant`, `CONCEPT:Human-Only-Merge-Invariant`, `CONCEPT:Human-only_Merge_Invariant`, `CONCEPT:Human_Merge_Invariant`, `CONCEPT:Human_Only_Merge_Invariant`, `CONCEPT:MERGE_INVARIANT`, `CONCEPT:human-merge-invariant`, `CONCEPT:human-only-merge-invariant`, `CONCEPT:human_merge_invariant`, `CONCEPT:merge invariant`, `CONCEPT:merge-invariant`
- Keys: `0-human-only-merge-invariant`, `human-merge-invariant`, `human-only-merge-invariant`, `merge-authority-protocol`, `merge-invariant`

### 8. `neural-link`

- Node count: 11
- Key count: 5
- Neighbor signatures: 12
- Shared signatures: 1
- Disjoint signatures: 11
- Nodes: `CLASS:Neural Link`, `CLASS:NeuralLink`, `CLASS:NeuralLinkWindowService`, `CLASS:neural-link`, `CLASS:neuralLink`, `CONCEPT:Neural Link`, `CONCEPT:Neural-Link`, `CONCEPT:NeuralLink`, `CONCEPT:neural-link`, `CONCEPT:neuralLink`, `neural-link`
- Keys: `neural-link`, `neural-link-nl`, `neural-link-web-socket-bridge`, `neural-link-window-operations`, `neural-link-window-service`

### 9. `identity-roots`

- Node count: 11
- Key count: 6
- Neighbor signatures: 10
- Shared signatures: 2
- Disjoint signatures: 8
- Nodes: `CLASS:IdentityRoots`, `CLASS:Neo.identityRoots`, `CLASS:ai.graph.identityRoots`, `CLASS:ai/graph/identityRoots.mjs`, `CLASS:ai_graph_identityRoots`, `CLASS:identityRoots`, `CLASS:identityRoots.mjs`, `CLASS:identityRoots_mjs`, `CONCEPT:identity roots`, `CONCEPT:identityRoots`, `CONCEPT:identity_roots`
- Keys: `ai-graph-identity-roots`, `ai-graph-identity-roots-mjs`, `identity-roots`, `identity-roots-mjs`, `identity-roots-module`, `neo-identity-roots`

### 10. `contract-ledger`

- Node count: 11
- Key count: 1
- Neighbor signatures: 5
- Shared signatures: 0
- Disjoint signatures: 5
- Nodes: `CLASS:Contract Ledger`, `CLASS:Contract-Ledger`, `CLASS:ContractLedger`, `CLASS:contract ledger`, `CLASS:contract-ledger`, `CONCEPT:Contract Ledger`, `CONCEPT:Contract-Ledger`, `CONCEPT:ContractLedger`, `CONCEPT:Contract_Ledger`, `CONCEPT:contract ledger`, `CONCEPT:contract-ledger`
- Keys: `contract-ledger`

### 11. `flat-peer-team`

- Node count: 11
- Key count: 3
- Neighbor signatures: 4
- Shared signatures: 0
- Disjoint signatures: 4
- Nodes: `CONCEPT:Flat Peer-Team`, `CONCEPT:Flat Peer-Team Model`, `CONCEPT:Flat Peer-Team model`, `CONCEPT:Flat-Peer-Team-Model`, `CONCEPT:FlatPeerTeam`, `CONCEPT:FlatPeerTeamModel`, `CONCEPT:SWARM_TOPOLOGY`, `CONCEPT:Swarm Topology`, `CONCEPT:flat-peer-team`, `CONCEPT:swarm-topology`, `CONCEPT:swarm_topology`
- Keys: `flat-peer-team`, `flat-peer-team-model`, `swarm-topology`

### 12. `knowledge-base`

- Node count: 10
- Key count: 4
- Neighbor signatures: 13
- Shared signatures: 0
- Disjoint signatures: 13
- Nodes: `CLASS:Knowledge Base`, `CLASS:KnowledgeBase`, `CLASS:knowledge-base`, `CLASS:knowledgeBase`, `CLASS:knowledge_base`, `CONCEPT:Knowledge Base`, `CONCEPT:KnowledgeBase`, `CONCEPT:knowledge-base`, `CONCEPT:knowledgeBase`, `knowledge-base`
- Keys: `knowledge-base`, `knowledge-base-distribution`, `knowledge-base-kb`, `knowledge-base-semantic-rag`

### 13. `agent-harness`

- Node count: 10
- Key count: 4
- Neighbor signatures: 2
- Shared signatures: 0
- Disjoint signatures: 2
- Nodes: `CLASS:Agent Harness`, `CLASS:AgentHarness`, `CLASS:Agent_Harness`, `CLASS:agent harness`, `CLASS:agent-harness`, `CONCEPT:Agent Harness`, `CONCEPT:AgentHarness`, `CONCEPT:agent harness`, `CONCEPT:agent-harness`, `CONCEPT:agent_harness`
- Keys: `agent-harness`, `agent-harness-coordination`, `agent-harness-framework`, `agent-harness-workflow`

### 14. `human-merge-gate`

- Node count: 10
- Key count: 3
- Neighbor signatures: 2
- Shared signatures: 0
- Disjoint signatures: 2
- Nodes: `CLASS:human-merge-gate`, `CONCEPT:Human-Only Merge Boundary`, `CONCEPT:HumanMergeGate`, `CONCEPT:Human_Merge_Gate`, `CONCEPT:human merge gate`, `CONCEPT:human merge-gate`, `CONCEPT:human-merge gate`, `CONCEPT:human-merge-gate`, `CONCEPT:human-only merge gate`, `CONCEPT:human-only-merge-gate`
- Keys: `human-merge-gate`, `human-only-merge-boundary`, `human-only-merge-gate`

### 15. `pull-request-workflow`

- Node count: 10
- Key count: 2
- Neighbor signatures: 0
- Shared signatures: 0
- Disjoint signatures: 0
- Nodes: `CLASS:Pull Request workflow`, `CLASS:PullRequestWorkflow`, `CLASS:pull-request workflow`, `CLASS:pull-request-workflow`, `CLASS:pull-request-workflow.md`, `CONCEPT:Pull Request Workflow`, `CONCEPT:Pull Request workflow`, `CONCEPT:pull request workflow`, `CONCEPT:pull-request workflow`, `CONCEPT:pull-request-workflow`
- Keys: `pull-request-workflow`, `pull-request-workflow-md`

### 16. `golden-path`

- Node count: 9
- Key count: 4
- Neighbor signatures: 19
- Shared signatures: 1
- Disjoint signatures: 18
- Nodes: `CLASS:GoldenPath`, `CONCEPT:Golden Path`, `CONCEPT:Golden Path Synthesis`, `CONCEPT:Golden Path synthesis`, `CONCEPT:Golden-Path`, `CONCEPT:GoldenPath`, `CONCEPT:Golden_Path`, `CONCEPT:golden-path`, `golden-path`
- Keys: `golden-path`, `golden-path-gp-ranking-engine`, `golden-path-rlaif-slm`, `golden-path-synthesis`

### 17. `agent-identity`

- Node count: 9
- Key count: 4
- Neighbor signatures: 10
- Shared signatures: 0
- Disjoint signatures: 10
- Nodes: `CLASS:AgentIdentity`, `CLASS:AgentIdentityScope`, `CLASS:agentIdentity`, `CLASS:agentIdentity_Scope`, `CONCEPT:Agent Identity`, `CONCEPT:AgentIdentity`, `CONCEPT:agent identity`, `CONCEPT:agent-identity`, `CONCEPT:agentIdentity`
- Keys: `agent-identity`, `agent-identity-scope`, `agent-identity-scope-param`, `agent-identity-scope-parameter`

### 18. `lane-state`

- Node count: 9
- Key count: 5
- Neighbor signatures: 6
- Shared signatures: 0
- Disjoint signatures: 6
- Nodes: `CLASS:lane-state`, `CONCEPT:LANE_STATE`, `CONCEPT:Lane State`, `CONCEPT:LaneState`, `CONCEPT:lane state`, `CONCEPT:lane-state`, `CONCEPT:lane-state management`, `CONCEPT:lane-state-management`, `CONCEPT:lane_state`
- Keys: `lane-state`, `lane-state-emission-substrate`, `lane-state-management`, `lane-state-matrix`, `lane-state-verified-empty`

### 19. `object-permanence`

- Node count: 9
- Key count: 4
- Neighbor signatures: 4
- Shared signatures: 0
- Disjoint signatures: 4
- Nodes: `CONCEPT:OBJECT_PERMANENCE`, `CONCEPT:Object-Permanence`, `CONCEPT:Object_Permanence`, `CONCEPT:object-permanence`, `CONCEPT:object-permanence-of-identity`, `CONCEPT:object-permanent selves`, `CONCEPT:object-permanent-selves`, `CONCEPT:object_permanence`, `object-permanence`
- Keys: `object-permanence`, `object-permanence-of-identity`, `object-permanent-self-continuity`, `object-permanent-selves`

### 20. `session-sunset`

- Node count: 9
- Key count: 3
- Neighbor signatures: 4
- Shared signatures: 0
- Disjoint signatures: 4
- Nodes: `CLASS:session-sunset`, `CLASS:session-sunset-skill`, `CONCEPT:Session Sunset`, `CONCEPT:Session Sunset Protocol`, `CONCEPT:Session-Sunset`, `CONCEPT:SessionSunset`, `CONCEPT:session-sunset`, `CONCEPT:session-sunset protocol`, `CONCEPT:session-sunset skill`
- Keys: `session-sunset`, `session-sunset-protocol`, `session-sunset-skill`

### 21. `x-family-review`

- Node count: 9
- Key count: 5
- Neighbor signatures: 1
- Shared signatures: 0
- Disjoint signatures: 1
- Nodes: `CONCEPT:Cross-Family-Review`, `CONCEPT:CrossFamilyReview`, `CONCEPT:X-FAMILY_REVIEW`, `CONCEPT:cross-family review`, `CONCEPT:cross-family review gate`, `CONCEPT:cross-family-review`, `CONCEPT:cross-family-review-gate`, `CONCEPT:cross_family_policy`, `concept:cross_family_review`
- Keys: `cross-family-policy`, `cross-family-review`, `cross-family-review-gate`, `cross-family-review-mandate`, `x-family-review`

### 22. `daemon-mjs`

- Node count: 9
- Key count: 3
- Neighbor signatures: 1
- Shared signatures: 0
- Disjoint signatures: 1
- Nodes: `CLASS:Codex wake app-server adapter`, `CLASS:Wake.Daemon`, `CLASS:daemon.mjs`, `CLASS:wake daemon`, `CLASS:wake-daemon`, `CLASS:wake.daemon`, `CLASS:wakeDaemon`, `CONCEPT:wake daemon`, `CONCEPT:wake-daemon`
- Keys: `codex-wake-app-server-adapter`, `daemon-mjs`, `wake-daemon`

### 23. `orchestrator`

- Node count: 8
- Key count: 5
- Neighbor signatures: 67
- Shared signatures: 0
- Disjoint signatures: 67
- Nodes: `CLASS:Neo.ai.agent.Orchestrator`, `CLASS:Neo.ai.daemons.Orchestrator`, `CLASS:Neo.ai.daemons.orchestrator`, `CLASS:Orchestrator`, `CLASS:Orchestrator_Service`, `CLASS:orchestrator`, `CONCEPT:Orchestrator`, `CONCEPT:orchestrator`
- Keys: `neo-ai-agent-orchestrator`, `neo-ai-daemons-orchestrator`, `orchestrator`, `orchestrator-service`, `the-orchestrator`

### 24. `integration-unified`

- Node count: 8
- Key count: 5
- Neighbor signatures: 5
- Shared signatures: 0
- Disjoint signatures: 5
- Nodes: `CONCEPT:INTEGRATION_UNIFIED`, `CONCEPT:Integration_Unified`, `CONCEPT:Integration_Unified_CI`, `CONCEPT:Integration_Unified_Test`, `CONCEPT:Integration_Unified_Validation`, `CONCEPT:integration-unified`, `CONCEPT:integration-unified CI`, `CONCEPT:integration_unified`
- Keys: `integration-unified`, `integration-unified-ci`, `integration-unified-ci-suite`, `integration-unified-test`, `integration-unified-validation`

### 25. `neural-link-bridge`

- Node count: 8
- Key count: 2
- Neighbor signatures: 4
- Shared signatures: 0
- Disjoint signatures: 4
- Nodes: `CLASS:Neural Link Bridge`, `CLASS:Neural Link bridge`, `CLASS:NeuralLinkBridge`, `CLASS:NeuralLink_Bridge`, `CLASS:neuralLinkBridge`, `CONCEPT:Neural Link Bridge`, `CONCEPT:neural-link bridge`, `CONCEPT:neural-link-bridge`
- Keys: `neural-link-bridge`, `neural-link-topology-inspector`
