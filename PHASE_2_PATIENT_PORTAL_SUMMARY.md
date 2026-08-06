# Phase 2 Implementation: Patient Payment Portal

## Overview
As part of the ongoing enhancement of the VitalCore hospital management system, I have begun implementing Phase 2 features focusing on the patient payment portal. This allows patients to view their billing information, make payments, and check payment history through a secure portal.

## Features Implemented

### 1. Patient Billing Information Endpoint
**URL:** `GET /api/patients/billing`
**Parameters:** 
- `patientNumber` (string) - Patient's ID number
- `dateOfBirth` (string, ISO format) - Patient's date of birth

**Returns:**
- Patient information (name, ID, etc.)
- List of outstanding invoices with details:
  - Invoice number, date, due date
  - Total amount, amount paid, balance due
  - Status (Unpaid, Partial)
  - Visit information (if applicable)
  - Line items (description, quantity, price)
  - Recent payments
- Summary statistics (total outstanding, total charges, etc.)

### 2. Invoice Details Endpoint
**URL:** `GET /api/patients/invoice/[id]`
**Parameters:**
- `patientNumber` (string) - Patient's ID number
- `dateOfBirth` (string, ISO format) - Patient's date of birth
- `id` (string, in URL) - Invoice ID

**Returns:**
- Detailed invoice information including:
  - All billing information
  - Complete line item breakdown
  - Full payment history
  - Visit details (if applicable)

### 3. Payment Processing Endpoint
**URL:** `POST /api/patients/payments`
**Parameters:**
- `patientNumber` (string) - Patient's ID number
- `dateOfBirth` (string, ISO format) - Patient's date of birth
- `invoiceId` (string) - ID of invoice to pay
- `amount` (number) - Payment amount
- `paymentMethod` (string) - Method of payment (Cash, Mobile Money, Card, Bank Transfer)
- `transactionId` (string, optional) - External transaction reference
- `notes` (string, optional) - Payment notes

**Returns:**
- Success confirmation
- Payment transaction details
- Updated invoice information

### 4. Payment History Endpoint
**URL:** `GET /api/patients/payments/history`
**Parameters:**
- `patientNumber` (string) - Patient's ID number
- `dateOfBirth` (string, ISO format) - Patient's date of birth

**Returns:**
- Patient information
- Complete payment history:
  - Payment amount, method, date
  - Associated invoice details
  - Processing staff member (if applicable)
  - Transaction ID and notes
- Summary statistics (total paid, payment count)

## Security Features
- Patient identity verified using patient number + date of birth
- All endpoints validate that requested invoices belong to the authenticated patient
- Input validation for all parameters
- Proper error handling without exposing sensitive information

## Technical Implementation
- Created new API routes under `/app/api/patients/`
- Used Prisma ORM for secure database queries
- Implemented proper transaction handling for payment processing
- Followed existing code patterns and conventions in the codebase
- Added comprehensive error handling and validation

## Files Created
1. `app/api/patients/billing/route.ts` - GET endpoint for billing information
2. `app/api/patients/invoice/[id]/route.ts` - GET endpoint for invoice details
3. `app/api/patients/payments/route.ts` - POST endpoint for processing payments
4. `app/api/patients/payments/history/route.ts` - GET endpoint for payment history

## Next Steps for Phase 2
1. Frontend integration to create patient portal UI
2. Additional security enhancements (rate limiting, logging)
3. Payment method validation and processing integration
4. Email/SMS notifications for payment confirmations
5. Implementation of denial management workflow (other Phase 2 component)

## Status: ✅ Phase 2 - Patient Payment Portal Foundation Complete
The core API endpoints for the patient payment portal have been implemented and are ready for frontend integration and further enhancement.