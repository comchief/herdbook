"use client";

import { useState } from "react";
import Link from "next/link";

export type MedicationOption = { id: string; name: string };

/** The health page's "Type" select plus, only when "Medication" is chosen,
 * a second select for which saved medication was administered. Client-only
 * because showing/hiding that second field has to react to the Type select
 * without a round trip — the rest of the "Log a record" form stays a plain
 * server-rendered form (see src/app/app/medical/page.tsx), this just slots
 * into it as the Type field. */
export function MedicalTypeFields({ medications }: { medications: MedicationOption[] }) {
  const [type, setType] = useState("treatment");

  return (
    <>
      <div className="field">
        <label>Type</label>
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="vaccination">Vaccination</option>
          <option value="treatment">Treatment</option>
          <option value="checkup">Check-up</option>
          <option value="injury">Injury</option>
          <option value="deworming">Deworming</option>
          <option value="medication">Medication</option>
        </select>
      </div>
      {type === "medication" && (
        <div className="field">
          <label>Medication</label>
          <select name="medicationName" defaultValue="" required>
            <option value="" disabled>
              Select a medication…
            </option>
            {medications.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          {medications.length === 0 && (
            <p className="text-[11px] text-muted mt-1">
              No medications saved yet — add one in <Link href="/app/settings" className="text-accent font-semibold">Farm settings</Link>.
            </p>
          )}
        </div>
      )}
    </>
  );
}
