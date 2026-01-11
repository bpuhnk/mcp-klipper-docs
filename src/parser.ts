/**
 * MCP Klipper Documentation Server - Markdown Parser
 * Parses and processes Klipper documentation files
 */

import * as fs from 'fs';
import * as path from 'path';
import { marked } from 'marked';
import matter from 'gray-matter';
import { ParsedDocument, DocumentMetadata, DocumentHeading } from './types.js';
import { ParsingError, handleError } from './errors.js';
import { logger } from './logger.js';

export class DocumentParser {
  private docs: Map<string, ParsedDocument> = new Map();

  async parseDirectory(docsPath: string): Promise<Map<string, ParsedDocument>> {
    logger.info(`Parsing documentation from: ${docsPath}`, 'DocumentParser');

    try {
      if (!fs.existsSync(docsPath)) {
        throw new ParsingError(`Documentation directory not found: ${docsPath}`, 'DocumentParser.parseDirectory');
      }

      await this.processDirectory(docsPath, docsPath);

      logger.info(`Parsed ${this.docs.size} documents`, 'DocumentParser');
      return this.docs;
    } catch (error) {
      throw handleError(error, 'DocumentParser.parseDirectory');
    }
  }

  private async processDirectory(currentPath: string, basePath: string): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories and non-documentation folders
        if (!entry.name.startsWith('.') && !['scripts', 'klippy', 'lib'].includes(entry.name)) {
          await this.processDirectory(fullPath, basePath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        await this.parseFile(fullPath, basePath);
      }
    }
  }

  private async parseFile(filePath: string, basePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(basePath, filePath);

      // Parse frontmatter if present
      const { data: frontmatter, content: markdownContent } = matter(content);

      // Extract title from first heading or filename
      const title = this.extractTitle(markdownContent, filePath);

      // Extract section from directory structure
      const section = this.extractSection(relativePath);

      // Extract headings for navigation
      const headings = this.extractHeadings(markdownContent);

      // Calculate metadata
      const metadata = this.calculateMetadata(markdownContent, headings, frontmatter);

      // Create document ID from relative path
      const id = relativePath.replace(/\\/g, '/').replace('.md', '');

      const doc: ParsedDocument = {
        id,
        title,
        content: markdownContent,
        section,
        subsection: this.extractSubsection(relativePath),
        filePath: relativePath,
        lastModified: stats.mtime,
        metadata
      };

      this.docs.set(id, doc);
      logger.debug(`Parsed document: ${id}`, 'DocumentParser');
    } catch (error) {
      logger.warn(`Failed to parse file: ${filePath}`, 'DocumentParser', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private extractTitle(content: string, filePath: string): string {
    // Try to find first h1 heading
    const h1Match = content.match(/^#\s+(.+)$/m);
    if (h1Match && h1Match[1]) {
      return h1Match[1].trim();
    }

    // Fall back to filename
    const filename = path.basename(filePath, '.md');
    return filename
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }

  private extractSection(relativePath: string): string {
    const parts = relativePath.split(path.sep);
    const filename = path.basename(relativePath, '.md').toLowerCase();
    
    // If there's a subdirectory, use it as the section
    if (parts.length > 1 && parts[0]) {
      return parts[0];
    }
    
    // Categorize based on filename patterns
    if (filename.includes('config') || filename === 'config_reference') {
      return 'config-reference';
    }
    if (filename.includes('g-code') || filename === 'g-codes') {
      return 'g-codes';
    }
    if (filename.includes('mcu') || filename.includes('protocol')) {
      return 'protocol';
    }
    if (filename.includes('probe') || filename.includes('bed') || filename.includes('level')) {
      return 'calibration';
    }
    if (filename.includes('canbus') || filename.includes('tmc') || filename.includes('driver')) {
      return 'hardware';
    }
    if (filename.includes('install') || filename.includes('bootloader')) {
      return 'installation';
    }
    if (filename.includes('debug') || filename.includes('troubleshoot') || filename.includes('faq')) {
      return 'troubleshooting';
    }
    if (filename.includes('api') || filename.includes('command')) {
      return 'api';
    }
    if (filename.includes('slice') || filename.includes('octoprint')) {
      return 'software';
    }
    
    // Default categories
    if (filename === 'index' || filename === 'overview' || filename === 'features') {
      return 'general';
    }
    if (filename === 'contact' || filename === 'contributing' || filename === 'sponsors') {
      return 'community';
    }
    
    return 'general';
  }

  private extractSubsection(relativePath: string): string | undefined {
    const parts = relativePath.split(path.sep);
    if (parts.length > 2) {
      return parts[1];
    }
    return undefined;
  }

  private extractHeadings(content: string): DocumentHeading[] {
    const headings: DocumentHeading[] = [];
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    let match;

    while ((match = headingRegex.exec(content)) !== null) {
      const levelMatch = match[1];
      const textMatch = match[2];
      if (!levelMatch || !textMatch) continue;
      const level = levelMatch.length;
      const text = textMatch.trim();
      const anchor = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');

      headings.push({ level, text, anchor });
    }

    return headings;
  }

  private calculateMetadata(
    content: string,
    headings: DocumentHeading[],
    frontmatter: Record<string, unknown>
  ): DocumentMetadata {
    // Calculate word count
    const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

    // Estimate reading time (average 200 words per minute)
    const readingTime = Math.ceil(wordCount / 200);

    // Determine difficulty based on content analysis
    const difficulty = this.determineDifficulty(content, headings);

    // Extract tags from frontmatter or content
    const tags = this.extractTags(content, frontmatter);

    return {
      wordCount,
      readingTime,
      difficulty,
      tags,
      relatedDocuments: [],
      headings
    };
  }

  private determineDifficulty(content: string, headings: DocumentHeading[]): 'beginner' | 'intermediate' | 'advanced' {
    const lowerContent = content.toLowerCase();

    // Advanced indicators
    const advancedKeywords = ['gcode_macro', 'pin:', 'mcu', 'kinematics', 'stepper', 'endstop', 'probe'];
    const advancedCount = advancedKeywords.filter(kw => lowerContent.includes(kw)).length;

    // Beginner indicators
    const beginnerKeywords = ['getting started', 'installation', 'overview', 'introduction', 'basic'];
    const beginnerCount = beginnerKeywords.filter(kw => lowerContent.includes(kw)).length;

    if (advancedCount >= 3 || headings.length > 20) {
      return 'advanced';
    } else if (beginnerCount >= 2 || headings.length < 5) {
      return 'beginner';
    }
    return 'intermediate';
  }

  private extractTags(content: string, frontmatter: Record<string, unknown>): string[] {
    const tags: Set<string> = new Set();

    // Add tags from frontmatter
    if (Array.isArray(frontmatter.tags)) {
      frontmatter.tags.forEach(tag => tags.add(String(tag).toLowerCase()));
    }

    // Extract common Klipper-related tags from content
    const klipperTags = [
      'configuration', 'calibration', 'troubleshooting', 'gcode', 'macro',
      'extruder', 'bed', 'probe', 'endstop', 'stepper', 'heater',
      'fan', 'display', 'mcu', 'installation', 'upgrade'
    ];

    const lowerContent = content.toLowerCase();
    klipperTags.forEach(tag => {
      if (lowerContent.includes(tag)) {
        tags.add(tag);
      }
    });

    return Array.from(tags);
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

  clear(): void {
    this.docs.clear();
  }
}

export const documentParser = new DocumentParser();
