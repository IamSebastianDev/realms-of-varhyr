/** Keep these exercises out of development screens when tuning decisions. */
export const holdoutIds = new Set([
  "rov-002",
  "rov-008",
  "rov-010",
  "rov-012",
  "rov-015",
  "rov-018",
  "rov-023",
  "rov-025",
  "rov-028",
  "rov-030",
]);
export function splitFor(id: string) {
  return holdoutIds.has(id) ? "holdout" : "development";
}
