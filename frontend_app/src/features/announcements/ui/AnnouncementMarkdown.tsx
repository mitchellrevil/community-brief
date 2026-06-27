import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

type AnnouncementMarkdownProps = {
  content: string;
  className?: string;
  compact?: boolean;
};

export function AnnouncementMarkdown({
  content,
  className,
  compact = false,
}: AnnouncementMarkdownProps) {
  return (
    <div className={cn('text-foreground max-w-none', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary font-medium underline decoration-primary/30 underline-offset-4 hover:decoration-primary"
              {...props}
            />
          ),
          p: ({ node: _node, ...props }) => (
            <p
              className={cn(
                compact ? 'mb-1.5 leading-5 last:mb-0' : 'mb-4 leading-7 last:mb-0'
              )}
              {...props}
            />
          ),
          ul: ({ node: _node, ...props }) => (
            <ul
              className={cn(
                'list-disc pl-5',
                compact ? 'mb-1.5 space-y-0.5' : 'mb-4 space-y-1'
              )}
              {...props}
            />
          ),
          ol: ({ node: _node, ...props }) => (
            <ol
              className={cn(
                'list-decimal pl-5',
                compact ? 'mb-1.5 space-y-0.5' : 'mb-4 space-y-1'
              )}
              {...props}
            />
          ),
          li: ({ node: _node, ...props }) => (
            <li className={cn(compact ? 'leading-5' : 'leading-7')} {...props} />
          ),
          h1: ({ node: _node, ...props }) => (
            <h1 className="mb-4 mt-6 text-2xl font-semibold tracking-normal" {...props} />
          ),
          h2: ({ node: _node, ...props }) => (
            <h2 className="mb-3 mt-6 text-xl font-semibold tracking-normal" {...props} />
          ),
          h3: ({ node: _node, ...props }) => (
            <h3 className="mb-2 mt-5 text-lg font-semibold tracking-normal" {...props} />
          ),
          blockquote: ({ node: _node, ...props }) => (
            <blockquote
              className="my-4 border-l-4 border-primary/25 pl-4 text-muted-foreground"
              {...props}
            />
          ),
          code: ({ node: _node, className: codeClassName, ...props }) => (
            <code
              className={cn(
                'rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground',
                codeClassName
              )}
              {...props}
            />
          ),
          pre: ({ node: _node, ...props }) => (
            <pre className="my-4 overflow-x-auto rounded-md border bg-muted p-4 text-sm" {...props} />
          ),
          table: ({ node: _node, ...props }) => (
            <div className="my-4 overflow-x-auto rounded-md border">
              <table className="w-full text-sm" {...props} />
            </div>
          ),
          th: ({ node: _node, ...props }) => (
            <th className="bg-muted px-3 py-2 text-left font-medium" {...props} />
          ),
          td: ({ node: _node, ...props }) => (
            <td className="border-t px-3 py-2 align-top" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
