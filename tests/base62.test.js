const base62 = require('../src/base62');

describe('Base62 Encoder/Decoder', () => {
    it('should encode 0', () => {
        expect(base62.encode(0)).toBe('0');
    });

    it('should encode numbers', () => {
        expect(base62.encode(12345)).toBe('3d7');
    });

    it('should decode numbers', () => {
        expect(base62.decode('3d7')).toBe(12345);
    });

    it('should be reversible', () => {
        expect(base62.decode(base62.encode(999999))).toBe(999999);
    });
});
