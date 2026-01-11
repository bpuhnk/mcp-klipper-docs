/**
 * MCP Klipper Documentation Server - Parser Tests
 */

import { DocumentParser } from '../src/parser';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('DocumentParser', () => {
  let parser: DocumentParser;
  let tempDir: string;

  beforeEach(() => {
    parser = new DocumentParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'klipper-test-'));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    parser.clear();
  });

  const createTempFile = (relativePath: string, content: string): void => {
    const fullPath = path.join(tempDir, relativePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
  };

  describe('parseDirectory', () => {
    it('should parse markdown files', async () => {
      createTempFile('test.md', '# Test Document\n\nThis is test content.');

      const docs = await parser.parseDirectory(tempDir);
      expect(docs.size).toBe(1);
    });

    it('should extract title from h1 heading', async () => {
      createTempFile('test.md', '# My Title\n\nContent here.');

      const docs = await parser.parseDirectory(tempDir);
      const doc = docs.get('test');
      expect(doc?.title).toBe('My Title');
    });

    it('should handle nested directories', async () => {
      createTempFile('section1/doc1.md', '# Doc 1\n\nContent 1.');
      createTempFile('section2/doc2.md', '# Doc 2\n\nContent 2.');

      const docs = await parser.parseDirectory(tempDir);
      expect(docs.size).toBe(2);
    });

    it('should extract section from directory structure', async () => {
      createTempFile('config/options.md', '# Options\n\nConfig options.');

      const docs = await parser.parseDirectory(tempDir);
      const doc = docs.get('config/options');
      expect(doc?.section).toBe('config');
    });

    it('should skip non-markdown files', async () => {
      createTempFile('test.md', '# Markdown\n\nContent.');
      createTempFile('test.txt', 'Plain text.');

      const docs = await parser.parseDirectory(tempDir);
      expect(docs.size).toBe(1);
    });
  });

  describe('metadata extraction', () => {
    it('should calculate word count', async () => {
      createTempFile('test.md', '# Title\n\nOne two three four five.');

      const docs = await parser.parseDirectory(tempDir);
      const doc = docs.get('test');
      expect(doc?.metadata.wordCount).toBeGreaterThan(0);
    });

    it('should extract headings', async () => {
      const content = `# Main Title

## Section One

### Subsection

## Section Two`;

      createTempFile('test.md', content);

      const docs = await parser.parseDirectory(tempDir);
      const doc = docs.get('test');
      expect(doc?.metadata.headings.length).toBe(4);
    });

    it('should extract tags from content', async () => {
      createTempFile(
        'test.md',
        '# Extruder Configuration\n\nConfigure your extruder settings.'
      );

      const docs = await parser.parseDirectory(tempDir);
      const doc = docs.get('test');
      expect(doc?.metadata.tags).toContain('extruder');
      expect(doc?.metadata.tags).toContain('configuration');
    });
  });

  describe('getDocument', () => {
    it('should return document by id', async () => {
      createTempFile('test.md', '# Test\n\nContent.');

      await parser.parseDirectory(tempDir);
      const doc = parser.getDocument('test');
      expect(doc).toBeDefined();
      expect(doc?.title).toBe('Test');
    });

    it('should return undefined for non-existent document', async () => {
      await parser.parseDirectory(tempDir);
      const doc = parser.getDocument('non-existent');
      expect(doc).toBeUndefined();
    });
  });

  describe('getSections', () => {
    it('should return unique sections', async () => {
      createTempFile('section1/doc1.md', '# Doc 1');
      createTempFile('section1/doc2.md', '# Doc 2');
      createTempFile('section2/doc3.md', '# Doc 3');

      await parser.parseDirectory(tempDir);
      const sections = parser.getSections();
      expect(sections).toContain('section1');
      expect(sections).toContain('section2');
      expect(sections.length).toBe(2);
    });
  });
});
