const path = require('node:path');
const root = path.resolve(__dirname, '../../../..');
const base = require(path.join(root, 'apps/api/jest.config.js'));

module.exports = {
  ...base,
  rootDir: root,
  roots: [__dirname],
  testRegex: '.*\\.integration\\.spec\\.ts$',
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^@fg/database$': '<rootDir>/packages/database/dist/index.js',
    '^@fg/contracts$': '<rootDir>/packages/contracts/dist/index.js',
  },
  cacheDirectory: path.join(root, '.cache/t30/jest-frame-lease-policy-review-1'),
};
