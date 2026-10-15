import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RecruitmentsController } from './recruitments.controller.js';
import { RecruitmentsService } from './recruitments.service.js';
@Module({ imports: [AuthModule], controllers: [RecruitmentsController], providers: [RecruitmentsService], exports: [RecruitmentsService] })
export class RecruitmentsModule {
}
