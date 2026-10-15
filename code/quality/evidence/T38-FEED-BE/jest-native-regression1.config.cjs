module.exports={
  "moduleFileExtensions": [
    "js",
    "json",
    "ts"
  ],
  "rootDir": "E:\\FGweb\\code",
  "testRegex": "(moderation-regression|moderation-crypto-regression|support-regression|delete-reason)\\.integration\\.spec\\.ts$",
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
  "cacheDirectory": "E:\\FGweb\\code\\.cache\\t38-feed-be\\jest-native-regression1",
  "coverageDirectory": "../../.cache/coverage/api",
  "testEnvironment": "node",
  "roots": [
    "E:\\FGweb\\code\\quality\\evidence\\T38-FEED-BE"
  ],
  "modulePathIgnorePatterns": [
    "<rootDir>/.runtime/",
    "<rootDir>/.cache/"
  ]
};
