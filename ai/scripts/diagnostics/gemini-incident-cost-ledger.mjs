/**
 * @plane in-plane
 */
import fs              from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';
import {Command}       from 'commander';

/**
 * Pre-Flight (structural fast-path): authoring
 * `ai/scripts/diagnostics/gemini-incident-cost-ledger.mjs` matches sibling pattern of
 * `ai/scripts/diagnostics/check-retired-primitives.mjs` and
 * `ai/scripts/diagnostics/review-cost-meter.mjs`; all are local diagnostics scripts for
 * Agent OS operational forensics; sibling-file-lift applies; no novel directory choice.
 *
 * @summary Private-content-safe Gemini incident cost ledger helper.
 *
 * Parses orchestrator daemon logs for `memory miniSummary backfill` starts, completions, and
 * deferrals, then converts aggregate prompt/response length statistics into public-pricing
 * sanity estimates. The script intentionally accepts aggregate character counts only; it never
 * reads or prints raw Memory Core prompt/response content.
 *
 * This ledger remains Cloud-Billing-gated: these estimates are sanity bands. Actual SKU/model,
 * billable request count, token counts, and 429/retry billing behavior from the provider console
 * remain the incident closeout authority.
 */

const DEFAULTS = {
    charsPerToken         : 4,
    fixedPromptChars      : 0,
    inputPricePerMillion  : 0.50,
    outputPricePerMillion : 3.00,
    outputTokens          : 100
};

/**
 * Parses an ISO timestamp from an orchestrator log line.
 *
 * @param {String} line
 * @returns {Date|null}
 */
export function parseLogTimestamp(line) {
    const match = line.match(/^\[([^\]]+)]/);
    if (!match) return null;

    const date = new Date(match[1]);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Tests whether a timestamp is inside an optional inclusive window.
 *
 * @param {Date|null} timestamp
 * @param {Object} options
 * @param {Date|null} [options.windowStart=null]
 * @param {Date|null} [options.windowEnd=null]
 * @returns {Boolean}
 */
export function isInsideWindow(timestamp, {windowStart = null, windowEnd = null} = {}) {
    if (!timestamp) return false;
    if (windowStart && timestamp < windowStart) return false;
    if (windowEnd && timestamp > windowEnd) return false;

    return true;
}

/**
 * Builds an empty per-log ledger bucket.
 *
 * @param {String} source
 * @returns {Object}
 */
function createLogLedger(source) {
    return {
        source,
        starts                       : 0,
        completions                  : 0,
        pendingStartSum              : 0,
        pendingStartMax              : 0,
        pendingDeferrals             : 0,
        pendingDeferralSum           : 0,
        activeTaskDeferrals          : 0,
        maxRepresentedCallAttempts   : 0,
        firstStartAt                 : null,
        lastStartAt                  : null
    };
}

/**
 * Records an ISO timestamp as the first/last start boundary.
 *
 * @param {Object} ledger
 * @param {Date} timestamp
 */
function recordStartTimestamp(ledger, timestamp) {
    const iso = timestamp.toISOString();

    if (!ledger.firstStartAt || iso < ledger.firstStartAt) {
        ledger.firstStartAt = iso;
    }
    if (!ledger.lastStartAt || iso > ledger.lastStartAt) {
        ledger.lastStartAt = iso;
    }
}

/**
 * Parses one orchestrator log content string.
 *
 * @param {String} content
 * @param {Object} [options]
 * @param {String} [options.source='inline']
 * @param {Date|null} [options.windowStart=null]
 * @param {Date|null} [options.windowEnd=null]
 * @returns {Object}
 */
export function parseOrchestratorLog(content, {
    source      = 'inline',
    windowStart = null,
    windowEnd   = null
} = {}) {
    const ledger = createLogLedger(source);

    for (const line of String(content || '').split(/\r?\n/)) {
        const timestamp = parseLogTimestamp(line);
        if (!isInsideWindow(timestamp, {windowStart, windowEnd})) continue;

        if (line.includes('Starting memory miniSummary backfill')) {
            const pending = Number(line.match(/pending-memory-minisummary:(\d+)/)?.[1] || 0);

            ledger.starts++;
            ledger.pendingStartSum += pending;
            ledger.pendingStartMax = Math.max(ledger.pendingStartMax, pending);
            recordStartTimestamp(ledger, timestamp);
        } else if (line.includes('memory miniSummary backfill completed successfully')) {
            ledger.completions++;
        } else if (line.includes('Deferring memory miniSummary backfill')) {
            const pending = Number(line.match(/pending-memory-minisummary:(\d+)/)?.[1] || 0);

            ledger.pendingDeferrals++;
            ledger.pendingDeferralSum += pending;
        } else if (line.includes('heavy maintenance task memory miniSummary backfill is active')) {
            ledger.activeTaskDeferrals++;
        }
    }

    ledger.maxRepresentedCallAttempts = ledger.pendingStartSum;

    return ledger;
}

