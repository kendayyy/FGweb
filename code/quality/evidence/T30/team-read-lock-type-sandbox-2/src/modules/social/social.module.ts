import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { SocialService } from './social.service.js';
import { SocialController } from './social.controller.js';

@Module({
  imports: [AuthModule, ProfilesModule],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
