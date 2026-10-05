module.exports={
  "moduleFileExtensions": [
    "js",
    "json",
    "ts"
  ],
  "rootDir": "../../..",
  "testRegex": "quality/evidence/T16/independent-review\\.spec\\.ts$",
  "extensionsToTreatAsEsm": [
    ".ts"
  ],
  "transform": {
    "^.+\\.ts$": [
      "ts-jest",
      {
        "useESM": true,
        "tsconfig": {
          "module": "NodeNext",
          "moduleResolution": "NodeNext",
          "target": "ES2022",
          "allowSyntheticDefaultImports": true,
          "experimentalDecorators": true,
          "emitDecoratorMetadata": true,
          "skipLibCheck": true
        }
      }
    ]
  },
  "moduleNameMapper": {
    "^(\\.\\.?\\/.*)\\.js$": "$1",
    "^@fg/database$": "<rootDir>/packages/database/dist/index.js",
    "^@fg/contracts$": "<rootDir>/packages/contracts/dist/index.js"
  },
  "transformIgnorePatterns": [
    "node_modules[/\\\\](?!(@nestjs|better-auth|@better-auth|drizzle-orm)/)"
  ],
  "collectCoverageFrom": [
    "**/*.(t|j)s"
  ],
  "cacheDirectory": "<rootDir>/.cache/jest-t16-review",
  "coverageDirectory": "../../.cache/coverage/api",
  "testEnvironment": "node"
};
