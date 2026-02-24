import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Login — Adsnap V2 PRO",
    description: "Acesse sua central de controle e automação",
};

export default function LoginLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div
            className="min-h-screen w-full"
            style={{
                background: 'var(--bg-primary)',
                fontFamily: 'var(--font-body)',
                color: 'var(--text-primary)',
            }}
        >
            {children}
        </div>
    );
}
