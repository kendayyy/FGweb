import fs from'node:fs';const s=JSON.parse(fs.readFileSync('quality/evidence/T30/pg-wait-native32-summary-1.json','utf8'));console.log(JSON.stringify(s.inspectionWindow[0]?.rows[0]));
