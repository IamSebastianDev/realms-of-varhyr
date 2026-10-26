import type { AbilityBinding, AbilityExtension } from "@realms/contracts";

/** Plain text for any client; React escapes it when rendered. */
export function describeAbility(
  binding: AbilityBinding,
  extension: AbilityExtension,
  /** "field" for an ability printed on a creature or holding; spell effects use the plain description. */
  context?: "field",
) {
  const params = { ...extension.defaults, ...binding.params };
  function fill(template: string) {
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_placeholder, key: string) => {
      let value = params[key];
      // A list of words reads as "creature or holding". Translating callers join the list themselves.
      if (Array.isArray(value) && value.every((entry) => typeof entry === "string"))
        value = value.join(" or ");
      if (typeof value !== "number" && typeof value !== "string" && typeof value !== "boolean") {
        throw new Error(`Missing text parameter ${key} for ability ${binding.id}`);
      }
      if (key === "stat") return String(value).charAt(0).toUpperCase() + String(value).slice(1);
      return key === "energy"
        ? String(value).replace(
            /(^|-)([a-z])/g,
            (_m, dash: string, letter: string) => (dash ? " " : "") + letter.toUpperCase(),
          )
        : String(value);
    });
  }
  // `{?flag|text if set|text if not}` picks a wording by a parameter; `a&b` needs both. A parameter is set when it is true, a non-zero number or a non-empty word. The branches may hold placeholders.
  const isSet = (key: string) =>
    params[key] === true ||
    (typeof params[key] === "number" && params[key] !== 0) ||
    (typeof params[key] === "string" && params[key] !== "");
  const choose = (template: string) =>
    template.replace(
      /\{\?([\w&]+)\|((?:[^|{}]|\{\w+\})*)\|((?:[^|{}]|\{\w+\})*)\}/g,
      (_m, flags: string, yes: string, no: string) => (flags.split("&").every(isSet) ? yes : no),
    );
  let description = fill(
    choose((context === "field" && extension.fieldDescription) || extension.description),
  );
  // Draw uses one shared template across card counts; keep its singular readable in both supported languages.
  if (binding.id === "draw" && binding.params.amount === 1)
    description = description.replace(/\b1 cards\b/g, "1 card").replace(/\b1 Karten\b/g, "1 Karte");
  return { name: extension.name ? fill(choose(extension.name)) : undefined, description };
}
