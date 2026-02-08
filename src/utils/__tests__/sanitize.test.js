import { 
  sanitizeText, 
  sanitizeNumber, 
  sanitizeSeparator, 
  sanitizeSeed,
  sanitizeBlockNumber,
  sanitizeUrlParam 
} from '../sanitize';

describe('sanitize utilities', () => {
  describe('sanitizeText', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeText('<script>alert("xss")</script>Hello')).toBe('Hello');
      expect(sanitizeText('<b>Bold</b> text')).toBe('Bold text');
    });

    it('should limit length', () => {
      const longText = 'a'.repeat(2000);
      expect(sanitizeText(longText, 100)).toHaveLength(100);
    });

    it('should handle non-string input', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
      expect(sanitizeText(123)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeText('  hello  ')).toBe('hello');
    });
  });

  describe('sanitizeNumber', () => {
    it('should remove non-numeric characters', () => {
      expect(sanitizeNumber('123abc')).toBe('123');
      expect(sanitizeNumber('abc123def')).toBe('123');
    });

    it('should handle negative numbers when allowed', () => {
      expect(sanitizeNumber('-123', { allowNegative: true })).toBe('-123');
      expect(sanitizeNumber('-123', { allowNegative: false })).toBe('123');
    });

    it('should apply min/max constraints', () => {
      expect(sanitizeNumber('5', { min: 10 })).toBe('10');
      expect(sanitizeNumber('100', { max: 50 })).toBe('50');
      expect(sanitizeNumber('25', { min: 10, max: 50 })).toBe('25');
    });

    it('should handle empty or invalid input', () => {
      expect(sanitizeNumber('')).toBe('');
      expect(sanitizeNumber('abc')).toBe('');
      expect(sanitizeNumber('-')).toBe('');
    });
  });

  describe('sanitizeSeparator', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeSeparator('<script>alert("xss")</script>, ')).toBe(', ');
    });

    it('should limit length to 10 characters', () => {
      expect(sanitizeSeparator('a'.repeat(20))).toHaveLength(10);
    });

    it('should return default value for empty input', () => {
      expect(sanitizeSeparator('')).toBe(', ');
    });

    it('should handle non-string input', () => {
      expect(sanitizeSeparator(null)).toBe(', ');
      expect(sanitizeSeparator(undefined)).toBe(', ');
    });
  });

  describe('sanitizeSeed', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeSeed('<script>alert("xss")</script>0x123')).toBe('0x123');
    });

    it('should limit length to 1000 characters', () => {
      const longSeed = 'a'.repeat(2000);
      expect(sanitizeSeed(longSeed)).toHaveLength(1000);
    });

    it('should preserve hex strings', () => {
      expect(sanitizeSeed('0x1234567890abcdef')).toBe('0x1234567890abcdef');
    });

    it('should handle non-string input', () => {
      expect(sanitizeSeed(null)).toBe('');
      expect(sanitizeSeed(undefined)).toBe('');
    });
  });

  describe('sanitizeBlockNumber', () => {
    it('should only accept positive numbers', () => {
      expect(sanitizeBlockNumber('123')).toBe('123');
      expect(sanitizeBlockNumber('-123')).toBe('');
    });

    it('should remove non-numeric characters', () => {
      expect(sanitizeBlockNumber('123abc')).toBe('123');
    });
  });

  describe('sanitizeUrlParam', () => {
    it('should only allow alphanumeric, hyphens, and underscores', () => {
      expect(sanitizeUrlParam('abc-123_def')).toBe('abc-123_def');
      expect(sanitizeUrlParam('abc@123#def')).toBe('abc123def');
    });

    it('should limit length to 100 characters', () => {
      const longParam = 'a'.repeat(200);
      expect(sanitizeUrlParam(longParam)).toHaveLength(100);
    });

    it('should handle non-string input', () => {
      expect(sanitizeUrlParam(null)).toBe('');
      expect(sanitizeUrlParam(undefined)).toBe('');
    });
  });
});
