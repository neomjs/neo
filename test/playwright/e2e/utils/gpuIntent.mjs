/**
 * @summary The E2E browser's launch arguments, split so the GPU intent is machine-readable.
 *
 * This module is the single declaration. `playwright.config.e2e.mjs` spreads it into the project's
 * `launchOptions`, and the boot probe reads it to decide whether hardware GL is something this run
 * is *entitled to demand*. A second hand-maintained copy in the probe would drift, and drift between
 * two statements of the same fact is how a dead GL flag stayed invisible for five months.
 *
 * **Why the split matters.** The probe must not demand GL unconditionally. If a future config drops
 * every accelerator flag — a legitimate choice for a headless CI lane — a probe that still failed on
 * software rendering would be a guard nobody could satisfy, and guards nobody can satisfy get
 * disabled. Reading the intent from the declaration keeps the demand proportional to the claim.
 *
 * @see test/playwright/e2e/gl.setup.mjs  the boot probe that consumes GPU_INTENT_ARGS
 * @see https://github.com/neomjs/neo/issues/15664  the five-month-silent dead-flag incident
 */

/**
 * @summary Flags whose only purpose is to obtain hardware-accelerated rendering.
 *
 * Presence of any of these is the run asserting *"this suite renders on the GPU"* — which is exactly
 * the claim the boot probe verifies against the live browser. Flags that merely tune an already
 * accelerated pipeline (`--disable-frame-rate-limit`, `--force-gpu-mem-available-mb`) are NOT here:
 * they do not by themselves claim acceleration, so they must not arm the demand.
 * @type {String[]}
 */
export const GPU_INTENT_ARGS = [
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--enable-accelerated-2d-canvas'
];

/**
 * @summary Everything else the E2E browser launches with — isolation, memory, throttling, sandbox.
 *
 * NEVER add `--use-gl=desktop` or `--disable-software-rasterizer` here. Modern Chrome's GL allowlist
 * is ANGLE-only (metal/opengl/swiftshader), so `desktop` resolves to gl=none — the GPU process then
 * dies at EVERY window birth, and with the software fallback disabled Chromium's crash threshold kills
 * the whole browser mid-test in headed mode (the second popup birth crossed it deterministically:
 * "GPU process isn't usable. Goodbye." → SIGTRAP, all SharedWorkers gone). Default ANGLE (Metal on
 * macOS) IS the hardware path — measured on this seat, headed and headless: "ANGLE (Apple, ANGLE Metal
 * Renderer: Apple M5 Max)". This warning is the source authority for that removal; the boot gate in
 * `gl.setup.mjs` enforces it at runtime, but the two together are cheaper than either alone.
 * @type {String[]}
 */
export const BASE_LAUNCH_ARGS = [
    '--disable-frame-rate-limit',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--js-flags=--max_old_space_size=8192',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-dev-shm-usage',
    '--disable-ipc-flooding-protection',
    '--force-gpu-mem-available-mb=4096',
    '--disable-features=IsolateOrigins,site-per-process'
];

/**
 * @summary The full argument list handed to Chrome.
 * @type {String[]}
 */
export const E2E_LAUNCH_ARGS = [...GPU_INTENT_ARGS, ...BASE_LAUNCH_ARGS];

/**
 * @summary Whether a given argument list claims hardware acceleration.
 * @param {String[]} [args=E2E_LAUNCH_ARGS]
 * @returns {Boolean}
 */
export function claimsGpuAcceleration(args = E2E_LAUNCH_ARGS) {
    return args.some(arg => GPU_INTENT_ARGS.includes(arg))
}
