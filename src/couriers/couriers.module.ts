import { Module } from '@nestjs/common';
import { COURIER_ADAPTERS } from './courier-adapter.interface';
import { CourierRegistry } from './courier-registry.service';
import { MockCourierAdapter } from './mock/mock-courier.adapter';
import { UrbaneBoltAdapter } from './urbanebolt/urbanebolt.adapter';
import { UrbaneBoltClient } from './urbanebolt/urbanebolt.client';
import { UrbaneBoltMapper } from './urbanebolt/urbanebolt.mapper';
@Module({
  providers: [
    MockCourierAdapter,
    UrbaneBoltAdapter,
    UrbaneBoltClient,
    UrbaneBoltMapper,
    {
      provide: COURIER_ADAPTERS,
      inject: [MockCourierAdapter, UrbaneBoltAdapter],
      useFactory: (mock: MockCourierAdapter, urbaneBolt: UrbaneBoltAdapter) => [mock, urbaneBolt],
    },
    CourierRegistry,
  ],
  exports: [CourierRegistry],
})
export class CouriersModule {}
