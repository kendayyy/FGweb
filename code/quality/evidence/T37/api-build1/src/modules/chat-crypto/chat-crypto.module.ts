import {Module} from '@nestjs/common';
import {AuthModule} from '../auth/auth.module.js';
import {ChatModule} from '../chat/chat.module.js';
import {CryptoDevicesController} from './crypto-devices.controller.js';
import {CryptoDevicesService} from './crypto-devices.service.js';
import {CryptoRelayController} from './crypto-relay.controller.js';
import {CryptoRelayService} from './crypto-relay.service.js';
import {CryptoReportsController} from './crypto-reports.controller.js';
import {CryptoReportsService} from './crypto-reports.service.js';
import {CryptoLegacyService} from './crypto-legacy.service.js';
import {CryptoLegacyController} from './crypto-legacy.controller.js';
@Module({imports:[AuthModule,ChatModule],controllers:[CryptoDevicesController,CryptoRelayController,CryptoReportsController,CryptoLegacyController],providers:[CryptoDevicesService,CryptoRelayService,CryptoReportsService,CryptoLegacyService],exports:[CryptoDevicesService,CryptoRelayService]})
export class ChatCryptoModule {}
