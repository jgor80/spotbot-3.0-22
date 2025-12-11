// Shared validation helpers for edge functions

// Discord snowflake IDs are 17-19 digits
const DISCORD_ID_REGEX = /^\d{17,19}$/;

// UUID v4 format
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ValidationError {
  field: string;
  message: string;
}

export function validateDiscordId(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== "string" || !DISCORD_ID_REGEX.test(value)) {
    return { field: fieldName, message: `${fieldName} must be a valid Discord ID (17-19 digits)` };
  }
  return null;
}

export function validateUUID(value: unknown, fieldName: string): ValidationError | null {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    return { field: fieldName, message: `${fieldName} must be a valid UUID` };
  }
  return null;
}

export function validateString(
  value: unknown, 
  fieldName: string, 
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): ValidationError | null {
  const { minLength = 0, maxLength = 1000, required = true } = options;
  
  if (required && (value === undefined || value === null || value === "")) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  
  if (value !== undefined && value !== null) {
    if (typeof value !== "string") {
      return { field: fieldName, message: `${fieldName} must be a string` };
    }
    if (value.length < minLength) {
      return { field: fieldName, message: `${fieldName} must be at least ${minLength} characters` };
    }
    if (value.length > maxLength) {
      return { field: fieldName, message: `${fieldName} must be at most ${maxLength} characters` };
    }
  }
  
  return null;
}

export function validateNumber(
  value: unknown, 
  fieldName: string, 
  options: { min?: number; max?: number; required?: boolean; integer?: boolean } = {}
): ValidationError | null {
  const { min, max, required = true, integer = false } = options;
  
  if (required && (value === undefined || value === null)) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  
  if (value !== undefined && value !== null) {
    if (typeof value !== "number" || isNaN(value)) {
      return { field: fieldName, message: `${fieldName} must be a number` };
    }
    if (integer && !Number.isInteger(value)) {
      return { field: fieldName, message: `${fieldName} must be an integer` };
    }
    if (min !== undefined && value < min) {
      return { field: fieldName, message: `${fieldName} must be at least ${min}` };
    }
    if (max !== undefined && value > max) {
      return { field: fieldName, message: `${fieldName} must be at most ${max}` };
    }
  }
  
  return null;
}

export function validateArray<T>(
  value: unknown, 
  fieldName: string, 
  itemValidator: (item: unknown, index: number) => ValidationError | null,
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): ValidationError | null {
  const { minLength = 0, maxLength = 100, required = true } = options;
  
  if (required && (value === undefined || value === null)) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  
  if (value !== undefined && value !== null) {
    if (!Array.isArray(value)) {
      return { field: fieldName, message: `${fieldName} must be an array` };
    }
    if (value.length < minLength) {
      return { field: fieldName, message: `${fieldName} must have at least ${minLength} items` };
    }
    if (value.length > maxLength) {
      return { field: fieldName, message: `${fieldName} must have at most ${maxLength} items` };
    }
    
    for (let i = 0; i < value.length; i++) {
      const itemError = itemValidator(value[i], i);
      if (itemError) {
        return { field: `${fieldName}[${i}]`, message: itemError.message };
      }
    }
  }
  
  return null;
}

export function validateEnum<T extends string>(
  value: unknown, 
  fieldName: string, 
  allowedValues: readonly T[],
  options: { required?: boolean } = {}
): ValidationError | null {
  const { required = true } = options;
  
  if (required && (value === undefined || value === null)) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  
  if (value !== undefined && value !== null) {
    if (typeof value !== "string" || !allowedValues.includes(value as T)) {
      return { field: fieldName, message: `${fieldName} must be one of: ${allowedValues.join(", ")}` };
    }
  }
  
  return null;
}

export function validateISODate(value: unknown, fieldName: string, options: { required?: boolean } = {}): ValidationError | null {
  const { required = true } = options;
  
  if (required && (value === undefined || value === null || value === "")) {
    return { field: fieldName, message: `${fieldName} is required` };
  }
  
  if (value !== undefined && value !== null && value !== "") {
    if (typeof value !== "string") {
      return { field: fieldName, message: `${fieldName} must be a string` };
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      return { field: fieldName, message: `${fieldName} must be a valid ISO date` };
    }
  }
  
  return null;
}

export function collectErrors(errors: (ValidationError | null)[]): ValidationError[] {
  return errors.filter((e): e is ValidationError => e !== null);
}

export function formatValidationErrors(errors: ValidationError[]): string {
  return errors.map(e => e.message).join("; ");
}
