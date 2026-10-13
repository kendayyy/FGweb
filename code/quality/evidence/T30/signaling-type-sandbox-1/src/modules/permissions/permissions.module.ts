import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {RoomsModule} from '../rooms/rooms.module.js';
import {PermissionsController} from './permissions.controller.js';
@Module({imports:[AuthModule,RoomsModule],controllers:[PermissionsController]})
export class PermissionsModule {}
