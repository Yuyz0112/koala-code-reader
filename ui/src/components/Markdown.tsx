import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

// Import GitHub Markdown CSS
import "github-markdown-css/github-markdown-light.css";
import "highlight.js/styles/github.css";

interface MarkdownProps {
  children: string;
  className?: string;
}

export const Markdown: React.FC<MarkdownProps> = ({ children, className }) => {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h1: ({ className, ...props }) => (
            <h1
              className={cn(
                "text-2xl font-bold border-b border-gray-200 pb-2 mb-4",
                className
              )}
              {...props}
            />
          ),
          h2: ({ className, ...props }) => (
            <h2
              className={cn(
                "text-xl font-semibold border-b border-gray-100 pb-1 mb-3 mt-6",
                className
              )}
              {...props}
            />
          ),
          h3: ({ className, ...props }) => (
            <h3
              className={cn("text-lg font-semibold mb-2 mt-4", className)}
              {...props}
            />
          ),
          h4: ({ className, ...props }) => (
            <h4
              className={cn("text-base font-semibold mb-2 mt-3", className)}
              {...props}
            />
          ),
          h5: ({ className, ...props }) => (
            <h5
              className={cn("text-sm font-semibold mb-1 mt-2", className)}
              {...props}
            />
          ),
          h6: ({ className, ...props }) => (
            <h6
              className={cn("text-sm font-medium mb-1 mt-2", className)}
              {...props}
            />
          ),
          p: ({ className, ...props }) => (
            <p className={cn("mb-4 leading-relaxed", className)} {...props} />
          ),
          a: ({ className, ...props }) => (
            <a
              className={cn(
                "text-blue-600 hover:text-blue-800 underline",
                className
              )}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          code: ({ className, ...props }: any) => (
            <code
              className={cn(
                "bg-gray-100 text-red-600 px-1 py-0.5 rounded text-sm font-mono",
                className
              )}
              {...props}
            />
          ),
          pre: ({ className, ...props }) => (
            <pre
              className={cn(
                "bg-gray-50 border rounded-lg p-4 overflow-x-auto mb-4",
                className
              )}
              {...props}
            />
          ),
          blockquote: ({ className, ...props }) => (
            <blockquote
              className={cn(
                "border-l-4 border-gray-300 pl-4 py-2 mb-4 italic text-gray-700 bg-gray-50",
                className
              )}
              {...props}
            />
          ),
          ul: ({ className, ...props }) => (
            <ul
              className={cn("list-disc pl-6 mb-4 space-y-1", className)}
              {...props}
            />
          ),
          ol: ({ className, ...props }) => (
            <ol
              className={cn("list-decimal pl-6 mb-4 space-y-1", className)}
              {...props}
            />
          ),
          li: ({ className, ...props }) => (
            <li className={cn("leading-relaxed", className)} {...props} />
          ),
          table: ({ className, ...props }) => (
            <div className="overflow-x-auto mb-4">
              <table
                className={cn(
                  "min-w-full border-collapse border border-gray-300",
                  className
                )}
                {...props}
              />
            </div>
          ),
          thead: ({ className, ...props }) => (
            <thead
              className={cn("bg-gray-50 border-b border-gray-300", className)}
              {...props}
            />
          ),
          tbody: ({ className, ...props }) => (
            <tbody
              className={cn("divide-y divide-gray-200", className)}
              {...props}
            />
          ),
          tr: ({ className, ...props }) => (
            <tr className={cn("hover:bg-gray-50", className)} {...props} />
          ),
          th: ({ className, ...props }) => (
            <th
              className={cn(
                "border border-gray-300 px-4 py-2 text-left font-semibold",
                className
              )}
              {...props}
            />
          ),
          td: ({ className, ...props }) => (
            <td
              className={cn("border border-gray-300 px-4 py-2", className)}
              {...props}
            />
          ),
          hr: ({ className, ...props }) => (
            <hr className={cn("border-gray-300 my-6", className)} {...props} />
          ),
          input: ({ className, ...props }) => {
            if (props.type === "checkbox") {
              return (
                <input
                  className={cn("mr-2 accent-blue-600", className)}
                  disabled
                  {...props}
                />
              );
            }
            return <input className={className} {...props} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;
