import { Module } from '@nestjs/common';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';

@Module({
  imports: [AuthModule, ProfilesModule],
})
export class AppModule {}
