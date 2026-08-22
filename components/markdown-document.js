import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { headingId, resolveDocHref } from "../lib/protocol";

function plainText(children) {
  return Array.isArray(children) ? children.join("") : String(children);
}

export default function MarkdownDocument({ markdown }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => null,
        h2: ({ children }) => <h2 id={headingId(plainText(children))}>{children}</h2>,
        h3: ({ children }) => <h3 id={headingId(plainText(children))}>{children}</h3>,
        a: ({ href, children }) => {
          const resolved = resolveDocHref(href);
          const external = resolved?.startsWith("http");
          return external ? (
            <a href={resolved} rel="noreferrer" target="_blank">
              {children}
            </a>
          ) : (
            <Link href={resolved || "#"}>{children}</Link>
          );
        },
        table: ({ children }) => (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
