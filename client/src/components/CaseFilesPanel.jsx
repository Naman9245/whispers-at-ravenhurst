import { useState, useEffect } from "react";
import { version } from "../../package.json";

// "Case Files" — the main-menu credits panel. Renders the live
// client/public/sounds/CREDITS.md (fetched, never duplicated here) through a
// deliberately tiny line-based markdown renderer — headers, blockquotes,
// tables, paragraphs and inline **bold** / `code` are all CREDITS.md uses.
// React elements only (no dangerouslySetInnerHTML). A fetch failure degrades
// to a short static credit + GitHub link, never a blank panel.

const REPO_URL = "https://github.com/Naman9245/whispers-at-ravenhurst";

// Inline pass: **bold** and `code` → <b>/<code>.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <b key={i}>{part.slice(2, -2)}</b>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return part;
  });
}

// Line-based block renderer. Unknown constructs fall through as paragraphs —
// it can render ugly, but it can never throw.
function renderMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let para = [];    // accumulating plain-text lines
  let table = [];   // accumulating |-rows

  const flushPara = () => {
    if (para.length) { out.push(<p key={out.length}>{inline(para.join(" "))}</p>); para = []; }
  };
  const flushTable = () => {
    if (!table.length) return;
    const cells = (r) => r.split("|").slice(1, -1).map((c) => c.trim());
    // Drop the |---|---| separator row; first remaining row is the header.
    const body = table.filter((r) => !/^:?-{3,}/.test(cells(r)[0] || ""));
    const [head, ...rest] = body;
    out.push(
      <table className="mm-credits-table" key={out.length}>
        <thead><tr>{cells(head).map((c, i) => <th key={i}>{inline(c)}</th>)}</tr></thead>
        <tbody>{rest.map((r, ri) => <tr key={ri}>{cells(r).map((c, i) => <td key={i}>{inline(c)}</td>)}</tr>)}</tbody>
      </table>
    );
    table = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("|")) { flushPara(); table.push(line); continue; }
    flushTable();
    if (!line.trim()) { flushPara(); continue; }
    if (line.startsWith("## ")) { flushPara(); out.push(<h4 key={out.length}>{inline(line.slice(3))}</h4>); continue; }
    if (line.startsWith("# ")) { flushPara(); out.push(<h3 key={out.length}>{inline(line.slice(2))}</h3>); continue; }
    if (line.startsWith("> ")) { flushPara(); out.push(<blockquote key={out.length}>{inline(line.slice(2))}</blockquote>); continue; }
    para.push(line);
  }
  flushPara(); flushTable();
  return out;
}

export default function CaseFilesPanel({ onClose }) {
  const [state, setState] = useState({ status: "loading", text: "" });

  useEffect(() => {
    let alive = true;
    fetch("/sounds/CREDITS.md")
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(res.status))))
      .then((text) => { if (alive) setState({ status: "ok", text }); })
      .catch(() => { if (alive) setState({ status: "error", text: "" }); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="mm-panel-backdrop" onClick={onClose}>
      <div className="mm-panel files" onClick={(e) => e.stopPropagation()}>
        <div className="mm-panel-head">
          <span>📖 CASE FILES</span>
          <button className="panel-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="mm-credits-body">
          {state.status === "loading" && <p className="mm-credits-loading">Opening the file…</p>}
          {state.status === "error" && (
            <p>
              All audio is CC0 / royalty-free — the full attribution log lives in{" "}
              <a href={`${REPO_URL}/blob/main/client/public/sounds/CREDITS.md`} target="_blank" rel="noopener noreferrer">
                sounds/CREDITS.md
              </a>{" "}on GitHub.
            </p>
          )}
          {state.status === "ok" && renderMarkdown(state.text)}
        </div>

        <div className="mm-credits-footer">
          <span>Built by <b>Namandeep Singh Virdi</b></span>
          <a className="mm-repo-link" href={REPO_URL} target="_blank" rel="noopener noreferrer">
            ◈ github.com/Naman9245/whispers-at-ravenhurst
          </a>
          <span className="mm-version">v{version}</span>
        </div>

        <div className="mm-panel-foot">
          <button className="mm-back" onClick={onClose}>← Back</button>
        </div>
      </div>
    </div>
  );
}
