import Component    from '../../../src/controller/Component.mjs';
import LegitService from '../service/Legit.mjs';

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
         * @member {Number} pollingInterval=1000
         */
        pollingInterval: 1000
    }

    /**
     * @member {Neo.dialog.Base|null}
     */
    addDialog = null
    /**
     * @member {String} currentTreeState=null
     */
    currentTreeState = null
    /**
     * @member {Boolean} running=false
     */
    running = false

    /**
     * @returns {Promise<void>}
     */
    async initAsync() {
        await super.initAsync();

        const me = this;

        await LegitService.ready();

        me.getReference('new-file-button').disabled = false;
        me.getReference('save-button')    .disabled = false;

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
            filePath  = `${LegitService.path}/${textField.value}`;

        dialog.hide();

        console.log('onAddFileDialogSave', textField.value);
        await LegitService.writeFile({
            data: '',
            path: filePath
        });

        me.setState({currentFile: filePath});
    }

    /**
     * @param {Object} data
     */
    onCommitColumnRenderer(data) {
        if (data.dataField === 'author') {
            return data.value.name;
        }

        if (data.dataField === 'timestamp') {
            return new Intl.DateTimeFormat('default', {
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric'
            }).format(new Date(data.value * 1000));
        }

        return data.value;
    }

    /**
     * @param {Record} record
     */
    onFileItemClick(record) {
        console.log('onFileItemClick', record)
    }

    /**
     * @param data
     * @returns {Promise<void>}
     */
    async onEditorChange(data) {
        // console.log('onEditorChange', data);
    }

    /**
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

        await LegitService.writeFile({
            data: livePreview.value,
            path: `${LegitService.path}/${currentFile}`
        });
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

            const value = await LegitService.readFile(`${LegitService.path}/${record.id}`, 'utf-8');

            await livePreview.set({language, value});
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async poll() {
        let me = this;

        if (me.running) {
            return
        }

        try {
            me.running = true;

            let newState = await LegitService.readFile(LegitService.path + '/.legit/head', 'utf-8');

            if (me.currentTreeState === newState) {
                return;
            }

            const commitStore = me.getStore('commitStore');
            const fileStore   = me.getStore('fileStore');
            const treeDelta   = await LegitService.loadTreeDelta(me.currentTreeState, newState);

            commitStore.data = await LegitService.loadHistory();

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
}

export default Neo.setupClass(ViewportController);
