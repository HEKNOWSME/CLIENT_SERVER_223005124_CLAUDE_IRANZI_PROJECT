import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { env } from './config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('v1');
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
  const config = new DocumentBuilder().setTitle('PMRMS API')
    .setDescription('Local infrastructure foundation. Clinical and authentication endpoints are not implemented yet.')
    .setVersion('0.1.0').build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  await app.listen(env.API_PORT, env.API_HOST);
  console.log(`API: http://${env.API_HOST}:${env.API_PORT}/v1/health`);
  console.log(`OpenAPI: http://${env.API_HOST}:${env.API_PORT}/docs`);
}
bootstrap().catch(() => { console.error('API failed to start. Check environment settings, database availability and port conflicts.'); process.exitCode = 1; });
