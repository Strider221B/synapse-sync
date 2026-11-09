/**
 * Utility for normalizing LaTeX math blocks and expressions in Markdown text.
 * Resolves incompatibilities between CommonMark/remark-math fenced block requirements
 * and standard TeX/VSCode multiline math notation and escaped dollar currency symbols.
 */
export class MarkdownMathNormalizer {
  private static readonly _PLACEHOLDER_PREFIX = '@@@SYNAPSE_CODE_BLOCK_';
  private static readonly _PLACEHOLDER_SUFFIX = '@@@';
  private static readonly _CODE_BLOCK_REGEX = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;
  private static readonly _BRACKET_DISPLAY_MATH_REGEX = /(?<!\\)\\\[([\s\S]+?)(?<!\\)\\\]/g;
  private static readonly _BRACKET_INLINE_MATH_REGEX = /(?<!\\)\\\(([\s\S]+?)(?<!\\)\\\)/g;
  private static readonly _DISPLAY_MATH_REGEX = /(?<![\\$])\$\$(?!\$)((?:\\\$|[\s\S])+?)(?<![\\$])\$\$(?!\$)/g;
  private static readonly _INLINE_MATH_REGEX = /(?<![\\$])\$(?!\$)((?:\\\$|[^$\n])+?)(?<![\\$])\$(?!\$)/g;
  private static readonly _CURRENCY_MATH_REGEX = /\$\\\$([0-9][^\n$]*?)\$/g;
  private static readonly _CURRENCY_SYMBOL_REGEX = /\$\\\$/g;
  private static readonly _CHAR36_CMD = '\\char36 ';
  private static readonly _ESCAPED_DOLLAR_REGEX = /\\\$/g;
  private static readonly _TEXT_WRAPPER_REGEX = /\\text\{([^}]+)\}/g;
  private static readonly _STANDALONE_ESCAPED_DOLLAR = '\\$';

  /**
   * Normalizes math delimiters, multi-line blocks, and escaped currency in markdown.
   */
  public static normalize(markdown: string): string {
    if (!markdown || typeof markdown !== 'string') {
      return markdown;
    }
    const codeBlocks: string[] = [];
    let text = this._protectCodeBlocks(markdown, codeBlocks);
    text = this._normalizeBracketMath(text);
    text = this._normalizeFauxCurrency(text);
    text = this._normalizeDisplayMath(text);
    text = this._normalizeInlineMath(text);
    return this._restoreCodeBlocks(text, codeBlocks);
  }

  /**
   * Temporarily protects fenced code blocks and inline code spans from math normalization.
   */
  private static _protectCodeBlocks(text: string, blocks: string[]): string {
    return text.replace(this._CODE_BLOCK_REGEX, (match) => {
      const idx = blocks.length;
      blocks.push(match);
      return `${this._PLACEHOLDER_PREFIX}${idx}${this._PLACEHOLDER_SUFFIX}`;
    });
  }

  /**
   * Restores protected code blocks back to their original locations in markdown.
   */
  private static _restoreCodeBlocks(text: string, blocks: string[]): string {
    const pattern = new RegExp(`${this._PLACEHOLDER_PREFIX}(\\d+)${this._PLACEHOLDER_SUFFIX}`, 'g');
    return text.replace(pattern, (_, idx) => {
      return blocks[Number(idx)];
    });
  }

  /**
   * Converts bracket LaTeX delimiters (\[...\] and \(...\)) to $$...$$ and $...$.
   */
  private static _normalizeBracketMath(text: string): string {
    let result = text.replace(this._BRACKET_DISPLAY_MATH_REGEX, (_, inner) => {
      return `\n$$\n${inner.trim()}\n$$\n`;
    });
    result = result.replace(this._BRACKET_INLINE_MATH_REGEX, (_, inner) => {
      return `$${inner.trim()}$`;
    });
    return result;
  }

  /**
   * Ensures multi-line and standalone display math ($$...$$) are wrapped with clean fences.
   */
  private static _normalizeDisplayMath(text: string): string {
    return text.replace(this._DISPLAY_MATH_REGEX, (_, inner) => {
      const cleanInner = inner.replace(this._ESCAPED_DOLLAR_REGEX, this._CHAR36_CMD);
      return `\n$$\n${cleanInner.trim()}\n$$\n`;
    });
  }

  /**
   * Replaces escaped dollar signs inside inline math ($...$) with KaTeX \\char36.
   */
  private static _normalizeInlineMath(text: string): string {
    return text.replace(this._INLINE_MATH_REGEX, (_, inner) => {
      const cleanInner = inner.replace(this._ESCAPED_DOLLAR_REGEX, this._CHAR36_CMD);
      return `$${cleanInner}$`;
    });
  }

  /**
   * Normalizes faux-math currency notation (e.g., '$\\$10$' or '$\\$4') into standard escaped markdown.
   */
  private static _normalizeFauxCurrency(text: string): string {
    let result = text.replace(this._CURRENCY_MATH_REGEX, (_, inner) => {
      const clean = inner.replace(this._TEXT_WRAPPER_REGEX, '$1');
      return `${this._STANDALONE_ESCAPED_DOLLAR}${clean}`;
    });
    result = result.replace(this._CURRENCY_SYMBOL_REGEX, () => this._STANDALONE_ESCAPED_DOLLAR);
    return result;
  }
}

export default MarkdownMathNormalizer;
