import { requireManager } from "@/lib/auth";
import { requireActiveFarm } from "@/lib/gate";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { createPigAction } from "@/lib/actions/pigs";
import Link from "next/link";
import { Icon } from "@/components/icons";

export default async function NewPigPage() {
  const session = await requireManager();
  await requireActiveFarm(session);

  const pigs = await db.select().from(schema.pigs).where(eq(schema.pigs.farmId, session.farmId));
  const boars = pigs.filter((p) => p.status === "breeding-boar");
  const sows = pigs.filter((p) => p.status === "breeding-sow");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-ink mb-6 flex items-center gap-2"><Icon name="pig" className="w-5 h-5 text-accent" />Add a pig</h1>
      <form action={createPigAction} className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="field">
            <label>Ear tag</label>
            <input name="tag" required placeholder="PB-0231" />
          </div>
          <div className="field">
            <label>Name</label>
            <input name="name" required placeholder="Nutmeg" />
          </div>
          <div className="field">
            <label>Breed</label>
            <select name="breed" defaultValue="Duroc">
              {["Duroc", "Yorkshire", "Landrace", "Hampshire", "Berkshire", "Tamworth", "Crossbred"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sex</label>
            <select name="sexBase" defaultValue="Female">
              <option value="Female">Female</option>
              <option value="Male">Male</option>
            </select>
          </div>
          <div className="field">
            <label>Date of birth</label>
            <input type="date" name="dob" />
          </div>
          <div className="field">
            <label>Acquired date</label>
            <input type="date" name="acquiredDate" defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>
          <div className="field">
            <label>Status</label>
            <select name="status" defaultValue="piglet">
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
            <input name="pen" placeholder="Grower Barn A" />
          </div>
          <div className="field">
            <label>Current weight (kg)</label>
            <input type="number" step="0.1" min="0" name="weight" required placeholder="24.5" />
          </div>
          <div className="field">
            <label>Sire (boar)</label>
            <select name="sireTag" defaultValue="">
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
            <select name="damTag" defaultValue="">
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
            <input type="number" step="0.1" min="0" name="targetWeightKg" placeholder="120" />
          </div>
          <div className="field">
            <label>Target months to market</label>
            <input type="number" step="0.1" min="0" name="targetMonths" placeholder="6" />
          </div>
        </div>
        <p className="text-xs text-muted -mt-2">Provide a date of birth, or — if it isn&apos;t known — an acquired date so the pig can still be tracked.</p>
        <div className="field">
          <label>Notes</label>
          <textarea name="notes" rows={3} placeholder="Temperament, markings, anything worth remembering…" />
        </div>
        <div className="flex gap-3 pt-2">
          <button type="submit" className="btn btn-primary">
            Save pig
          </button>
          <Link href="/app/pigs" className="btn">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
