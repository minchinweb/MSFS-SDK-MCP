import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export interface DocumentationResult {
  title: string;
  url: string;
  description: string;
  category: string;
}

type ToolResult = { content: Array<{ type: string; text: string }> };

// The SDK docs moved to a Hugo site (2026). Every page has a Markdown twin at <url>index.md,
// (a few pages have none; those are skipped when loading bodies).
const SITE = 'https://docs.flightsimulator.com/msfs2024';
const EDITION = 'retail'; // the other edition listed in llms.txt is "flighting"
const USER_AGENT = { 'User-Agent': 'MSFS-SDK-MCP-Server/1.1' };

const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });

export class MSFSDocumentationService {
  private pages: DocumentationResult[] | null = null;
  private bodies = new Map<string, string>();
  private bodiesLoaded = false;

  private categoryOf(url: string): string {
    const rest = url.split(`/${EDITION}/`)[1] ?? '';
    return rest.split('/')[0] || 'general';
  }

  // The retail home page links every page in the docs (llms.txt only lists the top levels).
  private async loadIndex(): Promise<DocumentationResult[]> {
    if (this.pages) return this.pages;
    const res = await fetch(`${SITE}/${EDITION}/`, { headers: USER_AGENT });
    if (!res.ok) throw new Error(`Failed to fetch docs index: ${res.status}`);
    const $ = cheerio.load(await res.text());
    const pages: DocumentationResult[] = [];
    const seen = new Set<string>();
    $('a[href]').each((_, a) => {
      const url = ($(a).attr('href') ?? '').split('#')[0];
      const title = $(a).text().trim().replace(/\s+/g, ' ');
      if (!url.startsWith(`${SITE}/${EDITION}/`) || url === `${SITE}/${EDITION}/` || !title || seen.has(url)) return;
      seen.add(url);
      pages.push({ title, url, description: '', category: this.categoryOf(url) });
    });
    this.pages = pages;
    return pages;
  }

  private async fetchMarkdown(url: string): Promise<string> {
    const mdUrl = url.endsWith('.md') ? url : `${url.replace(/\/?$/, '/')}index.md`;
    const res = await fetch(mdUrl, { headers: USER_AGENT });
    if (!res.ok) throw new Error(`Failed to fetch ${mdUrl}: ${res.status}`);
    return res.text();
  }

  // Full-text search needs every page body: ~250 small files, fetched once and cached.
  private async loadBodies(pages: DocumentationResult[]): Promise<void> {
    if (this.bodiesLoaded) return;
    const queue = [...pages];
    const worker = async () => {
      for (let p = queue.pop(); p; p = queue.pop()) {
        try {
          this.bodies.set(p.url, await this.fetchMarkdown(p.url));
        } catch (e) {
          console.error(String(e));
        }
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    this.bodiesLoaded = true;
  }

  async searchDocumentation(query: string, category: string = 'all', limit: number = 10): Promise<ToolResult> {
    try {
      const pages = (await this.loadIndex()).filter(
        p => category === 'all' || category === 'index' || category === 'contents' || p.category === category.toLowerCase()
      );
      await this.loadBodies(pages);
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

      const scored = pages.map(p => {
        const head = `${p.title} ${p.url.split(`/${EDITION}/`)[1] ?? ''}`.toLowerCase();
        const desc = p.description.toLowerCase();
        const body = (this.bodies.get(p.url) ?? '').toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (head.includes(t)) score += 10;
          if (desc.includes(t)) score += 4;
          const hits = body.split(t).length - 1;
          score += Math.min(hits, 10);
        }
        return { p, score };
      }).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);

      if (scored.length === 0) return text(`No MSFS SDK documentation found for "${query}".`);
      const lines = scored.map(({ p }, i) => `${i + 1}. **${p.title}** [${p.category}]\n   ${p.url}\n   ${p.description}`);
      return text(`Found ${scored.length} result(s) for "${query}":\n\n${lines.join('\n\n')}`);
    } catch (error) {
      return text(`Error searching MSFS documentation: ${(error as Error).message}.`);
    }
  }

  async getDocumentationContent(url: string, section?: string): Promise<ToolResult> {
    try {
      let md = await this.fetchMarkdown(url);
      if (section) {
        const want = section.toLowerCase();
        const lines = md.split('\n');
        const start = lines.findIndex(l => /^#{1,6}\s/.test(l) && l.toLowerCase().includes(want));
        if (start >= 0) {
          const level = lines[start].match(/^#+/)![0].length;
          let end = lines.length;
          for (let i = start + 1; i < lines.length; i++) {
            const h = lines[i].match(/^(#{1,6})\s/);
            if (h && h[1].length <= level) { end = i; break; }
          }
          md = lines.slice(start, end).join('\n');
        }
      }
      const max = 20000;
      return text(`URL: ${url}\n\n${md.substring(0, max)}${md.length > max ? '\n\n... (truncated; pass `section` to narrow)' : ''}`);
    } catch (error) {
      throw new Error(`Failed to get documentation content: ${error}`);
    }
  }

  async listCategories(): Promise<ToolResult> {
    const pages = await this.loadIndex();
    const counts = new Map<string, number>();
    for (const p of pages) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const list = [...counts].map(([c, n]) => `- **${c}**: ${n} pages`).join('\n');
    return text(`MSFS SDK documentation categories (retail edition):\n\n${list}\n\nUse a category name with search_msfs_docs, or "all".`);
  }

  async listCategoryItems(category: string): Promise<ToolResult> {
    const pages = await this.loadIndex();
    const items = pages.filter(p => p.category === category.toLowerCase());
    if (items.length === 0) {
      throw new Error(`Invalid category: ${category}. Use list_categories to see the valid ones.`);
    }
    return text(`Pages in "${category}":\n\n${items.map(p => `- ${p.title}: ${p.url}`).join('\n')}`);
  }

  async close() {
    return Promise.resolve();
  }
}
