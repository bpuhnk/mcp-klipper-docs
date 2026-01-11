/**
 * MCP Klipper Documentation Server - Configuration
 * Application configuration management
 */

import { AppConfig, LogLevel } from './types.js';
import * as path from 'path';

const DEFAULT_CONFIG: AppConfig = {
  server: {
    name: 'mcp-klipper',
    version: '1.0.0'
  },
  git: {
    repository: 'https://github.com/Klipper3d/klipper.git',
    branch: 'master',
    localPath: path.join(process.cwd(), 'data', 'klipper-repo'),
    syncInterval: 3600000 // 1 hour in milliseconds
  },
  search: {
    maxResults: 10,
    snippetLength: 200,
    minScore: 0.1
  },
  logging: {
    level: LogLevel.INFO,
    format: 'text'
  }
};

export function getConfig(): AppConfig {
  return {
    server: {
      name: process.env.SERVER_NAME || DEFAULT_CONFIG.server.name,
      version: process.env.SERVER_VERSION || DEFAULT_CONFIG.server.version
    },
    git: {
      repository: process.env.GIT_REPOSITORY || DEFAULT_CONFIG.git.repository,
      branch: process.env.GIT_BRANCH || DEFAULT_CONFIG.git.branch,
      localPath: process.env.GIT_LOCAL_PATH || DEFAULT_CONFIG.git.localPath,
      syncInterval: parseInt(process.env.GIT_SYNC_INTERVAL || '') || DEFAULT_CONFIG.git.syncInterval
    },
    search: {
      maxResults: parseInt(process.env.SEARCH_MAX_RESULTS || '') || DEFAULT_CONFIG.search.maxResults,
      snippetLength: parseInt(process.env.SEARCH_SNIPPET_LENGTH || '') || DEFAULT_CONFIG.search.snippetLength,
      minScore: parseFloat(process.env.SEARCH_MIN_SCORE || '') || DEFAULT_CONFIG.search.minScore
    },
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || DEFAULT_CONFIG.logging.level,
      format: (process.env.LOG_FORMAT as 'json' | 'text') || DEFAULT_CONFIG.logging.format
    }
  };
}

export const config = getConfig();
