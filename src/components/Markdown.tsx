import { type ReactNode } from "react";

// Minimal, safe Markdown renderer for the AI "Detective's Report".
// Supports: ## headings, - / 1. lists, **bold**, `code`, and paragraphs.

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[3] !== undefined) nodes.push(<code key={key++}>{m[3]}</code>);
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ content }: { content: string }) {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length) {
      blocks.push(<ul key={key++}>{list}</ul>);
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,3}\s/.test(line)) {
      flushList();
      blocks.push(<h2 key={key++}>{renderInline(line.replace(/^#{1,3}\s/, ""))}</h2>);
    } else if (/^\s*[-*]\s+/.test(line)) {
      list.push(<li key={key++}>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      list.push(<li key={key++}>{renderInline(line.replace(/^\s*\d+\.\s+/, ""))}</li>);
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(<p key={key++}>{renderInline(line)}</p>);
    }
  }
  flushList();

  return <div className="md">{blocks}</div>;
}
