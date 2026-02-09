import DOMPurify from 'dompurify';

export function sanitizeText(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return '';
  }
  
  const cleaned = DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  return cleaned.slice(0, maxLength).trim();
}

export function sanitizeNumber(input, options = {}) {
  const { min = null, max = null, allowNegative = false } = options;
  
  let cleaned = String(input).replace(/[^\d-]/g, '');
  
  if (!allowNegative) {
    cleaned = cleaned.replace(/-/g, '');
  } else {
    const hasNegative = cleaned.startsWith('-');
    cleaned = cleaned.replace(/-/g, '');
    if (hasNegative) {
      cleaned = '-' + cleaned;
    }
  }
  
  if (!cleaned || cleaned === '-') {
    return '';
  }
  
  try {
    const num = BigInt(cleaned);
    
    if (min !== null && num < BigInt(min)) {
      return String(min);
    }
    
    if (max !== null && num > BigInt(max)) {
      return String(max);
    }
    
    return cleaned;
  } catch (e) {
    return '';
  }
}

export function sanitizeSeparator(input) {
  if (typeof input !== 'string') {
    return ', ';
  }
  const cleaned = DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  const limited = cleaned.slice(0, 10);
  return limited || ', ';
}

export function sanitizeSeed(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  const cleaned = DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  return cleaned.slice(0, 1000).trim();
}

export function sanitizeBlockNumber(input) {
  if (String(input).includes('-')) {
    return '';
  }
  // Max: 200 billion
  return sanitizeNumber(input, { min: 0, max: 200000000000, allowNegative: false });
}

export function sanitizeUrlParam(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 100);
}
