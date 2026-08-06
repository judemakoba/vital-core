// Test file for claim scrubbing and billing validation services
import { prisma } from "@/lib/prisma";
import { ClaimScrubbingService } from "@/lib/finance/claim-scrubbing-service";
import { BillingValidationService } from "@/lib/finance/billing-validation-service";

async function runTests() {
    console.log("Starting validation service tests...");

    // Test 1: Claim Scrubbing Service
    console.log("\n=== Testing Claim Scrubbing Service ===");

    // Test case 1: Valid claim data
    const validClaimData = {
        patientId: "test-patient-id",
        insuranceId: "test-insurance-id",
        visitId: "test-visit-id",
        invoiceId: "test-invoice-id",
        totalAmount: 150.00,
        serviceDate: new Date().toISOString(),
        serviceType: "OFFICE_VISIT",
        diagnosisCodes: ["A01.0"],
        procedureCodes: ["99213"]
    };

    try {
        const scrubResult = await ClaimScrubbingService.scrubClaim(validClaimData);
        console.log("Valid claim scrub result:", JSON.stringify(scrubResult, null, 2));
    } catch (error) {
        console.error("Error testing valid claim:", error);
    }

    // Test case 2: Invalid claim data (missing patient)
    const invalidClaimData = {
        patientId: "non-existent-patient-id",
        insuranceId: "test-insurance-id",
        visitId: "test-visit-id",
        invoiceId: "test-invoice-id",
        totalAmount: 150.00
    };

    try {
        const scrubResult = await ClaimScrubbingService.scrubClaim(invalidClaimData);
        console.log("Invalid claim scrub result:", JSON.stringify(scrubResult, null, 2));
    } catch (error) {
        console.error("Error testing invalid claim:", error);
    }

    // Test 2: Billing Validation Service
    console.log("\n=== Testing Billing Validation Service ===");

    // Test case 1: Valid invoice data
    const validInvoiceData = {
        patientId: "test-patient-id",
        visitId: "test-visit-id",
        items: [
            {
                description: "Office Visit",
                quantity: 1,
                unitPrice: 100.00,
                itemType: "CONSULTATION"
            },
            {
                description: "Lab Test",
                quantity: 1,
                unitPrice: 50.00,
                itemType: "LAB"
            }
        ],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    };

    try {
        const validationResult = await BillingValidationService.validateInvoice(validInvoiceData);
        console.log("Valid invoice validation result:", JSON.stringify(validationResult, null, 2));
    } catch (error) {
        console.error("Error testing valid invoice:", error);
    }

    // Test case 2: Invalid invoice data (missing items)
    const invalidInvoiceData = {
        patientId: "test-patient-id",
        visitId: "test-visit-id",
        items: [],
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };

    try {
        const validationResult = await BillingValidationService.validateInvoice(invalidInvoiceData);
        console.log("Invalid invoice validation result:", JSON.stringify(validationResult, null, 2));
    } catch (error) {
        console.error("Error testing invalid invoice:", error);
    }

    // Test 3: Charge Capture Audit
    console.log("\n=== Testing Charge Capture Audit ===");

    try {
        // This would require actual visit data with services
        // For now, we'll just test that the function exists and can be called
        console.log("Charge capture audit function exists:", typeof BillingValidationService.auditChargeCapture === 'function');
    } catch (error) {
        console.error("Error testing charge capture audit:", error);
    }

    console.log("\n=== Tests completed ===");
}

// Run the tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

export default runTests;