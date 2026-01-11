/**
 * MCP Klipper Documentation Server - Type Definitions
 * Core interfaces and types for the application
 */

// Document Types
export interface ParsedDocument {
  id: string;
  title: string;
  content: string;
  section: string;
  subsection?: string;
  filePath: string;
  lastModified: Date;
  metadata: DocumentMetadata;
}

export interface DocumentMetadata {
  wordCount: number;
  readingTime: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  relatedDocuments: string[];
  headings: DocumentHeading[];
}

export interface DocumentHeading {
  level: number;
  text: string;
  anchor: string;
}

// Search Types
export interface SearchResult {
  document: ParsedDocument;
  score: number;
  snippet: string;
  highlights: string[];
  metadata: SearchMetadata;
}

export interface SearchMetadata {
  query: string;
  searchTime: number;
  totalResults: number;
  filters?: SearchFilters;
}

export interface SearchFilters {
  section?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  tags?: string[];
}

export interface SearchOptions {
  limit?: number;
  section?: string;
  includeContent?: boolean;
}

// Configuration Types
export interface AppConfig {
  server: ServerConfig;
  git: GitConfig;
  search: SearchConfig;
  logging: LoggingConfig;
}

export interface ServerConfig {
  name: string;
  version: string;
}

export interface GitConfig {
  repository: string;
  branch: string;
  localPath: string;
  syncInterval: number;
}

export interface SearchConfig {
  maxResults: number;
  snippetLength: number;
  minScore: number;
}

export interface LoggingConfig {
  level: LogLevel;
  format: 'json' | 'text';
}

// Error Types
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  PARSING = 'PARSING_ERROR',
  SEARCH = 'SEARCH_ERROR',
  GIT = 'GIT_ERROR',
  NETWORK = 'NETWORK_ERROR',
  SYSTEM = 'SYSTEM_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR'
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

// MCP Tool Input Types
export interface SearchToolInput {
  query: string;
  limit?: number;
  section?: string;
}

export interface LookupToolInput {
  option: string;
  includeExamples?: boolean;
}

export interface BrowseToolInput {
  section?: string;
  path?: string;
}

// MCP Resource Types
export interface DocumentResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

// Git Types
export interface GitSyncResult {
  success: boolean;
  filesChanged: number;
  lastCommit: string;
  timestamp: Date;
}

// Index Types
export interface IndexStats {
  totalDocuments: number;
  totalWords: number;
  lastIndexed: Date;
  sections: string[];
}
