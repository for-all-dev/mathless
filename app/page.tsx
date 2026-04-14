import Content from "../content.mdx";

export default function Home() {
    return (
        <div className="flex min-h-screen justify-center">
            <main className="w-full max-w-2xl px-6 py-20 sm:py-32">
                <header className="mb-16">
                    <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6">
                        m<span className="font-mono">∀</span>thl
                        <span className="font-mono">∃</span>ss.lean
                    </h1>
                    <p className="text-xl leading-relaxed text-[var(--muted)]">
                        A virtual conference celebrating and exploring the Lean4
                        community&apos;s contributions to{" "}
                        <strong className="text-[var(--foreground)]">
                            secure program synthesis
                        </strong>
                        .{" "}
                        <em>
                            Math is made of tokens, which we can use for
                            something else
                        </em>
                        .
                    </p>
                </header>
                <Content />
            </main>
        </div>
    );
}
