module.exports={
  "moduleFileExtensions": [
    "js",
    "json",
    "ts"
  ],
  "rootDir": "E:\\FGweb\\code",
  "testRegex": "native-ban\\.integration\\.spec\\.ts$",
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
  "cacheDirectory": "E:\\FGweb\\code\\.cache\\t37\\jest-native",
  "coverageDirectory": "../../.cache/coverage/api",
  "testEnvironment": "node",
  "roots": [
    "E:\\FGweb\\code\\quality\\evidence\\T37"
  ],
  "modulePathIgnorePatterns": [
    "<rootDir>/.runtime/",
    "<rootDir>/.cache/"
  ]
};
