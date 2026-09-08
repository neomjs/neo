import Toolbar from '../../../src/toolbar/Base.mjs';

/**
 * @summary Lightweight tour chrome bound to the workspace's provider before playback is activated.
 * @class Workstation.view.TourToolbar
 * @extends Neo.toolbar.Base
 */
class TourToolbar extends Toolbar {
    static config = {
        /** @member {String} className='Workstation.view.TourToolbar' */
        className: 'Workstation.view.TourToolbar',
        /** @member {String[]} cls */
        cls: ['workstation-tourbar'],
        /** @member {String} flex='none' */
        flex: 'none',
        /** @member {Object} layout */
        layout: {ntype: 'hbox', align: 'center'},
        /** @member {String} reference='tour-bar' */
        reference: 'tour-bar',
        /** @member {Object[]} items */
        items: [{
            bind     : {disabled: 'tour.running'},
            cls      : ['workstation-tour-play'],
            handler  : 'onStartTour',
            iconCls  : 'fa fa-play',
            ntype    : 'button',
            reference: 'tour-play',
            text     : 'Start dense tour'
        }, {
            cls   : ['workstation-tour-story'],
            flex  : 1,
            ntype : 'container',
            layout: {ntype: 'vbox', align: 'stretch', pack: 'center'},
            items : [{
                bind     : {html: 'tour.caption'},
                cls      : ['workstation-tour-caption'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-caption'
            }, {
                bind: {html: data => Array.from({length: data.tour.totalBeats}, (_, index) =>
                    `<div class="workstation-pip${index < data.tour.completedCount ? ' workstation-pip-done' : ''}"></div>`
                ).join('')},
                cls      : ['workstation-tour-pips'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-pips'
            }]
        }, {
            cls      : ['workstation-theme-button'],
            handler  : 'onToggleWorkspaceTheme',
            iconCls  : 'fa fa-sun',
            ntype    : 'button',
            reference: 'theme-toggle',
            text     : 'Light mode'
        }]
    }
}

export default Neo.setupClass(TourToolbar);
