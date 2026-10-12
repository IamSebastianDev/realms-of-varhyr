import type { AbilityBinding, AbilityExtension } from '../../contracts/src';

/** Plain text for any client; React escapes it when rendered. */
export function describeAbility(binding: AbilityBinding, extension: AbilityExtension) {
  function fill(template: string) {
    return template.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_placeholder, key: string) => {
      const value = binding.params[key];
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') {
        throw new Error(`Missing text parameter ${key} for ability ${binding.id}`);
      }
      return String(value);
    });
  }
  return { name: fill(extension.name), description: fill(extension.description) };
}
