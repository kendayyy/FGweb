export declare function attachmentUrl(id: string): string;
export declare function attachmentDTO(row: {
    id: string;
    file_name: string;
    file_size: number;
    mime_type: string;
}): {
    id: string;
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: "image/jpeg" | "image/png" | "image/webp";
};
