import { createRequestHash } from './request-hash';
describe('createRequestHash', () => {
  it('is deterministic across object key order', () => {
    expect(createRequestHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      createRequestHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
  });
  it('changes when meaningful content changes', () => {
    expect(createRequestHash({ weight: 1 })).not.toBe(createRequestHash({ weight: 2 }));
  });
});
