import type { AbilityBinding, AbilityExtension } from "@realms/contracts";

/** Plain text for any client; React escapes it when rendered. */
export function describeAbility(binding: AbilityBinding, extension: AbilityExtension) {
  function fill(template: string) {
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_placeholder, key: string) => {
      const value = binding.params[key];
      if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") {
        throw new Error(`Missing text parameter ${key} for ability ${binding.id}`);
      }
      return key === "energy"
        ? String(value).replace(
            /(^|-)([a-z])/g,
            (_m, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase(),
          )
        : String(value);
    });
  }
  let description = fill(extension.description);
  // Draw uses one shared template across card counts; keep its singular readable in both supported languages.
  if (binding.id === "draw" && binding.params.amount === 1)
    description = description.replace(/\b1 cards\b/g, "1 card").replace(/\b1 Karten\b/g, "1 Karte");
  return { name: fill(extension.name), description };
}
