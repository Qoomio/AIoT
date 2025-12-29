import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';

export interface Position {
  row: number;
  column: number;
}

export interface ASTNode {
  type: string;
  startPosition: Position;
  endPosition: Position;
  startIndex: number;
  endIndex: number;
  children?: ASTNode[];
  text?: string;
  name?: { text: string };
}

export interface ChunkOptions {
  chunkSize?: number;
  overlap?: number;
  language?: string;
}

export interface CodeChunk {
  id: number;
  content: string;
  startLine: number;
  endLine: number;
  size: number;
  type: string;
  nodeType: string;
  filePath: string | undefined;
}

export interface ASTChunk {
  content: string;
  startLine: number;
  endLine: number;
  type: string;
  nodeType: string;
}

export interface CodeAnalysis {
  totalLines: number;
  totalCharacters: number;
  functions: string[];
  classes: string[];
  imports: string[];
  exports: string[];
  variables: string[];
  nodeTypes: Record<string, number>;
}

export interface ASTJSON {
  type: string;
  startPosition: Position;
  endPosition: Position;
  startIndex: number;
  endIndex: number;
  children?: ASTJSON[];
  text?: string;
}

export default class TreeSitterCodeChunker {
  private parser: Parser;
  private chunkSize: number;
  private overlap: number;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(JavaScript);
    this.chunkSize = 1000; 
    this.overlap = 200;
  }

  chunkCode(sourceCode: string, options: ChunkOptions = {}, filePath?: string): CodeChunk[] {
    const {
      chunkSize = this.chunkSize,
      overlap = this.overlap,
      language = 'javascript'
    } = options;

    if (!sourceCode || typeof sourceCode !== 'string') {
      throw new Error('Source code must be a non-empty string');
    }

    const tree = this.parser.parse(sourceCode);
    const rootNode = tree.rootNode as ASTNode;

    const astChunks = this.extractASTChunks(rootNode, sourceCode);
    
    let finalChunks = this.splitLargeChunks(astChunks, chunkSize, overlap);
    
    finalChunks = this.mergeSmallChunks(finalChunks, chunkSize);
    
    return finalChunks.map((chunk, index) => ({
      id: index,
      content: chunk.content,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      size: chunk.content.length,
      type: chunk.type || 'code',
      nodeType: chunk.nodeType,
      filePath
    }));
  }

  private extractASTChunks(rootNode: ASTNode, sourceCode: string): ASTChunk[] {
    const chunks: ASTChunk[] = [];
    const lines = sourceCode.split('\n');

    const majorNodeTypes = [
      'function_declaration',
      'function_expression',
      'arrow_function',
      'class_declaration',
      'class_expression',
      'method_definition',
      'import_statement',
      'export_statement',
      'export_named_declarations',
      'export_default_declaration'
    ];

    const minorNodeTypes = [
      'variable_declaration',
      'expression_statement',
      'if_statement',
      'for_statement',
      'while_statement',
      'try_statement',
      'switch_statement'
    ];

    const allNodes: ASTNode[] = [];
    this.traverseAST(rootNode, (node) => {
      if (majorNodeTypes.includes(node.type) || minorNodeTypes.includes(node.type)) {
        allNodes.push(node);
      }
    });

    allNodes.sort((a, b) => a.startIndex - b.startIndex);

    let currentChunk: ASTNode[] = [];
    let currentStartLine = 1;
    let currentEndLine = 1;

    for (const node of allNodes) {
      const nodeStartLine = node.startPosition.row + 1;
      const nodeEndLine = node.endPosition.row + 1;

      if (majorNodeTypes.includes(node.type)) {
        if (currentChunk.length > 0) {
          const chunk = this.createChunkFromNodes(currentChunk, sourceCode, currentStartLine, currentEndLine);
          if (chunk && chunk.content.length > 50) {
            chunks.push(chunk);
          }
        }

        currentChunk = [node];
        currentStartLine = nodeStartLine;
        currentEndLine = nodeEndLine;
      } else {
        const gap = nodeStartLine - currentEndLine;
        
        if (gap <= 2 || currentChunk.length === 0) {
          currentChunk.push(node);
          currentEndLine = Math.max(currentEndLine, nodeEndLine);
        } else {
          if (currentChunk.length > 0) {
            const chunk = this.createChunkFromNodes(currentChunk, sourceCode, currentStartLine, currentEndLine);
            if (chunk && chunk.content.length > 50) {
              chunks.push(chunk);
            }
          }

          currentChunk = [node];
          currentStartLine = nodeStartLine;
          currentEndLine = nodeEndLine;
        }
      }
    }

    if (currentChunk.length > 0) {
      const chunk = this.createChunkFromNodes(currentChunk, sourceCode, currentStartLine, currentEndLine);
      if (chunk && chunk.content.length > 50) {
        chunks.push(chunk);
      }
    }

    if (chunks.length === 0) {
      chunks.push({
        content: sourceCode,
        startLine: 1,
        endLine: lines.length,
        type: 'code',
        nodeType: 'program'
      });
    }

    return chunks;
  }

  private createChunkFromNodes(nodes: ASTNode[], sourceCode: string, startLine: number, endLine: number): ASTChunk | null {
    if (nodes.length === 0) return null;

    const startIndex = Math.min(...nodes.map(n => n.startIndex));
    const endIndex = Math.max(...nodes.map(n => n.endIndex));

    const content = sourceCode.substring(startIndex, endIndex);

    if (!content.trim()) {
      return null;
    }

    const primaryNode = nodes.find(n => 
      ['function_declaration', 'class_declaration', 'method_definition'].includes(n.type)
    ) || nodes[0];

    if (!primaryNode) return null;

    return {
      content: content,
      startLine: startLine,
      endLine: endLine,
      type: this.getChunkType(primaryNode),
      nodeType: primaryNode.type
    };
  }

  private traverseAST(node: ASTNode, callback: (node: ASTNode) => void): void {
    callback(node);
    
    if (node.children) {
      for (const child of node.children) {
        this.traverseAST(child, callback);
      }
    }
  }

  private getChunkType(node: ASTNode): string {
    switch (node.type) {
      case 'function_declaration':
      case 'function_expression':
      case 'arrow_function':
      case 'method_definition':
        return 'function';
      case 'class_declaration':
      case 'class_expression':
        return 'class';
      case 'import_statement':
        return 'import';
      case 'export_statement':
      case 'export_named_declarations':
      case 'export_default_declaration':
        return 'export';
      case 'variable_declaration':
        return 'variable';
      case 'expression_statement':
        return 'expression';
      default:
        return 'code';
    }
  }

  private splitLargeChunks(chunks: ASTChunk[], maxSize: number, overlap: number): ASTChunk[] {
    const result: ASTChunk[] = [];
    const minChunkSize = 100;

    for (const chunk of chunks) {
      if (chunk.content.length <= maxSize) {
        result.push(chunk);
        continue;
      }

      const lines = chunk.content.split('\n');
      let currentChunk: string[] = [];
      let currentSize = 0;
      let startLine = chunk.startLine;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        const lineSize = line.length + 1;

        if (currentSize + lineSize > maxSize && currentChunk.length > 0 && currentSize >= minChunkSize) {
          result.push({
            content: currentChunk.join('\n'),
            startLine: startLine,
            endLine: startLine + currentChunk.length - 1,
            type: chunk.type,
            nodeType: chunk.nodeType
          });

          const overlapLines = Math.max(1, Math.floor(overlap / 50));
          const overlapStart = Math.max(0, currentChunk.length - overlapLines);
          currentChunk = currentChunk.slice(overlapStart);
          currentSize = currentChunk.join('\n').length;
          startLine = chunk.startLine + i - currentChunk.length;
        }

        currentChunk.push(line);
        currentSize += lineSize;
      }

      if (currentChunk.length > 0 && currentSize >= minChunkSize) {
        result.push({
          content: currentChunk.join('\n'),
          startLine: startLine,
          endLine: chunk.endLine,
          type: chunk.type,
          nodeType: chunk.nodeType
        });
      } else if (currentChunk.length > 0) {
        const lastChunk = result[result.length - 1];
        if (lastChunk && lastChunk.content.length + currentSize <= maxSize * 1.5) {
          lastChunk.content += '\n' + currentChunk.join('\n');
          lastChunk.endLine = chunk.endLine;
        } else {
          result.push({
            content: currentChunk.join('\n'),
            startLine: startLine,
            endLine: chunk.endLine,
            type: chunk.type,
            nodeType: chunk.nodeType
          });
        }
      }
    }

    return result;
  }

  private mergeSmallChunks(chunks: ASTChunk[], maxSize: number): ASTChunk[] {
    if (chunks.length <= 1) return chunks;

    const result: ASTChunk[] = [];
    const minChunkSize = 150;
    let currentChunk: ASTChunk | null = null;

    for (const chunk of chunks) {
      if (chunk.content.length >= minChunkSize) {
        if (currentChunk) {
          result.push(currentChunk);
          currentChunk = null;
        }
        result.push(chunk);
        continue;
      }

      if (currentChunk) {
        const combinedSize = currentChunk.content.length + chunk.content.length + 1;
        
        if (combinedSize <= maxSize * 1.2) {
          currentChunk.content += '\n' + chunk.content;
          currentChunk.endLine = chunk.endLine;
          
          if (currentChunk.content.length >= minChunkSize) {
            result.push(currentChunk);
            currentChunk = null;
          }
        } else {
          result.push(currentChunk);
          currentChunk = chunk;
        }
      } else {
        currentChunk = chunk;
      }
    }

    if (currentChunk) {
      result.push(currentChunk);
    }

    return result;
  }

  analyzeCode(sourceCode: string): CodeAnalysis {
    const tree = this.parser.parse(sourceCode);
    const rootNode = tree.rootNode as ASTNode;
    
    const analysis: CodeAnalysis = {
      totalLines: sourceCode.split('\n').length,
      totalCharacters: sourceCode.length,
      functions: [],
      classes: [],
      imports: [],
      exports: [],
      variables: [],
      nodeTypes: {}
    };

    this.traverseAST(rootNode, (node) => {
      analysis.nodeTypes[node.type] = (analysis.nodeTypes[node.type] || 0) + 1;

      switch (node.type) {
        case 'function_declaration':
          if (node.name) {
            analysis.functions.push(node.name.text);
          }
          break;
        case 'class_declaration':
          if (node.name) {
            analysis.classes.push(node.name.text);
          }
          break;
        case 'import_statement':
          if (node.text) {
            analysis.imports.push(node.text);
          }
          break;
        case 'export_statement':
        case 'export_named_declarations':
        case 'export_default_declaration':
          if (node.text) {
            analysis.exports.push(node.text);
          }
          break;
        case 'variable_declaration':
          if (node.text) {
            analysis.variables.push(node.text);
          }
          break;
      }
    });

    return analysis;
  }

  getAST(sourceCode: string): ASTJSON {
    const tree = this.parser.parse(sourceCode);
    return this.nodeToJSON(tree.rootNode as ASTNode);
  }

  private nodeToJSON(node: ASTNode): ASTJSON {
    const result: ASTJSON = {
      type: node.type,
      startPosition: {
        row: node.startPosition.row,
        column: node.startPosition.column
      },
      endPosition: {
        row: node.endPosition.row,
        column: node.endPosition.column
      },
      startIndex: node.startIndex,
      endIndex: node.endIndex
    };

    if (node.children) {
      result.children = node.children.map(child => this.nodeToJSON(child));
    }

    if (node.text) {
      result.text = node.text;
    }

    return result;
  }
}
