import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/tests/unit/**/*.test.tsx"],
  // Integration tests share a single local Supabase DB; running workers in
  // parallel causes cross-file races (e.g., one test deletes today's game
  // while another is writing it). Serialize to keep tests deterministic.
  maxWorkers: 1,
};

export default createJestConfig(config);
