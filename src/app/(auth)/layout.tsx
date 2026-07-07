/** Layout des pages hors application (login) : plein écran, centré, sans shell. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      {children}
    </div>
  );
}
