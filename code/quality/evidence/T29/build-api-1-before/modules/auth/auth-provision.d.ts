import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '@fg/database';
export declare function provisionAdminAccount(db: NodePgDatabase<typeof schema>, input: {
    userId: string;
    email: string;
    password: string;
}): Promise<{
    created: boolean;
    verified: boolean;
}>;
