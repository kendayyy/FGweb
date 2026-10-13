"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachmentUrl = attachmentUrl;
exports.attachmentDTO = attachmentDTO;
const contracts_1 = require("@fg/contracts");
function attachmentUrl(id) { return `${new URL(process.env.PUBLIC_ORIGIN).origin}/api/v1/attachments/${encodeURIComponent(id)}/content`; }
function attachmentDTO(row) { return contracts_1.AttachmentSchema.parse({ id: row.id, url: attachmentUrl(row.id), fileName: row.file_name, fileSize: row.file_size, mimeType: row.mime_type }); }
//# sourceMappingURL=attachment-dto.js.map