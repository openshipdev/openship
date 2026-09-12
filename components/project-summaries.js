"use client";

import { useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ProjectSummaries({ project, detail = false }) {
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  const [technicalExpanded, setTechnicalExpanded] = useState(false);
  const technicalId = useId();
  if (detail)
    return (
      <div className="project-detail-summaries">
        <section
          className="project-summary-section"
          aria-labelledby={`${summaryId}-heading`}
        >
          <h2 id={`${summaryId}-heading`}>Project summary</h2>
          <div
            id={summaryId}
            className={`project-markdown${expanded ? "" : " project-detail-preview"}`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {project.productSummary}
            </ReactMarkdown>
          </div>
          <button
            type="button"
            className="summary-toggle"
            aria-expanded={expanded}
            aria-controls={summaryId}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : "Read full summary"}
            <span aria-hidden="true">{expanded ? "↑" : "↓"}</span>
          </button>
        </section>
        <section className="project-summary-section project-technical-section">
          <h2>
            <button
              type="button"
              className="technical-summary-toggle"
              aria-expanded={technicalExpanded}
              aria-controls={technicalId}
              onClick={() => setTechnicalExpanded(!technicalExpanded)}
            >
              Technical summary
              <span aria-hidden="true">{technicalExpanded ? "−" : "+"}</span>
            </button>
          </h2>
          <p className="project-technical-description">
            {project.technicalDescription}
          </p>
          <div
            id={technicalId}
            className="project-markdown"
            hidden={!technicalExpanded}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
              {project.technicalSummary}
            </ReactMarkdown>
          </div>
        </section>
      </div>
    );
  return (
    <div className="project-summaries">
      <p>{project.productDescription}</p>
      <div
        id={summaryId}
        className={`project-markdown${expanded ? "" : " project-summary-preview"}`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {project.productSummary}
        </ReactMarkdown>
      </div>
      <button
        type="button"
        className="summary-toggle"
        aria-expanded={expanded}
        aria-controls={summaryId}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? "Show less" : "Expand product summary"}
      </button>
      <details>
        <summary>Technical summary</summary>
        <p>{project.technicalDescription}</p>
        <div className="project-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
            {project.technicalSummary}
          </ReactMarkdown>
        </div>
      </details>
    </div>
  );
}
