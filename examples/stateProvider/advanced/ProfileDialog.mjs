import Button                          from '../../../src/button/Base.mjs';
import Container                       from '../../../src/container/Base.mjs';
import Dialog                          from '../../../src/dialog/Base.mjs';
import ProfileFields                   from './ProfileFields.mjs';
import {initialsOf, resetMemberRecord} from './memberDefaults.mjs';

/**
 * @summary Floating non-modal editor dialog chained to the root StateProvider so visitors can edit in either the form or dialog simultaneously.
 * @class Neo.examples.stateProvider.advanced.ProfileDialog
 * @extends Neo.dialog.Base
 */
class ProfileDialog extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.examples.stateProvider.advanced.ProfileDialog'
         * @protected
         */
        className: 'Neo.examples.stateProvider.advanced.ProfileDialog',
        /**
         * @member {String[]} additionalThemeFiles=['Neo.examples.stateProvider.advanced.MainContainer']
         */
        additionalThemeFiles: ['Neo.examples.stateProvider.advanced.MainContainer'],
        /**
         * @member {Boolean} animated=false
         * @reactive
         */
        animated: false,
        /**
         * @member {String} boundaryContainerId='document.body'
         */
        boundaryContainerId: 'document.body',
        /**
         * @member {String} closeAction='close'
         */
        closeAction: 'close',
        /**
         * @member {String[]} cls=['sp-profile-dialog']
         */
        cls: ['sp-profile-dialog'],
        /**
         * @member {Object} containerConfig
         */
        containerConfig: {
            cls   : ['sp-dialog-body'],
            layout: 'base'
        },
        /**
         * Non-modal so typing in the underlying page form while this dialog stays open updates both live.
         * @member {Boolean} modal=false
         * @reactive
         */
        modal: false,
        /**
         * @member {String} title='Edit member in dialog'
         * @reactive
         */
        title: 'Edit member in dialog',
        /**
         * @member {Boolean} trapFocus=false
         */
        trapFocus: false,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['sp-dialog-summary'],
            layout: 'base',
            items : [{
                cls : ['sp-avatar', 'sp-avatar-sm'],
                bind: {text: data => initialsOf(data['member.name'])}
            }, {
                module: Container,
                cls   : ['sp-dialog-summary-meta'],
                layout: 'base',
                items : [
                    {tag: 'strong', cls: ['sp-dialog-name'], bind: {text: data => data['member.name'] || ''}},
                    {tag: 'span',   cls: ['sp-dialog-role'], bind: {text: data => `${data['member.role'] || ''} · ${data['member.location'] || ''}`}}
                ]
            }]
        }, {
            module       : ProfileFields,
            reference    : 'dialog-fields',
            surfacePrefix: 'dialog'
        }, {
            module: Container,
            cls   : ['sp-dialog-footer'],
            layout: 'base',
            items : [{
                module : Button,
                cls    : ['sp-btn-secondary'],
                handler: 'up.onResetMemberClick',
                text   : 'Reset member'
            }]
        }]
    }

    /**
     * @summary Restores the active member record's seed values from inside the dialog.
     */
    onResetMemberClick() {
        resetMemberRecord(this.getStateProvider()?.getData('member'))
    }
}

export default Neo.setupClass(ProfileDialog);
