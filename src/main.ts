import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Multi-Courier Integration API')
      .setVersion('1.0')
      .addTag('orders')
      .addTag('batches')
      .addTag('health')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);
  app.getHttpAdapter().getInstance().set('json spaces', 2);
  await app.listen(process.env.PORT ?? 3000);
  return app;
}
if (require.main === module) void bootstrap();
