/**
 * MCP Klipper Documentation Server - Search Engine
 * Implements lunr.js based search functionality
 */

import lunr from 'lunr';
import { ParsedDocument, SearchResult, SearchOptions, SearchMetadata, IndexStats } from './types.js';
import { SearchError, handleError } from './errors.js';
import { logger } from './logger.js';
import { config } from './config.js';

export class SearchEngine {
  private index: lunr.Index | null = null;
  private docs: Map<string, ParsedDocument> = new Map();
  private lastIndexed: Date | null = null;

  buildIndex(documents: Map<string, ParsedDocument>): void {
    logger.info(`Building search index with ${documents.size} documents`, 'SearchEngine');

    const startTime = Date.now();
    this.docs = documents;

    try {
      const docsArray = Array.from(documents.values());

      this.index = lunr(function () {
        // Configure the index
        this.ref('id');
        this.field('title', { boost: 10 });
        this.field('content');
        this.field('section', { boost: 5 });
        this.field('tags', { boost: 3 });

        // Add metadata extractor for position information
        this.metadataWhitelist = ['position'];

        // Add all documents to the index
        docsArray.forEach(doc => {
          this.add({
            id: doc.id,
            title: doc.title,
            content: doc.content,
            section: doc.section,
            tags: doc.metadata.tags.join(' ')
          });
        });
      });

      this.lastIndexed = new Date();
      const elapsed = Date.now() - startTime;
      logger.info(`Search index built in ${elapsed}ms`, 'SearchEngine');
    } catch (error) {
      throw handleError(error, 'SearchEngine.buildIndex');
    }
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    if (!this.index) {
      throw new SearchError('Search index not initialized', 'SearchEngine.search');
    }

    const startTime = Date.now();
    const limit = options.limit || config.search.maxResults;

    try {
      logger.debug(`Searching for: "${query}"`, 'SearchEngine');

      // Perform the search
      let results = this.index.search(query);

      // Filter by section if specified
      if (options.section) {
        results = results.filter(result => {
          const doc = this.docs.get(result.ref);
          return doc?.section === options.section;
        });
      }

      // Filter by minimum score
      results = results.filter(result => result.score >= config.search.minScore);

      // Limit results
      results = results.slice(0, limit);

      // Build search results
      const searchResults: SearchResult[] = results.map(result => {
        const doc = this.docs.get(result.ref);
        if (!doc) {
          throw new SearchError(`Document not found: ${result.ref}`, 'SearchEngine.search');
        }

        return {
          document: doc,
          score: result.score,
          snippet: this.generateSnippet(doc.content, query),
          highlights: this.extractHighlights(result, query),
          metadata: {
            query,
            searchTime: Date.now() - startTime,
            totalResults: results.length,
            filters: options.section ? { section: options.section } : undefined
          }
        };
      });

      const elapsed = Date.now() - startTime;
      logger.debug(`Search completed in ${elapsed}ms, found ${searchResults.length} results`, 'SearchEngine');

      return searchResults;
    } catch (error) {
      throw handleError(error, 'SearchEngine.search');
    }
  }

  private generateSnippet(content: string, query: string): string {
    const snippetLength = config.search.snippetLength;
    const queryTerms = query.toLowerCase().split(/\s+/);
    const lowerContent = content.toLowerCase();

    // Find the best position to start the snippet
    let bestPosition = 0;
    let bestScore = 0;

    for (let i = 0; i < lowerContent.length - snippetLength; i += 50) {
      const window = lowerContent.substring(i, i + snippetLength);
      let score = 0;
      queryTerms.forEach(term => {
        if (window.includes(term)) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        bestPosition = i;
      }
    }

    // Extract snippet
    let snippet = content.substring(bestPosition, bestPosition + snippetLength);

    // Clean up snippet boundaries
    if (bestPosition > 0) {
      const firstSpace = snippet.indexOf(' ');
      if (firstSpace > 0 && firstSpace < 20) {
        snippet = '...' + snippet.substring(firstSpace + 1);
      }
    }

    if (bestPosition + snippetLength < content.length) {
      const lastSpace = snippet.lastIndexOf(' ');
      if (lastSpace > snippetLength - 20) {
        snippet = snippet.substring(0, lastSpace) + '...';
      }
    }

    return snippet.trim();
  }

  private extractHighlights(result: lunr.Index.Result, query: string): string[] {
    const highlights: string[] = [];
    const queryTerms = query.toLowerCase().split(/\s+/);

    // Get matching terms from the result
    if (result.matchData && result.matchData.metadata) {
      Object.keys(result.matchData.metadata).forEach(term => {
        if (queryTerms.some(qt => term.includes(qt) || qt.includes(term))) {
          highlights.push(term);
        }
      });
    }

    return highlights;
  }

  getDocument(id: string): ParsedDocument | undefined {
    return this.docs.get(id);
  }

  getAllDocuments(): ParsedDocument[] {
    return Array.from(this.docs.values());
  }

  getDocumentsBySection(section: string): ParsedDocument[] {
    return this.getAllDocuments().filter(doc => doc.section === section);
  }

  getSections(): string[] {
    const sections = new Set<string>();
    this.docs.forEach(doc => sections.add(doc.section));
    return Array.from(sections).sort();
  }

  getStats(): IndexStats {
    const docs = this.getAllDocuments();
    const totalWords = docs.reduce((sum, doc) => sum + doc.metadata.wordCount, 0);

    return {
      totalDocuments: docs.length,
      totalWords,
      lastIndexed: this.lastIndexed || new Date(),
      sections: this.getSections()
    };
  }

  isReady(): boolean {
    return this.index !== null;
  }
}

export const searchEngine = new SearchEngine();
