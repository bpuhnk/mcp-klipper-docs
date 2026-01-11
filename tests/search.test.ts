/**
 * MCP Klipper Documentation Server - Search Engine Tests
 */

import { SearchEngine } from '../src/search';
import { ParsedDocument, DocumentMetadata } from '../src/types';

describe('SearchEngine', () => {
  let searchEngine: SearchEngine;
  let mockDocs: Map<string, ParsedDocument>;

  const createMockDocument = (
    id: string,
    title: string,
    content: string,
    section: string
  ): ParsedDocument => {
    const metadata: DocumentMetadata = {
      wordCount: content.split(/\s+/).length,
      readingTime: Math.ceil(content.split(/\s+/).length / 200),
      difficulty: 'intermediate',
      tags: [],
      relatedDocuments: [],
      headings: [],
    };

    return {
      id,
      title,
      content,
      section,
      filePath: `${section}/${id}.md`,
      lastModified: new Date(),
      metadata,
    };
  };

  beforeEach(() => {
    searchEngine = new SearchEngine();
    mockDocs = new Map();

    // Add mock documents
    mockDocs.set(
      'config-reference/extruder',
      createMockDocument(
        'config-reference/extruder',
        'Extruder Configuration',
        'The extruder section is used to configure the extruder heater and stepper motor. This includes settings for rotation_distance, nozzle_diameter, and filament_diameter.',
        'config-reference'
      )
    );

    mockDocs.set(
      'config-reference/bed-mesh',
      createMockDocument(
        'config-reference/bed-mesh',
        'Bed Mesh Configuration',
        'The bed_mesh section enables bed leveling mesh support. Configure probe_count, mesh_min, mesh_max for automatic bed leveling.',
        'config-reference'
      )
    );

    mockDocs.set(
      'g-codes/bed-leveling',
      createMockDocument(
        'g-codes/bed-leveling',
        'Bed Leveling G-Codes',
        'G-code commands for bed leveling include BED_MESH_CALIBRATE, BED_MESH_PROFILE, and BED_MESH_OUTPUT.',
        'g-codes'
      )
    );

    searchEngine.buildIndex(mockDocs);
  });

  describe('buildIndex', () => {
    it('should build index successfully', () => {
      expect(searchEngine.isReady()).toBe(true);
    });

    it('should index all documents', () => {
      const stats = searchEngine.getStats();
      expect(stats.totalDocuments).toBe(3);
    });
  });

  describe('search', () => {
    it('should find documents matching query', () => {
      const results = searchEngine.search('extruder');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.document.title).toBe('Extruder Configuration');
    });

    it('should return empty array for no matches', () => {
      const results = searchEngine.search('nonexistent_term_xyz');
      expect(results.length).toBe(0);
    });

    it('should filter by section', () => {
      const results = searchEngine.search('bed', { section: 'g-codes' });
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        expect(result.document.section).toBe('g-codes');
      });
    });

    it('should limit results', () => {
      const results = searchEngine.search('bed', { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should include search metadata', () => {
      const results = searchEngine.search('extruder');
      expect(results[0]?.metadata.query).toBe('extruder');
      expect(results[0]?.metadata.searchTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDocument', () => {
    it('should return document by id', () => {
      const doc = searchEngine.getDocument('config-reference/extruder');
      expect(doc).toBeDefined();
      expect(doc?.title).toBe('Extruder Configuration');
    });

    it('should return undefined for non-existent document', () => {
      const doc = searchEngine.getDocument('non-existent');
      expect(doc).toBeUndefined();
    });
  });

  describe('getSections', () => {
    it('should return all sections', () => {
      const sections = searchEngine.getSections();
      expect(sections).toContain('config-reference');
      expect(sections).toContain('g-codes');
    });
  });

  describe('getDocumentsBySection', () => {
    it('should return documents for section', () => {
      const docs = searchEngine.getDocumentsBySection('config-reference');
      expect(docs.length).toBe(2);
    });

    it('should return empty array for non-existent section', () => {
      const docs = searchEngine.getDocumentsBySection('non-existent');
      expect(docs.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return index statistics', () => {
      const stats = searchEngine.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.totalWords).toBeGreaterThan(0);
      expect(stats.sections.length).toBe(2);
      expect(stats.lastIndexed).toBeInstanceOf(Date);
    });
  });
});
