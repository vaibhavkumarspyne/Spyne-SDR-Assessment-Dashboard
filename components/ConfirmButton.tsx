"use client";

/** A one-button form that asks before running a destructive or visible action. */
export default function ConfirmButton({
  action, message, className, children,
}: {
  action: (form: FormData) => void | Promise<void>;
  message: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={action} className="inline" onSubmit={(e) => { if (!confirm(message)) e.preventDefault(); }}>
      <button className={className}>{children}</button>
    </form>
  );
}
