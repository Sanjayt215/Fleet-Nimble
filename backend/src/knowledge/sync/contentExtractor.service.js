import logger from '../../utils/logger.js';

export function extractPageContent(page) {
  const { body, contentType, url } = page;

  if (!body || body.trim().length === 0) {
    return { error: 'empty_content' };
  }

  try {
    if (contentType.includes('text/markdown') || contentType.includes('text/plain')) {
      return extractMarkdown(body, url);
    }
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      return extractHtml(body, url);
    }
    return { error: 'unsupported_content_type', contentType };
  } catch (err) {
    logger.error('CONTENT_EXTRACTION_FAILED', { url, error: err.message });
    return { error: 'extraction_failed', message: err.message };
  }
}

function extractHtml(html, url) {
  const title = extractTagContent(html, 'title');
  const metaDescription = extractMetaContent(html, 'description');
  const canonicalUrl = extractCanonical(html);
  const lastModified = extractLastModified(html);
  const breadcrumbs = extractBreadcrumbs(html);

  const bodyContent = extractBodyContent(html);
  const mainContent = extractMainContent(bodyContent);

  const headings = extractHeadings(html);
  const faqItems = extractFaqItems(html);
  const lists = extractLists(html);
  const tables = extractUsefulTables(html);

  const answer = generateAnswer(mainContent, faqItems);
  const details = generateDetails(mainContent, headings, lists, tables);

  const keywords = extractKeywords(title, mainContent, headings);

  return {
    title: title || extractTitleFromUrl(url),
    metaDescription,
    canonicalUrl: canonicalUrl || url,
    lastModified,
    breadcrumbs,
    headings,
    paragraphs: mainContent.paragraphs || [],
    faqItems,
    lists,
    tables,
    answer,
    details,
    keywords,
    rawText: mainContent.rawText,
  };
}

