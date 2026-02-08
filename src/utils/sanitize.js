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
  
  const num = parseInt(cleaned, 10);
  
  if (isNaN(num)) {
    return '';
  }
  
  if (min !== null && num < min) {
    return String(min);
  }
  
  if (max !== null && num > max) {
    return String(max);
  }
  
  return String(num);
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
  return sanitizeNumber(input, { min: 0, allowNegative: false });
}

export function sanitizeUrlParam(input) {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input.replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 100);
}
