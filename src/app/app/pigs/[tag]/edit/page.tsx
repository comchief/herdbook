import { requireManager } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { and, eq } from "drizzle-orm";
import { updatePigAction } from "@/lib/actions/pigs";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditPigPage({ params }: { params: Promise<{ tag: string }> }) {
  const session = await requireManager();
  await requireActiveFarm(session);
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);

  const [pig] = await db
    .select()
    .from(schema.pigs)
    .where(and(eq(schema.pigs.farmId, session.farmId), eq(schema.pigs.tag, decodedTag)))
    .limit(1);
  if (!pig) notFound();

  const pigs = await db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId));
  const boars = pigs.filter((p) => p.status === "breeding-boar" || p.tag === pig!.sireTag);
  const sows = pigs.filter((p) => p.status === "breeding-sow" || p.tag === pig!.damTag);

  const dobStr = pig!.dob.toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-6">Edit {pig!.name}</h1>
      <form action={updatePigAction} className="card p-6 space-y-4">
        <input type="hidden" name="originalTag" value={pig!.tag} />
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Ear tag</label>
            <input name="tag" defaultValue={pig!.tag} required />
          </div>
          <div className="field">
            <label>Name</label>
            <input name="name" defaultValue={pig!.name} required />
          </div>
          <div className="field">
            <label>Breed</label>
            <select name="breed" defaultValue={pig!.breed ?? "Duroc"}>
              {["Duroc", "Yorkshire", "Landrace", "Hampshire", "Berkshire", "Tamworth", "Crossbred"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sex</label>
            <select name="sexBase" defaultValue={pig!.sexBase}>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>
          <div className="field">
            <label>Date of birth</label>
            <input type="date" name="dob" defaultValue={dobStr} required />
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue={pig!.status}>
              <option value="piglet">Piglet</option>
              <option value="weaner">Weaner</option>
              <option value="grower">Grower</option>
              <option value="finisher">Finisher</option>
              <option value="breeding-sow">Breeding sow</option>
              <option value="breeding-boar">Breeding boar</option>
            </select>
          </div>
          <div className="field">
            <label>Pen / location</label>
            <input name="pen" defaultValue={pig!.pen ?? ""} />
          </div>
          <div className="field">
            <label>Current weight (kg)</label>
            <input type="number" step="0.1" min="0" name="weight" defaultValue={pig!.currentWeightKg} required />
          </div>
          <div className="field">
            <label>Sire (boar)</label>
            <select name="sireTag" defaultValue={pig!.sireTag ?? ""}>
              <option value="">— none —</option>
              {boars.map((b) => (
                <option key={b.id} value={b.tag}>
                  {b.name} ({b.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Dam (sow)</label>
            <select name="damTag" defaultValue={pig!.damTag ?? ""}>
              <option value="">— none —</option>
              {sows.map((s) => (
                <option key={s.id} value={s.tag}>
                  {s.name} ({s.tag})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Target market weight (kg)</label>
            <input type="number" step="0.1" min="0" name="targetWeightKg" defaultValue={pig!.targetWeightKg ?? ""} />
          </div>
          <div className="field">
            <label>Target months to market</label>
            <input type="number" step="0.1" min="0" name="targetMonths" defaultValue={pig!.targetMonths ?? ""} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={3} defaultValue={pig!.notes ?? ""} />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn btn-primary">
            Save changes
          </button>
          <Link href="/app/pigs" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
