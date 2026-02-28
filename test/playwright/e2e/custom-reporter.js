import fs from 'fs-extra';
import os from 'os';
import { execSync } from 'child_process';
import path from 'path';

class BenchmarkSystemReporter {
  constructor(options) {
      this.outputFile = options?.outputFile || 'benchmark-system-info.json';
  }

  onBegin(config, suite) {
    const systemInfo = this.getSystemInfo();

    const fullSystemInfo = {
      ...systemInfo,
      benchmarkRun: {
        timestamp: new Date().toISOString(),
        playwrightProjects: config.projects?.map(p => p.name) || [],
        totalTests: suite.allTests().length
      }
    };

    const outputDir = path.dirname(this.outputFile);
    fs.ensureDirSync(outputDir);
    
    fs.writeJsonSync(this.outputFile, fullSystemInfo, { spaces: 2 });

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

  getSystemInfo() {
    let osVersion = os.release();
    let cpuModel = 'Unknown';
    let cpuSpeed = 'Unknown';

    try {
      if (process.platform === 'darwin') {
        osVersion = execSync('sw_vers -productVersion', { encoding: 'utf8' }).trim();
        cpuModel = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
        cpuSpeed = execSync('sysctl -n hw.cpufrequency_max', { encoding: 'utf8' }).trim();
        cpuSpeed = cpuSpeed ? (parseInt(cpuSpeed) / 1000000000).toFixed(1) : 'Unknown';
      }
    } catch (e) {
      // Fallback to basic info
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
      loadAverage: os.loadavg(),
      uptime: Math.round(os.uptime() / 3600),
    };
  }

  getOSName() {
    const platform = process.platform;
    switch (platform) {
      case 'darwin': return 'macOS';
      case 'win32': return 'Windows';
      case 'linux': return 'Linux';
      default: return platform;
    }
  }

  onEnd(result) {
    const duration = result.duration || 0;
    console.log(`\n Benchmark completed in ${Math.round(duration / 1000)}s`);
    console.log(`✅ Passed: ${result.stats?.passed || 0}`);
    console.log(`❌ Failed: ${result.stats?.failed || 0}`);
    console.log(`⏭️  Skipped: ${result.stats?.skipped || 0}`);
  }
}

export default BenchmarkSystemReporter;
