#!/usr/bin/env node

import {Command}       from 'commander';
import isEntryModule   from '../../util/isEntryModule.mjs';
import {sanitizeInput} from '../../util/sanitizer.mjs';
import {
    LLMS_TXT_MAX_BYTES,
    validateLlmsTxtContent,
    validateRobotsTxt,
    validateSitemapIndexXml,
    validateUrlsetXml
} from './verify.mjs';

/**
 * @module buildScripts.docs.seo.verifyLive
 * @summary Post-deploy HTTP verifier and CLI gate for the live `neomjs.com` SEO and agent-discovery surface
 * (`robots.txt`, `sitemap*.xml`, `llms*.txt`, `Googlebot` SSR metadata/JSON-LD/`noindex`, and Markdown twins).
 */

const GOOGLEBOT_USER_AGENT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const GOOGLEBOT_ACCEPT     = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const VERIFIER_USER_AGENT  = 'NeoSeoLiveVerifier/1.0';

/**
 * @summary Extracts the `href` attribute from `<link rel="canonical" ...>` regardless of attribute order.
 * @param {String} [html='']
 * @returns {String|null}
 */
function extractCanonicalHref(html='') {
    for (const [tag] of String(html).matchAll(/<link\b[^>]*>/gi)) {
        if (/\brel\s*=\s*["']canonical["']/i.test(tag)) {
            const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);

            if (hrefMatch) {
                return hrefMatch[1].trim();
            }
        }
    }

    return null;
}

/**
 * @summary Extracts the `content` attribute from `<meta name="<name>" ...>` regardless of attribute order.
 * @param {String} [html='']
 * @param {String} [name='']
 * @returns {String|null}
 */
function extractMetaContent(html='', name='') {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const namePattern = new RegExp(`\\bname\\s*=\\s*["']${escapedName}["']`, 'i');

    for (const [tag] of String(html).matchAll(/<meta\b[^>]*>/gi)) {
        if (namePattern.test(tag)) {
            const contentMatch = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag);

            if (contentMatch) {
                return contentMatch[1].trim();
            }
        }
    }

    return null;
}

/**
 * @summary Checks whether `html` carries a parseable `<script data-schema-name="...">` JSON-LD block.
 * @param {String} [html='']
 * @param {String} [schemaName='']
 * @returns {Boolean}
 */
function hasNamedJsonLd(html='', schemaName='') {
    const escapedName = schemaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern     = new RegExp(
        `<script\\b[^>]*\\bdata-schema-name\\s*=\\s*["']${escapedName}["'][^>]*>([\\s\\S]*?)<\\/script>`,
        'i'
    );
    const match = pattern.exec(String(html));

    if (!match || !match[1]?.trim()) {
        return false;
    }

    try {
        JSON.parse(match[1].trim());
        return true;
    } catch {
        return false;
    }
}

/**
 * @summary Counts `<h1>` elements in `html` outside HTML comments, `<script>`, and `<style>` raw-text blocks
 * using a single-pass tag scanner without regex HTML sanitization.
 * @param {String} [html='']
 * @returns {Number}
 */
export function countHtmlH1Tags(html='') {
    const lower  = String(html).toLowerCase();
    let count    = 0;
    let index    = 0;
    let rawTag   = null;

    while (index < lower.length) {
        if (rawTag) {
            const closePrefix = `</${rawTag}`;
            const closeStart  = lower.indexOf(closePrefix, index);

            if (closeStart === -1) {
                break;
            }

            const boundaryChar = lower[closeStart + closePrefix.length] || '';

            if (boundaryChar === '>' || boundaryChar === '/' || /\s/.test(boundaryChar)) {
                const closeEnd = lower.indexOf('>', closeStart + closePrefix.length);

                if (closeEnd === -1) {
                    break;
                }

                rawTag = null;
                index  = closeEnd + 1;
            } else {
                index = closeStart + closePrefix.length;
            }
            continue;
        }

        const lt = lower.indexOf('<', index);

        if (lt === -1) {
            break;
        }

        if (lower.startsWith('<!--', lt)) {
            const commentEnd = lower.indexOf('-->', lt + 4);

            if (commentEnd === -1) {
                break;
            }

            index = commentEnd + 3;
            continue;
        }

        let cursor = lt + 1;

        while (cursor < lower.length && /[a-z0-9:-]/.test(lower[cursor])) {
            cursor += 1;
        }

        const tagName      = lower.slice(lt + 1, cursor);
        const boundaryChar = lower[cursor] || '';
        const isBoundary   = boundaryChar === '>' || boundaryChar === '/' || /\s/.test(boundaryChar);

        if (tagName && isBoundary) {
            const tagEnd = lower.indexOf('>', cursor);

            if (tagEnd === -1) {
                break;
            }

            if (tagName === 'h1') {
                count += 1;
            } else if ((tagName === 'script' || tagName === 'style') && lower[tagEnd - 1] !== '/') {
                rawTag = tagName;
            }

            index = tagEnd + 1;
        } else {
            index = lt + 1;
        }
    }

    return count;
}

