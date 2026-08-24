import { ErrorCode } from '../common/errors/error-code';
import { CourierAdapter } from './courier-adapter.interface';
import { CourierRegistry } from './courier-registry.service';
const adapter = { partner: 'mock' } as CourierAdapter;
describe('CourierRegistry', () => {
  const registry = new CourierRegistry([adapter]);
  it('returns known couriers case-insensitively', () => expect(registry.get('MoCk')).toBe(adapter));
  it('reports supported couriers for unknown names', () => {
    try {
      registry.get('missing');
      fail('expected error');
    } catch (error: any) {
      expect(error.code).toBe(ErrorCode.UNKNOWN_COURIER);
      expect(error.details.supported_couriers).toEqual(['mock']);
    }
  });
});
