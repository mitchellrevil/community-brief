
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("text-foreground max-w-none", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline font-medium decoration-primary/30 underline-offset-4 transition-colors"
              {...props} 
            />
          ),
          code: ({ node, className: codeClassName, ...props }) => {
            const hasLang = /language-(\w+)/.exec(codeClassName || "");
            return hasLang ? (
              <code className={cn("bg-muted/50 px-1.5 py-0.5 rounded text-sm font-mono text-foreground border border-border/50", codeClassName)} {...props} />
            ) : (
              <code className={cn("bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-muted-foreground", codeClassName)} {...props} />
            );
          },
          pre: ({ node, ...props }) => (
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto my-4 border border-border text-sm leading-normal" {...props} />
          ),
          h1: ({ node, ...props }) => (
            <h1 className="text-3xl font-bold tracking-tight mt-8 mb-4 text-foreground/90 border-b pb-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-2xl font-semibold tracking-tight mt-8 mb-4 text-foreground/90" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-semibold tracking-tight mt-6 mb-3 text-foreground/90" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-lg font-semibold tracking-tight mt-4 mb-2 text-foreground/90" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="leading-7 mb-4 last:mb-0" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 mb-4 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 mb-4 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-7 pl-1" {...props} />
          ),
          input: ({ node, type, checked, ...props }) => {
            // Render task-list checkboxes as non-interactive inputs for accessibility
            if (type === 'checkbox') {
              // fallback to node properties if checked not passed
              const isChecked = typeof checked === 'boolean' ? checked : !!(node && (node as any).properties && (node as any).properties.checked);
              return (
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled
                  aria-hidden
                  className="mr-2 align-middle accent-primary"
                />
              );
            }
            return <input {...props} />;
          },
          s: ({ node, ...props }) => (
            <span className="line-through text-muted-foreground" {...props} />
          ),
          del: ({ node, ...props }) => (
            <span className="line-through text-muted-foreground" {...props} />
          ),
          blockquote: ({ node, ...props }) => (
            <blockquote className="border-l-4 border-primary/20 pl-4 italic text-muted-foreground my-4 py-1" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="my-6 w-full overflow-y-auto rounded-lg border">
              <table className="w-full text-sm" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-muted/50 text-left font-semibold" {...props} />
          ),
          tbody: ({ node, ...props }) => (
            <tbody className="divide-y divide-border/50" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-muted/50 transition-colors" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-3 text-left font-medium text-muted-foreground align-middle [&:has([role=checkbox])]:pr-0" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0" {...props} />
          ),
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-border" {...props} />
          ),
          img: ({ node, ...props }) => (
            <img className="rounded-md border border-border my-4" {...props} alt={props.alt || ''} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
