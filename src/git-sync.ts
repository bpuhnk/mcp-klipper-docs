/**
 * MCP Klipper Documentation Server - Git Synchronization
 * Handles cloning and updating the Klipper repository
 */

import simpleGit, { SimpleGit, CloneOptions } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { GitSyncResult } from './types.js';
import { GitError, handleError } from './errors.js';
import { logger } from './logger.js';
import { config } from './config.js';

export class GitSync {
  private git: SimpleGit;
  private localPath: string;
  private repository: string;
  private branch: string;

  constructor() {
    this.localPath = config.git.localPath;
    this.repository = config.git.repository;
    this.branch = config.git.branch;
    this.git = simpleGit();
  }

  async initialize(): Promise<GitSyncResult> {
    logger.info('Initializing Git repository', 'GitSync');

    try {
      // Ensure parent directory exists
      const parentDir = path.dirname(this.localPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      // Check if repository already exists
      if (fs.existsSync(path.join(this.localPath, '.git'))) {
        logger.info('Repository exists, pulling latest changes', 'GitSync');
        return await this.pull();
      } else {
        logger.info('Cloning repository', 'GitSync');
        return await this.clone();
      }
    } catch (error) {
      throw handleError(error, 'GitSync.initialize');
    }
  }

  private async clone(): Promise<GitSyncResult> {
    try {
      const cloneOptions: CloneOptions = {
        '--branch': this.branch,
        '--depth': 1,
        '--single-branch': null
      };

      await this.git.clone(this.repository, this.localPath, cloneOptions);

      // Initialize git in the cloned directory
      this.git = simpleGit(this.localPath);

      const log = await this.git.log({ maxCount: 1 });
      const lastCommit = log.latest?.hash || 'unknown';

      logger.info(`Repository cloned successfully. Latest commit: ${lastCommit}`, 'GitSync');

      return {
        success: true,
        filesChanged: -1, // Unknown for initial clone
        lastCommit,
        timestamp: new Date()
      };
    } catch (error) {
      throw new GitError(
        `Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`,
        'GitSync.clone',
        { repository: this.repository, branch: this.branch }
      );
    }
  }

  async pull(): Promise<GitSyncResult> {
    try {
      this.git = simpleGit(this.localPath);

      // Fetch and reset to ensure clean state
      await this.git.fetch(['origin', this.branch]);
      await this.git.reset(['--hard', `origin/${this.branch}`]);

      const log = await this.git.log({ maxCount: 1 });
      const lastCommit = log.latest?.hash || 'unknown';

      logger.info(`Repository updated. Latest commit: ${lastCommit}`, 'GitSync');

      return {
        success: true,
        filesChanged: 0, // Could track this with diff
        lastCommit,
        timestamp: new Date()
      };
    } catch (error) {
      throw new GitError(
        `Failed to pull repository: ${error instanceof Error ? error.message : String(error)}`,
        'GitSync.pull',
        { repository: this.repository, branch: this.branch }
      );
    }
  }

  getLocalPath(): string {
    return this.localPath;
  }

  getDocsPath(): string {
    return path.join(this.localPath, 'docs');
  }

  async getLastCommitInfo(): Promise<{ hash: string; date: Date; message: string }> {
    try {
      this.git = simpleGit(this.localPath);
      const log = await this.git.log({ maxCount: 1 });

      if (!log.latest) {
        throw new GitError('No commits found', 'GitSync.getLastCommitInfo');
      }

      return {
        hash: log.latest.hash,
        date: new Date(log.latest.date),
        message: log.latest.message
      };
    } catch (error) {
      throw handleError(error, 'GitSync.getLastCommitInfo');
    }
  }
}

export const gitSync = new GitSync();
