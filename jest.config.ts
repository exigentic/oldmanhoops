import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/jest.setup-env.ts"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  testMatch: ["<rootDir>/tests/unit/**/*.test.ts", "<rootDir>/tests/unit/**/*.test.tsx"],
};

export default createJestConfig(config);
