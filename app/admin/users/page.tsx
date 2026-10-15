import Link from "next/link";
import { asc, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, attempts } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { formatIST } from "@/lib/time";
import { removeUser, resetPassword, setRole } from "@/app/actions";
import Header from "@/components/Header";
import AddUserForm from "./AddUserForm";
import ConfirmButton from "@/components/ConfirmButton";

export default async function UsersPage() {
  const me = await requireAdmin();
  const rows = await db
    .select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`, lastLoginAt: users.lastLoginAt, attempts: count(attempts.id),
    })
    .from(users)
    .leftJoin(attempts, eq(attempts.userId, users.id))
    .groupBy(users.id)
    .orderBy(asc(users.role), asc(users.email));

  return (
    <>
      <Header user={me} active="/admin/users" />
      <section className="block">
        <h2>Add a person</h2>
        <p className="h2note">
          Only @spyne.ai emails can be added. Anyone with a @spyne.ai email who signs in without being added gets the trainee role.
        </p>
        <AddUserForm />
      </section>

      <section className="block">
        <h2>People and roles</h2>
        <p className="h2note">Admins see every answer, every trainee's history, and manage tests and people. Trainees see questions only while taking a test.</p>
        <div className="scroll">
          <table style={{ minWidth: 820 }}>
            <thead>
              <tr><th>Person</th><th>Role</th><th className="c">Tests taken</th><th>Last sign-in</th><th>Password</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const self = u.id === me.id;
                return (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name || u.email}</strong>
                      {u.name && <div className="small">{u.email}</div>}
                    </td>
                    <td>
                      {self ? (
                        <span className="role">{u.role} (you)</span>
                      ) : (
                        <form action={setRole.bind(null, u.id)} className="row">
                          <select name="role" defaultValue={u.role} aria-label={`Role for ${u.email}`} style={{ width: "auto" }}>
                            <option value="trainee">Trainee</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button className="btn ghost sm">Save</button>
                        </form>
                      )}
                    </td>
                    <td className="c">{u.attempts}</td>
                    <td>{u.lastLoginAt ? formatIST(u.lastLoginAt) : <span className="small">Never</span>}</td>
                    <td>{u.hasPassword ? "Set" : <span className="small">Set on first sign-in</span>}</td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <Link className="btn ghost sm" href={`/history/${u.id}`}>History</Link>
                        {u.hasPassword && !self && (
                          <ConfirmButton action={resetPassword.bind(null, u.id)} message={`Reset the password for ${u.email}? They'll set a new one at their next sign-in.`} className="btn ghost sm">
                            Reset password
                          </ConfirmButton>
                        )}
                        {!self && (
                          <ConfirmButton action={removeUser.bind(null, u.id)} message={`Remove ${u.email}? This deletes their test history too.`} className="btn danger sm">
                            Remove
                          </ConfirmButton>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
