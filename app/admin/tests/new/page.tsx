import { requireAdmin } from "@/lib/auth";
import { toISTLocal } from "@/lib/time";
import Header from "@/components/Header";
import TestEditor from "@/components/TestEditor";

export default async function NewTestPage() {
  const me = await requireAdmin();
  // Default: tomorrow 10:00 IST.
  const tomorrow = toISTLocal(new Date(Date.now() + 86_400_000)).slice(0, 10) + "T10:00";
  return (
    <>
      <Header user={me} active="/admin/tests" />
      <h2 style={{ marginBottom: 14 }}>New test</h2>
      <TestEditor
        test={{ title: "", week: "", description: "", kind: "mcq", passPct: 75, maxAttempts: 2, liveAt: tomorrow }}
        initialQuestions={[]}
        locked={false}
      />
    </>
  );
}
