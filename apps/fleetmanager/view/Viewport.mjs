import BaseViewport from '../../../src/container/Viewport.mjs';

/**
 * The token-layer verification surface: renders one element per token group so the extracted
 * vocabulary (`resources/tokens.css`) is visually verifiable under the dev server — the
 * verification consumer for the design-SSOT extraction, not a product view.
 * Product views land per the cockpit epic's leaves (fleet grid, activity stream, agent detail, …)
 * and replace this viewport's items as they arrive; see `../TOKENS.md` for the token contract.
 * @class FleetManager.view.Viewport
 * @extends Neo.container.Viewport
 */
class Viewport extends BaseViewport {
    static config = {
        /**
         * @member {String} className='FleetManager.view.Viewport'
         * @protected
         */
        className: 'FleetManager.view.Viewport',
        /**
         * @member {Object} style
         */
        style: {backgroundColor: 'var(--fm-ground)', color: 'var(--fm-ink)', fontFamily: 'var(--fm-font-sans)', padding: '2rem'},
        /**
         * One demo row per token group — surfaces, ink tiers, signal, session states, family rails,
         * type stacks — each consuming tokens exclusively (zero literal colors, per the token contract).
         * @member {Object[]} items
         */
        items: [{
            vdom:
            {cn: [
                {tag: 'h1', text: 'FM cockpit tokens — verification surface (#14578)', style: {fontFamily: 'var(--fm-font-mono)', fontSize: '14px', letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--fm-signal)'}},
                {cn: [
                    {text: 'panel',   style: {background: 'var(--fm-panel)',   border: '1px solid var(--fm-line)',      padding: '1rem', borderRadius: '8px'}},
                    {text: 'panel-2', style: {background: 'var(--fm-panel-2)', border: '1px solid var(--fm-line-soft)', padding: '1rem', borderRadius: '8px'}},
                    {text: 'rail',    style: {background: 'var(--fm-rail)',    border: '1px solid var(--fm-line)',      padding: '1rem', borderRadius: '8px'}}
                ], style: {display: 'flex', gap: '1rem', marginTop: '1rem'}},
                {cn: [
                    {text: 'primary ink', style: {color: 'var(--fm-ink)'}},
                    {text: 'dim ink',     style: {color: 'var(--fm-ink-dim)'}},
                    {text: 'faint ink',   style: {color: 'var(--fm-ink-faint)'}}
                ], style: {display: 'flex', gap: '2rem', marginTop: '1rem'}},
                {cn: ['ok', 'idle', 'wedged', 'limited', 'off'].map(state => (
                    {cn: [
                        {style: {background: `var(--fm-state-${state})`, width: '10px', height: '10px', borderRadius: '50%'}},
                        {text: state, style: {fontFamily: 'var(--fm-font-mono)', fontSize: '12px', color: 'var(--fm-ink-dim)'}}
                    ], style: {display: 'flex', alignItems: 'center', gap: '.5rem'}}
                )), style: {display: 'flex', gap: '1.5rem', marginTop: '1rem'}},
                {cn: ['claude', 'gpt', 'gemini', 'human'].map(family => (
                    {text: family, style: {borderLeft: `3px solid var(--fm-family-${family})`, paddingLeft: '.6rem', fontFamily: 'var(--fm-font-mono)', fontSize: '12px', color: 'var(--fm-ink-dim)'}}
                )), style: {display: 'flex', gap: '1.5rem', marginTop: '1rem'}}
            ]}
        }]
    }
}

export default Neo.setupClass(Viewport);
