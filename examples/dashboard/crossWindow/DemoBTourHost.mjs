import Base from '../../../src/core/Base.mjs';

/**
 * @class Neo.examples.dashboard.crossWindow.DemoBTourHost
 * @extends Neo.core.Base
 * @summary Presents tour controls, captions and progress while dispatching the existing host cues.
 *
 * The host retains the runner, script identity, beat state, reset and teardown. Its facades supply
 * the script and a lazy beat lookup, preserving lookup order after current host callbacks run.
 * No tour state or lifecycle is constructed here.
 */
class DemoBTourHost extends Base {
    static config = {
        /** @member {String} className='Neo.examples.dashboard.crossWindow.DemoBTourHost' */
        className: 'Neo.examples.dashboard.crossWindow.DemoBTourHost'
    }

    /**
     * @summary The tour bar — play button, caption feed, pip strip (the Demo-A pattern).
     * @param {Object} script The host tour script.
     * @param {Function} getBeats Resolves the current script beats when invoked.
     * @returns {Object}
     */
    createTourControls(script, getBeats) {
        let me = this;

        return {
            cls   : ['agentos-dockdemo-tourbar'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},
            ntype : 'toolbar',
            items : [{
                cls      : ['agentos-dockdemo-tour-play'],
                handler  : () => me.startTour(),
                iconCls  : 'fa fa-play',
                ntype    : 'button',
                reference: 'tour-play-b',
                text     : 'Tour'
            }, {
                cls      : ['agentos-dockdemo-tour-caption'],
                flex     : 1,
                html     : `${script.title} — press Tour: three perspectives get captured live, morph into each other, and a pane leaves for its own OS window without dropping a beat.`,
                ntype    : 'component',
                reference: 'tour-caption-b',
                style    : {padding: '0 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}
            }, {
                cls      : ['agentos-dockdemo-tour-pips'],
                flex     : 'none',
                ntype    : 'component',
                reference: 'tour-pips-b',
                vdom     : {cn: getBeats().map(() => ({cls: ['agentos-dockdemo-pip']}))}
            }]
        }
    }

    /**
     * @summary Publishes captions and starts the surface cue the runner awaits before its next beat.
     * Caption feed + pip progress + the surface cues that make narrated beats EXECUTABLE:
     * perspective saves/loads ride the store, pop-out/reattach ride the vessel — none of
     * them are dock-document ops, so none of them masquerade as descriptors.
     * The runner's host callback awaits the returned cue outcome and its projection.
     * @param {Object} data The runner's beat payload.
     * @returns {Object|Promise|Boolean|undefined} The initiated surface cue's outcome.
     */
    onTourBeat(data) {
        let me    = this,
            {cue} = data;

        data.caption && me.setTourCaption(data.caption);
        me.setPipProgress(++me.beatCount);

        if (!cue) return;

        if (cue.type === 'perspective-save') return me.capturePerspective(cue.name, {scope: cue.scope});
        if (cue.type === 'perspective-load') return me.loadPerspectiveByName(cue.name);
        if (cue.type === 'popout') return me.popOutPane(cue.itemId);
        if (cue.type === 'reattach') return me.reattachPane(cue.itemId)
    }

    /**
     * @summary Publishes the completion caption before resolving the current progress count.
     * @param {Object} data The runner's completion payload.
     * @param {Function} getBeats Resolves the current script beats when invoked.
     * @returns {void}
     */
    renderTourCompletion(data, getBeats) {
        let me = this;

        me.setTourCaption(`Tour complete — ${data.log.length} beats; the workbench counter never reset.`);
        me.setPipProgress(getBeats().length)
    }

    /**
     * @summary Honest failure surface: an aborted tour names its reason.
     * @param {Object} data `{errors, log}`
     */
    onTourError(data) {
        this.setTourCaption(`Tour stopped: ${data.errors[0] || 'unknown reason'}`)
    }

    /**
     * @summary Publishes a scene's title and optional caption.
     * @param {Object} data The runner's scene payload.
     */
    onTourScene(data) {
        this.setTourCaption(`${data.title}${data.caption ? ' — ' + data.caption : ''}`)
    }

    /**
     * @summary Lights the first `count` pips.
     * @param {Number} count
     */
    setPipProgress(count) {
        const pips = this.getReference('tour-pips-b');

        if (pips) {
            let {vdom} = pips;

            vdom.cn.forEach((pip, index) => {
                pip.cls = index < count
                    ? ['agentos-dockdemo-pip', 'agentos-dockdemo-pip-done']
                    : ['agentos-dockdemo-pip']
            });

            pips.update()
        }
    }

    /**
     * @summary Updates the caption feed.
     * @param {String} text
     */
    setTourCaption(text) {
        const caption = this.getReference('tour-caption-b');

        caption && (caption.html = text)
    }
}

export default Neo.setupClass(DemoBTourHost);
