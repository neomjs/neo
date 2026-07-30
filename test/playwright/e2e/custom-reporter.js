import fs from 'fs-extra';
import os from 'os';
import { execSync } from 'child_process';
import path from 'path';
import {isEngineProfile} from './utils/gpuIntent.mjs';

const
  ANSI_ESCAPE_PATTERN = /\u001B\[[0-?]*[ -/]*[@-~]/g,
  PROCESS_EXIT_PATTERN = /\[pid=(\d+)]\s+<process did exit: exitCode=([^,>]+), signal=([^>]+)>/;

/**
 * @summary Resolves the Neo browser launch profile without conflating film run mode with launch policy.
 * @returns {'presenting'|'engine'}
 */
export function resolveE2eProfileName() {
  return isEngineProfile() ? 'engine' : 'presenting'
}

/**
 * @summary Reads optional host telemetry without allowing a restricted platform call to erase the run receipt.
 * @param {Function} read
 * @param {*} [fallback=null]
 * @returns {*}
 */
export function readOptionalSystemFact(read, fallback=null) {
  try {
    return read()
  } catch {
    return fallback
  }
}

/**
 * @summary Extracts the bounded launch-process receipt Playwright already carries in a rejected browser launch.
 * @param {Error|Object|String} error
 * @param {Object} [context]
 * @param {String|null} [context.channel=null]
 * @param {String|null} [context.profile=resolveE2eProfileName()]
 * @param {String|null} [context.project=null]
 * @returns {Object|null}
 */
export function classifyBrowserLaunchExit(error, {
  channel = null,
  profile = resolveE2eProfileName(),
  project = null
} = {}) {
  const
    rawText = typeof error === 'string'
      ? error
      : [error?.message, error?.stack, error?.value].filter(Boolean).join('\n'),
    text    = String(rawText).replace(ANSI_ESCAPE_PATTERN, ''),
    match   = text.match(PROCESS_EXIT_PATTERN);

  // The process-exit grammar also appears during normal browser teardown. Only a rejected
  // BrowserType launch proves that Playwright never yielded a usable Browser fixture.
  if (!/\bbrowserType\.launch:/.test(text) || !match) return null;

  const
    exitValue = match[2].trim(),
    signal    = match[3].trim(),
    exitCode  = exitValue === 'null'
      ? null
      : /^-?\d+$/.test(exitValue) ? Number(exitValue) : exitValue,
    exitSignal = signal === 'null' ? null : signal;

  return {
    classification          : 'browser-launch-process-exit',
    project,
    channel,
    profile,
    processId               : Number(match[1]),
    exitCode,
    signal                  : exitSignal,
    abnormal                : exitCode !== 0 || exitSignal !== null,
    browserObjectEstablished: false,
    // Playwright may construct a pipe before connectToTransport() rejects. Reporter callbacks do
    // not expose that boundary, so a Boolean here would manufacture certainty.
    transportState          : 'not-observable'
  }
}

/**
 * @summary Retains benchmark host facts and bounded browser-launch lifecycle evidence for one E2E run.
 */
export default class BenchmarkSystemReporter {
  /**
   * @summary Initializes one reporter-owned receipt without taking ownership of Playwright browsers.
   * @param {Object} [options]
   * @param {String} [options.outputFile='benchmark-system-info.json']
   */
  constructor(options={}) {
      this.outputFile = options?.outputFile || 'benchmark-system-info.json';
      this.receipt = null;
      this.launchExits = new Map();
  }

  /**
   * @summary Opens the retained run receipt before test execution begins.
   * @param {Object} config
   * @param {Object} suite
   * @returns {void}
   */
  onBegin(config, suite) {
    const systemInfo = this.getSystemInfo();

    this.receipt = {
      ...systemInfo,
      benchmarkRun: {
        timestamp: new Date().toISOString(),
        playwrightProjects: config.projects?.map(p => p.name) || [],
        totalTests: suite.allTests().length
      },
      browserLifecycle: {
        profile: resolveE2eProfileName(),
        launchExits: [...this.launchExits.values()]
      }
    };

    this.flushReceipt();

    console.log('');
    console.log('='.repeat(50));
    console.log('🚀 BENCHMARK SYSTEM INFORMATION');
    console.log('='.repeat(50));
    console.log(`🖥️  OS: ${systemInfo.os} ${systemInfo.osVersion} (${systemInfo.arch})`);
    console.log(`💾 RAM: ${systemInfo.totalMemory}GB (Available: ${systemInfo.freeMemory}GB)`);
    console.log(`⚡ CPU: ${systemInfo.cpuModel} (${systemInfo.cpuCores} cores @ ${systemInfo.cpuSpeed}GHz)`);
    console.log(`📦 Node.js: ${systemInfo.nodeVersion}`);

    console.log(`🏃 Running ${suite.allTests().length} tests across ${config.projects?.length || 1} browsers`);
    console.log('='.repeat(50));
    console.log('');
  }

  /**
   * @summary Persists the bounded run receipt immediately so a later runner failure cannot erase the incident.
   * @returns {void}
   */
  flushReceipt() {
    if (!this.receipt) return;

    fs.ensureDirSync(path.dirname(this.outputFile));
    fs.writeJsonSync(this.outputFile, this.receipt, { spaces: 2 })
  }

  /**
   * @summary Deduplicates one Playwright launch exit across reporter error and test-result delivery.
   * @param {Error|Object|String} error
   * @param {Object} [context]
   * @param {String|null} [context.channel=null]
   * @param {String} [context.observedVia='reporter-error']
   * @param {String|null} [context.project=null]
   * @returns {Object|null}
   */
  captureBrowserLaunchExit(error, {
    channel = null,
    observedVia = 'reporter-error',
    project = null
  } = {}) {
    const incident = classifyBrowserLaunchExit(error, {channel, project});

    if (!incident) return null;

    const
      key      = [incident.processId, incident.exitCode, incident.signal].join(':'),
      existing = this.launchExits.get(key);

    if (existing) {
      if (!existing.observedVia.includes(observedVia)) existing.observedVia.push(observedVia);
      if (!existing.project && project) existing.project = project;
      if (!existing.channel && channel) existing.channel = channel;
      this.flushReceipt();

      return existing
    }

    const receipt = {
      ...incident,
      observedVia: [observedVia]
    };

    this.launchExits.set(key, receipt);

    if (this.receipt) {
      this.receipt.browserLifecycle.launchExits = [...this.launchExits.values()];
      this.flushReceipt()
    }

    console.error(
      `[browser-lifecycle] project=${project ?? 'unknown'} profile=${incident.profile} ` +
      `pid=${incident.processId} exitCode=${incident.exitCode ?? 'null'} ` +
      `signal=${incident.signal ?? 'null'} browserObjectEstablished=false ` +
      'transportState=not-observable'
    );

    return receipt
  }

  /**
   * @summary Captures browser-launch failures that occur outside an individual test result.
   * @param {Object} error
   * @param {Object} [workerInfo]
   * @returns {void}
   */
  onError(error, workerInfo) {
    const project = workerInfo?.project;

    this.captureBrowserLaunchExit(error, {
      channel    : project?.use?.channel ?? null,
      observedVia: 'reporter-error',
      project    : project?.name ?? null
    })
  }

  /**
   * @summary Captures fixture-bound launch failures with their exact project and retry identity.
   * @param {Object} test
   * @param {Object} result
   * @returns {void}
   */
  onTestEnd(test, result) {
    const project = test.parent?.project?.();

    for (const error of result.errors || (result.error ? [result.error] : [])) {
      this.captureBrowserLaunchExit(error, {
        channel    : project?.use?.channel ?? null,
        observedVia: 'test-result',
        project    : project?.name ?? null
      })
    }
  }

  /**
   * @summary Reads optional benchmark host facts while preserving fallbacks on restricted seats.
   * @returns {Object}
   */
  getSystemInfo() {
    let
      osVersion = os.release(),
      cpuModel  = 'Unknown',
      cpuSpeed  = 'Unknown';

    if (process.platform === 'darwin') {
      const commandOptions = {
        encoding: 'utf8',
        stdio   : ['ignore', 'pipe', 'ignore']
      };

      osVersion = readOptionalSystemFact(
        () => execSync('sw_vers -productVersion', commandOptions).trim(),
        osVersion
      );
      cpuModel = readOptionalSystemFact(
        () => execSync('sysctl -n machdep.cpu.brand_string', commandOptions).trim(),
        cpuModel
      );

      const rawCpuSpeed = readOptionalSystemFact(
        () => execSync('sysctl -n hw.cpufrequency_max', commandOptions).trim(),
        null
      );

      if (rawCpuSpeed) {
        cpuSpeed = (parseInt(rawCpuSpeed) / 1000000000).toFixed(1)
      }
    }

    return {
      os: this.getOSName(),
      osVersion,
      arch: process.arch,
      platform: process.platform,
      totalMemory: Math.round(os.totalmem() / (1024 ** 3)),
      freeMemory: Math.round(os.freemem() / (1024 ** 3)),
      cpuCores: os.cpus().length,
      cpuModel,
      cpuSpeed,
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
      loadAverage: readOptionalSystemFact(() => os.loadavg(), null),
      uptime: readOptionalSystemFact(() => Math.round(os.uptime() / 3600), null),
    };
  }

  /**
   * @summary Maps the Node platform identifier to the reporter's display label.
   * @returns {String}
   */
  getOSName() {
    const platform = process.platform;
    switch (platform) {
      case 'darwin': return 'macOS';
      case 'win32': return 'Windows';
      case 'linux': return 'Linux';
      default: return platform;
    }
  }

  /**
   * @summary Flushes the final receipt and prints the existing terminal benchmark summary.
   * @param {Object} result
   * @returns {void}
   */
  onEnd(result) {
    const duration = result.duration || 0;

    this.flushReceipt();

    console.log(`\n Benchmark completed in ${Math.round(duration / 1000)}s`);
    console.log(`✅ Passed: ${result.stats?.passed || 0}`);
    console.log(`❌ Failed: ${result.stats?.failed || 0}`);
    console.log(`⏭️  Skipped: ${result.stats?.skipped || 0}`);
  }
}