/**
 * Aggregates multiple per-log ledgers.
 *
 * @param {Object[]} ledgers
 * @returns {Object}
 */
export function aggregateLedgers(ledgers) {
    const total = createLogLedger('total');

    for (const ledger of ledgers) {
        total.starts                     += ledger.starts;
        total.completions                += ledger.completions;
        total.pendingStartSum            += ledger.pendingStartSum;
        total.pendingStartMax             = Math.max(total.pendingStartMax, ledger.pendingStartMax);
        total.pendingDeferrals           += ledger.pendingDeferrals;
        total.pendingDeferralSum         += ledger.pendingDeferralSum;
        total.activeTaskDeferrals        += ledger.activeTaskDeferrals;
        total.maxRepresentedCallAttempts += ledger.maxRepresentedCallAttempts;

        if (ledger.firstStartAt && (!total.firstStartAt || ledger.firstStartAt < total.firstStartAt)) {
            total.firstStartAt = ledger.firstStartAt;
        }
        if (ledger.lastStartAt && (!total.lastStartAt || ledger.lastStartAt > total.lastStartAt)) {
            total.lastStartAt = ledger.lastStartAt;
        }
    }

    return total;
}

/**
 * Estimates Gemini text-call cost for aggregate private-content-safe input stats.
 *
 * @param {Object} options
 * @param {Number} options.calls
 * @param {Object<String, Number>} options.inputCharStats
 * @param {Number} [options.charsPerToken=4]
 * @param {Number} [options.fixedPromptChars=0]
 * @param {Number} [options.inputPricePerMillion=0.5]
 * @param {Number} [options.outputPricePerMillion=3]
 * @param {Number} [options.outputTokens=100]
 * @returns {Array<Object>}
 */
export function estimateCostBands({
    calls,
    inputCharStats,
    charsPerToken         = DEFAULTS.charsPerToken,
    fixedPromptChars      = DEFAULTS.fixedPromptChars,
    inputPricePerMillion  = DEFAULTS.inputPricePerMillion,
    outputPricePerMillion = DEFAULTS.outputPricePerMillion,
    outputTokens          = DEFAULTS.outputTokens
}) {
    return Object.entries(inputCharStats)
        .filter(([, chars]) => Number.isFinite(chars))
        .map(([label, chars]) => {
            const
                inputTokensPerCall = (chars + fixedPromptChars) / charsPerToken,
                inputCost          = calls * inputTokensPerCall * inputPricePerMillion / 1_000_000,
                outputCost         = calls * outputTokens * outputPricePerMillion / 1_000_000,
                estimatedCost      = inputCost + outputCost;

            return {
                label,
                calls,
                inputCharsPerCall: chars,
                inputTokensPerCall,
                outputTokensPerCall: outputTokens,
                inputCost,
                outputCost,
                estimatedCost
            };
        });
}

/**
 * Formats a number with stable cost-ledger precision.
 *
 * @param {Number} value
 * @returns {String}
 */
function formatNumber(value) {
    return Number.isFinite(value) ? value.toFixed(4) : 'n/a';
}

/**
 * Parses a numeric CLI flag.
 *
 * @param {String} flag
 * @returns {Function}
 */
function parseNumberFlag(flag) {
    return value => {
        const number = Number(value);
        if (!Number.isFinite(number)) {
            throw new Error(`${flag} requires a finite number`);
        }

        return number;
    };
}

/**
 * Parses an ISO date CLI flag.
 *
 * @param {String} flag
 * @returns {Function}
 */
function parseDateFlag(flag) {
    return value => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`${flag} requires an ISO timestamp`);
        }

        return date;
    };
}

/**
 * Collects repeatable CLI options.
 *
 * @param {String} value
 * @param {String[]} previous
 * @returns {String[]}
 */
function collectOption(value, previous = []) {
    previous.push(value);
    return previous;
}

/**
 * Builds a fresh commander Program for the Gemini incident cost ledger CLI.
 *
 * @returns {Command}
 */
