import { AttachmentSchema } from '@fg/contracts';
export function attachmentUrl(id: string) { return `${new URL(process.env.PUBLIC_ORIGIN!).origin}/api/v1/attachments/${encodeURIComponent(id)}/content`; }
export function attachmentDTO(row: {
    id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
}) { return AttachmentSchema.parse({ id: row.id, url: attachmentUrl(row.id), fileName: row.file_name, fileSize: row.file_size, mimeType: row.mime_type }); }
