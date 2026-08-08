import 'dotenv/config';
import path            from 'path';
import {fileURLToPath} from 'url';

import Neo       from '../src/Neo.mjs';
import * as core from '../src/core/_export.mjs';

import {makeSafe, safeLoadYaml} from './services/shared/serviceProxy.mjs';


/**
 * @module ai/services.host
 * @summary The HOST-plane SDK barrel: every service a process running outside the container may use,
 * and nothing that can reach a durable store.
 *
 * ## The property this file exists to hold
 *
 * > A host-side entrypoint must be UNABLE TO CONSTRUCT A DURABLE STORE HANDLE BY IMPORT ALONE.
 *
 * `ai/services.mjs` unified two planes that no longer execute together. A host process importing it
 * eagerly reaches `chromadb` (statically, via the KB `ChromaManager`) and `@google/generative-ai`
 * (statically, via `ai/provider/Gemini.mjs`) — and, through an eager singleton whose `initAsync`
 * defers only syntactically, `better-sqlite3`. None of those exist in the host plane.
 *
 * Measured: the full barrel resolves 23 external packages, three of them cloud-only. The set below
 * resolves eleven, none of them cloud-only — `child_process crypto fs fs-extra gray-matter os path
 * semver url util ws`. The boundary is by grouping, not by rewriting the services.
 *
 * ## Why the membership is what it is
 *
 * Host plane = the surfaces a process on the operator's machine drives: the stdio MCP servers
 * (neural-link, github-workflow), their GitLab sibling, and the shared destructive-operation guard.
 * Cloud plane = Knowledge Base, Memory Core, Chroma, the graph store, and the Dream pipeline, which
 * live in containers and keep `ai/services.mjs` as their composition root.
 *
 * The split axis is the export-prefix vocabulary the barrel already used, and the consumer graph
 * agrees with it independently: of 114 importers of `ai/services.mjs`, 79 use only cloud exports and
 * 22 only host ones. Exactly five span both, and four of those are already-condemned demo/example
 * debt — so the boundary was latent in the code before it was written down.
 *
 * ## What this file must never gain
 *
 * A re-export of anything from `ai/services.mjs`, or a direct import of a KB / Memory Core service.
 * Either restores the reachability this file removes, and does so invisibly — the failure would be a
 * host process that boots fine on a developer machine with the packages installed and dies in the
 * host plane where they are absent.
 */

import Shared_DestructiveOperationGuard from './mcp/server/shared/services/DestructiveOperationGuard.mjs';
import GH_Config                        from './mcp/server/github-workflow/config.mjs';
import _GH_HealthService                from './services/github-workflow/HealthService.mjs';
import _GH_IssueService                 from './services/github-workflow/IssueService.mjs';
import _GH_LabelService                 from './services/github-workflow/LabelService.mjs';
import _GH_LocalFileService             from './services/github-workflow/LocalFileService.mjs';
import _GH_PullRequestService           from './services/github-workflow/PullRequestService.mjs';
import GH_PullRequestHistoryService     from './services/github-workflow/PullRequestHistoryService.mjs';
import _GH_RepositoryService            from './services/github-workflow/RepositoryService.mjs';
import _GH_SyncService                  from './services/github-workflow/SyncService.mjs';
import _GL_IssueService                 from './services/gitlab-workflow/IssueService.mjs';
import _GL_MergeRequestService          from './services/gitlab-workflow/MergeRequestService.mjs';
import _NeuralLink_ComponentService     from './services/neural-link/ComponentService.mjs';
import _NeuralLink_ConnectionService    from './services/neural-link/ConnectionService.mjs';
import _NeuralLink_DataService          from './services/neural-link/DataService.mjs';
import _NeuralLink_DockService          from './services/neural-link/DockService.mjs';
import _NeuralLink_HealthService        from './services/neural-link/HealthService.mjs';
import _NeuralLink_InstanceService      from './services/neural-link/InstanceService.mjs';
import _NeuralLink_InteractionService   from './services/neural-link/InteractionService.mjs';
import _NeuralLink_RuntimeService       from './services/neural-link/RuntimeService.mjs';
import NeuralLink_Config                from './mcp/server/neural-link/config.mjs';