export function createProgram() {
    const program = new Command();

    program
        .name('gemini-incident-cost-ledger')
        .description('Private-content-safe Gemini incident cost ledger helper.')
        .exitOverride()
        .allowExcessArguments(false)
        .option('--log <path>', 'Orchestrator log path. Can be provided multiple times.', collectOption, [])
        .option('--window-start <ISO>', 'Inclusive log window start.', parseDateFlag('--window-start'), null)
        .option('--window-end <ISO>', 'Inclusive log window end.', parseDateFlag('--window-end'), null)
        .option('--calls <count>', 'Manual call-count override.', parseNumberFlag('--calls'), null)
        .option('--billing-cost <amount>', 'Cloud Billing cost to compare against estimates.', parseNumberFlag('--billing-cost'), null)
        .option('--billing-requests <count>', 'Cloud Billing request count.', parseNumberFlag('--billing-requests'), null)
        .option('--chars-per-token <count>', 'Estimated chars/token ratio.', parseNumberFlag('--chars-per-token'), DEFAULTS.charsPerToken)
        .option('--fixed-prompt-chars <count>', 'Fixed prompt wrapper characters per call.', parseNumberFlag('--fixed-prompt-chars'), DEFAULTS.fixedPromptChars)
        .option('--input-price-per-million <amount>', 'Input token price per 1M tokens.', parseNumberFlag('--input-price-per-million'), DEFAULTS.inputPricePerMillion)
        .option('--output-price-per-million <amount>', 'Output token price per 1M tokens.', parseNumberFlag('--output-price-per-million'), DEFAULTS.outputPricePerMillion)
        .option('--output-tokens <count>', 'Estimated output tokens per call.', parseNumberFlag('--output-tokens'), DEFAULTS.outputTokens)
        .option('--input-chars-p50 <chars>', 'Aggregate p50 input characters per call.', parseNumberFlag('--input-chars-p50'))
        .option('--input-chars-p90 <chars>', 'Aggregate p90 input characters per call.', parseNumberFlag('--input-chars-p90'))
        .option('--input-chars-p95 <chars>', 'Aggregate p95 input characters per call.', parseNumberFlag('--input-chars-p95'))
        .option('--input-chars-p99 <chars>', 'Aggregate p99 input characters per call.', parseNumberFlag('--input-chars-p99'))
        .option('--input-chars-mean <chars>', 'Aggregate mean input characters per call.', parseNumberFlag('--input-chars-mean'))
        .option('--input-chars-max <chars>', 'Aggregate max input characters per call.', parseNumberFlag('--input-chars-max'))
        .option('--json', 'Print JSON instead of the human-readable report.', false);

    return program;
}

/**
 * Extracts the provided aggregate input character stats from commander options.
 *
 * @param {Object} options
 * @returns {Object<String, Number>}
 */
function getInputCharStats(options) {
    const stats = {};

    for (const [key, label] of [
        ['inputCharsP50',  'p50'],
        ['inputCharsP90',  'p90'],
        ['inputCharsP95',  'p95'],
        ['inputCharsP99',  'p99'],
        ['inputCharsMean', 'mean'],
        ['inputCharsMax',  'max']
    ]) {
        if (Number.isFinite(options[key])) {
            stats[label] = options[key];
        }
    }

    return stats;
}

/**
 * Parses CLI arguments through commander.
 *
 * @param {String[]} argv
 * @returns {Object}
 */
export function parseArgs(argv) {
    const program = createProgram();
    program.configureOutput({writeOut: () => {}, writeErr: () => {}});
    program.parse(argv, {from: 'user'});

    const options = program.opts();

    return {
        logPaths             : options.log,
        inputCharStats       : getInputCharStats(options),
        windowStart          : options.windowStart,
        windowEnd            : options.windowEnd,
        callsOverride        : options.calls,
        billingCost          : options.billingCost,
        billingRequests      : options.billingRequests,
        json                 : options.json,
        charsPerToken        : options.charsPerToken,
        fixedPromptChars     : options.fixedPromptChars,
        inputPricePerMillion : options.inputPricePerMillion,
        outputPricePerMillion: options.outputPricePerMillion,
        outputTokens         : options.outputTokens
    };
}

/**
 * Builds the full ledger from CLI-shaped options.
 *
 * @param {Object} options
 * @returns {Object}
 */
