import type { TestStatus } from "@/lib/tests";

const LABEL: Record<TestStatus, string> = { scheduled: "Scheduled", live: "Live", released: "Answers released" };

export default function StatusBadge({ status }: { status: TestStatus }) {
  return <span className={`badge ${status}`}>{LABEL[status]}</span>;
}
