import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { REFRESH_COOKIE } from './auth/auth.controller';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestIdMiddleware } from './common/request-context';
import { env } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // The Next.js proxy runs on loopback; trusting it makes req.ip the real client for rate limits and audit rows.
  app.set('trust proxy', 'loopback');
  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '100kb' });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true, exposedHeaders: ['X-Request-Id', 'Retry-After'] });
  app.enableShutdownHooks();
  const config = new DocumentBuilder().setTitle('PMRMS API')
    .setDescription('Patient Medical Records Management System. Protected routes need `Authorization: Bearer <accessToken>` from `/v1/auth/login`.')
    .setVersion('0.2.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addCookieAuth(REFRESH_COOKIE)
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(env.API_PORT, env.API_HOST);
  console.log(`API: http://${env.API_HOST}:${env.API_PORT}/v1/health`);
  console.log(`OpenAPI: http://${env.API_HOST}:${env.API_PORT}/docs`);
}
bootstrap().catch(() => { console.error('API failed to start. Check environment settings, database availability and port conflicts.'); process.exitCode = 1; });
