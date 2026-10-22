import * as v from "valibot";
import type { AbilityExtension } from "@realms/contracts";

const parameterSchemas = new WeakMap<AbilityExtension, v.GenericSchema>();

/** Keep validation and the authoring schema attached to the same definition. */
export function defineAbility(
  id: string,
  schema: v.GenericSchema,
  impl: Omit<AbilityExtension, "id" | "version" | "validate">,
  version = 1,
): AbilityExtension {
  const ability: AbilityExtension = {
    id,
    version,
    validate: (params) => {
      v.parse(schema, params);
    },
    ...impl,
  };
  parameterSchemas.set(ability, schema);
  return ability;
}

export function abilityParameterSchema(ability: AbilityExtension): v.GenericSchema {
  const schema = parameterSchemas.get(ability);
  if (!schema)
    throw new Error(
      `Ability ${ability.id} has no authoring parameter schema. Define it with defineAbility().`,
    );
  return schema;
}
