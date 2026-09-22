import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { deletePigAction } from "@/lib/actions/pigs";

function ageLabel(dob: Date) {
  const days = Math.round((Date.now() - dob.getTime()) / 86400000);
  if (days < 21) return `${days}d`;
  if (days < 210) return `${Math.floor(days / 7)}w`;
  return `${(days / 30.44).toFixed(0)}mo`;
}

export default async function PigsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  await requireActiveFarm(session);
  const { error } = await searchParams;
  const isManager = session.role !== "worker";

  const pigs = await db
    .select()
    .from(schema.pigs)
    .where(eq(schema.pigs.farmId, session.farmId))
    .orderBy(asc(schema.pigs.tag));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Pig registry</h1>
          <p className="text-ink-soft text-sm">Every animal currently on the farm.</p>
        </div>
        {isManager && (
          <Link href="/app/pigs/new" className="btn btn-primary">
            + Add pig
          </Link>
        )}
      </div>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th>Pig</th>
              <th>Tag</th>
              <th>Breed</th>
              <th>Sex</th>
              <th className="num">Age</th>
              <th>Pen</th>
              <th className="num">Weight</th>
              <th>Status</th>
              {isManager && <th></th>}
            </tr>
          </thead>
          <tbody>
            {pigs.map((p) => (
              <tr key={p.id}>
                <td className="font-semibold">{p.name}</td>
                <td className="tag">{p.tag}</td>
                <td>{p.breed || "—"}</td>
                <td>{p.sexBase}</td>
                <td className="num">{ageLabel(p.dob)}</td>
                <td>{p.pen || "—"}</td>
                <td className="num">{p.currentWeightKg.toFixed(1)} kg</td>
                <td>
                  <span className="badge badge-muted">{p.status}</span>
                </td>
                {isManager && (
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/app/pigs/${encodeURIComponent(p.tag)}/edit`} className="btn btn-small mr-1">
                      Edit
                    </Link>
                    <form action={deletePigAction} className="inline">
                      <input type="hidden" name="tag" value={p.tag} />
                      <button type="submit" className="btn btn-small btn-danger">
                        Delete
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {pigs.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-10">
                  No pigs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
