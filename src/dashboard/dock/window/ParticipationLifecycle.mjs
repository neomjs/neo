import Base from '../../../core/Base.mjs';

/**
 * @module Neo.dashboard.dock.window.ParticipationLifecycle
 * @summary The lifecycle of the cross-window participation a dock Workspace composes for a published
 * `crossWindowSortGroup` (docking design record §2.3) — the one place that decides WHEN that
 * participation exists, beside the façade that owns the seams it reads.
 *
 * The façade's `dockParticipation` declaration is the collaborator's contract: `true` composes the
 * engine class, imported on first use so a single-window host never loads the coordinator chain;
 * `{module, ...seams}` composes a host subclass synchronously; an instance is adopted and stays its
 * creator's to destroy; `null` declines. This module turns the declaration into exactly one live
 * instance per set of BINDINGS — the window, the published identity and sort group, the workspace
 * set — and keeps the registered instance across every sync whose bindings did not change, so
 * ordinary projections never churn the coordinator's registry (the target registers inside the
 * participation's construct, keyed by the window and the sort group, so a changed binding means a
 * fresh instance rather than a mutated one). A host whose seams changed asks for a recompose; seam
 * identity is not a binding this module compares.
 */

/**
 * The participation configs a changed value re-composes over.
 * @type {String[]}
 */
const BINDING_KEYS = ['sortGroup', 'windowId', 'workspaceId', 'workspaceSet'];

/**
 * @summary Composes, keeps, re-composes or retires the workspace's participation against its
 * current bindings — idempotent, so every lifecycle seam calls it without bookkeeping.
 * @param {Neo.dashboard.dock.Workspace} workspace The façade whose `dockParticipation`, projection
 *     options, host seams and members this lifecycle reads and writes.
 * @param {Object} [options]
 * @param {Boolean} [options.recompose=false] Compose a fresh instance even under unchanged
 *     bindings — a host whose seams changed (a controller it created after construction) says so.
 * @returns {Promise<Neo.dashboard.dock.window.Participation|null>}
 */
export function syncParticipation(workspace, {recompose=false}={}) {
    let declaration = workspace.dockParticipation,
        options     = declaration ? workspace.getDockProjectionOptions() : null,
        sortGroup   = options?.crossWindowSortGroup ?? null,
        windowId    = workspace.windowId,
        current     = workspace.participation,
        bindings, promise;

    if (!sortGroup || windowId == null || workspace.isDestroyed) {
        retireParticipation(workspace);

        return workspace.participationPromise = Promise.resolve(null)
    }

    if (declaration instanceof Base) {
        if (current !== declaration) {
            retireParticipation(workspace);
            workspace.participation = declaration
        }

        return workspace.participationPromise = Promise.resolve(declaration)
    }

    bindings = {
        sortGroup,
        windowId,
        workspace,
        workspaceId : options.workspaceId ?? workspace.workspaceKey ?? workspace.id,
        workspaceSet: workspace.workspaceSet ?? null
    };

    if (!recompose && current && !current.isDestroyed && workspace.participationOwned &&
        BINDING_KEYS.every(key => current[key] === bindings[key])
    ) {
        return workspace.participationPromise ??= Promise.resolve(current)
    }

    retireParticipation(workspace);

    const adopt = instance => {
        workspace.participation      = instance;
        workspace.participationOwned = true;

        return instance
    };

    if (declaration === true) {
        promise = workspace.participationPromise = import('./Participation.mjs').then(({default: Participation}) =>
            workspace.isDestroyed || workspace.participationPromise !== promise
                ? null
                : adopt(Neo.create(Participation, {...workspace.getDockParticipationConfig(), ...bindings}))
        );

        return promise
    }

    const {module, ...declared} = declaration;

    return workspace.participationPromise = Promise.resolve(
        adopt(Neo.create(module, {...declared, ...workspace.getDockParticipationConfig(), ...bindings}))
    )
}

/**
 * @summary Destroys an owned participation, releases an adopted one, and clears the settled promise
 * so a stale lazy composition resolves to nothing.
 * @param {Neo.dashboard.dock.Workspace} workspace
 */
export function retireParticipation(workspace) {
    workspace.participationOwned && workspace.participation?.destroy();

    workspace.participation        = null;
    workspace.participationOwned   = false;
    workspace.participationPromise = null
}
