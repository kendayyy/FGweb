import { Controller, Post, Get, Param, Body, Req, Res, Header, UploadedFile, UseGuards, UseInterceptors, UseFilters } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { MAX_IMAGE_SIZE_BYTES, AttachmentUrlSchema } from '@fg/contracts';
import { UploadsService } from './uploads.service.js';
import { ChatService } from '../chat/chat.service.js';
import {UploadPurposeExceptionFilter} from '../feed/upload-purpose.filter.js';
import { attachmentUrl } from '../chat/attachment-dto.js';
import { CsrfGuard } from '../../common/csrf.guard.js';
import { SessionGuard } from '../../common/session.guard.js';
import { RequireOnboardedGuard } from '../auth/onboarded.guard.js';
@Controller('api/v1')
@UseFilters(UploadPurposeExceptionFilter)
export class UploadsController {
    constructor(private readonly uploads: UploadsService, private readonly chat: ChatService) { }
    @Post('uploads/images')
    @Header('Cache-Control','private, no-store')
    @UseGuards(CsrfGuard, SessionGuard, RequireOnboardedGuard)
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES, files: 1, fields: 1, parts: 2 } }))
    async upload(
    @Body()
    body: unknown, 
    @UploadedFile()
    file: Express.Multer.File | undefined, 
    @Req()
    req: Request) { return this.uploads.upload(body, file, await this.chat.actor(req.headers)); }
    @Get('attachments/:id')
    async metadata(
    @Param('id')
    id: string, 
    @Req()
    req: Request, 
    @Res({ passthrough: true })
    response: Response) { await this.uploads.image(id, await this.chat.actor(req.headers)); response.setHeader('Cache-Control', 'private, no-store'); return AttachmentUrlSchema.parse({ url: attachmentUrl(id) }); }
    @Get('attachments/:id/content')
    async content(
    @Param('id')
    id: string, 
    @Req()
    req: Request, 
    @Res()
    response: Response) { const bytes = await this.uploads.content(id, await this.chat.actor(req.headers)); response.setHeader('Cache-Control', 'private, no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.type('image/webp').send(bytes); }
}
