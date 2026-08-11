import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect}  from '@playwright/test';

import {
    HOOK_OVERHEAD_MARGIN_MS,
    HOOK_TIMEOUT_MS,
    TURN_PRESENCE_DEFAULTS,
    resolveExchangeDeadlineMs,
    resolveTurnPresenceRuntimeConfig
} from '../../../../../../../ai/mcp/server/memory-core/helpers/TurnPresenceConfig.mjs';
import {
    recordTurnPresenceOverMcp
} from '../../../../../../../ai/mcp/server/memory-core/helpers/recordTurnPresenceOverMcp.mjs';

const repoRoot = fileURLToPath(new URL('../../../../../../../', import.meta.url));

/**
 * @summary The presence hook's budget must be derived from the ceiling it runs under, not inherited.
 *
 * `1500` was sized when this hook opened a local SQLite file and ran one `INSERT`. It now bounds a
 * four-stage network exchange — TCP connect, TLS handshake, MCP `initialize`, `tools/call` — because
 * the transport changed underneath it without the constant being re-derived.
 *
 * The obvious repair is the one its siblings suggest: `readSubscriptionsOverMcp` and
 * `recordTurnPresenceOverMcp` both declare `8000` for this class of exchange. **That repair is
 * unreachable here, and these specs are what pin why.** Those siblings run under a 15s `SessionStart`
 * registration; this hook runs on `UserPromptSubmit` and `PostToolUse` under a **2s** one, because it
 * fires on every prompt and every tool call. An 8000ms inner deadline would sit four times beyond a
 * ceiling that kills the process first — converting a reportable skip into a silent kill, which is the
 * exact failure mode the presence lane exists to remove.
 */
test.describe('ai/mcp/server/memory-core/helpers/TurnPresenceConfig — the hook budget is derived, not inherited', () => {
    test('the harness ceiling strictly exceeds the exchange budget it contains', () => {
        const exchange = resolveExchangeDeadlineMs();

        expect(exchange).toBeLessThan(HOOK_TIMEOUT_MS);
        expect(HOOK_TIMEOUT_MS - exchange).toBeGreaterThanOrEqual(HOOK_OVERHEAD_MARGIN_MS);

        // The default consumers read must equal the derived budget.
        //
        // Stated precisely, because the obvious stronger claim is false and was measured to be: this
        // does NOT catch someone deleting the derivation and pasting `1500` back. The derived value is
        // numerically identical to the literal it replaced — that is deliberate, the number was never
        // the defect — so no assertion can tell the two apart while they coincide. Verified by
        // mutation: substituting the literal leaves this suite fully green.
        //
        // What it does catch is the pair drifting apart afterwards. Move `HOOK_TIMEOUT_MS` or the
        // margin with a pasted literal still in place, and this fails — which is the state that
        // actually hurts, since a stale literal above a lowered ceiling stops producing reports.
        expect(TURN_PRESENCE_DEFAULTS.hookWriteTimeoutMs).toBe(exchange);
        expect(resolveTurnPresenceRuntimeConfig({env: {}}).hookWriteTimeoutMs).toBe(exchange);
    });

    test('the derivation stays strictly inside the ceiling however the pair is retuned', () => {
        // Both bounds matter and they fail in opposite directions. A non-positive budget makes every
        // stage skip instantly and report a timeout that never happened; a budget at or above the
        // ceiling is terminated by the harness rather than reported.
        for (const [ceiling, margin] of [[2000, 500], [1000, 9000], [2000, 0], [1, 0], [500, 500]]) {
            const derived = resolveExchangeDeadlineMs(ceiling, margin);

            expect(derived, `ceiling=${ceiling} margin=${margin}`).toBeGreaterThan(0);
            expect(derived, `ceiling=${ceiling} margin=${margin}`).toBeLessThan(ceiling + 1);
            ceiling > 1 && expect(derived, `ceiling=${ceiling} margin=${margin}`).toBeLessThan(ceiling);
        }
    });

    test('the registered hook timeout matches the constant the budget is derived from, in BOTH settings files', () => {
        // Two places holding one number drift silently. Here the drift is worse than silent: exceeding
        // the OUTER bound kills the process, so a ceiling that dropped below the inner budget would
        // stop producing reports entirely rather than producing wrong ones.
        //
        // `settings.json` is asserted alongside the template because the template is what a new seat
        // installs, while `settings.json` is what this repo's own agents actually run under — a fix
        // applied to one and not the other is a fix nobody is running.
        for (const file of ['.claude/settings.template.json', '.claude/settings.json']) {
            const settings = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')),
                  entries  = Object.values(settings.hooks || {})
                      .flat()
                      .flatMap(entry => entry.hooks || [])
                      .filter(entry => entry.command?.includes('turnPresenceHook.mjs'));

            // Both registrations — `start` on UserPromptSubmit and `progress` on PostToolUse — share
            // one constant, so finding only one of them would leave the other unbound.
            expect(entries.length, `${file} must register the presence hook`).toBeGreaterThanOrEqual(2);

            for (const entry of entries) {
                expect(entry.timeout * 1000, `${file}: ${entry.command}`).toBe(HOOK_TIMEOUT_MS);
            }
        }
    });

    test('an exceeded deadline is VISIBLE — it names the budget it spent, and does not resolve as recorded', async () => {
        // The property that makes this lane worth having: the failure the ceiling produces must be
        // reportable. A deadline that resolved quietly — or rejected with an opaque transport error —
        // would leave the seat silently absent, which is the "unmeasured state that looks measured"
        // failure the presence lane was built to remove.
        //
        // A connect that never settles, against a deliberately small budget: no network, no timing
        // slack, and the assertion is on the message the hook turns into its stderr WARN.
        await expect(recordTurnPresenceOverMcp({
            baseUrl       : 'http://127.0.0.1:9/mc/mcp',
            identity      : '@neo-opus-ada',
            deadlineMs    : 50,
            TransportClass: class { async start() {} async send() {} async close() {} },
            ClientClass   : class {
                async connect() { return new Promise(() => {}) }
                async callTool() { return {content: []} }
                async close() {}
            }
        })).rejects.toThrow(/50ms/);
    });

    test('an operator override is still bounded by the same ceiling, and a bad one is refused', () => {
        // The env override is the one path that can put a value above the ceiling into production, so
        // it is the one worth stating: the resolver does not clamp it, and this records that.
        const raised = resolveTurnPresenceRuntimeConfig({
            env: {NEO_TURN_PRESENCE_HOOK_WRITE_TIMEOUT_MS: '8000'}
        });

        expect(raised.hookWriteTimeoutMs).toBe(8000);
        expect(raised.hookWriteTimeoutMs, 'an override CAN exceed the ceiling — the harness kills it, and nothing here prevents that')
            .toBeGreaterThan(HOOK_TIMEOUT_MS);

        // Refusal rather than fallback for values that are not usable budgets at all.
        for (const bad of ['0', '-1', 'abc']) {
            expect(() => resolveTurnPresenceRuntimeConfig({
                env: {NEO_TURN_PRESENCE_HOOK_WRITE_TIMEOUT_MS: bad}
            }), `${bad} must be refused`).toThrow();
        }
    });
});
