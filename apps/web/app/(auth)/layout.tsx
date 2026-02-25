/**
 * Auth route group layout — no sidebar, no header.
 *
 * Provides a centered card layout for all auth pages (/login, /signup,
 * /forgot-password). Styles are inherited from the root layout which imports
 * globals.css. This layout renders a minimal background with a vertically and
 * horizontally centered container — Vercel/Linear style (locked decision).
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {children}
    </div>
  );
}
