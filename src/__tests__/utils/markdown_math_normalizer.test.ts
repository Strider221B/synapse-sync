import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MarkdownMathNormalizer } from '@/lib/utils/markdown_math_normalizer';

describe('MarkdownMathNormalizer', () => {
  it('handles null, undefined, or empty markdown inputs gracefully', () => {
    assert.equal(MarkdownMathNormalizer.normalize(''), '');
    assert.equal(MarkdownMathNormalizer.normalize(null as unknown as string), null);
    assert.equal(MarkdownMathNormalizer.normalize(undefined as unknown as string), undefined);
  });

  it('normalizes multiline $$...$$ equations into clean display fences', () => {
    const input = `$$a = \\begin{cases}
x & 1 \\\\
y & 2
\\end{cases}$$`;

    const result = MarkdownMathNormalizer.normalize(input);
    assert.ok(result.startsWith('\n$$\n'));
    assert.ok(result.endsWith('\n$$\n'));
    assert.ok(result.includes('a = \\begin{cases}'));
    assert.ok(result.includes('\\end{cases}'));
  });

  it('normalizes single-line standalone $$...$$ into clean display fences', () => {
    const input = '$$E = mc^2$$';
    const result = MarkdownMathNormalizer.normalize(input);
    assert.equal(result, '\n$$\nE = mc^2\n$$\n');
  });

  it('preserves code blocks and does not modify $$ inside them', () => {
    const input = `\`\`\`python
code = "$$not_math$$"
\`\`\`

Here is \`$$inline_code$$\`.`;

    const result = MarkdownMathNormalizer.normalize(input);
    assert.ok(result.includes('code = "$$not_math$$"'));
    assert.ok(result.includes('`$$inline_code$$`'));
  });

  it('converts escaped dollar signs inside display and inline math to \\char36', () => {
    const displayInput = '$$\\text{Price} = \\$100$$';
    const displayResult = MarkdownMathNormalizer.normalize(displayInput);
    assert.ok(displayResult.includes('\\char36 100'));
    assert.ok(!displayResult.includes('\\$100'));

    const inlineInput = 'The cost is $\\sim \\$400$ per user.';
    const inlineResult = MarkdownMathNormalizer.normalize(inlineInput);
    assert.ok(inlineResult.includes('$\\sim \\char36 400$'));
  });

  it('normalizes faux currency expressions like $\\$10$ into escaped markdown \\$10', () => {
    const input = String.raw`Receive $\$10$ and end game. Lose $\$3$ or $\$1.5\text{ billion}$.`;
    const result = MarkdownMathNormalizer.normalize(input);
    assert.ok(result.includes(String.raw`\$10`), 'Must include \\$10');
    assert.ok(result.includes(String.raw`\$3`), 'Must include \\$3');
    assert.ok(result.includes(String.raw`\$1.5 billion`), 'Must include \\$1.5 billion');
  });
});
