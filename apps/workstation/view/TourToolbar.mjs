import Toolbar from '../../../src/toolbar/Base.mjs';

/**
 * @summary Lightweight tour chrome bound to the workspace's provider before playback is activated.
 *
 * Two screenplays share the bar: the dense tour (no windows) and the film (windows born through
 * real-pointer gestures). The film's window beats wait at a gate for the viewer's click on
 * **Continue** — that click is the user activation a vessel birth needs, so the button is visible
 * only while a gate is pending and carries the gate's own prompt.
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
            bind     : {disabled: 'tour.running'},
            cls      : ['workstation-tour-film'],
            handler  : 'onStartFilmTour',
            iconCls  : 'fa fa-film',
            ntype    : 'button',
            reference: 'tour-play-film',
            text     : 'Start film tour'
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
            bind     : {hidden: data => !data.tour.gatePrompt, text: data => data.tour.gatePrompt || 'Continue'},
            cls      : ['workstation-tour-continue'],
            handler  : 'onContinueTour',
            hidden   : true,
            iconCls  : 'fa fa-forward',
            ntype    : 'button',
            reference: 'tour-continue',
            text     : 'Continue'
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
