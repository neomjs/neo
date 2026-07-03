import Button         from '../../../src/button/Base.mjs';
import MarkdownVdom   from '../../../src/component/markdown/Component.mjs';
import Toolbar        from '../../../src/toolbar/Base.mjs';
import Viewport       from '../../../src/container/Viewport.mjs';

/**
 * The canonical markdown source the streaming demo replays chunk-wise — deliberately covering
 * the full v1 block grammar (headings, paragraphs, inline marks, links, lists, fenced code,
 * blockquote, table, thematic break) so a streamed pass exercises every parser path.
 * @type {String}
 */
const DEMO_SOURCE = `# Streaming Markdown, VDOM-native

This component parses markdown into **pure vdom subtrees** — no \`innerHTML\` at any stage.
Settled blocks keep *reference-identical* ids across appends, so the differ no-ops them and
streaming stays cheap. Docs live in the [neo repo](https://github.com/neomjs/neo).

## Why transcripts need this

- Agent responses stream as markdown
- Untrusted content renders inert by construction
- Appends produce insert-only tail batches
- The open tail block grows via updateVtext

1. Stable ids first
2. Security defaults second
3. Feature breadth last

> The ledger is the oracle — liveness is never DOM-probed.

\`\`\`js
const parser = new MarkdownParser({idPrefix: 'demo'});
const blocks = parser.update(source);
\`\`\`

| Surface | Layer |
|---|---|
| Parser | App Worker |
| Deltas | Main |

---

Raw HTML stays harmless: <script>alert('nope')</script> and hostile links
like [click me](javascript:alert(1)) render as plain text.
`;

/**
 * @summary Demo viewport for the streaming markdown VDOM component.
 *
 * "Stream demo" replays the canonical source in fixed-size chunks on a timer — the exact
 * producer shape of an LLM response surface — while "Render instantly" assigns it whole and
 * "Reset" clears. The chunk replay is deterministic (fixed source, fixed chunk length), which
 * makes this app the manual falsification surface for the delta-contract instruments: enable
 * `Neo.config.useDeltaGrammarGuards` / `useDeltaCoherenceRegistry` and stream.
 * @class Neo.examples.component.markdown.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.markdown.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.markdown.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-markdown-viewport']
         * @protected
         */
        cls: ['neo-examples-markdown-viewport'],
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
                handler: 'up.onStreamButtonClick',
                iconCls: 'fa fa-play',
                text   : 'Stream demo'
            }, {
                module : Button,
                handler: 'up.onMarathonButtonClick',
                iconCls: 'fa fa-person-running',
                text   : 'Stream marathon (40×)'
            }, {
                module : Button,
                handler: 'up.onRenderButtonClick',
                iconCls: 'fa fa-bolt',
                text   : 'Render instantly'
            }, {
                module : Button,
                handler: 'up.onResetButtonClick',
                iconCls: 'fa fa-rotate-left',
                text   : 'Reset'
            }]
        }, {
            module   : MarkdownVdom,
            flex     : 1,
            reference: 'markdown-output',
            style    : {overflow: 'auto', padding: '1em'}
        }]
    }

    /**
     * Monotonic token preventing two overlapping stream replays: each run captures its own
     * token and yields as soon as a newer run (or a reset) bumps it.
     * @member {Number} streamRun=0
     * @protected
     */
    streamRun = 0

    /**
     * Streams the canonical source into the component in fixed-size chunks, simulating an
     * LLM response producer: the value re-assigns as the GROWING full source per tick, which
     * is exactly the append shape the parser's incremental path consumes.
     * @returns {Promise<void>}
     */
    async onStreamButtonClick() {
        let me        = this,
            component = me.getReference('markdown-output'),
            chunkSize = 24,
            cursor    = 0,
            token     = ++me.streamRun;

        component.value = null;

        while (cursor < DEMO_SOURCE.length && me.streamRun === token) {
            cursor          = Math.min(cursor + chunkSize, DEMO_SOURCE.length);
            component.value = DEMO_SOURCE.slice(0, cursor);

            await me.timeout(50)
        }
    }

    /**
     * Streams the demo source repeated 40× in coarse chunks — the marathon-transcript surface
     * the settled-block windowing exists for: hundreds of estimated pages, with the DOM
     * bounded to the mounted window while spacers carry the evicted ranges.
     * @returns {Promise<void>}
     */
    async onMarathonButtonClick() {
        let me        = this,
            component = me.getReference('markdown-output'),
            source    = Array.from({length: 40}, (item, index) => `# Marathon section ${index + 1}\n\n${DEMO_SOURCE}`).join('\n\n'),
            chunkSize = 400,
            cursor    = 0,
            token     = ++me.streamRun;

        component.value = null;

        while (cursor < source.length && me.streamRun === token) {
            cursor          = Math.min(cursor + chunkSize, source.length);
            component.value = source.slice(0, cursor);

            await me.timeout(20)
        }
    }

    /**
     * Assigns the full source in one shot — the non-streaming baseline.
     */
    onRenderButtonClick() {
        let me = this;

        me.streamRun++;
        me.getReference('markdown-output').value = DEMO_SOURCE
    }

    /**
     * Clears the rendered output and stops any in-flight stream replay.
     */
    onResetButtonClick() {
        let me = this;

        me.streamRun++;
        me.getReference('markdown-output').value = null
    }
}

export default Neo.setupClass(MainContainer);
