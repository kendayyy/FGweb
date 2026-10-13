import type { Pool } from 'pg';
export declare function cryptoSchemaAvailable(db: Pool): Promise<boolean>;
