# VitalCore API Documentation hearth

## Authentication
- **POST `/api/auth/signin`**: NextAuth credentials sign-in.
- **GET `/api/auth/session`**: Retrieve current user session.

## Patients
- **GET `/api/patients`**: List all patients (supports search).
- **POST `/api/patients`**: Register a new patient.

## Clinical
- **GET `/api/appointments`**: Fetch scheduled appointments.
- **POST `/api/doctor/consultation/[visitId]/diagnosis`**: Record patient diagnosis.

## Pharmacy & Inventory
- **GET `/api/pharmacy/inventory`**: Current drug stock levels.
- **POST `/api/pharmacy/dispense`**: Record drug dispensing.

## Administration
- **GET `/api/admin/backup`**: Download a full JSON backup of system data (ADMIN only).
- **POST `/api/admin/settings`**: Update clinic-wide configuration.

## Verification
- Run Logic Tests: `node tests/logic_billing.js`
- Run Probes: `npm run test:security`
