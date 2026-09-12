import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../../db/schema.js";
let instance;
export function getDb() {
  if (!process.env.DATABASE_URL)
    throw new Error("Project storage is not configured.");
  return (instance ??= drizzle(
    postgres(process.env.DATABASE_URL, { max: 5, prepare: false }),
    { schema },
  ));
}
