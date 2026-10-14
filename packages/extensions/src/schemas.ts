import * as v from "valibot";
export const positive = v.pipe(v.number(), v.integer(), v.minValue(1));
export const amountSchema = v.object({ amount: positive });
export const amount = (params: Record<string, unknown>) => params.amount as number;