/**
 * @summary Executes a single non-redirect-following HTTP GET probe and normalizes status, headers, and body.
 * @param {String} url
 * @param {Object} options
 * @param {Function} options.fetchFn
 * @param {Object<String, String>} [options.headers={}]
 * @param {Number} options.timeoutMs
 * @returns {Promise<{body: String, contentType: String, error: (String|null), status: (Number|null), vary: String, xRobotsTag: String}>}
 */
async function probeUrl(url, {fetchFn, headers={}, timeoutMs}) {
    const signal = typeof AbortSignal?.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;

    try {
        const response = await fetchFn(url, {
            headers,
            redirect: 'manual',
            ...(signal && {signal})
        });
        const body = await response.text();

        return {
            body,
            contentType: response.headers.get('content-type') || '',
            error      : null,
            status     : response.status,
            vary       : response.headers.get('vary') || '',
            xRobotsTag : response.headers.get('x-robots-tag') || ''
        };
    } catch (error) {
        return {
            body       : '',
            contentType: '',
            error      : error?.message || String(error),
            status     : null,
            vary       : '',
            xRobotsTag : ''
        };
    }
}

/**
 * @summary Probes a live Neo.mjs origin across `robots.txt`, `sitemap*.xml`, `llms*.txt`, `Googlebot` SSR
 * routes, and Markdown twins, throwing a consolidated `Error` when any check fails.
 * @param {Object} [options={}]
 * @param {String} [options.baseUrl='https://neomjs.com']
 * @param {String|null} [options.expectedCanonicalOrigin=null]
 * @param {String|null} [options.expectedOrigin=null]
 * @param {Function} [options.fetchFn=globalThis.fetch]
 * @param {Boolean} [options.requireMarkdownTwins=true]
 * @param {String} [options.sampleArchiveTicketRoute='/news/tickets/20671']
 * @param {String} [options.sampleLearnRoute='/learn/benefits/Introduction']
 * @param {Number} [options.timeoutMs=15000]
 * @returns {Promise<{baseUrl: String, checks: Array<{errors: String[], id: String, passed: Boolean, status: (Number|null), url: String}>, expectedOrigin: String, passed: Boolean}>}
 */