export function buildLedger(options) {
    const perLog = options.logPaths.map(logPath => {
        const fullPath = path.resolve(logPath);
        return parseOrchestratorLog(fs.readFileSync(fullPath, 'utf8'), {
            source     : fullPath,
            windowStart: options.windowStart,
            windowEnd  : options.windowEnd
        });
    });

    const
        totals = aggregateLedgers(perLog),
        calls  = options.callsOverride ?? totals.maxRepresentedCallAttempts,
        estimates = estimateCostBands({
            calls,
            inputCharStats       : options.inputCharStats,
            charsPerToken        : options.charsPerToken,
            fixedPromptChars     : options.fixedPromptChars,
            inputPricePerMillion : options.inputPricePerMillion,
            outputPricePerMillion: options.outputPricePerMillion,
            outputTokens         : options.outputTokens
        });

    const billing = {
        cost    : options.billingCost,
        requests: options.billingRequests
    };

    if (billing.cost !== null) {
        billing.residuals = estimates.map(item => ({
            label: item.label,
            cost : billing.cost - item.estimatedCost
        }));
    }

    return {
        generatedAt: new Date().toISOString(),
        scope      : {
            windowStart: options.windowStart?.toISOString() ?? null,
            windowEnd  : options.windowEnd?.toISOString() ?? null,
            logCount   : options.logPaths.length
        },
        assumptions: {
            charsPerToken        : options.charsPerToken,
            fixedPromptChars     : options.fixedPromptChars,
            inputPricePerMillion : options.inputPricePerMillion,
            outputPricePerMillion: options.outputPricePerMillion,
            outputTokens         : options.outputTokens,
            callsSource          : options.callsOverride === null ? 'log-pending-start-sum' : 'manual-override'
        },
        perLog,
        totals,
        calls,
        estimates,
        billing
    };
}

/**
 * Formats a human-readable report.
 *
 * @param {Object} ledger
 * @returns {String}
 */
export function formatReport(ledger) {
    const lines = [
        'Gemini Incident Cost Ledger (#12743)',
        '------------------------------------',
        `Logs scanned: ${ledger.scope.logCount}`,
        `Window: ${ledger.scope.windowStart || 'start'} -> ${ledger.scope.windowEnd || 'end'}`,
        `Starts: ${ledger.totals.starts}`,
        `Completions: ${ledger.totals.completions}`,
        `Pending-start sum / max represented calls: ${ledger.totals.maxRepresentedCallAttempts}`,
        `Pending deferrals: ${ledger.totals.pendingDeferrals}`,
        `Active-task deferrals: ${ledger.totals.activeTaskDeferrals}`,
        `Calls used for estimates: ${ledger.calls} (${ledger.assumptions.callsSource})`,
        '',
        'Assumptions:',
        `- chars/token: ${ledger.assumptions.charsPerToken}`,
        `- fixed prompt chars/call: ${ledger.assumptions.fixedPromptChars}`,
        `- input price / 1M tokens: ${ledger.assumptions.inputPricePerMillion}`,
        `- output price / 1M tokens: ${ledger.assumptions.outputPricePerMillion}`,
        `- output tokens/call: ${ledger.assumptions.outputTokens}`,
        '',
        'Estimate bands:'
    ];

    if (ledger.estimates.length === 0) {
        lines.push('- none (pass --input-chars-mean / --input-chars-p99 / etc.)');
    } else {
        ledger.estimates.forEach(item => {
            lines.push(`- ${item.label}: inputTokens/call=${formatNumber(item.inputTokensPerCall)}, estimatedCost=${formatNumber(item.estimatedCost)}`);
        });
    }

    if (ledger.billing.cost !== null) {
        lines.push('', `Billing cost provided: ${formatNumber(ledger.billing.cost)}`);
        ledger.billing.residuals.forEach(item => {
            lines.push(`- residual vs ${item.label}: ${formatNumber(item.cost)}`);
        });
    }

    lines.push(
        '',
        'Note: this is a public-pricing sanity ledger. Cloud Billing SKU/model/token data remains authoritative.'
    );

    return `${lines.join('\n')}\n`;
}

function main() {
    try {
        const options = parseArgs(process.argv.slice(2));

        if (options.logPaths.length === 0) {
            throw new Error('At least one --log <path> is required');
        }

        const ledger = buildLedger(options);

        if (options.json) {
            console.log(JSON.stringify(ledger, null, 2));
        } else {
            process.stdout.write(formatReport(ledger));
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        console.error('Usage: npm run ai:gemini-incident-cost-ledger -- --log <orchestrator.log> [--window-start ISO] [--window-end ISO] [--input-chars-mean N] [--input-chars-p99 N] [--billing-cost N] [--json]');
        process.exit(1);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    main();
}
