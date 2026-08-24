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
 * ## Measured — and the instrument is named, because two of them disagree by exactly the residual
 *
 * **Static module-graph walk** (the discipline the sibling spec enforces):
 *
 *     ai/services.mjs        273 files    22 externals    2 cloud-only: chromadb, @google/generative-ai
 *     ai/services.host.mjs    90 files    14 externals    none
 *
 * The host set is `child_process crypto dotenv fs fs-extra gray-matter js-yaml os path semver url
 * util ws zod`. The boundary is by grouping, not by rewriting the services.
 *
 * **Runtime record-and-allow resolve hook** over `ai/services.mjs` reports **23**, with a *third*
 * cloud package: `better-sqlite3`.
 *
 * That one-package gap is not a discrepancy to reconcile — it IS this file's residual, stated as a
 * number. `SQLite.mjs` reaches `better-sqlite3` through `await import()` inside `initAsync()`, so no
 * static walk can see it, yet it still loads on barrel import because the singleton is eager and
 * `initAsync` runs on the next microtask. Quoting a runtime count and a static count as one figure
 * hides precisely the half that is not yet proven, so both are labelled here and neither is rounded
 * into the other.
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

// --- Inherited boot-policy compatibility: ONE owning site, and it is debt ---
//
// The pre-split `ai/services.mjs` applied this at import time, so every consumer of the old barrel
// inherited it. This file is now the single owning site: `ai/services.mjs` imports this module, so
// the cloud root inherits the same policy without repeating the write.
//
// **This is preserved debt, not architecture.** ADR 0019 B4 (ticket-ref-ok: the ADR is the authority
// that makes this a KNOWN violation rather than an oversight; without the citation "debt" is
// unsupported) forbids runtime writes to the reactive
// config SSOT, and this is one. It survives because deleting it changes behaviour: `configBase.mjs`
// defaults `autoConnect` to `true`, `ConnectionService.initAsync()` is the sole automatic caller and
// gates on that value, and `mcp-server.mjs` — the canonical Neural Link host entrypoint — relies on
// it. `Server.boot()` awaits `ConnectionService.ready()` and never calls `ensureBridgeAndConnect()`
// itself, so the config value IS the connect decision. Flipping the leaf instead was proposed,
// probed, and falsified on exactly that entrypoint.
//
// Its retirement is a real lifecycle fork rather than a cleanup: some component must take explicit
// ownership of the connect decision before this write can go. The decision record for this barrel
// boundary carries the successor and its retirement trigger.
//
// The former GitHub Workflow `syncOnStartup` leaf and write are both retired. Native Graph corpus
// projection has one container-plane owner; retaining a dormant startup fork would recreate a
// second, unleased writer the moment an overlay enabled it.
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
