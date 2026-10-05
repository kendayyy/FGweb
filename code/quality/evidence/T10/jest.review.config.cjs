/* eslint-disable @typescript-eslint/no-require-imports */
const base=require('../../../apps/api/jest.config.js');
module.exports={...base,rootDir:process.cwd(),roots:['<rootDir>/quality/evidence/T10'],testRegex:'codex-profile-regressions\\.spec\\.ts$',moduleNameMapper:{
 '^(\\.\\.?\\/.*)\\.js$':'$1',
 '^@fg/database$':'<rootDir>/packages/database/dist/index.js',
 '^@fg/contracts$':'<rootDir>/packages/contracts/dist/index.js',
},cacheDirectory:'<rootDir>/.cache/jest-review'};
