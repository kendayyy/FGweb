import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {configureFgHttpBodyParsers} from './modules/chat-crypto/http-body-parsers.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule,{bodyParser:false});
  configureFgHttpBodyParsers(app);

  app.enableCors({
    origin: process.env.PUBLIC_ORIGIN || 'http://localhost:5173',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`API Server running on port ${port}`);
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}
