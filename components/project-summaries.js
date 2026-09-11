"use client";

import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ProjectSummaries({ project }) {
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  return (
    <div className="project-summaries">
      <p>{project.productDescription}</p>
      <div id={summaryId} className={`project-markdown${expanded ? "" : " project-summary-preview"}`}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{project.productSummary}</ReactMarkdown>
      </div>
      <button type="button" className="summary-toggle" aria-expanded={expanded} aria-controls={summaryId} onClick={() => setExpanded(!expanded)}>
        {expanded ? "Show less" : "Expand product summary"}
      </button>
      <details>
        <summary>Technical summary</summary>
        <p>{project.technicalDescription}</p>
        <div className="project-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{project.technicalSummary}</ReactMarkdown>
        </div>
      </details>
    </div>
  );
}
