import DockWorkspace from '../../../../../src/dashboard/dock/Workspace.mjs';
import StateProvider from '../../../../../src/state/Provider.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';
import Pane          from './Pane.mjs';
import '../../../../../src/tab/Container.mjs';

let lazyRequests = 0;

const loadLazyPane = () => {
    lazyRequests++;
    return import('./LazyPane.mjs')
}, paneKeys = ['alpha', 'beta', 'summary', 'lazyTab', 'lazyRail'];

/**
 * @class Test.Playwright.Component.DockAuthoring.Workspace
 * @extends Neo.dashboard.dock.Workspace
 * @summary Config-only consumer: the engine seeds, resolves and preserves every declared pane.
 */
class AuthoringWorkspace extends DockWorkspace {
    static config = {
        className    : 'Test.Playwright.Component.DockAuthoring.Workspace',
        id           : 'dock-authoring-workspace',
        layout       : {ntype: 'vbox', align: 'stretch'},
        stateProvider: {
            module: StateProvider,
            data  : {alphaText: 'Alpha initial', betaText: 'Beta initial'}
        },
        panes: {
            alpha: {
                module: Pane,
                header: {text: 'Alpha'},
                bind  : {text: data => data.alphaText}
            },
            beta: {
                module: Pane,
                header: {text: 'Beta'},
                bind  : {text: data => data.betaText}
            },
            summary : {ntype: 'component', header: {text: 'Summary'}, text: 'Summary content'},
            lazyTab : {module: loadLazyPane, header: {text: 'Lazy tab'}, text: 'Lazy tab initial'},
            lazyRail: {
                module    : loadLazyPane,
                header    : {text: 'Lazy rail'},
                text      : 'Lazy rail initial',
                autoHidden: true
            }
        },
        zones: {
            center: {
                id         : 'center-split',
                orientation: 'horizontal',
                sizes      : [0.6, 0.4],
                children   : [
                    {id: 'main-tabs', items: ['alpha', 'lazyTab'], activeItemId: 'alpha'},
                    {id: 'summary-tabs', items: ['summary']}
                ]
            },
            right: {id: 'edge-tabs', items: ['beta', 'lazyRail'], activeItemId: 'beta', extent: 0.3}
        }
    }
}

AuthoringWorkspace = Neo.setupClass(AuthoringWorkspace);

/**
 * @class Test.Playwright.Component.DockAuthoring.Harness
 * @extends Neo.container.Viewport
 * @summary Separate test driver; the consumer above owns no test or lifecycle hooks.
 */
class AuthoringHarness extends Viewport {
    static config = {
        className     : 'Test.Playwright.Component.DockAuthoring.Harness',
        id            : 'dock-authoring-harness',
        commandJson_  : null,
        commandResult_: null,
        items         : [{module: AuthoringWorkspace, flex: 1}]
    }

    /** @member {Object<String,String>} observedIds={} */
    observedIds = {}

    /** @member {Object|null} capturedDocument=null */
    capturedDocument = null

    /**
     * @summary Dispatches commands through ordinary host APIs and reports asynchronous completion.
     * @param {String|null} value
     * @param {String|null} oldValue
     */
    afterSetCommandJson(value, oldValue) {
        if (oldValue === undefined || !value) return;
        const command = JSON.parse(value);

        this.runCommand(command).catch(error => {
            this.commandResult = {sequence: command.sequence, failure: error.message}
        })
    }

    /**
     * @summary Awaits the final projection, including a replacement repair promise.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @returns {Promise<void>}
     */
    async settle(workspace) {
        let tail;

        do {
            tail = workspace.refreshPromise;
            await tail
        } while (tail !== workspace.refreshPromise)
    }

    /**
     * @summary Exercises public operations without installing a consumer resolver or projection hook.
     * @param {Object} command
     * @returns {Promise<void>}
     */
    async runCommand(command) {
        const workspace = Neo.get('dock-authoring-workspace');
        await this.settle(workspace);
        const documentBefore = workspace.dockModel,
              refreshBefore  = workspace.refreshPromise;
        let result = {errors: []};

        if (command.action === 'captureDocument') {
            this.capturedDocument = workspace.dockModel
        } else if (command.action === 'operation') {
            result = workspace.applyDockZoneOperation(command.descriptor);
            if (!result.errors.length) {
                await workspace.onDockZoneDocumentChange(result.document, command.descriptor, workspace)
            }
        } else if (command.action === 'open') {
            result = await workspace.openPane(command.itemId, command.target)
        } else if (command.action === 'mark') {
            const pane = workspace.resolvePane(command.itemId, workspace.dockModel.items[command.itemId]);
            if (!pane?.isConstructed) throw new Error(`Pane ${command.itemId} is not live`);
            pane.transientNote = command.value;
            if (command.text !== undefined) pane.text = command.text
        } else if (command.action === 'state') {
            workspace.getStateProvider().data[command.key] = command.value
        } else if (command.action === 'laterAssignment') {
            workspace.panes = {alpha: {ntype: 'component', text: 'Replacement declaration'}};
            workspace.zones = ['beta']
        }

        await this.settle(workspace);
        this.commandResult = {
            sequence                 : command.sequence,
            errors                   : result.errors,
            documentIdentityUnchanged: workspace.dockModel === documentBefore,
            refreshIdentityUnchanged : workspace.refreshPromise === refreshBefore,
            ...this.snapshot(workspace)
        }
    }

    /**
     * @summary Reads real instances and persisted membership without materializing dormant panes.
     * @param {Neo.dashboard.dock.Workspace} workspace
     * @returns {Object}
     */
    snapshot(workspace) {
        const panes = Object.fromEntries(paneKeys.map(itemId => {
            const item = workspace.dockModel.items[itemId],
                  pane = item ? workspace.resolvePane(itemId, item) : Neo.get(this.observedIds[itemId]);
            if (!pane?.isConstructed || pane.isDestroyed) return [itemId, null];
            this.observedIds[itemId] = pane.id;
            return [itemId, {
                id             : pane.id,
                className      : pane.className,
                instanceWitness: pane.instanceWitness,
                text           : pane.text,
                transientNote  : pane.transientNote ?? null
            }]
        }));

        return {
            panes,
            lazyRequests,
            catalog             : Object.keys(workspace.dockModel.items),
            nodes               : workspace.dockModel.nodes,
            lazyLoaded          : !!Neo.ns('Test.Playwright.Component.DockAuthoring.LazyPane'),
            lazyInstances       : Neo.ns('Test.Playwright.Component.DockAuthoring.LazyPane')?.sequence ?? 0,
            sameCapturedDocument: workspace.dockModel === this.capturedDocument,
            shellCount          : workspace.items.length
        }
    }
}

AuthoringHarness = Neo.setupClass(AuthoringHarness);

/** @summary Boots the declaration-only consumer inside its independent test driver. */
export const onStart = () => Neo.app({
    mainView: {module: AuthoringHarness},
    name    : 'Test.Playwright.DockAuthoring'
});
