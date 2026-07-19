# Content Extraction

## Overview

The Content Extractor parses raw HTML and Markdown documents into structured fields suitable for
further normalization and knowledge engine storage.

## HTML Extraction

### Extracted Fields

| Field | Source |
|---|---|
| title | `<title>` tag or `<h1>` |
| description | `<meta name="description">` |
| canonicalUrl | `<link rel="canonical">` |
| headings | H2 and H3 text content |
| faq | FAQPage schema.org JSON-LD or `<div>` with FAQ Q&A pairs |
| lists | `<ul>` and `<ol>` list items |
| tables | `<table>` → array of { headers, rows } |
| breadcrumbs | Breadcrumb structured data or nav path |
| bodyText | Cleaned text with nav/footer/script/style removed |

### Content Cleaning

- Navigation elements (`<nav>`, `<header>`, `.nav`, `.navbar`)
- Footer elements (`<footer>`, `.footer`)
- Scripts (`<script>`), styles (`<style>`), iframes
- Hidden elements (`display:none`, `visibility:hidden`)
- Empty paragraphs and excess whitespace

## Markdown Extraction

### Extracted Fields

| Field | Source |
|---|---|
| title | First `#` heading or filename |
| description | YAML front matter `description` field |
| headings | All `##` and `###` lines |
| sections | Grouped by heading level 2 |
| faq | Consecutive lines starting with Q: / A: or questions ending with ? |
| codeBlocks | Triple-backtick fenced code blocks |
| bodyText | All non-empty lines without front matter |

### YAML Front Matter

Standard Jekyll/Hugo front matter is parsed for:
- `title`, `description`, `tags`, `category`, `layout`

## Output Format

Both extractors produce a normalized extraction object:

```js
{
  title: string,
  description: string,
  bodyText: string,
  headings: string[],
  faq: [{ question: string, answer: string }],
  lists: string[],
  tables: [...],
  breadcrumbs: string[],
  metadata: { sourceUrl, sourceType, ... }
}
```