function extractMarkdown(content, url) {
  const lines = content.split('\n');
  const title = lines.find(l => l.startsWith('# ') && !l.startsWith('## '))?.replace(/^#\s+/, '').trim()
    || lines.find(l => l.startsWith('title:'))?.replace(/^title:\s*['"]?/, '').replace(/['"]?\s*$/, '').trim()
    || extractTitleFromUrl(url);

  const headings = lines.filter(l => l.startsWith('## ')).map(l => l.replace(/^##+\s+/, '').trim());

  const faqItems = [];
  let currentQuestion = null;
  for (const line of lines) {
    if (line.startsWith('### ') || line.startsWith('**') || line.endsWith('?')) {
      if (currentQuestion) faqItems.push(currentQuestion);
      currentQuestion = { question: line.replace(/^###\s+/, '').replace(/^\*\*/, '').replace(/\*\*$/, '').trim(), answer: '' };
    } else if (currentQuestion && line.trim()) {
      currentQuestion.answer += line.trim() + ' ';
    }
  }
  if (currentQuestion) faqItems.push(currentQuestion);

  const paragraphs = lines.filter(l => l.trim().length > 0 && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('[')).map(l => l.trim());
  const rawText = paragraphs.join('\n');

  const answer = lines.find(l => l.startsWith('> ') || (l.startsWith('## Answer') && lines.indexOf(l) + 1 < lines.length))
    ? lines[lines.indexOf(lines.find(l => l.startsWith('## Answer') || l.startsWith('> '))) + 1]?.trim()
    : paragraphs.slice(0, 3).join(' ').substring(0, 500);

  const detailsSections = [];
  let currentSection = null;
  for (const line of lines) {
    if (line.startsWith('## ') && !line.startsWith('## Answer')) {
      if (currentSection) detailsSections.push(currentSection);
      currentSection = { heading: line.replace(/^##+\s+/, '').trim(), content: '' };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }
  if (currentSection) detailsSections.push(currentSection);
  const details = detailsSections.map(s => `${s.heading}: ${s.content.trim()}`).join('\n\n').substring(0, 3000);

  const keywords = extractKeywords(title, { paragraphs, rawText }, headings);

  return { title, headings, paragraphs, faqItems, answer: answer || '', details: details || rawText.substring(0, 2000), keywords, rawText, canonicalUrl: url };
}

function extractTagContent(html, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = html.match(regex);
  return match ? cleanText(match[1]) : '';
}

function extractMetaContent(html, name) {
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["'](?:og:)?${name}["'][^>]+content=["']([^"']+)["']`, 'i');
  const match = html.match(regex);
  if (match) return match[1];

  const altRegex = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:)?${name}["']`, 'i');
  const altMatch = html.match(altRegex);
  return altMatch ? altMatch[1] : '';
}

function extractCanonical(html) {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function extractLastModified(html) {
  const match = html.match(/<meta[^>]+(?:http-equiv=["']last-modified["']|itemprop=["']dateModified["'])[^>]+content=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

function extractBreadcrumbs(html) {
  const items = [];
  const schemaMatch = html.match(/"@type":"BreadcrumbList"[^}]+"itemListElement":\[([^\]]+)\]/);
  if (schemaMatch) {
    const entries = schemaMatch[1].match(/"name":"([^"]+)"/g);
    if (entries) {
      entries.forEach(e => items.push(e.replace(/"name":"|"$/g, '')));
    }
  }
  if (items.length === 0) {
    const htmlItems = html.match(/<li[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>([\s\S]*?)<\/li>/gi);
    if (htmlItems) {
      htmlItems.forEach(li => {
        const text = li.replace(/<[^>]+>/g, '').trim();
        if (text) items.push(text);
      });
    }
  }
  return items;
}

function extractBodyContent(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return bodyMatch ? bodyMatch[1] : html;
}

function extractMainContent(bodyHtml) {
  const mainSelectors = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:class|id)=["'][^"']*(?:content|main|article|page-body|doc)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<section[^>]*>([\s\S]*?)<\/section>/i,
  ];

  let mainContent = null;
  for (const selector of mainSelectors) {
    const match = bodyHtml.match(selector);
    if (match) {
      mainContent = match[1];
      break;
    }
  }

  if (!mainContent) {
    mainContent = bodyHtml;
  }

  const cleaned = mainContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/class=["'][^"']*cookie[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi, '')
    .replace(/class=["'][^"']*banner[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi, '')
    .replace(/class=["'][^"']*social[^"']*["'][^>]*>[\s\S]*?<\/(?:div|ul|section)>/gi, '')
    .replace(/class=["'][^"']*share[^"']*["'][^>]*>[\s\S]*?<\/(?:div|ul|section)>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const textContent = cleaned.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const paragraphs = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = pRegex.exec(cleaned)) !== null) {
    const text = cleanText(pMatch[1]);
    if (text.length > 20) paragraphs.push(text);
  }

  if (paragraphs.length === 0 && textContent.length > 0) {
    const sentences = textContent.split(/\.\s+/).filter(s => s.trim().length > 20);
    paragraphs.push(...sentences.map(s => s.trim() + '.'));
  }

  return { rawText: textContent, paragraphs };
}

function extractHeadings(html) {
  const headings = [];
  const hRegex = /<h([2-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = hRegex.exec(html)) !== null) {
    const text = cleanText(match[2]);
    if (text) headings.push({ level: parseInt(match[1]), text });
  }
  return headings;
}

function extractFaqItems(html) {
  const items = [];
  const schemaMatch = html.match(/"@type":"FAQPage"[^}]+"mainEntity":\[([^\]]+)\]/);
  if (schemaMatch) {
    const entries = schemaMatch[1].match(/\{[^}]+\}/g);
    if (entries) {
      for (const entry of entries) {
        const q = entry.match(/"name":"([^"]+)"/);
        const a = entry.match(/"text":"([^"]+)"/);
        if (q && a) {
          items.push({ question: q[1], answer: a[1] });
        }
      }
    }
  }
  if (items.length === 0) {
    const pairs = html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>[\s\S]*?<(?:p|div[^>]*class="[^"]*answer[^"]*")[^>]*>([\s\S]*?)<\/(?:p|div)>/gi);
    if (pairs) {
      for (const pair of pairs.slice(0, 10)) {
        const q = pair.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/);
        const a = pair.match(/<(?:p|div)[^>]*>([\s\S]*?)<\/(?:p|div)>/);
        if (q && a) {
          const question = cleanText(q[1]);
          const answer = cleanText(a[1]);
          if (question && answer && question.endsWith('?')) {
            items.push({ question, answer });
          }
        }
      }
    }
  }
  return items;
}

function extractLists(html) {
  const lists = [];
  const ulRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let ulMatch;
  while ((ulMatch = ulRegex.exec(html)) !== null) {
    const items = [];
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRegex.exec(ulMatch[1])) !== null) {
      const text = cleanText(liMatch[1]);
      if (text) items.push(text);
    }
    if (items.length > 0) lists.push(items);
  }
  return lists;
}

function extractUsefulTables(html) {
  const tables = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tMatch;
  while ((tMatch = tableRegex.exec(html)) !== null) {
    const rows = [];
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRegex.exec(tMatch[1])) !== null) {
      const cells = [];
      const cellRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;
      let cMatch;
      while ((cMatch = cellRegex.exec(trMatch[1])) !== null) {
        cells.push(cleanText(cMatch[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    if (rows.length > 1) tables.push(rows);
  }
  return tables;
}

function generateAnswer(paragraphs, faqItems) {
  if (faqItems.length > 0) {
    const first = faqItems[0];
    return `${first.question} ${first.answer}`.substring(0, 500);
  }
  const text = (paragraphs.paragraphs || []).slice(0, 3).join(' ');
  return text.substring(0, 500);
}

function generateDetails(mainContent, headings, lists, tables) {
  const parts = [];
  if (headings.length > 0) {
    parts.push(headings.map(h => h.text).join(', '));
  }
  if (mainContent.paragraphs && mainContent.paragraphs.length > 3) {
    parts.push(mainContent.paragraphs.slice(3).join('\n'));
  }
  if (lists.length > 0) {
    parts.push(lists.map(items => items.join(', ')).join('\n'));
  }
  if (tables.length > 0) {
    parts.push(JSON.stringify(tables.slice(0, 2)));
  }
  return parts.join('\n\n').substring(0, 3000);
}

function extractKeywords(title, mainContent, headings) {
  const words = new Set();

  if (title) {
    title.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => words.add(w));
  }

  for (const h of headings) {
    h.text.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => words.add(w));
  }

  if (mainContent.paragraphs) {
    const text = mainContent.paragraphs.slice(0, 5).join(' ').toLowerCase();
    const freqs = {};
    text.split(/\s+/).filter(w => w.length > 4).forEach(w => {
      freqs[w] = (freqs[w] || 0) + 1;
    });
    const topWords = Object.entries(freqs)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(e => e[0]);
    topWords.forEach(w => words.add(w));
  }

  return [...words].slice(0, 30);
}

function extractTitleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '').split('/').pop() || parsed.hostname;
    return path.replace(/[-_]/g, ' ').replace(/\.[a-z]+$/, '').replace(/\b\w/g, c => c.toUpperCase());
  } catch {
    return 'Untitled Page';
  }
}

function cleanText(text) {
  return text.replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
