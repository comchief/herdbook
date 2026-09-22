import { requireSession } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { PigsTable } from "@/components/pigs-table";
import { getGrowthStageRules } from "@/lib/growth-rules-db";

export default async function PigsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  const farm = await requireActiveFarm(session);
  const unit = farm.unit === "lbs" ? "lbs" : "kg";
  const { error } = await searchParams;
  const isManager = session.role !== "worker";

  const [pigs, growthRules] = await Promise.all([
    db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId)).orderBy(asc(schema.pigs.tag)),
    getGrowthStageRules(),
  ]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Pig registry</h1>
          <p className="text-ink-soft text-sm">Every animal currently on the farm, with its status and location.</p>
        </div>
        {isManager && (
          <Link href="/app/pigs/new" className="btn btn-primary">
            + Add pig
          </Link>
        )}
      </div>
      {error && <div className="mb-4 text-sm text-critical bg-[#fbdada] rounded-lg px-3 py-2">{error}</div>}

      <PigsTable pigs={pigs} isManager={isManager} unit={unit} growthRules={growthRules} />
    </div>
  );
}
