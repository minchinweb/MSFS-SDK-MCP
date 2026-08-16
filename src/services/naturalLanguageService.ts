export class NaturalLanguageService {
  static parse(command: string): { tool: string; arguments: any } | null {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      return null;
    }

    // 1. Match URL / content requests
    // e.g. "Get content for http://...", "Get http://...", "http://..."
    const urlPattern = /^(?:Get\s+content\s+for\s+|Get\s+content\s+of\s+|Get\s+)?(https?:\/\/[^\s]+)$/i;
    const urlMatch = trimmedCommand.match(urlPattern);
    if (urlMatch) {
      return {
        tool: "get_doc_content",
        arguments: {
          url: urlMatch[1]
        }
      };
    }

    // 2. Match "List categories" / "Show categories" / "Categories"
    const categoriesPattern = /^(?:List\s+categories|Show\s+categories|Categories)$/i;
    if (categoriesPattern.test(trimmedCommand)) {
      return {
        tool: "list_categories",
        arguments: {}
      };
    }

    // 3. Match "List items in [category]" / "List [category]" / "Show items in [category]"
    const categoryItemsPattern = /^(?:list\s+items\s+in\s+|list\s+category\s+items\s+for\s+|list\s+|show\s+items\s+in\s+|show\s+category\s+items\s+for\s+|show\s+)?(index|contents|glossary)(?:\s+items)?$/i;
    const categoryItemsMatch = trimmedCommand.match(categoryItemsPattern);
    if (categoryItemsMatch) {
      return {
        tool: "list_category_items",
        arguments: {
          category: categoryItemsMatch[1].toLowerCase()
        }
      };
    }

    // 4. Match "Search [query] in [category]"
    const categorySearchPattern = /^Search\s+(.+?)\s+in\s+(aircraft|scenery|simvars|panels|missions|packaging|tools|general)$/i;
    const categoryMatch = trimmedCommand.match(categorySearchPattern);
    if (categoryMatch) {
      const query = categoryMatch[1].trim();
      const category = categoryMatch[2].toLowerCase();
      return {
        tool: "search_msfs_docs",
        arguments: {
          query: query,
          category: category,
          limit: 5
        }
      };
    }

    // 5. Match "Search [query] on/op msfs sdk" or just "Search [query]"
    const searchPattern = /^Search\s+(.+?)(?:\s+(?:on|op)\s+msfs\s+sdk)?$/i;
    const searchMatch = trimmedCommand.match(searchPattern);
    if (searchMatch) {
      return {
        tool: "search_msfs_docs",
        arguments: {
          query: searchMatch[1].trim(),
          category: "all",
          limit: 5
        }
      };
    }

    // 6. Fallback: treat the entire command as a search query
    return {
      tool: "search_msfs_docs",
      arguments: {
        query: trimmedCommand,
        category: "all",
        limit: 5
      }
    };
  }
}

