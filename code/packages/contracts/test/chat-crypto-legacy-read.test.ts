import {describe,it,expect} from 'vitest';
import * as wire from '../src/index.js';
import type {z} from 'zod';
const schemas=wire as unknown as {LegacySourceManifestSchema:z.ZodType;LegacyMigrationItemSchema:z.ZodType};
const source={version:1,conversationId:'private',messageId:'original',senderId:'alice',clientMessageId:'original-retry',type:'IMAGE',content:'original text',replyToId:null,mentionedUserIds:['bob'],createdAt:'2026-10-08T00:00:00.123456Z',updatedAt:'2026-10-08T00:00:00.123456Z',attachments:[{id:'image',fileName:'original.webp',fileSize:120,mimeType:'image/webp',plaintextSha256:Buffer.alloc(32,1).toString('base64').replace(/=+$/,'')}]};
describe('Verified-cohort canonical legacy source boundary',()=>{
 it('requires the original identifiers, content, metadata and physical image digests',()=>{expect(schemas.LegacySourceManifestSchema).toBeDefined();expect(schemas.LegacySourceManifestSchema.parse(source)).toEqual(source);});
 it.each(['privateKey','recoveryCode','cohortVerified','deletedOriginal'])('rejects caller %s claims in a source manifest',key=>{expect(schemas.LegacySourceManifestSchema).toBeDefined();expect(schemas.LegacySourceManifestSchema.safeParse({...source,[key]:true}).success).toBe(false);});
 it('rejects duplicate images, excessive size and missing physical digest',()=>{expect(schemas.LegacySourceManifestSchema).toBeDefined();for(const attachments of [[source.attachments[0],source.attachments[0]],[{...source.attachments[0],fileSize:5*1024*1024+1}],[{...source.attachments[0],plaintextSha256:''}]])expect(schemas.LegacySourceManifestSchema.safeParse({...source,attachments}).success).toBe(false);});
 it('binds the migration item to the exact source identity and attachment selection',()=>{
  const item={messageId:source.messageId,originalSha256:Buffer.alloc(32,2).toString('base64').replace(/=+$/,''),createdAt:source.createdAt,senderId:source.senderId,content:source.content,attachmentIds:['image'],sourceManifest:source};expect(schemas.LegacyMigrationItemSchema.parse(item)).toEqual(item);
  for(const change of [{messageId:'different'},{senderId:'different'},{content:'different'},{createdAt:'2026-10-09T00:00:00.000Z'},{attachmentIds:[]},{sourceManifest:undefined}])expect(schemas.LegacyMigrationItemSchema.safeParse({...item,...change}).success).toBe(false);
 });
});
