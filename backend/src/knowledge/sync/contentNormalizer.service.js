import { createHash } from 'crypto';
import logger from '../../utils/logger.js';

const CATEGORY_MAP = {
  'feature': 'Fleet Management',
  'features': 'Fleet Management',
  'gps': 'GPS Tracking',
  'tracking': 'GPS Tracking',
  'location': 'GPS Tracking',
  'diagnostic': 'Live Diagnostics',
  'obd': 'OBD Devices',
  'maintenance': 'Maintenance',
  'service': 'Maintenance',
  'fuel': 'Fuel Analytics',
  'driver': 'Driver Management',
  'driving': 'Driver Management',
  'alert': 'Alerts',
  'notification': 'Alerts',
  'report': 'Reports',
  'analytics': 'Reports',
  'pricing': 'Pricing',
  'price': 'Pricing',
  'plan': 'Pricing',
  'demo': 'Demo Booking',
  'support': 'Support',
  'help': 'Support',
  'faq': 'FAQs',
  'integration': 'Integrations',
  'api': 'Integrations',
  'security': 'Security',
  'privacy': 'Security',
  'company': 'Company',
  'about': 'Company',
  'digital twin': 'Digital Twin',
  'twin': 'Digital Twin',
  'crm': 'CRM',
  'customer': 'CRM',
  'ai assistant': 'AI Assistant',
  'ai receptionist': 'AI Receptionist',
  'receptionist': 'AI Receptionist',
  'voice': 'AI Receptionist',
  'deploy': 'Deployment',
  'installation': 'Deployment',
  'on premise': 'Deployment',
  'hardware': 'OBD Devices',
  'device': 'OBD Devices',
};

const MODE_KEYWORDS = {
  sales: ['pricing', 'price', 'cost', 'plan', 'subscription', 'buy', 'purchase', 'demo', 'book', 'roi', 'benefit', 'advantage', 'value'],
  support: ['troubleshoot', 'fix', 'error', 'problem', 'issue', 'not working', 'broken', 'help', 'how to', 'setup', 'install', 'configure', 'connect'],
};

export function normalizeExtractedContent(extracted, source) {
  if (!extracted || extracted.error) return null;
  if (!extracted.title || extracted.title.trim().length === 0) return null;

  const title = extracted.title.trim();
  const contentHash = computeHash(extracted.rawText || extracted.answer || '');
  const category = detectCategory(title, extracted.keywords, extracted.headings);
  const subcategory = detectSubcategory(extracted.headings, extracted.breadcrumbs);
  const mode = detectMode(extracted.answer, extracted.details, extracted.faqItems);
  const keywords = generateKeywords(title, extracted.keywords, extracted.headings, extracted.faqItems);
  const synonyms = generateSynonyms(title, keywords);
  const answer = generateAnswer(title, extracted);
  const details = generateDetails(extracted);
  const priority = source.priority || 5;

  const article = {
    id: computeArticleId(contentHash, title),
    title,
    category,
    subcategory,
    keywords,
    synonyms,
    mode,
    priority,
    answer,
    details,
    relatedArticles: [],
    proactiveSalesTip: null,
    source: source.name || 'web',
    sourceUrl: extracted.canonicalUrl || extracted.url || '',
    sourceType: source.type || 'website',
    contentHash,
    version: 1,
    status: 'DISCOVERED',
    lastVerifiedAt: new Date().toISOString(),
  };

  return article;
}

function computeHash(content) {
  return createHash('sha256').update(content || '').digest('hex').substring(0, 16);
}

function computeArticleId(hash, title) {
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 60);
  return `sync_${slug}_${hash.substring(0, 8)}`;
}

function detectCategory(title, keywords, headings) {
  const text = [title, ...(keywords || []), ...((headings || []).map(h => h.text || h))]
    .join(' ').toLowerCase();

  for (const [key, category] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(key)) return category;
  }

  return 'Fleet Management';
}

