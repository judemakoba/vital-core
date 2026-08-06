export const calculateInvoiceTotal = (items: any[], taxRate: number = 0) => {
    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subtotal * (taxRate / 100);
    return {
        subtotal,
        tax,
        total: subtotal + tax
    };
};

const runTests = () => {
    console.log("--- Running Billing Logic Tests heath ---");

    const testCase1 = [
        { quantity: 2, unitPrice: 500 }, // 1000
        { quantity: 1, unitPrice: 250 }  // 250
    ];
    const result1 = calculateInvoiceTotal(testCase1, 10);

    if (result1.subtotal === 1250 && result1.tax === 125 && result1.total === 1375) {
        console.log("✅ Case 1: Standard billing passed");
    } else {
        console.error("❌ Case 1: Standard billing failed", result1);
    }

    const testCase2 = [
        { quantity: 5, unitPrice: 0 }
    ];
    const result2 = calculateInvoiceTotal(testCase2, 18);
    if (result2.total === 0) {
        console.log("✅ Case 2: Zero price handling passed");
    } else {
        console.error("❌ Case 2: Zero price handling failed");
    }

    console.log("--- Billing Tests Complete heath ---");
};

runTests();
