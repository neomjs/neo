import Button        from '../../../../src/button/Base.mjs';
import MarkdownVdom   from '../../../../src/component/markdown/Component.mjs';
import TextField      from '../../../../src/form/field/Text.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';
import Viewport       from '../../../../src/container/Viewport.mjs';
import {LoadProfile}  from '../shared/LoadProfile.mjs';

/**
 * @summary Subject A — the Neo.mjs transcript surface for the Harness Endurance Benchmark.
 *
 * The engine-favourable subject: the streaming markdown transcript (`Neo.component.markdown.Component`)
 * parses + diffs OFF the main thread, leaving the main thread a thin DOM-applicator. Under a long
 * streamed-append load, the runner samples main-thread event-loop lag head-to-head against the
 * single-main-thread comparator (Subject B). (The probe field below anchors a planned
 * keystroke→echo-latency layer — present as the input surface, not measured yet.)
 *
 * The append load is SELF-DRIVEN (the in-app loop in {@link MainContainer#startLoad}), not injected
 * per-append by the runner: pushing ~20 appends/s for hours across the Playwright process boundary
 * would let cross-process round-trip latency dominate the very signal under test. The runner triggers
 * a run via `startLoad` (over the Neural Link) and then samples main-thread event-loop lag + heap
 * over a window. The toolbar makes the subject runnable + manually verifiable standalone.
 *
 * @class Neo.examples.harnessEndurance.neo.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.harnessEndurance.neo.MainContainer'
         * @protected
         */
        className: 'Neo.examples.harnessEndurance.neo.MainContainer',
        /**
         * @member {String[]} cls=['neo-harness-endurance-neo']
         * @protected
         */
        cls: ['neo-harness-endurance-neo'],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                handler: 'up.onStartButtonClick',
                iconCls: 'fa fa-play',
                text   : 'Start load'
            }, {
                module : Button,
                handler: 'up.onResetButtonClick',
                iconCls: 'fa fa-rotate-left',
                text   : 'Reset'
            }]
        }, {
            // Keystroke probe: the input surface for a planned keystroke→echo-latency layer (NOT
            // measured yet — the current metric is main-thread event-loop lag). The field value
            // round-trips through Neo's worker pipeline, so a deep task queue under load would
            // surface as echo lag once that layer lands.
            module   : TextField,
            reference: 'probe',
            flex     : 'none',
            labelText: 'Keystroke probe'
        }, {
            module   : MarkdownVdom,
            reference: 'transcript',
            flex     : 1,
            style    : {overflow: 'auto', padding: '1em'}
        }]
    }

    /**
     * Monotonic token preventing overlapping load runs: each run captures its own token and
     * yields the moment a newer run (or a reset) bumps it.
     * @member {Number} loadRun=0
     * @protected
     */
    loadRun = 0

    /**
     * Runner entry point and the "Start load" handler. Drives the deterministic `LoadProfile`
     * append stream into the transcript — each tick re-assigns the GROWING full source (the
     * parser's incremental-append path), exactly the producer shape of a streamed model response.
     *
     * Fire-and-forget: returns immediately after scheduling the first tick, so an NL
     * `call_method('startLoad')` RPC resolves NOW instead of hanging for the whole run. The stream
     * continues off the call stack via self-scheduled ticks, yielding to a newer run / reset through
     * the `loadRun` token. (Button-driven runs are unaffected — the handler never awaited it.)
     * @param {Object} [config] forwarded to {@link LoadProfile} (seed, durationMs, cadences).
     */
    startLoad(config = {}) {
        let me          = this,
            transcript  = me.getReference('transcript'),
            profile     = new LoadProfile(config),
            token       = ++me.loadRun,
            iterator    = profile.appendEvents(),
            accumulated = '';

        transcript.value = null;

        const tick = () => {
            if (me.loadRun !== token) {
                return
            }

            const next = iterator.next();

            if (next.done) {
                return
            }

            accumulated     += next.value.text;
            transcript.value = accumulated;

            me.timeout(profile.appendCadenceMs).then(tick)
        };

        tick()
    }

    /**
     * "Start load" toolbar handler — kicks a default-config run for manual verification.
     */
    onStartButtonClick() {
        this.startLoad()
    }

    /**
     * "Reset" toolbar handler — stops any in-flight run and clears the transcript.
     */
    onResetButtonClick() {
        let me = this;

        me.loadRun++;
        me.getReference('transcript').value = null
    }

    /**
     * Runner/test helper: the full accumulated transcript length (the App-Worker `value`), as opposed
     * to the RENDERED DOM. Under virtualization the two diverge sharply — the value reaches marathon
     * scale while only a viewport window mounts — which is exactly the property the benchmark proves.
     * @returns {Number}
     */
    getTranscriptLength() {
        return this.getReference('transcript').value?.length ?? 0
    }
}

export default Neo.setupClass(MainContainer);