function detectSubcategory(headings, breadcrumbs) {
  if (breadcrumbs && breadcrumbs.length > 1) {
    return breadcrumbs[breadcrumbs.length - 1];
  }
  if (headings && headings.length > 0) {
    return headings[0].text || headings[0];
  }
  return 'General';
}

function detectMode(answer, details, faqItems) {
  const text = [answer, details, ...(faqItems || []).map(f => f.question + ' ' + f.answer)]
    .filter(Boolean).join(' ').toLowerCase();

  let salesScore = 0;
  let supportScore = 0;

  for (const kw of MODE_KEYWORDS.sales) {
    if (text.includes(kw)) salesScore++;
  }
  for (const kw of MODE_KEYWORDS.support) {
    if (text.includes(kw)) supportScore++;
  }

  if (salesScore > supportScore && salesScore > 1) return 'sales';
  if (supportScore > salesScore && supportScore > 1) return 'support';
  return 'both';
}

function generateKeywords(title, words, headings, faqItems) {
 const keywordSet = new Set();

  if (title) {
    title.toLowerCase().split(/\s+/).filter(w => w.length > 2).forEach(w => keywordSet.add(w));
    keywordSet.add(title.toLowerCase());
  }

  if (words && Array.isArray(words)) {
    words.filter(w => w.length > 2).forEach(w => keywordSet.add(w.toLowerCase()));
  }

  if (headings && Array.isArray(headings)) {
    headings.forEach(h => {
      const text = (h.text || h || '').toLowerCase();
      text.split(/\s+/).filter(w => w.length > 2).forEach(w => keywordSet.add(w));
      if (text.length > 3) keywordSet.add(text);
    });
  }

  if (faqItems && Array.isArray(faqItems)) {
    faqItems.forEach(f => {
      const q = (f.question || '').toLowerCase();
      q.split(/\s+/).filter(w => w.length > 3).forEach(w => keywordSet.add(w));
    });
  }

  return [...keywordSet].slice(0, 30);
}

function generateSynonyms(title, keywords) {
  const synonyms = [];
  const titleLower = title.toLowerCase();

  if (titleLower.includes('gps')) synonyms.push('gps tracker');
  if (titleLower.includes('tracking')) synonyms.push('location tracking');
  if (titleLower.includes('diagnostic')) synonyms.push('live obd');
  if (titleLower.includes('obd')) synonyms.push('obd2');
  if (titleLower.includes('maintenance')) synonyms.push('servicing');
  if (titleLower.includes('fuel')) synonyms.push('fuel economy');

  if (keywords.includes('fleet')) synonyms.push('fleet management');
  if (keywords.includes('driver')) synonyms.push('driver management');

  return [...new Set(synonyms)].slice(0, 10);
}

function generateAnswer(title, extracted) {
  const faqItems = extracted.faqItems || [];
  if (faqItems.length > 0) {
    const first = faqItems[0];
    const q = first.question || '';
    const a = first.answer || '';
    return `${q} ${a}`.substring(0, 500).trim();
  }

  const paragraphs = extracted.paragraphs || [];
  if (paragraphs.length > 0) {
    return paragraphs.slice(0, 3).join(' ').substring(0, 500).trim();
  }

  return extracted.answer || title;
}

function generateDetails(extracted) {
  const parts = [];
  const headings = extracted.headings || [];
  const faqItems = extracted.faqItems || [];
  const lists = extracted.lists || [];
  const tables = extracted.tables || [];
  const paragraphs = extracted.paragraphs || [];

  if (headings.length > 0) {
    parts.push('Sections: ' + headings.map(h => h.text || h).join(', '));
  }

  if (paragraphs.length > 3) {
    parts.push(paragraphs.slice(3).join('\n'));
  }

  if (faqItems.length > 1) {
    const faqText = faqItems.slice(1).map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n');
    parts.push(faqText);
  }

  if (lists.length > 0) {
    parts.push(lists.map((items, i) => `List ${i + 1}: ${items.join(', ')}`).join('\n'));
  }

  if (tables.length > 0) {
    parts.push(JSON.stringify(tables.slice(0, 2)));
  }

  return parts.join('\n\n').substring(0, 3000);
}
