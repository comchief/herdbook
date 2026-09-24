/** Built-in breed list every farm's pig_breeds table is seeded with at
 * signup (see signupAction in src/lib/actions/auth.ts) — the same seven
 * breeds the "Add a pig" form used to hard-code before breeds became
 * farm-editable. Pure and client-safe: no DB import here. */
export const DEFAULT_BREEDS = ["Duroc", "Yorkshire", "Landrace", "Hampshire", "Berkshire", "Tamworth", "Crossbred"];
