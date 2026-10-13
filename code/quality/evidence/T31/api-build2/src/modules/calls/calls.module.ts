import {PublishingService} from './publishing.service.js';
import {CallModerationService} from './call-moderation.service.js';
import {CallControlsController} from './call-controls.controller.js';
import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {RoomsModule} from '../rooms/rooms.module.js';
import {CallsController} from './calls.controller.js';
import {CallsService} from './calls.service.js';
import {CallLifecycleService} from './call-lifecycle.service.js';
import {CallWebhookController} from './call-webhook.controller.js';
@Module({imports:[AuthModule,RoomsModule],controllers:[CallsController,CallWebhookController,CallControlsController],providers:[CallsService,PublishingService,CallModerationService,CallLifecycleService,{provide:'FG_CALL_LIFECYCLE',useExisting:CallLifecycleService}],exports:[CallsService,PublishingService,CallModerationService,CallLifecycleService]})
export class CallsModule {}