// --- Import-time boot policy (carried from the pre-split barrel, NOT new) ---
//
// These two assignments were applied by `ai/services.mjs` before the split, so every consumer of the
// old barrel inherited them at import time. A host consumer migrating to this file must see the same
// initialization policy it had, or the split changes behaviour while claiming to be a regrouping.
//
// Dropping them is silent, which is why it must stay pinned here: this file already imports and
// re-exports both configs, so the export surface looks identical either way. `configBase.mjs`
// defaults `autoConnect` to `true`, and `ConnectionService.initAsync()` calls `ensureBridgeAndConnect()`
// while it stays true — so the omission does not fail at import, it spawns a Bridge at connect time.
// A missing export would fail loudly; this fails at connect time, in a process that booted clean.
GH_Config.data.syncOnStartup     = false;
NeuralLink_Config.data.autoConnect = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const ghSpec     = safeLoadYaml(path.join(__dirname, 'mcp/server/github-workflow/openapi.yaml'));
const nlSpec     = safeLoadYaml(path.join(__dirname, 'mcp/server/neural-link/openapi.yaml'));
const gitlabSpec = safeLoadYaml(path.join(__dirname, 'mcp/server/gitlab-workflow/openapi.yaml'));

// --- Apply Safety Wrappers ---

const GH_HealthService              = makeSafe(_GH_HealthService, ghSpec);
const GH_IssueService               = makeSafe(_GH_IssueService, ghSpec);
const GH_LabelService               = makeSafe(_GH_LabelService, ghSpec);
const GH_LocalFileService           = makeSafe(_GH_LocalFileService, ghSpec);
const GH_PullRequestService         = makeSafe(_GH_PullRequestService, ghSpec);
const GH_RepositoryService          = makeSafe(_GH_RepositoryService, ghSpec);
const GH_SyncService                = makeSafe(_GH_SyncService, ghSpec);
const GL_IssueService               = makeSafe(_GL_IssueService, gitlabSpec);
const GL_MergeRequestService        = makeSafe(_GL_MergeRequestService, gitlabSpec);
const NeuralLink_ConnectionService  = makeSafe(_NeuralLink_ConnectionService, nlSpec);
const NeuralLink_ComponentService   = makeSafe(_NeuralLink_ComponentService, nlSpec);
const NeuralLink_DataService        = makeSafe(_NeuralLink_DataService, nlSpec);
const NeuralLink_DockService        = makeSafe(_NeuralLink_DockService, nlSpec);
const NeuralLink_HealthService      = makeSafe(_NeuralLink_HealthService, nlSpec);
const NeuralLink_InstanceService    = makeSafe(_NeuralLink_InstanceService, nlSpec);
const NeuralLink_InteractionService = makeSafe(_NeuralLink_InteractionService, nlSpec);
const NeuralLink_RuntimeService     = makeSafe(_NeuralLink_RuntimeService, nlSpec);

export {
    GH_Config,
    GH_HealthService,
    GH_IssueService,
    GH_LabelService,
    GH_LocalFileService,
    GH_PullRequestHistoryService,
    GH_PullRequestService,
    GH_RepositoryService,
    GH_SyncService,
    GL_IssueService,
    GL_MergeRequestService,
    NeuralLink_ComponentService,
    NeuralLink_Config,
    NeuralLink_ConnectionService,
    NeuralLink_DataService,
    NeuralLink_DockService,
    NeuralLink_HealthService,
    NeuralLink_InstanceService,
    NeuralLink_InteractionService,
    NeuralLink_RuntimeService,
    Shared_DestructiveOperationGuard
};
