import {execSync} from 'node:child_process';

/**
 * @summary Resolves a webServer port for a Playwright config: an explicit env pin always wins;
 * otherwise an OS-assigned free port is probed synchronously.
 *
 * Why per-process instead of a fixed default: on the shared multi-agent machine, several
 * checkouts run the same suite concurrently. A fixed default port with `reuseExistingServer:
 * false` makes runs contend — and the failure is sticky: a runner that dies without graceful
 * shutdown orphans its server, and every subsequent run machine-wide wedges against the corpse,
 * polling a socket it refuses to adopt. With per-process ports an orphan squats only its own
 * dead port and tmpdir — the machine-wide wedge class disappears without any reaper hygiene.
 *
 * Why a subprocess probe: Playwright needs the number at config-definition time (both `command`
 * and `url` template from it), but Node's `net` binds are async — a one-shot `node -e` bind to
 * `127.0.0.1:0` returns the OS-assigned port synchronously. The port is free by construction at
 * probe time; the instant of exposure before the webServer binds it is negligible on a dev box.
 *
 * @param {String|undefined} envValue The env override (e.g. `NEO_CHROMA_PORT_TEST`) — a positive
 *        integer string pins the port unchanged (CI and deliberate pinning keep working).
 * @returns {Number} The pinned or probed port.
 */
export function resolveFreePortSync(envValue) {
    const pinned = Number(envValue);

    if (Number.isInteger(pinned) && pinned > 0) {
        return pinned;
    }

    // NODE_OPTIONS is stripped for the child: a Playwright worker inherits the suite's module
    // loaders there, which pollute the one-line stdout contract. The child exits from the
    // stdout write-callback — pipe writes are async in Node, so a plain log-then-close can
    // exit before the port ever flushes (an intermittent empty-stdout probe). The last stdout
    // line is the port either way.
    const probed = execSync(
        `node -e "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;process.stdout.write(p+'\\n',()=>process.exit(0))})"`,
        {encoding: 'utf8', env: {...process.env, NODE_OPTIONS: ''}}
    );

    return Number(probed.trim().split('\n').pop());
}
