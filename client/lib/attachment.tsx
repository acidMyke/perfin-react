const FILES_ROUTE_BASE = '/api/files';

export type LocalAttachment = {
  file: File;
  type: 'local';

  name: string;
  size?: number | null;
  mimeType?: string;
};

export type ServerAttachment = {
  fileId: string;
  type: 'server';
  name: string;
  size?: number | null;
  url: string;
  mimeType?: string;
};

export function createAttachmentFromFileUpload(file: File): LocalAttachment {
  return {
    file,
    type: 'local',
    name: file.name,
    size: file.size,
    mimeType: file.type,
  };
}

export type ServerFileDetail = {
  fileId: string;
  name?: string | null;
  size?: number | null;
  mimeType?: string;
};

export function createAttachmentFromServerDetail({ fileId, name, size, mimeType }: ServerFileDetail): ServerAttachment {
  return {
    fileId,
    url: [FILES_ROUTE_BASE, fileId, name].filter(Boolean).join('/'),
    type: 'server',
    name: name ?? fileId,
    size,
    mimeType,
  };
}

export type Attachment = LocalAttachment | ServerAttachment;
export const isServerAttachment = (attachment: Attachment): attachment is ServerAttachment =>
  attachment.type === 'server';
export const isLocalAttachment = (attachment: Attachment): attachment is LocalAttachment => attachment.type === 'local';
