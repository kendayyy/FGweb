import {Module} from '@nestjs/common';import {FeedRateService} from './feed-rate.service.js';
@Module({providers:[FeedRateService],exports:[FeedRateService]})export class FeedInfrastructureModule{}
