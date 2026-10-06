/** Jest for pure logic only: src/core and src/chain, node env, no RN preset. */
module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/src/core", "<rootDir>/src/chain"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { strict: true, esModuleInterop: true, resolveJsonModule: true, target: "ES2020", module: "commonjs", types: ["jest", "node"] }, diagnostics: true }],
  },
};
