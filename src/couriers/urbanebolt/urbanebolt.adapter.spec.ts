import { ConfigService } from '@nestjs/config';
import { UrbaneBoltAdapter } from './urbanebolt.adapter';
import { UrbaneBoltMapper } from './urbanebolt.mapper';

describe('UrbaneBoltAdapter', () => {
  const client = { request: jest.fn() };
  const mapper = new UrbaneBoltMapper(
    new ConfigService({ urbanebolt: { customerCode: 'CUSTOMER', serviceType: 'SDD' } }),
  );
  const adapter = new UrbaneBoltAdapter(client as any, mapper);

  beforeEach(() => jest.clearAllMocks());

  it('uses the documented tracking endpoint and AWB query', async () => {
    client.request.mockResolvedValue({
      status: 'Success',
      data: {
        awbNumber: 2001,
        orderNumber: 'URB-1',
        currentStatusDateTime: '03 May 2025, 15:47',
        currentStatusCode: 'MAN',
        currentStatusCodeDescription: 'Shipment Manifested',
        scans: [],
      },
    });
    await adapter.trackShipment({ orderId: 'URB-1', courierOrderId: 'URB-1', awbNumber: '2001' });
    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      url: '/api/v1/services/tracking-pub/',
      params: { awb: '2001' },
    });
  });

  it('uses the documented cancellation endpoint and body', async () => {
    client.request.mockResolvedValue({
      status: 'Success',
      successResponse: [{ awb: '2001', message: 'Cancelled' }],
      failureResponse: [],
    });
    await adapter.cancelShipment({ orderId: 'URB-1', courierOrderId: 'URB-1', awbNumber: '2001' });
    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/api/v1/services/cancel/',
      data: { awbs: '2001' },
    });
  });
});
