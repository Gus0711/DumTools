/** Layout des pages hors application (login) : plein écran, centré, sans shell.
 *  Fond marine + voile de lumière : de la profondeur, sans motif. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-brand-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div aria-hidden className="voile-brand pointer-events-none absolute inset-0" />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
