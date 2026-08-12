import { describe, it, expect } from 'vitest';
import { 
  createPatientSchema, 
  updatePatientSchema, 
  loginSchema,
  paginationSchema,
  validateRequest 
} from '@/lib/validation';

describe('Validation Schemas', () => {
  describe('createPatientSchema', () => {
    it('should validate valid patient data', () => {
      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'MALE',
        phone: '+256****0000',
        email: 'john@example.com',
      };

      const result = validateRequest(createPatientSchema, validData);
      expect(result.firstName).toBe('John');
      expect(result.gender).toBe('MALE');
    });

    it('should reject invalid email', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'MALE',
        phone: '+256****0000',
        email: 'invalid-email',
      };

      expect(() => validateRequest(createPatientSchema, invalidData)).toThrow();
    });

    it('should reject missing required fields', () => {
      const invalidData = {
        firstName: 'John',
      };

      expect(() => validateRequest(createPatientSchema, invalidData)).toThrow();
    });

    it('should reject invalid gender', () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'INVALID',
        phone: '+256****0000',
      };

      expect(() => validateRequest(createPatientSchema, invalidData)).toThrow();
    });
  });

  describe('loginSchema', () => {
    it('should validate valid credentials', () => {
      const validData = {
        email: 'user@example.com',
        password: 'password123',
      };

      const result = validateRequest(loginSchema, validData);
      expect(result.email).toBe('user@example.com');
    });

    it('should reject short password', () => {
      const invalidData = {
        email: 'user@example.com',
        password: 'short',
      };

      expect(() => validateRequest(loginSchema, invalidData)).toThrow();
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'password123',
      };

      expect(() => validateRequest(loginSchema, invalidData)).toThrow();
    });
  });

  describe('paginationSchema', () => {
    it('should use defaults', () => {
      const result = validateRequest(paginationSchema, {});
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should coerce string numbers', () => {
      const result = validateRequest(paginationSchema, { page: '2', limit: '50' });
      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should reject limit > 100', () => {
      // The schema correctly rejects values > 100
      expect(() => validateRequest(paginationSchema, { limit: '200' })).toThrow();
    });

  describe('createPatientSchema - new fields', () => {
    it('should accept valid next of kin data', () => {
      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'MALE',
        phone: '+256****0000',
        nextOfKinName: 'Jane Doe',
        nextOfKinPhone: '+256****1111',
        nextOfKinEmail: 'jane@example.com',
        nextOfKinAddress: '123 Main St',
        nextOfKinRel: 'Spouse',
      };

      const result = validateRequest(createPatientSchema, validData);
      expect(result.nextOfKinName).toBe('Jane Doe');
      expect(result.nextOfKinRel).toBe('Spouse');
    });

    // Insurance tests removed 2026-08 along with the insurance module.
    // Patient is now purely a personal-info form (no insurance enrollment).

    it('should accept all optional fields as empty strings', () => {
      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        gender: 'MALE',
        phone: '+256****0000',
        alternativePhone: '',
        email: '',
        address: '',
        city: '',
        district: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRel: '',
        nextOfKinName: '',
        nextOfKinPhone: '',
        nextOfKinEmail: '',
        nextOfKinAddress: '',
        nextOfKinRel: '',
        allergies: '',
        chronicConditions: '',
        currentMedications: '',
        bloodGroup: '',
        maritalStatus: '',
        occupation: '',
      };

      const result = validateRequest(createPatientSchema, validData);
      expect(result.firstName).toBe('John');
    });
  });
  });
});
