import { createParser } from '@openuidev/react-lang';
import { library } from './library';

const parser = createParser(library.toJSONSchema());
type Element = { type: 'element'; typeName: string; props: Record<string, unknown> };
const element = (value: unknown): value is Element => !!value && typeof value === 'object' && (value as Element).type === 'element';
const inline = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(inline).join('');
  if (!element(value)) return '';
  const { props, typeName } = value;
  const text = inline(props.text ?? props.children ?? props.label);
  return typeName === 'Link' && typeof props.url === 'string' && /^https?:\/\//i.test(props.url) ? `[${text}](${props.url})` : text;
};

// The same answer has a readable transcript on the left and interactive UI on
// the right. Read the parsed component tree, rather than showing source code or
// asking another model to rewrite the answer. Partial programs work here too.
export function intelligentUIConversationText(source: string): string {
  try {
    const blocks = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(blocks);
      if (!element(value)) return [];
      const { props, typeName } = value;
      if (typeName === 'ListItem') {
        return [inline(props.title), inline(props.description), ...blocks(props.children)].filter(Boolean);
      }
      if (['Title', 'Text', 'Markdown', 'Caption', 'Label', 'Quote', 'Badge', 'Link'].includes(typeName)) {
        const text = inline(value).trim();
        return text ? [typeName === 'Title' ? `**${text}**` : text] : [];
      }
      if (typeName === 'Table') {
        const cell = (value: unknown) => inline(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
        const columns = Array.isArray(props.columns) ? props.columns : [];
        const rows = Array.isArray(props.rows) ? props.rows : [];
        if (!columns.length) return [];
        return [[`| ${columns.map(cell).join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`,
          ...rows.filter(Array.isArray).map(row => `| ${row.map(cell).join(' | ')} |`)].join('\n')];
      }
      // Media URLs, input defaults and action payloads belong to the UI, not
      // the transcript. Only follow visible child components in containers.
      return blocks(props.children);
    };
    return blocks(parser.parse(source).root).join('\n\n');
  } catch { return ''; }
}
