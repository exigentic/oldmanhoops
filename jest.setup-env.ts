// Loads .env.local into process.env for each Jest worker before tests run.
// next/jest loads env in the main process but doesn't propagate to workers.
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
