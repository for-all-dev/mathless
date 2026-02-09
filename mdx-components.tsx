import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
    return {
        h2: ({ children }) => (
            <h2 className="text-2xl font-semibold mb-4 mt-16">{children}</h2>
        ),
        h3: ({ children }) => (
            <h3 className="text-lg font-semibold mb-2">{children}</h3>
        ),
        p: ({ children }) => (
            <p className="text-[var(--muted)] leading-relaxed mb-4">
                {children}
            </p>
        ),
        ol: ({ children }) => (
            <ol className="space-y-8 list-none">{children}</ol>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
            <strong className="text-[var(--foreground)]">{children}</strong>
        ),
        code: ({ children }) => (
            <code className="font-mono text-sm bg-[var(--border)] px-1.5 py-0.5 rounded">
                {children}
            </code>
        ),
        hr: () => (
            <hr className="border-t border-[var(--border)] mt-16 mb-8" />
        ),
        ...components,
    };
}