export async function verifyLiveSeoSurface(options={}) {
    const {
        baseUrl                  = 'https://neomjs.com',
        expectedCanonicalOrigin  = options.expectedOrigin || null,
        fetchFn                  = globalThis.fetch,
        requireMarkdownTwins     = true,
        sampleArchiveTicketRoute = '/news/tickets/20671',
        sampleLearnRoute         = '/learn/benefits/Introduction',
        timeoutMs                = 15000
    } = options;

    if (!baseUrl || typeof baseUrl !== 'string') {
        throw new Error('verifyLiveSeoSurface requires a non-empty baseUrl string.');
    }

    if (typeof fetchFn !== 'function') {
        throw new Error('verifyLiveSeoSurface requires a fetchFn implementation.');
    }

    const normalizedBaseUrl  = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const expectedOrigin     = new URL(expectedCanonicalOrigin || normalizedBaseUrl).origin;
    const learnRoute         = sampleLearnRoute.startsWith('/') ? sampleLearnRoute : `/${sampleLearnRoute}`;
    const archiveTicketRoute = sampleArchiveTicketRoute.startsWith('/') ? sampleArchiveTicketRoute : `/${sampleArchiveTicketRoute}`;
    const resolveTargetUrl   = routePath => routePath === '/'
        ? new URL('/', normalizedBaseUrl).toString()
        : new URL(routePath.replace(/^\/+/, ''), normalizedBaseUrl).toString();

    const runCheck = async (id, url, headers, evaluateFn) => {
        const probe  = await probeUrl(url, {fetchFn, headers, timeoutMs});
        const errors = [];

        if (probe.error) {
            errors.push(`request failed (${probe.error})`);
        } else {
            if (probe.status !== 200) {
                errors.push(`expected HTTP 200, received ${probe.status}`);
            }
            evaluateFn(probe, errors);
        }

        return {
            errors,
            id,
            passed: errors.length === 0,
            status: probe.status,
            url
        };
    };

    const googlebotHeaders = {
        Accept      : GOOGLEBOT_ACCEPT,
        'User-Agent': GOOGLEBOT_USER_AGENT
    };

    const checkPromises = [
        runCheck('robots.txt', resolveTargetUrl('/robots.txt'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            errors.push(...validateRobotsTxt(probe.body, {baseUrl: normalizedBaseUrl, expectedOrigin}));
        }),

        runCheck('sitemap.xml', resolveTargetUrl('/sitemap.xml'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            errors.push(...validateSitemapIndexXml(probe.body, {baseUrl: expectedOrigin}));
        }),

        runCheck('sitemap-core.xml', resolveTargetUrl('/sitemap-core.xml'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            errors.push(...validateUrlsetXml(probe.body, 'sitemap-core.xml'));
        }),

        runCheck('sitemap-discussions.xml', resolveTargetUrl('/sitemap-discussions.xml'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            errors.push(...validateUrlsetXml(probe.body, 'sitemap-discussions.xml'));
        }),

        runCheck('llms.txt', resolveTargetUrl('/llms.txt'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            errors.push(...validateLlmsTxtContent(probe.body, {maxBytes: LLMS_TXT_MAX_BYTES, requireAtlasLinks: true}));
        }),

        runCheck('llms-full.txt', resolveTargetUrl('/llms-full.txt'), {'User-Agent': VERIFIER_USER_AGENT}, (probe, errors) => {
            if (!probe.body.trim()) {
                errors.push('llms-full.txt body is empty');
            }
        }),

        runCheck('googlebot-home', resolveTargetUrl('/'), googlebotHeaders, (probe, errors) => {
            const canonical = extractCanonicalHref(probe.body);
            const h1Count   = countHtmlH1Tags(probe.body);

            if (!/text\/html/i.test(probe.contentType)) {
                errors.push(`expected content-type text/html, received "${probe.contentType}"`);
            }
            if (canonical !== `${expectedOrigin}/`) {
                errors.push(`expected canonical "${expectedOrigin}/", received "${canonical}"`);
            }
            if (!hasNamedJsonLd(probe.body, 'neo-organism')) {
                errors.push('missing valid data-schema-name="neo-organism" JSON-LD');
            }
            if (h1Count > 1) {
                errors.push(`expected <= 1 <h1> tag, found ${h1Count}`);
            }
        }),

        runCheck('googlebot-learn', resolveTargetUrl(learnRoute), googlebotHeaders, (probe, errors) => {
            const title       = /<title>([\s\S]*?)<\/title>/i.exec(probe.body)?.[1]?.replace(/\s+/g, ' ')?.trim() || '';
            const description = extractMetaContent(probe.body, 'description') || '';
            const canonical   = extractCanonicalHref(probe.body);

            if (!/text\/html/i.test(probe.contentType)) {
                errors.push(`expected content-type text/html, received "${probe.contentType}"`);
            }
            if (!title || title === 'Neo.mjs') {
                errors.push(`expected route-specific <title>, received "${title}"`);
            }
            if (!description) {
                errors.push('missing non-empty <meta name="description">');
            }
            if (canonical !== `${expectedOrigin}${learnRoute}`) {
                errors.push(`expected canonical "${expectedOrigin}${learnRoute}", received "${canonical}"`);
            }
            if (!hasNamedJsonLd(probe.body, 'neo-route')) {
                errors.push('missing valid data-schema-name="neo-route" JSON-LD');
            }
        }),

        runCheck('googlebot-archive-ticket', resolveTargetUrl(archiveTicketRoute), googlebotHeaders, (probe, errors) => {
            if (!/\bnoindex\b/i.test(probe.xRobotsTag)) {
                errors.push(`expected X-Robots-Tag header to include noindex, received "${probe.xRobotsTag}"`);
            }
        })
    ];

    if (requireMarkdownTwins !== false) {
        checkPromises.push(
            runCheck(
                'markdown-accept-learn',
                resolveTargetUrl(learnRoute),
                {Accept: 'text/markdown, text/html;q=0.8', 'User-Agent': VERIFIER_USER_AGENT},
                (probe, errors) => {
                    if (!/text\/markdown/i.test(probe.contentType)) {
                        errors.push(`expected content-type text/markdown, received "${probe.contentType}"`);
                    }
                    if (!/\baccept\b/i.test(probe.vary)) {
                        errors.push(`expected Vary header to include Accept, received "${probe.vary}"`);
                    }
                    if (!probe.body.trim() || /^\s*<!doctype\s+html/i.test(probe.body)) {
                        errors.push('expected non-HTML Markdown body');
                    }
                }
            ),

            runCheck(
                'markdown-dotmd-learn',
                resolveTargetUrl(`${learnRoute}.md`),
                {'User-Agent': VERIFIER_USER_AGENT},
                (probe, errors) => {
                    if (!/text\/markdown/i.test(probe.contentType)) {
                        errors.push(`expected content-type text/markdown, received "${probe.contentType}"`);
                    }
                    if (!/\baccept\b/i.test(probe.vary)) {
                        errors.push(`expected Vary header to include Accept, received "${probe.vary}"`);
                    }
                    if (!probe.body.trim() || /^\s*<!doctype\s+html/i.test(probe.body)) {
                        errors.push('expected non-HTML Markdown body');
                    }
                }
            ),

            runCheck(
                'markdown-accept-archive-ticket',
                resolveTargetUrl(archiveTicketRoute),
                {Accept: 'text/markdown', 'User-Agent': VERIFIER_USER_AGENT},
                (probe, errors) => {
                    if (!/text\/markdown/i.test(probe.contentType)) {
                        errors.push(`expected content-type text/markdown, received "${probe.contentType}"`);
                    }
                    if (!/\bnoindex\b/i.test(probe.xRobotsTag)) {
                        errors.push(`expected X-Robots-Tag header to include noindex, received "${probe.xRobotsTag}"`);
                    }
                }
            )
        );
    }

    const checks       = await Promise.all(checkPromises);
    const failedChecks = checks.filter(check => !check.passed);

    if (failedChecks.length > 0) {
        const error = new Error(
            `Live SEO verification failed (${failedChecks.length}/${checks.length} checks failed):\n` +
            failedChecks.map(check => `- [${check.id}] ${check.url}: ${check.errors.join('; ')}`).join('\n')
        );
        error.baseUrl        = baseUrl;
        error.checks         = checks;
        error.expectedOrigin = expectedOrigin;
        throw error;
    }

    return {
        baseUrl,
        checks,
        expectedOrigin,
        passed: true
    };
}

