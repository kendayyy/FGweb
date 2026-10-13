import path from 'node:path';
import config from '../../../apps/api/jest.config.js';
export default {...config,rootDir:process.cwd(),roots:[path.resolve('.cache/t26-fix1/native')],moduleNameMapper:{...config.moduleNameMapper,'^@fg/database$':'<rootDir>/packages/database/dist/index.js','^@fg/contracts$':'<rootDir>/packages/contracts/dist/index.js'},cacheDirectory:path.resolve('.cache/t26-fix1/jest'),coverageDirectory:path.resolve('.cache/t26-fix1/coverage')};
