#!/usr/bin/env node
/**
 * MCP Klipper Documentation Server
 * Main server implementation using Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { config } from './config.js';
import { logger } from './logger.js';
import { gitSync } from './git-sync.js';
import { documentParser } from './parser.js';
import { searchEngine } from './search.js';
import { handleError, NotFoundError, ValidationError } from './errors.js';
import { SearchToolInput, LookupToolInput, BrowseToolInput, ParsedDocument } from './types.js';

class KlipperMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: config.server.name,
        version: config.server.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'search_klipper_docs',
            description: 'Search Klipper documentation for specific topics, configuration options, or troubleshooting information',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query - can be keywords, configuration options, or natural language questions',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                  default: 10,
                },
                section: {
                  type: 'string',
                  description: 'Filter results by documentation section (e.g., "Config_Reference", "G-Codes")',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_config_option',
            description: 'Get detailed information about a specific Klipper configuration option or section',
            inputSchema: {
              type: 'object',
              properties: {
                option: {
                  type: 'string',
                  description: 'Configuration option or section name (e.g., "extruder", "bed_mesh", "stepper_x")',
                },
                includeExamples: {
                  type: 'boolean',
                  description: 'Include example configurations if available',
                  default: true,
                },
              },
              required: ['option'],
            },
          },
          {
            name: 'browse_docs',
            description: 'Browse available documentation sections and files',
            inputSchema: {
              type: 'object',
              properties: {
                section: {
                  type: 'string',
                  description: 'Section to browse (leave empty to list all sections)',
                },
                path: {
                  type: 'string',
                  description: 'Specific document path to retrieve',
                },
              },
            },
          },
          {
            name: 'get_index_stats',
            description: 'Get statistics about the documentation index',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_klipper_docs':
            return await this.handleSearch(args as unknown as SearchToolInput);
          case 'get_config_option':
            return await this.handleLookup(args as unknown as LookupToolInput);
          case 'browse_docs':
            return await this.handleBrowse(args as unknown as BrowseToolInput);
          case 'get_index_stats':
            return await this.handleStats();
          default:
            throw new ValidationError(`Unknown tool: ${name}`, 'CallToolRequest');
        }
      } catch (error) {
        const klipperError = handleError(error, `Tool:${name}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${klipperError.message}`,
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const docs = searchEngine.getAllDocuments();
      return {
        resources: docs.map(doc => ({
          uri: `klipper://docs/${doc.id}`,
          name: doc.title,
          description: `${doc.section} - ${doc.metadata.difficulty} level`,
          mimeType: 'text/markdown',
        })),
      };
    });

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        const docId = uri.replace('klipper://docs/', '');
        const doc = searchEngine.getDocument(docId);

        if (!doc) {
          throw new NotFoundError(`Document not found: ${docId}`, 'ReadResource');
        }

        return {
          contents: [
            {
              uri,
              mimeType: 'text/markdown',
              text: doc.content,
            },
          ],
        };
      } catch (error) {
        const klipperError = handleError(error, 'ReadResource');
        throw klipperError;
      }
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'klipper_setup',
            description: 'Guide for initial Klipper setup and configuration',
            arguments: [
              {
                name: 'printer_type',
                description: 'Type of 3D printer (e.g., cartesian, corexy, delta)',
                required: false,
              },
            ],
          },
          {
            name: 'troubleshoot_issue',
            description: 'Help troubleshoot common Klipper issues',
            arguments: [
              {
                name: 'issue',
                description: 'Description of the issue or error message',
                required: true,
              },
            ],
          },
          {
            name: 'config_review',
            description: 'Review and suggest improvements for Klipper configuration',
            arguments: [
              {
                name: 'config_section',
                description: 'Configuration section to review',
                required: true,
              },
            ],
          },
        ],
      };
    });

    // Get prompt content
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'klipper_setup':
          return this.getSetupPrompt(args?.printer_type as string | undefined);
        case 'troubleshoot_issue':
          return this.getTroubleshootPrompt(args?.issue as string);
        case 'config_review':
          return this.getConfigReviewPrompt(args?.config_section as string);
        default:
          throw new ValidationError(`Unknown prompt: ${name}`, 'GetPrompt');
      }
    });
  }

  private async handleSearch(input: SearchToolInput) {
    const results = searchEngine.search(input.query, {
      limit: input.limit,
      section: input.section,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No results found for "${input.query}". Try different keywords or browse available sections.`,
          },
        ],
      };
    }

    const formattedResults = results.map((result, index) => {
      return `## ${index + 1}. ${result.document.title}
**Section**: ${result.document.section}
**Relevance**: ${(result.score * 100).toFixed(1)}%
**Path**: ${result.document.filePath}

${result.snippet}

---`;
    }).join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Search Results for "${input.query}"

Found ${results.length} result(s):

${formattedResults}`,
        },
      ],
    };
  }

  private async handleLookup(input: LookupToolInput) {
    // First, always try to get Config_Reference document directly
    const configRefDoc = searchEngine.getDocument('Config_Reference');
    
    if (configRefDoc) {
      // Try to extract the specific section from Config_Reference
      const sectionContent = this.extractConfigSection(configRefDoc.content, input.option);
      
      if (sectionContent) {
        return {
          content: [
            {
              type: 'text',
              text: `# Configuration: [${input.option}]

**Source**: Klipper Configuration Reference

${sectionContent}`,
            },
          ],
        };
      }
    }

    // If not found in Config_Reference, search all documents
    const results = searchEngine.search(input.option, { limit: 10 });

    if (results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Configuration option "${input.option}" not found in Klipper documentation. 

Try one of these approaches:
- Check the exact spelling (e.g., "extruder", "stepper_x", "bed_mesh")
- Use the search tool for broader results
- Browse the Config_Reference document directly`,
          },
        ],
      };
    }

    // Use the best search match
    const bestMatch = results[0];
    if (!bestMatch) {
      return {
        content: [
          {
            type: 'text',
            text: `Configuration option "${input.option}" not found.`,
          },
        ],
      };
    }

    // Try to extract section from the matched document
    const sectionContent = this.extractConfigSection(bestMatch.document.content, input.option);
    
    if (sectionContent) {
      return {
        content: [
          {
            type: 'text',
            text: `# Configuration: ${input.option}

**Source Document**: ${bestMatch.document.title}

${sectionContent}`,
          },
        ],
      };
    }

    // Fall back to full document
    return this.formatConfigResponse(bestMatch.document, input.includeExamples ?? true);
  }

  private extractConfigSection(content: string, option: string): string | null {
    // Normalize option for flexible matching (handle underscores, hyphens, spaces)
    const optionVariants = [
      option,
      option.replace(/_/g, ' '),
      option.replace(/-/g, '_'),
    ];
    
    for (const variant of optionVariants) {
      // Pattern 1: Match "### [option]" or "### [option ...]" section headers
      // This matches from the header to the next ### or ## header
      const headerPattern = new RegExp(
        `(###\\s*\\[${this.escapeRegex(variant)}[^\\]]*\\][^\\n]*\\n)([\\s\\S]*?)(?=\\n###\\s|\\n##\\s|$)`,
        'i'
      );
      
      let match = headerPattern.exec(content);
      if (match && match[1] && match[2]) {
        const header = match[1];
        const body = match[2];
        return header + body;
      }

      // Pattern 2: Match standalone [option] in code blocks within a section
      const bracketPattern = new RegExp(
        `(\\[${this.escapeRegex(variant)}[^\\]]*\\]\\s*\\n)([\\s\\S]*?)(?=\\n\\[[a-z]|\\n###|\\n##|$)`,
        'i'
      );
      
      match = bracketPattern.exec(content);
      if (match) {
        // Find the section header above this
        const matchIndex = match.index;
        const beforeContent = content.substring(0, matchIndex);
        const headerMatch = beforeContent.match(/\n(###[^\n]+)\n[^#]*$/);
        
        const sectionHeader = headerMatch ? headerMatch[1] + '\n\n' : '';
        return sectionHeader + match[0];
      }
    }

    return null;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private formatConfigResponse(doc: ParsedDocument, includeExamples: boolean) {
    let response = `# ${doc.title}

**Section**: ${doc.section}
**Difficulty**: ${doc.metadata.difficulty}
**Reading Time**: ~${doc.metadata.readingTime} min

## Content

${doc.content}`;

    if (includeExamples) {
      // Extract code blocks as examples
      const codeBlocks = doc.content.match(/```[\s\S]*?```/g);
      if (codeBlocks && codeBlocks.length > 0) {
        response += `\n\n## Configuration Examples\n\n${codeBlocks.slice(0, 3).join('\n\n')}`;
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    };
  }

  private async handleBrowse(input: BrowseToolInput) {
    if (input.path) {
      const doc = searchEngine.getDocument(input.path);
      if (!doc) {
        throw new NotFoundError(`Document not found: ${input.path}`, 'BrowseDocs');
      }
      return {
        content: [
          {
            type: 'text',
            text: `# ${doc.title}\n\n${doc.content}`,
          },
        ],
      };
    }

    if (input.section) {
      const docs = searchEngine.getDocumentsBySection(input.section);
      if (docs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No documents found in section "${input.section}".`,
            },
          ],
        };
      }

      const docList = docs.map(doc => `- **${doc.title}** (${doc.filePath})`).join('\n');
      return {
        content: [
          {
            type: 'text',
            text: `# Documents in "${input.section}"\n\n${docList}`,
          },
        ],
      };
    }

    // List all sections
    const sections = searchEngine.getSections();
    const stats = searchEngine.getStats();

    return {
      content: [
        {
          type: 'text',
          text: `# Klipper Documentation Browser

## Available Sections

${sections.map(s => `- **${s}**`).join('\n')}

## Statistics

- Total Documents: ${stats.totalDocuments}
- Total Words: ${stats.totalWords.toLocaleString()}
- Last Indexed: ${stats.lastIndexed.toISOString()}`,
        },
      ],
    };
  }

  private async handleStats() {
    const stats = searchEngine.getStats();

    return {
      content: [
        {
          type: 'text',
          text: `# Documentation Index Statistics

- **Total Documents**: ${stats.totalDocuments}
- **Total Words**: ${stats.totalWords.toLocaleString()}
- **Sections**: ${stats.sections.length}
- **Last Indexed**: ${stats.lastIndexed.toISOString()}

## Sections

${stats.sections.map(s => `- ${s}`).join('\n')}`,
        },
      ],
    };
  }

  private getSetupPrompt(printerType?: string) {
    const typeInfo = printerType 
      ? `for a ${printerType} printer` 
      : 'for your 3D printer';

    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I need help setting up Klipper ${typeInfo}. Please guide me through the initial configuration process, including:

1. Basic printer configuration
2. Stepper motor setup
3. Endstop configuration
4. Extruder settings
5. Bed configuration

Use the Klipper documentation to provide accurate configuration examples.`,
          },
        },
      ],
    };
  }

  private getTroubleshootPrompt(issue: string) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I'm experiencing the following issue with Klipper: ${issue}

Please help me troubleshoot this problem by:
1. Identifying potential causes
2. Suggesting diagnostic steps
3. Providing solutions based on the Klipper documentation

Search the documentation for relevant information and provide specific configuration examples if needed.`,
          },
        },
      ],
    };
  }

  private getConfigReviewPrompt(configSection: string) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Please review my Klipper configuration for the "${configSection}" section.

Look up the documentation for this configuration section and:
1. Explain what each option does
2. Suggest any improvements or optimizations
3. Point out any potential issues or missing required options
4. Provide example configurations from the documentation`,
          },
        },
      ],
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing MCP Klipper Server', 'Server');

    try {
      // Initialize Git repository
      logger.info('Syncing Klipper repository...', 'Server');
      await gitSync.initialize();

      // Parse documentation
      logger.info('Parsing documentation...', 'Server');
      const docsPath = gitSync.getDocsPath();
      const docs = await documentParser.parseDirectory(docsPath);

      // Build search index
      logger.info('Building search index...', 'Server');
      searchEngine.buildIndex(docs);

      logger.info('Server initialization complete', 'Server', {
        documents: docs.size,
        sections: searchEngine.getSections().length,
      });
    } catch (error) {
      const klipperError = handleError(error, 'Server.initialize');
      logger.error('Failed to initialize server', 'Server', { error: klipperError.message });
      throw klipperError;
    }
  }

  async start(): Promise<void> {
    await this.initialize();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info('MCP Klipper Server started and connected via stdio', 'Server');
  }
}

// Main entry point
const server = new KlipperMCPServer();
server.start().catch((error) => {
  logger.error('Failed to start server', 'Main', { error: String(error) });
  process.exit(1);
});
