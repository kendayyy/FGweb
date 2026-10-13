import fs from 'node:fs';import assert from 'node:assert/strict';
const dir='quality/evidence/CHATCRYPTO-FE';
let source=fs.readFileSync(`${dir}/report-custody-fixture.mjs`,'utf8');
assert(source.includes('setupReportCustody')&&source.includes('transit/keys/fg-report'));
source=source.replaceAll('setupReportCustody','setupLegacyArchiveCustody').replaceAll('fg-chatcrypto-fe-report-','fg-chatcrypto-fe-legacy-archive-').replaceAll('`report-${run}`','`legacy-archive-${run}`').replaceAll('fg-report','fg-source-archive').replaceAll('FG_BAO_REPORT_WRITER_TOKEN_FILE','FG_BAO_ARCHIVE_WRITER_TOKEN_FILE').replaceAll('FG_BAO_REPORT_READER_TOKEN_FILE','FG_BAO_ARCHIVE_READER_TOKEN_FILE');
source=source.replace('Isolated real TLS Transit service; no frozen BE helper execution or main configuration.','Isolated real TLS Transit source-archive key/roles, separate from reports; no frozen BE helper execution or main configuration.');
fs.writeFileSync(`${dir}/legacy-archive-custody-fixture.mjs`,source,{flag:'wx'});
console.log('Created separate-key TLS custody fixture from previously verified FE infrastructure; not executed yet.');
