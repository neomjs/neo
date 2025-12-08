import Component     from '../../../src/controller/Component.mjs';
import {openLegitFs} from 'https://esm.sh/@legit-sdk/core';
import fs            from 'https://esm.sh/memfs';

/**
 * @class Legit.view.ViewportController
 * @extends Neo.controller.Component
 */
class ViewportController extends Component {
    static config = {
        /**
         * @member {String} className='Legit.view.ViewportController'
         * @protected
         */
        className: 'Legit.view.ViewportController',
        /**
         * @member {String} legitApiKey=null
         */
        legitApiKey: null,
        /**
         * @member {String} path='/.legit/branches/anonymous'
         */
        path: '/.legit/branches/anonymous'
    }

    /**
     *
     * @member {Neo.dialog.Base|null}
     */
    addDialog = null
    /**
     *
     * @member {Boolean} running=false
     */
    running = false

    /**
     *
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        globalThis.legitFs = await openLegitFs({
            storageFs: fs,
            gitRoot: '/',
            serverUrl: 'http://localhost:9999/',
            // publicKey: process.env.NEXT_PUBLIC_LEGIT_PUBLIC_KEY,
        });

        setInterval(this.poll, 1000);
    }

    /**
     *
     * @param data
     * @returns {Promise<void>}
     */
    async onEditorChange(data) {
        console.log('onEditorChange', data);
    }

    /**
     *
     * @param data
     * @returns {Promise<void>}
     */
    async onNewFileButtonClick(data) {
        let me          = this,
            {addDialog} = me,
            button      = data.component,
            {appName, theme, windowId} = button;

        if (!addDialog) {
            import('./AddFileDialog.mjs').then(module => {
                me.addDialog = Neo.create({
                    module         : module.default,
                    animateTargetId: button.id,
                    appName,
                    theme,
                    windowId
                })
            })
        } else {
            addDialog.show()
        }
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async poll() {
        let me = this;

        if (me.running) {
            return
        }

        try {
            me.running = true;

            let newState = await legitFs.readFile(path + '/.legit/head', 'utf-8');

            if (me.currentTreeState === newState) {
                return;
            }

            const treeDelta = await me.loadTreeDelta(currentTreeState, newState);
            console.log('TREE DELTA:', treeDelta);
            for (const deletedEntry of treeDelta.deleted) {
                console.log('Deleted FROM TREE: ' + deletedEntry);
                // TODO delete from tree store
            }

            for (const addedEntry of treeDelta.added) {

                // const newItem = await legitFs.readFile(path + '/' + addedEntry, 'utf8');

                console.log('Added From Tree:' + addedEntry);
                // TODO add new item to tree store
            }

            for (const modifiedEntry of treeDelta.modified) {
                // const newItem = await legitFs.readFile(path + '/' + addedEntry, 'utf8');
                // todo update item in tree store
                console.log('MODIFIED From Tree:' + modifiedEntry);
            }

            me.currentTreeState = newState;
        } finally {
            me.running = false;
        }
    }

    /**
     *
     * @param currentState
     * @param newState
     * @returns {Promise<{deleted: *[], added: *[], modified: *[]}>}
     */
    async loadTreeDelta(currentState, newState) {
        const me = this;

        const prefixCurrentState = currentState.slice(0, 2);
        const suffixCurrentState = currentState.slice(2);

        const prefixNewState = newState.slice(0, 2);
        const suffixNewState = newState.slice(2);

        me.currentstateTree = {}

        if (currentState !== '') {
            me.currentstateTree = await loadTree('/.legit/commits/' + prefixCurrentState + '/' + suffixCurrentState + '/');
            console.log('currentstateTree', currentstateTree);
        }
        const newStateTree = await loadTree('/.legit/commits/' + prefixNewState + '/' + suffixNewState + '/');

        const deleted  = [];
        const added    = [];
        const modified = [];

        function flattenTree(tree, path = '') {
            const result = {};

            if (tree.subEntries) {
                for (const [key, value] of Object.entries(tree.subEntries)) {
                    const currentPath = path ? `${path}/${key}` : key;

                    if (value.subEntries) {
                        Object.assign(result, flattenTree(value, currentPath));
                    } else {
                        result[currentPath] = value.hash;
                    }
                }
            }

            return result;
        }

        const currentStateFlat = currentState !== '' ? flattenTree(currentstateTree) : {};
        const newStateFlat     = flattenTree(newStateTree);

        // Find deleted (in current but not in new)
        for (const path in currentStateFlat) {
            if (!(path in newStateFlat)) {
                deleted.push(path);
            }
        }

        // Find added (in new but not in current)
        for (const path in newStateFlat) {
            if (!(path in currentStateFlat)) {
                added.push(path);
            }
        }

        // Find modified (in both but hash differs)
        for (const path in newStateFlat) {
            if (path in currentStateFlat) {
                const currentHash = new Uint8Array(currentStateFlat[path]);
                const newHash     = new Uint8Array(newStateFlat[path]);

                if (currentHash.length !== newHash.length ||
                    !currentHash.every((byte, i) => byte === newHash[i])) {
                    modified.push(path);
                }
            }
        }

        return {
            deleted,
            added,
            modified
        }
    }
}

export default Neo.setupClass(ViewportController);
