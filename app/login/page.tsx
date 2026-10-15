import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/tests");
  return (
    <>
      <header className="top">
        <div>
          <h1>SDR Certification Board</h1>
          <p className="sub">Spyne SDR training. Weekly tests, results and go-live readiness.</p>
        </div>
      </header>
      <div className="gate">
        <h2>Sign in</h2>
        <p className="h2note">Use your @spyne.ai email. The first time you sign in, the password you type becomes your password.</p>
        <LoginForm />
      </div>
    </>
  );
}
