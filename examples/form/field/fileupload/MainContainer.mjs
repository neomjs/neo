import ConfigurationViewport from '../../../ConfigurationViewport.mjs';
import FileUploadField       from '../../../../src/form/field/FileUpload.mjs';
import NumberField           from '../../../../src/form/field/Number.mjs';
import Panel                  from '../../../../src/container/Panel.mjs';

/**
 * @class Neo.examples.form.field.text.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.form.field.text.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 160,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            labelText: 'width',
            listeners: {change: me.onConfigChange.bind(me, 'width')},
            maxValue : 350,
            minValue : 200,
            stepSize : 5,
            style    : {marginTop: '10px'},
            value    : me.exampleComponent.width
        }];
    }

    createExampleComponent() {
        return Neo.create(Panel, {
            style : 'padding:1em',
            items : [{
                module            : FileUploadField,
                id                : 'my-downloadable-test',
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status-downloadable?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                },
                listeners : {
                    beforeRequest({ headers }) {
                        headers['X-XSRF-TOKEN'] = 'my-xsrf-token'
                    }
                }
            }, {
                module            : FileUploadField,
                id                : 'my-not-downloadable-test',
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status-not-downloadable?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                }
            }, {
                module            : FileUploadField,
                id                : 'my-upload-fail-test',
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test-fail',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                }
            }, {
                module            : FileUploadField,
                id                : 'my-scan-fail-test',
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status-fail?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                }
            }, {
                module            : FileUploadField,
                id                : 'my-existing-document-test',
                documentId        : 2,
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status-not-downloadable?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                }
            }, {
                module            : FileUploadField,
                id                : 'my-non-existing-document-test',
                documentId        : 2,
                uploadUrl         : 'http://127.0.0.1:3000/file-upload-test',
                documentStatusUrl : 'http://127.0.0.1:3000/document-status-non-existent?documentId={documentId}',
                documentDeleteUrl : 'http://127.0.0.1:3000/document-delete?documentId={documentId}',
                downloadUrl       : 'http://127.0.0.1:3000/getDocument?documentId={documentId}',
                width             : 350,
                maxSize           : '10mb',
                types             : {
                    png : 1,
                    jpg : 1,
                    xls : 1,
                    pdf : 1
                }
            }]
        });
    }
}

Neo.applyClassConfig(MainContainer);

export default MainContainer;
