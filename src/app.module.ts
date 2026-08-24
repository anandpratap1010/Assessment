import { BullModule } from '@nestjs/bullmq';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import { validateEnvironment } from './config/environment.validation';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { PrismaModule } from './database/prisma.module';
import { OrdersModule } from './orders/orders.module';
import { BatchesModule } from './batches/batches.module';
import { HealthModule } from './health/health.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate: validateEnvironment }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
        },
      }),
    }),
    PrismaModule,
    OrdersModule,
    BatchesModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
