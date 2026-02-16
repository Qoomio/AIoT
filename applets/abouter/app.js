/**
 * Abouter Applet Helper Functions
 * 
 * Provides system information utilities for the about endpoint.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Read package.json from the project root
 * @returns {object} Parsed package.json contents
 */
function getPackageInfo() {
  const packagePath = path.join(__dirname, '..', '..', 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    return {
      version: packageJson.version || 'unknown',
      description: packageJson.description || 'No description'
    };
  } catch (error) {
    console.error('Error reading package.json:', error.message);
    return {
      version: 'unknown',
      description: 'Unable to read package.json'
    };
  }
}

/**
 * Get environment variable values
 * @returns {object} Environment values
 */
function getEnvInfo() {
  return {
    NODE_ENV: process.env.NODE_ENV || 'not set',
    CHALLENGER_ROLE: process.env.CHALLENGER_ROLE || 'not set'
  };
}

/**
 * Detect if running on a Raspberry Pi and get the model
 * @returns {object} Pi detection info
 */
function getPiInfo() {
  const result = {
    isRaspberryPi: false,
    model: null,
    version: null
  };

  // Only check on Linux
  if (os.platform() !== 'linux') {
    return result;
  }

  // Try to read the device tree model file (most reliable method)
  try {
    const modelPath = '/sys/firmware/devicetree/base/model';
    if (fs.existsSync(modelPath)) {
      const modelInfo = fs.readFileSync(modelPath, 'utf8').replace(/\0/g, '').trim();
      
      if (modelInfo.toLowerCase().includes('raspberry pi')) {
        result.isRaspberryPi = true;
        result.model = modelInfo;
        
        // Extract version (e.g., "3B", "4", "5")
        const versionMatch = modelInfo.match(/Raspberry Pi (\d+[A-Za-z]*)/i);
        if (versionMatch) {
          result.version = versionMatch[1].toLowerCase();
        }
      }
    }
  } catch (error) {
    // Silently fail - not a Pi or no access
  }

  // Fallback: Try /proc/cpuinfo
  if (!result.isRaspberryPi) {
    try {
      const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
      
      // Look for Raspberry Pi in the Hardware or Model fields
      if (cpuInfo.includes('Raspberry Pi') || cpuInfo.includes('BCM')) {
        const modelLine = cpuInfo.split('\n').find(line => 
          line.startsWith('Model') || line.includes('Raspberry Pi')
        );
        
        if (modelLine && modelLine.toLowerCase().includes('raspberry pi')) {
          result.isRaspberryPi = true;
          result.model = modelLine.split(':').pop()?.trim() || 'Raspberry Pi (unknown model)';
          
          const versionMatch = result.model.match(/(\d+[A-Za-z]*)/);
          if (versionMatch) {
            result.version = versionMatch[1].toLowerCase();
          }
        }
      }
    } catch (error) {
      // Silently fail
    }
  }

  return result;
}

/**
 * Get OS information
 * @returns {object} OS details
 */
function getOsInfo() {
  let osVersion = os.release();
  let osName = os.platform();
  
  // Try to get more detailed Linux distribution info
  if (os.platform() === 'linux') {
    try {
      // Try os-release first (most modern Linux systems)
      if (fs.existsSync('/etc/os-release')) {
        const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
        const prettyName = osRelease.split('\n').find(line => line.startsWith('PRETTY_NAME='));
        if (prettyName) {
          osName = prettyName.split('=')[1].replace(/"/g, '').trim();
        }
        const versionId = osRelease.split('\n').find(line => line.startsWith('VERSION_ID='));
        if (versionId) {
          osVersion = versionId.split('=')[1].replace(/"/g, '').trim();
        }
      }
    } catch (error) {
      // Fall back to basic info
    }
  } else if (os.platform() === 'darwin') {
    osName = 'macOS';
  } else if (os.platform() === 'win32') {
    osName = 'Windows';
  }

  return {
    name: osName,
    version: osVersion,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname()
  };
}

/**
 * Get RAM information
 * @returns {object} Memory details
 */
function getRamInfo() {
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;

  const formatBytes = (bytes) => {
    const gb = bytes / (1024 * 1024 * 1024);
    const mb = bytes / (1024 * 1024);
    
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    }
    return `${mb.toFixed(2)} MB`;
  };

  return {
    total: formatBytes(totalBytes),
    totalBytes: totalBytes,
    free: formatBytes(freeBytes),
    freeBytes: freeBytes,
    used: formatBytes(usedBytes),
    usedBytes: usedBytes,
    usagePercent: ((usedBytes / totalBytes) * 100).toFixed(1) + '%'
  };
}

/**
 * Get all system information
 * @returns {object} Complete system info
 */
function getSystemInfo() {
  const packageInfo = getPackageInfo();
  const envInfo = getEnvInfo();
  const piInfo = getPiInfo();
  const osInfo = getOsInfo();
  const ramInfo = getRamInfo();

  return {
    version: packageInfo.version,
    description: packageInfo.description,
    environment: envInfo,
    raspberryPi: piInfo,
    os: osInfo,
    ram: ramInfo,
    timestamp: new Date().toISOString()
  };
}

export {
  getPackageInfo,
  getEnvInfo,
  getPiInfo,
  getOsInfo,
  getRamInfo,
  getSystemInfo
};
