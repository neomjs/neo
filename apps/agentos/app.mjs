import Viewport             from './view/Viewport.mjs';
import {installFleetBridge} from '../../src/ai/fleet/installFleetBridge.mjs';

export const onStart = () => {
    const params   = new URLSearchParams(Neo.config.url.search),
          fleetUrl = params.has('fleetUrl')
              ? params.get('fleetUrl')
              : 'http://127.0.0.1:8083/fleet';

    // The process bearer is an IN-MEMORY hand-off only: the Electron main process, the
    // Neural Link, or a test init-script places it at globalThis.AgentOS.fleet.bearerToken BEFORE
    // app start. Deliberately never read from URL params — a secret in a URL persists in history,
    // logs, and referrers, so installFleetBridge refuses credential-shaped query params outright.
    // Without the bearer the bridge installs fail-closed: every call rejects locally, named.
    const bearerToken = globalThis.AgentOS?.fleet?.bearerToken ?? null;

    // Wire the dev-server (Option B) app<->fleet HTTP transport so the Accounts pane's fail-closed
    // registry-bridge submit path goes live. The Electron shell (Option A) installs this in-process.
    installFleetBridge({url: fleetUrl, bearerToken});

    Neo.app({
        appThemeFolder: 'agentos',
        mainView      : Viewport,
        name          : 'AgentOS'
    })
};
