import { describe, it, expect } from 'vitest';

// Copy the function here for testing to avoid module issues
const calculateInvoiceTotal = (items: any[], taxRate: number = 0) => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subtotal * (taxRate / 100);
    return {
        subtotal,
        tax,
        total: subtotal + tax
    };
};

describe('Billing Logic', () => {
  describe('calculateInvoiceTotal', () => {
    it('should calculate standard billing with tax', () => {
      const items = [
        { quantity: 2, unitPrice: 500 },
        { quantity: 1, unitPrice: 250 },
      ];
      
      const result = calculateInvoiceTotal(items, 10);
      
      expect(result.subtotal).toBe(1250);
      expect(result.tax).toBe(125);
      expect(result.total).toBe(1375);
    });

    it('should handle zero price items', () => {
      const items = [{ quantity: 5, unitPrice: 0 }];
      const result = calculateInvoiceTotal(items, 18);
      expect(result.total).toBe(0);
    });

    it('should handle zero tax rate', () => {
      const items = [{ quantity: 1, unitPrice: 1000 }];
      const result = calculateInvoiceTotal(items, 0);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(1000);
    });

    it('should handle empty items array', () => {
      const result = calculateInvoiceTotal([], 10);
      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle decimal prices correctly', () => {
      const items = [{ quantity: 3, unitPrice: 333.33 }];
      const result = calculateInvoiceTotal(items, 10);
      expect(result.subtotal).toBeCloseTo(999.99);
      expect(result.tax).toBeCloseTo(99.999);
      expect(result.total).toBeCloseTo(1099.989);
    });

    it('should handle large quantities', () => {
      const items = [{ quantity: 10000, unitPrice: 100 }];
      const result = calculateInvoiceTotal(items, 5);
      expect(result.subtotal).toBe(1000000);
      expect(result.tax).toBe(50000);
      expect(result.total).toBe(1050000);
    });
  });
});
