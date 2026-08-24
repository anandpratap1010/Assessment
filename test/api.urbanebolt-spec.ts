import { ConfigService } from '@nestjs/config';
import { ShipmentStatus } from '../src/couriers/courier.types';
import { UrbaneBoltAdapter } from '../src/couriers/urbanebolt/urbanebolt.adapter';
import { UrbaneBoltClient } from '../src/couriers/urbanebolt/urbanebolt.client';
import { UrbaneBoltMapper } from '../src/couriers/urbanebolt/urbanebolt.mapper';

const enabled = process.env.RUN_URBANEBOLT_INTEGRATION_TESTS === 'true';

(enabled ? describe : describe.skip)('UrbaneBolt UAT integration', () => {
  it('authenticates, creates, tracks, and cancels through the real adapter', async () => {
    const config = new ConfigService({
      urbanebolt: {
        baseUrl: process.env.URBANEBOLT_BASE_URL,
        username: process.env.URBANEBOLT_USERNAME,
        password: process.env.URBANEBOLT_PASSWORD,
        customerCode: process.env.URBANEBOLT_CUSTOMER_CODE,
        serviceType: process.env.URBANEBOLT_SERVICE_TYPE ?? 'SDD',
      },
      courier: { timeoutMs: 10000, maxRetries: 2, retryBaseDelayMs: 100 },
    });
    const adapter = new UrbaneBoltAdapter(
      new UrbaneBoltClient(config),
      new UrbaneBoltMapper(config),
    );
    const orderId = `EASECODEX-${Date.now()}`;
    const created = await adapter.createShipment({
      order_id: orderId,
      courier_partner: 'urbanebolt',
      pickup: {
        name: 'UAT Warehouse',
        phone: '9425018023',
        address_line1: 'UAT Pickup Address',
        city: 'Gurgaon',
        state: 'Haryana',
        postal_code: '122001',
        country: 'INDIA',
      },
      delivery: {
        name: 'UAT Customer',
        phone: '8320226438',
        address_line1: 'UAT Delivery Address',
        city: 'Gurgaon',
        state: 'Haryana',
        postal_code: '122017',
        country: 'INDIA',
      },
      package: {
        weight: 1.1,
        length: 12,
        width: 10,
        height: 10,
        description: 'UAT test package',
        declared_value: 100,
        quantity: 1,
      },
      payment: { type: 'PREPAID', amount: 100 },
    });
    expect(created).toMatchObject({
      courierOrderId: orderId,
      status: ShipmentStatus.CREATED,
    });
    expect(created.awbNumber).toBeTruthy();

    try {
      const tracked = await adapter.trackShipment({
        orderId,
        courierOrderId: created.courierOrderId,
        awbNumber: created.awbNumber,
      });
      expect(Object.values(ShipmentStatus)).toContain(tracked.status);
    } finally {
      const cancelled = await adapter.cancelShipment({
        orderId,
        courierOrderId: created.courierOrderId,
        awbNumber: created.awbNumber,
      });
      expect(cancelled.status).toBe(ShipmentStatus.CANCELLED);
    }
  });
});
