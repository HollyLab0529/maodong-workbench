import React from "react";

function renderInline(text, keyPrefix) {
  const parts = String(text).split(/(!\[[^\]]*\]\([^)]+\)|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const img = p.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) {
      return (
        <img
          key={`${keyPrefix}-${i}`}
          src={img[2]}
          alt={img[1] || ""}
          loading="lazy"
          className="my-2 max-w-full rounded-lg"
        />
      );
    }
    const link = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="break-all text-terracotta-600 hover:underline"
        >
          {link[1]}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(p)) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-slate-900">
          {p.slice(2, -2)}
        </strong>
      );
    }
    if (/^`[^`]+`$/.test(p)) {
      return (
        <code key={`${keyPrefix}-${i}`} className="rounded bg-slate-100 px-1 py-0.5 text-[13px]">
          {p.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{p}</React.Fragment>;
  });
}

export default function MarkdownLite({ text }) {
  if (!text) return null;
  const lines = String(text).split("\n");
  const blocks = [];
  let listBuf = [];
  let codeBuf = null;

  const flushList = () => {
    if (listBuf.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
          {listBuf.map((it, i) => (
            <li key={i}>{renderInline(it, `li-${blocks.length}-${i}`)}</li>
          ))}
        </ul>
      );
      listBuf = [];
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();
    if (codeBuf !== null) {
      if (/^```/.test(line.trim())) {
        blocks.push(
          <pre key={`code-${blocks.length}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[13px] text-slate-50">
            <code>{codeBuf.join("\n")}</code>
          </pre>
        );
        codeBuf = null;
      } else codeBuf.push(raw);
      return;
    }
    if (/^```/.test(line.trim())) {
      flushList();
      codeBuf = [];
      return;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList();
      const cls =
        h[1].length === 1
          ? "mt-4 mb-2 text-lg font-semibold text-slate-900"
          : h[1].length === 2
            ? "mt-4 mb-2 text-base font-semibold text-slate-900"
            : "mt-3 mb-1 text-sm font-semibold text-slate-800";
      blocks.push(
        <p key={`h-${blocks.length}`} className={cls}>
          {renderInline(h[2], `h-${blocks.length}`)}
        </p>
      );
      return;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) return listBuf.push(li[1]);
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) return listBuf.push(ol[1]);
    flushList();
    if (!line.trim()) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="my-1.5 leading-relaxed">
        {renderInline(line, `p-${blocks.length}`)}
      </p>
    );
  });
  flushList();
  if (codeBuf !== null) {
    blocks.push(
      <pre key={`code-${blocks.length}`} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-[13px] text-slate-50">
        <code>{codeBuf.join("\n")}</code>
      </pre>
    );
  }
  return <div className="md-body text-sm text-slate-700">{blocks}</div>;
}
