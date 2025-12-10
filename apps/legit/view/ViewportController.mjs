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
        path: '/.legit/branches/anonymous',
        /**
         * @member {Number} pollingInterval=1000
         */
        pollingInterval: 1000
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

        const me = this;

        globalThis.legitFs = await openLegitFs({
            storageFs: fs,
            gitRoot: '/',
            serverUrl: 'http://localhost:9999/',
            // publicKey: process.env.NEXT_PUBLIC_LEGIT_PUBLIC_KEY,
        });

        let mdFile = await fetch('../../learn/benefits/FormsEngine.md');
        mdFile = await mdFile.text();

        await legitFs.writeFile(`${me.path}/FormsEngine.md`, mdFile);

        mdFile = await fetch('../../learn/benefits/OffTheMainThread.md');
        mdFile = await mdFile.text();

        await legitFs.writeFile(`${me.path}/OffTheMainThread.md`, mdFile);

        await legitFs.writeFile(`${me.path}/Helix.mjs`, [
            "import Viewport from '../../examples/component/multiWindowHelix/Viewport.mjs';",
            "",
            "class MainView extends Viewport {",
            "    static config = {",
            "        className           : 'Portal.view.MultiWindowHelix',",
            "        showGitHubStarButton: false,",
            "        theme               : 'neo-theme-dark'",
            "    }",
            "}",
            "",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'));

        await legitFs.writeFile(`${me.path}/Gallery.mjs`, [
            "import Viewport from '../../examples/component/multiWindowCoronaGallery/Viewport.mjs';",
            "",
            "class MainView extends Viewport {",
            "    static config = {",
            "        className           : 'Portal.view.MultiWindowHelix',",
            "        showGitHubStarButton: false,",
            "        theme               : 'neo-theme-dark'",
            "    }",
            "}",
            "",
            "MainView = Neo.setupClass(MainView);"
        ].join('\n'));

        setInterval(me.poll.bind(me), me.pollingInterval)
    }

    /**
     * @param {Object} data
     */
    async onAddFileDialogSave(data) {
        const
            me        = this,
            dialog    = me.addDialog,
            textField = dialog.getReference('filename'),
            filePath  = `/.legit/branches/anonymous/${textField.value}`;

        dialog.hide();

        console.log('onAddFileDialogSave', textField.value);
        await legitFs.writeFile(filePath, '');

        me.setState({currentFile: filePath});
    }

    /**
     * @param {Record} record
     */
    onFileItemClick(record) {
        console.log('onFileItemClick', record)
    }

    /**
     *
     * @param data
     * @returns {Promise<void>}
     */
    async onEditorChange(data) {
        // console.log('onEditorChange', data);
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

        button.disabled = true;

        if (!addDialog) {
            import('./AddFileDialog.mjs').then(module => {
                me.addDialog = Neo.create({
                    module         : module.default,
                    animateTargetId: button.id,
                    appName,
                    listeners      : {hide: data => {button.disabled = false}},
                    parentComponent: me.component,
                    theme,
                    windowId
                })
            })
        } else {
            addDialog.show()
        }
    }

    /**
     * @param {Object} data
     */
    async onSaveButtonClick(data) {
        const
            me          = this,
            livePreview = me.getReference('code-live-preview'),
            currentFile = me.getState('currentFile');

        console.log('onSaveButtonClick', me.getState('currentFile'), livePreview.value);

        await legitFs.writeFile(`${me.path}/${currentFile}`, livePreview.value);
    }

    /**
     * @param {Object}   data
     * @param {Record[]} data.records
     * @param {String[]} data.selection // selected dom node ids
     * @param {String}   data.source    // id of the event-firing instance
     */
    async onTreeListSelect({records}) {
        const
            livePreview = this.getReference('code-live-preview'),
            record      = records?.[0],
            language    = record.id.includes('.md') ? 'markdown' : 'neomjs';

        if (record?.isLeaf) {
            this.setState({currentFile: record.id});

            const value = await legitFs.readFile(`${this.path}/${record.id}`, 'utf-8');

            await livePreview.set({language, value});
        }
    }

    /**
     *
     * @param treePath
     * @returns {Promise<{hash: string, subEntries: {}}>}
     */
    async loadTree(treePath) {
        const subEntries = {};

        const pathEntries = await legitFs.readdir(treePath)
        for (const entryName of pathEntries) {
            const stat = await legitFs.stat(treePath + entryName);

            if (stat.isDirectory()) {
                subEntries[entryName] = await this.loadTree(treePath + entryName + '/');
            } else {
                const contenHash = await crypto.subtle.digest("SHA-1", await legitFs.readFile(treePath + entryName));
                subEntries[entryName] = {
                    // for now its the content instead of the hash
                    hash: contenHash,
                    name: entryName,
                };
            }
        }

        return {
            hash: '',
            subEntries
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

            let newState = await legitFs.readFile(me.path + '/.legit/head', 'utf-8');

            if (me.currentTreeState === newState) {
                return;
            }

            const fileStore = me.getStore('fileStore');
            const treeDelta = await me.loadTreeDelta(me.currentTreeState, newState);

            console.log('TREE DELTA:', treeDelta);
            for (const deletedEntry of treeDelta.deleted) {
                console.log('Deleted FROM TREE: ' + deletedEntry);
                fileStore.remove(deletedEntry)
            }

            for (const addedEntry of treeDelta.added) {
                console.log('Added From Tree:' + addedEntry);
                fileStore.insert(0, {
                    id      : addedEntry,
                    name    : addedEntry,
                    parentId: null
                })
            }

            for (const modifiedEntry of treeDelta.modified) {
                // const newItem = await legitFs.readFile(path + '/' + addedEntry, 'utf8');
                // todo update item in tree store
                console.log('MODIFIED From Tree:' + modifiedEntry);
            }

            me.currentTreeState = newState;
        } finally {
            me.running = false;

            let selectionModel = me.getReference('files-tree').selectionModel;

            if (!selectionModel.hasSelection()) {
                selectionModel.selectAt(0)
            }
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

        const prefixNewState = newState.slice(0, 2);
        const suffixNewState = newState.slice(2);

        let currentstateTree = {}

        if (currentState) {
            const prefixCurrentState = currentState.slice(0, 2);
            const suffixCurrentState = currentState.slice(2);

            currentstateTree = await me.loadTree('/.legit/commits/' + prefixCurrentState + '/' + suffixCurrentState + '/');
            console.log('currentstateTree', currentstateTree);
        }
        const newStateTree = await me.loadTree('/.legit/commits/' + prefixNewState + '/' + suffixNewState + '/');

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
