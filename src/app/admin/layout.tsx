export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 antialiased">
      {children}
    </div>
  );
}
