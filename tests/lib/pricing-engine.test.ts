import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateInsurancePriceFromCatalog } from '@/lib/pricing-engine';

describe('Pricing Engine', () => {
  const mockCatalog = {
    rules: [
      {
        id: 'rule-1',
        insuranceId: 'ins-1',
        serviceType: 'CONSULTATION',
        serviceId: null,
        priceType: 'FIXED',
        priceValue: 50000,
        priority: 10,
        appliesToAll: true,
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
      },
      {
        id: 'rule-2',
        insuranceId: 'ins-1',
        serviceType: 'LAB_TEST',
        serviceId: 'service-123',
        priceType: 'PERCENTAGE_DISCOUNT',
        priceValue: 20,
        priority: 20,
        appliesToAll: false,
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
      },
    ],
    packageOverrides: [],
    packageDetails: null,
  };

  describe('calculateInsurancePriceFromCatalog', () => {
    it('should apply FIXED price rule for matching service type', () => {
      const result = calculateInsurancePriceFromCatalog(
        'CONSULTATION',
        null,
        100000,
        mockCatalog
      );

      expect(result.originalPrice).toBe(100000);
      expect(result.negotiatedPrice).toBe(50000);
      expect(result.appliedRuleId).toBe('rule-1');
    });

    it('should apply PERCENTAGE_DISCOUNT for specific service when no appliesToAll matches', () => {
      // Create catalog without the appliesToAll CONSULTATION rule
      const catalog = {
        ...mockCatalog,
        rules: [
          {
            id: 'rule-2',
            insuranceId: 'ins-1',
            serviceType: 'LAB_TEST',
            serviceId: 'service-123',
            priceType: 'PERCENTAGE_DISCOUNT',
            priceValue: 20,
            priority: 20,
            appliesToAll: false,
            isActive: true,
            effectiveFrom: new Date(),
            effectiveTo: null,
          },
        ],
      };

      const result = calculateInsurancePriceFromCatalog(
        'LAB_TEST',
        'service-123',
        100000,
        catalog
      );

      expect(result.originalPrice).toBe(100000);
      expect(result.negotiatedPrice).toBe(80000);
      expect(result.appliedRuleId).toBe('rule-2');
    });

    it('should return base price when no rules match', () => {
      // Use a service type with no matching rules
      const catalog = {
        ...mockCatalog,
        rules: [], // Empty rules
      };

      const result = calculateInsurancePriceFromCatalog(
        'PHARMACY',
        'unknown-service',
        100000,
        catalog
      );

      expect(result.originalPrice).toBe(100000);
      expect(result.negotiatedPrice).toBe(100000);
      expect(result.appliedRuleId).toBeUndefined();
    });

    it('should prioritize higher priority rules when both match', () => {
      const catalogWithConflict = {
        ...mockCatalog,
        rules: [
          {
            ...mockCatalog.rules[0],
            id: 'rule-low',
            priority: 5,
            priceType: 'FIXED',
            priceValue: 30000,
          },
          {
            ...mockCatalog.rules[0],
            id: 'rule-high',
            priority: 20,
            priceType: 'FIXED',
            priceValue: 40000,
          },
        ],
      };

      const result = calculateInsurancePriceFromCatalog(
        'CONSULTATION',
        null,
        100000,
        catalogWithConflict
      );

      expect(result.negotiatedPrice).toBe(40000); // Higher priority wins
      expect(result.appliedRuleId).toBe('rule-high');
    });

    it('should match serviceId before appliesToAll', () => {
      const catalog = {
        ...mockCatalog,
        rules: [
          {
            id: 'specific-rule',
            insuranceId: 'ins-1',
            serviceType: 'LAB_TEST',
            serviceId: 'service-123',
            priceType: 'FIXED',
            priceValue: 25000,
            priority: 10,
            appliesToAll: false,
            isActive: true,
            effectiveFrom: new Date(),
            effectiveTo: null,
          },
          {
            id: 'general-rule',
            insuranceId: 'ins-1',
            serviceType: 'LAB_TEST',
            serviceId: null,
            priceType: 'FIXED',
            priceValue: 50000,
            priority: 20,
            appliesToAll: true,
            isActive: true,
            effectiveFrom: new Date(),
            effectiveTo: null,
          },
        ],
      };

      // Specific serviceId should match first even though lower priority
      const result = calculateInsurancePriceFromCatalog(
        'LAB_TEST',
        'service-123',
        100000,
        catalog
      );

      expect(result.negotiatedPrice).toBe(25000);
      expect(result.appliedRuleId).toBe('specific-rule');
    });
  });
});