/**
 * @summary CLI entrypoint for probing a live or staging Neo.mjs origin.
 * @returns {Promise<void>}
 */
async function runCli() {
    const program = new Command();

    program
        .name('verify-live-seo')
        .description('Verifies live robots.txt, sitemaps, llms*.txt, Googlebot SSR metadata, and Markdown twins.')
        .option('--base-url <url>',        'Origin to probe (default: https://neomjs.com)', sanitizeInput)
        .option('--expected-origin <url>', 'Expected canonical origin when probing staging/local ports', sanitizeInput)
        .option('--skip-markdown-twins',   'Skip Accept: text/markdown and .md twin checks', false)
        .option('--json',                  'Emit JSON check report', false);

    program.parse(process.argv);

    const opts                = program.opts();
    const baseUrl             = opts.baseUrl || 'https://neomjs.com';
    const requireMarkdownTwins = !opts.skipMarkdownTwins;

    try {
        const result = await verifyLiveSeoSurface({
            baseUrl,
            expectedCanonicalOrigin: opts.expectedOrigin || null,
            requireMarkdownTwins
        });

        if (opts.json) {
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log(
                `Live SEO verification passed: baseUrl=${result.baseUrl}, ` +
                `checks=${result.checks.length}/${result.checks.length} green`
            );
        }
    } catch (error) {
        if (opts.json) {
            console.log(JSON.stringify({
                baseUrl,
                checks: error.checks || [],
                error : error.message,
                passed: false
            }, null, 2));
        } else {
            console.error(error.message || error);
        }
        process.exit(1);
    }
}

if (isEntryModule(import.meta.url)) {
    runCli();
}

export default verifyLiveSeoSurface;
