import { config } from '../../config/index.js';

const MAX_SIZE = config.rag.chunking.maxSize;
const OVERLAP = config.rag.chunking.overlap;

export function chunkArticle(article) {
  const strategy = config.rag.chunking.strategy;
  const content = buildContent(article);

  switch (strategy) {
    case 'heading': return chunkByHeadings(content);
    case 'paragraph': return chunkByParagraphs(content);
    case 'hybrid':
    default: return chunkHybrid(content);
  }
}

function buildContent(article) {
  const parts = [];
  parts.push(`# ${article.title}`);

  if (article.details) parts.push(`\n${article.details}`);

  if (article.answer) parts.push(`\n${article.answer}`);

  if (article.keywords?.length) {
    parts.push(`\nKeywords: ${article.keywords.join(', ')}`);
  }

  return parts.join('\n\n');
}

export function chunkByHeadings(text) {
  const chunks = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const sections = [];
  let lastIndex = 0;
  let lastHeading = 'Introduction';

  let match;
  while ((match = headingRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      sections.push({ heading: lastHeading, content: text.slice(lastIndex, match.index).trim() });
    }
    lastHeading = match[2];
    lastIndex = match.index;
  }

  if (lastIndex < text.length) {
    sections.push({ heading: lastHeading, content: text.slice(lastIndex).trim() });
  }

  if (sections.length === 0) {
    sections.push({ heading: 'Content', content: text.trim() });
  }

  for (const section of sections) {
    if (section.content.length <= MAX_SIZE) {
      chunks.push(formatChunk(section.heading, section.content));
    } else {
      const subChunks = splitText(section.content, MAX_SIZE, OVERLAP);
      for (let i = 0; i < subChunks.length; i++) {
        chunks.push(formatChunk(`${section.heading} (part ${i + 1})`, subChunks[i]));
      }
    }
  }

  return chunks;
}

export function chunkByParagraphs(text) {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const chunks = [];
  let current = '';
  let currentHeading = 'Content';

  for (const para of paragraphs) {
    const headingMatch = para.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      if (current) {
        chunks.push(formatChunk(currentHeading, current.trim()));
      }
      currentHeading = headingMatch[1];
      current = para;
      continue;
    }

    const combined = current ? `${current}\n\n${para}` : para;
    if (combined.length > MAX_SIZE && current) {
      chunks.push(formatChunk(currentHeading, current.trim()));
      current = para;
    } else {
      current = combined;
    }
  }

  if (current) chunks.push(formatChunk(currentHeading, current.trim()));

  return chunks.length > 0 ? chunks : [formatChunk('Content', text.trim())];
}

export function chunkHybrid(text) {
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  let currentHeading = 'Content';
  let inTable = false;
  let tableBuffer = '';

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);

    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      if (!inTable) { inTable = true; tableBuffer = line; }
      else { tableBuffer += '\n' + line; }
      continue;
    }

    if (inTable) {
      const combinedTable = current ? `${current}\n\n${tableBuffer}` : tableBuffer;
      if (headingMatch) {
        if (current) chunks.push(formatChunk(currentHeading, current.trim()));
        currentHeading = headingMatch[2];
        current = '';
      } else if (combinedTable.length > MAX_SIZE) {
        if (current) chunks.push(formatChunk(currentHeading, current.trim()));
        current = tableBuffer;
      } else {
        current = combinedTable;
      }
      tableBuffer = '';
      inTable = false;
    }

    if (headingMatch) {
      if (current) chunks.push(formatChunk(currentHeading, current.trim()));
      currentHeading = headingMatch[2];
      current = line;
      continue;
    }

    const combined = current ? `${current}\n${line}` : line;
    if (combined.length > MAX_SIZE && current) {
      chunks.push(formatChunk(currentHeading, current.trim()));
      current = line;
    } else {
      current = combined;
    }
  }

  if (inTable && tableBuffer) {
    const combined = current ? `${current}\n\n${tableBuffer}` : tableBuffer;
    if (combined.length > MAX_SIZE && current) {
      chunks.push(formatChunk(currentHeading, current.trim()));
      chunks.push(formatChunk(currentHeading, tableBuffer));
    } else {
      current = combined;
    }
  }

  if (current) chunks.push(formatChunk(currentHeading, current.trim()));

  return chunks.length > 0 ? chunks : [formatChunk('Content', text.trim())];
}

function formatChunk(heading, text) {
  return `## ${heading}\n\n${text}`.trim();
}

function splitText(text, maxSize, overlap) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxSize;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    const breakAt = text.lastIndexOf('. ', end);
    if (breakAt > start + maxSize / 2) {
      end = breakAt + 1;
    } else {
      const spaceAt = text.lastIndexOf(' ', end);
      if (spaceAt > start + maxSize / 2) end = spaceAt;
    }
    chunks.push(text.slice(start, end));
    start = end - overlap;
  }
  return chunks;
}

export async function computeContentHash(text) {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(text).digest('hex');
}
