// applets/editer/shared/file-types-config.js
/**
 * Shared File Types Configuration
 * Used by both server and client for consistent file type detection and rendering
 */

export const FILE_TYPES_CONFIG = {
    markdown: {
      extensions: ['.md', '.markdown', '.mdown', '.mkd'],
      applet: 'renderer',
      config: {
        renderer: 'markdown'
      }
    },
    json: {
      extensions: ['.json', '.jsonl'],
      applet: 'renderer',
      config: {
        renderer: 'json'
      }
    },
    csv: {
      extensions: ['.csv', '.tsv'],
      applet: 'renderer',
      config: {
        renderer: 'csv'
      }
    },
    image: {
      extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
      applet: 'renderer',
      config: {
        renderer: 'image'
      }
    },
    video: {
      extensions: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
      applet: 'renderer',
      config: {
        renderer: 'video'
      }
    },
    audio: {
      extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
      applet: 'renderer',
      config: {
        renderer: 'audio'
      }
    },
    api: {
      extensions: ['.js'],
      applet: 'renderer',
      config: {
        renderer: 'api'
      },
      condition: (filePath) => filePath.endsWith('/api.js'),
    },
    html: {
      extensions: ['.html'],
      applet: 'renderer',
      config: {
        renderer: 'html'
      }
    },
    text: {
      extensions: ['.txt', '.log', '.conf', '.ini', '.cfg', '.env'],
      applet: 'renderer',
      config: {
        renderer: 'text'
      }
    },
    pdf: {
      extensions: ['.pdf'],
      applet: 'renderer',
      config: {
        renderer: 'pdf'
      }
    },
    mermaid: {
      extensions: ['.mermaid', '.mmd'],
      applet: 'renderer',
      config: {
        renderer: 'mermaid'
      }
    },
    python: {
      extensions: ['.py', '.pyw', '.pyc', '.pyo'],
      applet: 'terminaler',
      config: {
        title: 'Python Development',
        description: 'Terminal for Python file development'
      }
    },
    javascript: {
      extensions: ['.js', '.mjs', '.cjs'],
      applet: 'terminaler',
      condition: (filePath) => !filePath.includes('/frontend/'),
      config: {
        title: 'Node.js Development',
        description: 'Terminal for JavaScript development'
      }
    },
    shell: {
      extensions: ['.sh', '.bash', '.zsh'],
      applet: 'terminaler',
      config: {
        title: 'Shell Script',
        description: 'Terminal for shell script execution'
      }
    },
    rust: {
      extensions: ['.rs'],
      applet: 'terminaler',
      config: {
        title: 'Rust Development',
        description: 'Terminal for Rust development and cargo commands'
      }
    },
    go: {
      extensions: ['.go'],
      applet: 'terminaler',
      config: {
        title: 'Go Development',
        description: 'Terminal for Go development and testing'
      }
    },
    typescript: {
      extensions: ['.ts', '.tsx'],
      applet: 'terminaler',
      config: {
        title: 'TypeScript Development',
        description: 'Terminal for TypeScript development and compilation'
      }
    }
};

export const SUPPORTED_APPLETS = [
...new Set(Object.values(FILE_TYPES_CONFIG).map(config => config.applet))
];

/**
 * Supported renderer types
 */
export const SUPPORTED_RENDERERS = [
...new Set(
    Object.values(FILE_TYPES_CONFIG)
    .filter(config => config.applet === 'renderer')
    .map(config => config.config.renderer)
)
];

/**
 * Evaluate conditions for file types (shared logic)
 */
export function evaluateCondition(typeInfo, filePath = '') {
if (!typeInfo.condition) {
    return true;
}

return typeInfo.condition(filePath);
}

/**
 * Get video file extensions from config
 */
export function getVideoExtensions() {
  return FILE_TYPES_CONFIG.video?.extensions || [];
}

/**
 * Get image file extensions from config
 */
export function getImageExtensions() {
  return FILE_TYPES_CONFIG.image?.extensions || [];
}

/**
 * Get audio file extensions from config
 */
export function getAudioExtensions() {
  return FILE_TYPES_CONFIG.audio?.extensions || [];
}

/**
 * Get PDF/document file extensions from config
 */
export function getDocumentExtensions() {
  return FILE_TYPES_CONFIG.pdf?.extensions || [];
}

/**
 * Check if file extension is a video
 */
export function isVideoExtension(ext) {
  return getVideoExtensions().includes(ext.toLowerCase());
}

/**
 * Check if file extension is an image
 */
export function isImageExtension(ext) {
  return getImageExtensions().includes(ext.toLowerCase());
}

/**
 * Check if file extension is audio
 */
export function isAudioExtension(ext) {
  return getAudioExtensions().includes(ext.toLowerCase());
}

/**
 * Check if file extension is a document
 */
export function isDocumentExtension(ext) {
  return getDocumentExtensions().includes(ext.toLowerCase());
}