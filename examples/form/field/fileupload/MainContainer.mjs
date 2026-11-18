import FileUploadField from '../../../../src/form/field/FileUpload.mjs';
import NumberField     from '../../../../src/form/field/Number.mjs';
import Radio           from '../../../../src/form/field/Radio.mjs';
import StatesViewport  from '../StatesViewport.mjs';

const server = 'http://127.0.0.1:3000/';

/**
 * @summary The upload field waiting for a file, above the states a document it holds can be in.
 *
 * The live field talks to the test server beside this file (`node server.mjs`, see README.md); the inspector picks
 * which server answer it gets. The states below render from preset documents and need no server.
 * @class Neo.examples.form.field.fileupload.MainContainer
 * @extends Neo.examples.form.field.StatesViewport
 */
class MainContainer extends StatesViewport {
    /**
     * A document's states, each set by the document's server status
     * @member {Object[]} sheet
     * @static
     */
    static sheet = [
        {key: 'uploaded', caption: 'Uploaded'},
        {key: 'deleted',  caption: 'Deleted'},
        {key: 'malware',  caption: 'Malware found'},
        {key: 'error',    caption: 'Error'},
        {key: 'disabled', caption: 'Disabled', fromFilled: true, forced: {disabled: true}}
    ]

    /**
     * The test server's answers: the upload and document status URLs for each
     * @member {Object} scenarios
     * @static
     */
    static scenarios = {
        'downloadable': {uploadUrl: 'file-upload-test',      documentStatusUrl: 'document-status-downloadable'},
        'no download' : {uploadUrl: 'file-upload-test',      documentStatusUrl: 'document-status-not-downloadable'},
        'upload fails': {uploadUrl: 'file-upload-test-fail', documentStatusUrl: 'document-status'},
        'scan fails'  : {uploadUrl: 'file-upload-test',      documentStatusUrl: 'document-status-fail'},
        'status fails': {uploadUrl: 'file-upload-test',      documentStatusUrl: 'document-status-fails'}
    }

    static config = {
        className    : 'Neo.examples.form.field.fileupload.MainContainer',
        autoMount    : true,
        componentName: 'File upload field',
        // The server answers need room to stay on one line
        configItemWidth: 290,
        layout         : {ntype: 'hbox', align: 'stretch'},

        field: {
            module           : FileUploadField,
            documentDeleteUrl: `${server}document-delete?documentId={documentId}`,
            documentStatusUrl: `${server}document-status-downloadable?documentId={documentId}`,
            downloadUrl      : `${server}getDocument?documentId={documentId}`,
            maxSize          : '10mb',
            types            : {jpg: 1, pdf: 1, png: 1, xls: 1},
            uploadUrl        : `${server}file-upload-test`,
            width            : 340
        },
        states: {
            filled: {
                listeners: {
                    // A request can carry headers of its own, e.g. a CSRF token
                    beforeRequest({headers}) {
                        headers['X-XSRF-TOKEN'] = 'my-xsrf-token'
                    }
                }
            },
            // The demo server serves no documents, so the uploaded sample offers no download link
            uploaded: {document: {id: 1, fileName: 'invoice-2026-11.pdf', size: 248320,   status: 'UN_DOWNLOADABLE'}},
            deleted : {document: {id: 2, fileName: 'contract-draft.pdf',  size: 10664885, status: 'DELETED'}},
            malware : {document: {id: 3, fileName: 'setup.pdf',           size: 1290240,  status: 'MALWARE_DETECTED'}},
            error   : {document: {id: 4, fileName: 'scan-2026-11-18.png', size: 3145728,  status: 'ERROR'}},
            disabled: {}
        }
    }

    /**
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me = this;

        return [...Object.keys(MainContainer.scenarios).map((scenario, index) => ({
            module        : Radio,
            checked       : index === 0,
            hideValueLabel: false,
            labelText     : index === 0 ? 'server answer' : '',
            listeners     : {change: me.onScenarioChange.bind(me, scenario)},
            name          : 'scenario',
            valueLabel    : scenario
        })), {
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 400,
            minValue : 240,
            stepSize : 10,
            value    : me.exampleComponent.width
        }]
    }

    /**
     * Points the live field at the test server's answer for a scenario, both URLs in one batch
     * @param {String} scenario
     * @param {Object} opts
     */
    onScenarioChange(scenario, opts) {
        let {documentStatusUrl, uploadUrl} = MainContainer.scenarios[scenario];

        opts.value && this.exampleComponent.set({
            documentStatusUrl: `${server}${documentStatusUrl}?documentId={documentId}`,
            uploadUrl        : `${server}${uploadUrl}`
        })
    }
}

export default Neo.setupClass(MainContainer);
