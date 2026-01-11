/**
 * MCP Klipper Documentation Server - Logger
 * Simple logging utility
 */

import { LogLevel } from './types.js';
import { config } from './config.js';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  metadata?: Record<string, unknown>;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.ERROR]: 0,
  [LogLevel.WARN]: 1,
  [LogLevel.INFO]: 2,
  [LogLevel.DEBUG]: 3
};

class Logger {
  private level: LogLevel;
  private format: 'json' | 'text';

  constructor() {
    this.level = config.logging.level;
    this.format = config.logging.format;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] <= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatEntry(entry: LogEntry): string {
    if (this.format === 'json') {
      return JSON.stringify(entry);
    }
    
    const contextStr = entry.context ? ` [${entry.context}]` : '';
    const metadataStr = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    return `[${entry.timestamp}] ${entry.level.toUpperCase()}${contextStr}: ${entry.message}${metadataStr}`;
  }

  private log(level: LogLevel, message: string, context?: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      metadata
    };

    const formatted = this.formatEntry(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      default:
        console.log(formatted);
    }
  }

  error(message: string, context?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, metadata);
  }

  warn(message: string, context?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  info(message: string, context?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  debug(message: string, context?: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }
}

export const logger = new Logger();
