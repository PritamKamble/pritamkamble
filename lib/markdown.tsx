import React from "react";

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      nodes.push(
        <a key={`${keyPrefix}-${i++}`} href={match[2]} target="_blank" rel="noopener noreferrer">
          {match[1]}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(<b key={`${keyPrefix}-${i++}`}>{match[3]}</b>);
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// Deliberately minimal - handles the small, predictable subset of markdown
// (headings, bold, links, lists, paragraphs) that the blog generator prompt
// is instructed to produce. Not a general-purpose parser.
export function renderMarkdown(md: string): React.ReactNode {
  const lines = md.split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} style={{ paddingLeft: 20, marginBottom: 16 }}>
        {listItems.map((item, i) => (
          <li key={i} style={{ marginBottom: 4 }}>
            {renderInline(item, `li-${key}-${i}`)}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={`h2-${key++}`} style={{ fontSize: 20, marginTop: 24, marginBottom: 10 }}>
          {renderInline(line.slice(3), `h2-${key}`)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={`h1-${key++}`} style={{ fontSize: 24, marginTop: 24, marginBottom: 10 }}>
          {renderInline(line.slice(2), `h1-${key}`)}
        </h1>,
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      listItems.push(line.slice(2));
    } else {
      flushList();
      blocks.push(
        <p key={`p-${key++}`} style={{ marginBottom: 14, lineHeight: 1.7 }}>
          {renderInline(line, `p-${key}`)}
        </p>,
      );
    }
  }
  flushList();
  return blocks;
}
