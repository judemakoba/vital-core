
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  email: 'email',
  emailVerified: 'emailVerified',
  image: 'image',
  hashedPassword: 'hashedPassword',
  roleId: 'roleId',
  employeeId: 'employeeId',
  phone: 'phone',
  department: 'department',
  specialization: 'specialization',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  provider: 'provider',
  providerAccountId: 'providerAccountId',
  refresh_token: 'refresh_token',
  access_token: 'access_token',
  expires_at: 'expires_at',
  token_type: 'token_type',
  scope: 'scope',
  id_token: 'id_token',
  session_state: 'session_state'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId',
  expires: 'expires'
};

exports.Prisma.VerificationTokenScalarFieldEnum = {
  identifier: 'identifier',
  token: 'token',
  expires: 'expires'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PermissionScalarFieldEnum = {
  id: 'id',
  action: 'action',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.PatientScalarFieldEnum = {
  id: 'id',
  patientNumber: 'patientNumber',
  firstName: 'firstName',
  lastName: 'lastName',
  dateOfBirth: 'dateOfBirth',
  gender: 'gender',
  bloodGroup: 'bloodGroup',
  maritalStatus: 'maritalStatus',
  occupation: 'occupation',
  phone: 'phone',
  alternativePhone: 'alternativePhone',
  email: 'email',
  address: 'address',
  city: 'city',
  district: 'district',
  emergencyContactName: 'emergencyContactName',
  emergencyContactPhone: 'emergencyContactPhone',
  emergencyContactRel: 'emergencyContactRel',
  nextOfKinName: 'nextOfKinName',
  nextOfKinPhone: 'nextOfKinPhone',
  nextOfKinEmail: 'nextOfKinEmail',
  nextOfKinAddress: 'nextOfKinAddress',
  nextOfKinRel: 'nextOfKinRel',
  allergies: 'allergies',
  chronicConditions: 'chronicConditions',
  currentMedications: 'currentMedications',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VisitScalarFieldEnum = {
  id: 'id',
  visitNumber: 'visitNumber',
  patientId: 'patientId',
  type: 'type',
  chiefComplaint: 'chiefComplaint',
  bloodPressure: 'bloodPressure',
  heartRate: 'heartRate',
  temperature: 'temperature',
  weight: 'weight',
  height: 'height',
  priority: 'priority',
  status: 'status',
  subjective: 'subjective',
  objective: 'objective',
  assessment: 'assessment',
  treatmentPlan: 'treatmentPlan',
  assignedDoctorId: 'assignedDoctorId',
  checkInTime: 'checkInTime',
  completedTime: 'completedTime',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  consultationFeePaid: 'consultationFeePaid',
  consultationFeeAmount: 'consultationFeeAmount',
  consultationFeePaidAt: 'consultationFeePaidAt',
  consultationInvoiceId: 'consultationInvoiceId',
  labFeesPaid: 'labFeesPaid',
  labFeesAmount: 'labFeesAmount',
  labFeesPaidAt: 'labFeesPaidAt',
  labInvoiceId: 'labInvoiceId',
  accountsCleared: 'accountsCleared',
  accountsClearedAt: 'accountsClearedAt',
  accountsClearedById: 'accountsClearedById',
  discontinuationNote: 'discontinuationNote',
  discontinuationDate: 'discontinuationDate',
  discontinuationById: 'discontinuationById',
  linkedPriorVisitId: 'linkedPriorVisitId'
};

exports.Prisma.AppointmentScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  doctorId: 'doctorId',
  date: 'date',
  duration: 'duration',
  reason: 'reason',
  status: 'status',
  notesForStaff: 'notesForStaff',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DiagnosisScalarFieldEnum = {
  id: 'id',
  visitId: 'visitId',
  patientId: 'patientId',
  code: 'code',
  name: 'name',
  category: 'category',
  notes: 'notes',
  icdVersion: 'icdVersion',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ICD11CodeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  title: 'title'
};

exports.Prisma.PrescriptionScalarFieldEnum = {
  id: 'id',
  visitId: 'visitId',
  patientId: 'patientId',
  doctorId: 'doctorId',
  medicationName: 'medicationName',
  dosage: 'dosage',
  frequency: 'frequency',
  durationDays: 'durationDays',
  quantity: 'quantity',
  instructions: 'instructions',
  refills: 'refills',
  status: 'status',
  subStatus: 'subStatus',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  drugId: 'drugId',
  doseAmount: 'doseAmount',
  doseUnit: 'doseUnit',
  frequencyPerDay: 'frequencyPerDay',
  isManualQuantity: 'isManualQuantity',
  pharmacyFeesPaid: 'pharmacyFeesPaid',
  pharmacyFeesAmount: 'pharmacyFeesAmount',
  pharmacyFeesPaidAt: 'pharmacyFeesPaidAt',
  pharmacyInvoiceId: 'pharmacyInvoiceId'
};

exports.Prisma.LabOrderScalarFieldEnum = {
  id: 'id',
  visitId: 'visitId',
  patientId: 'patientId',
  doctorId: 'doctorId',
  testName: 'testName',
  testCategory: 'testCategory',
  priority: 'priority',
  specialInstructions: 'specialInstructions',
  status: 'status',
  subStatus: 'subStatus',
  result: 'result',
  resultFlags: 'resultFlags',
  resultRows: 'resultRows',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  feesPaid: 'feesPaid',
  feesAmount: 'feesAmount',
  feesPaidAt: 'feesPaidAt',
  invoiceId: 'invoiceId'
};

exports.Prisma.RadiologyCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RadiologyCatalogScalarFieldEnum = {
  id: 'id',
  name: 'name',
  categoryId: 'categoryId',
  description: 'description',
  price: 'price',
  referenceRange: 'referenceRange',
  preparationInstructions: 'preparationInstructions',
  turnaroundTime: 'turnaroundTime',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RadiologyResultTemplateScalarFieldEnum = {
  id: 'id',
  radiologyCatalogId: 'radiologyCatalogId',
  templateName: 'templateName',
  headerHtml: 'headerHtml',
  templateHtml: 'templateHtml',
  footerHtml: 'footerHtml',
  isActive: 'isActive',
  createdById: 'createdById',
  updatedById: 'updatedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RadiologyOrderScalarFieldEnum = {
  id: 'id',
  visitId: 'visitId',
  patientId: 'patientId',
  doctorId: 'doctorId',
  examName: 'examName',
  category: 'category',
  priority: 'priority',
  clinicalNotes: 'clinicalNotes',
  status: 'status',
  subStatus: 'subStatus',
  result: 'result',
  reportUrl: 'reportUrl',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  modality: 'modality',
  technique: 'technique',
  findings: 'findings',
  impression: 'impression',
  recommendations: 'recommendations',
  radiologistNotes: 'radiologistNotes',
  contrastUsed: 'contrastUsed',
  feesPaid: 'feesPaid',
  feesAmount: 'feesAmount',
  feesPaidAt: 'feesPaidAt',
  invoiceId: 'invoiceId'
};

exports.Prisma.OrderWriteOffScalarFieldEnum = {
  id: 'id',
  visitId: 'visitId',
  itemType: 'itemType',
  itemId: 'itemId',
  invoiceId: 'invoiceId',
  writtenOffAt: 'writtenOffAt',
  scheduledAt: 'scheduledAt',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.DrugCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  description: 'description',
  parentId: 'parentId',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugScalarFieldEnum = {
  id: 'id',
  drugCode: 'drugCode',
  name: 'name',
  genericName: 'genericName',
  categoryId: 'categoryId',
  drugClass: 'drugClass',
  schedule: 'schedule',
  isControlled: 'isControlled',
  dosageForm: 'dosageForm',
  strength: 'strength',
  strengthValue: 'strengthValue',
  strengthUnit: 'strengthUnit',
  packageSize: 'packageSize',
  packageUnit: 'packageUnit',
  manufacturer: 'manufacturer',
  countryOfOrigin: 'countryOfOrigin',
  indications: 'indications',
  contraindications: 'contraindications',
  sideEffects: 'sideEffects',
  storage: 'storage',
  shelfLifeMonths: 'shelfLifeMonths',
  isActive: 'isActive',
  isRestricted: 'isRestricted',
  gtin: 'gtin',
  atcCode: 'atcCode',
  rxNormCui: 'rxNormCui',
  unii: 'unii',
  barcode: 'barcode',
  registrationNumber: 'registrationNumber',
  ndcCode: 'ndcCode',
  route: 'route',
  pregnancyCategory: 'pregnancyCategory',
  hasBlackBoxWarning: 'hasBlackBoxWarning',
  mechanismOfAction: 'mechanismOfAction',
  halfLifeHours: 'halfLifeHours',
  therapeuticClass: 'therapeuticClass',
  localName: 'localName',
  formularyStatus: 'formularyStatus',
  requiresPriorAuth: 'requiresPriorAuth',
  genericSubstitutionAllowed: 'genericSubstitutionAllowed',
  isBrand: 'isBrand',
  pillShape: 'pillShape',
  pillColor: 'pillColor',
  pillImprint: 'pillImprint',
  imageUrl: 'imageUrl',
  packType: 'packType',
  unitsPerPack: 'unitsPerPack',
  minimumDispensingUnit: 'minimumDispensingUnit',
  isUnitDose: 'isUnitDose',
  reorderLevel: 'reorderLevel',
  maxStock: 'maxStock',
  leadTimeDays: 'leadTimeDays',
  averageMonthlyUsage: 'averageMonthlyUsage',
  standardUnitCost: 'standardUnitCost',
  lastPurchaseDate: 'lastPurchaseDate',
  preferredSupplierId: 'preferredSupplierId',
  costPrice: 'costPrice',
  markupPercent: 'markupPercent',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugBatchScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  batchNumber: 'batchNumber',
  supplierId: 'supplierId',
  manufacturingDate: 'manufacturingDate',
  expiryDate: 'expiryDate',
  receivedDate: 'receivedDate',
  quantityReceived: 'quantityReceived',
  quantityRemaining: 'quantityRemaining',
  quantityReserved: 'quantityReserved',
  quantityDamaged: 'quantityDamaged',
  quantityExpired: 'quantityExpired',
  purchasePrice: 'purchasePrice',
  sellingPrice: 'sellingPrice',
  wholesalePrice: 'wholesalePrice',
  taxRate: 'taxRate',
  storageLocation: 'storageLocation',
  qualityCheckDate: 'qualityCheckDate',
  qualityCheckBy: 'qualityCheckBy',
  qualityCheckPass: 'qualityCheckPass',
  isSplittable: 'isSplittable',
  isActive: 'isActive',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugPriceScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  priceType: 'priceType',
  price: 'price',
  currency: 'currency',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  minQuantity: 'minQuantity',
  maxQuantity: 'maxQuantity',
  isTaxInclusive: 'isTaxInclusive',
  taxRate: 'taxRate',
  isActive: 'isActive',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugPriceAuditScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  priceType: 'priceType',
  oldPrice: 'oldPrice',
  newPrice: 'newPrice',
  currency: 'currency',
  changedById: 'changedById',
  changedAt: 'changedAt',
  reason: 'reason'
};

exports.Prisma.DrugInteractionScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  interactsWithDrugId: 'interactsWithDrugId',
  severity: 'severity',
  description: 'description',
  clinicalEffect: 'clinicalEffect',
  managementAdvice: 'managementAdvice',
  evidenceLevel: 'evidenceLevel',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugDosageGuidelineScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  indication: 'indication',
  ageGroup: 'ageGroup',
  ageMin: 'ageMin',
  ageMax: 'ageMax',
  minDose: 'minDose',
  maxDose: 'maxDose',
  doseUnit: 'doseUnit',
  frequency: 'frequency',
  route: 'route',
  durationDays: 'durationDays',
  renalAdjust: 'renalAdjust',
  hepaticAdjust: 'hepaticAdjust',
  icd10Code: 'icd10Code',
  notes: 'notes',
  source: 'source',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DrugImageScalarFieldEnum = {
  id: 'id',
  drugId: 'drugId',
  imageUrl: 'imageUrl',
  caption: 'caption',
  isPrimary: 'isPrimary',
  uploadedById: 'uploadedById',
  createdAt: 'createdAt'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  supplierCode: 'supplierCode',
  name: 'name',
  contactPerson: 'contactPerson',
  phone: 'phone',
  email: 'email',
  address: 'address',
  tin: 'tin',
  paymentTerms: 'paymentTerms',
  creditLimit: 'creditLimit',
  leadTimeDays: 'leadTimeDays',
  isActive: 'isActive',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  supplierId: 'supplierId',
  orderDate: 'orderDate',
  expectedDate: 'expectedDate',
  receivedDate: 'receivedDate',
  status: 'status',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  taxTotal: 'taxTotal',
  shippingCost: 'shippingCost',
  totalAmount: 'totalAmount',
  paymentTerms: 'paymentTerms',
  paymentStatus: 'paymentStatus',
  requestedById: 'requestedById',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  purchaseOrderId: 'purchaseOrderId',
  drugId: 'drugId',
  quantityOrdered: 'quantityOrdered',
  quantityReceived: 'quantityReceived',
  unitPrice: 'unitPrice',
  discountPercent: 'discountPercent',
  discountAmount: 'discountAmount',
  taxRate: 'taxRate',
  taxAmount: 'taxAmount',
  lineTotal: 'lineTotal',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.GoodsReceiptScalarFieldEnum = {
  id: 'id',
  grNumber: 'grNumber',
  purchaseOrderId: 'purchaseOrderId',
  receivedDate: 'receivedDate',
  receivedById: 'receivedById',
  invoiceNumber: 'invoiceNumber',
  invoiceDate: 'invoiceDate',
  deliveryNote: 'deliveryNote',
  status: 'status',
  notes: 'notes',
  createdAt: 'createdAt',
  journalEntryId: 'journalEntryId'
};

exports.Prisma.GoodsReceiptItemScalarFieldEnum = {
  id: 'id',
  goodsReceiptId: 'goodsReceiptId',
  purchaseOrderItemId: 'purchaseOrderItemId',
  drugId: 'drugId',
  batchNumber: 'batchNumber',
  expiryDate: 'expiryDate',
  quantityReceived: 'quantityReceived',
  unitPrice: 'unitPrice',
  lineTotal: 'lineTotal',
  drugBatchId: 'drugBatchId',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.DispensingLogScalarFieldEnum = {
  id: 'id',
  dispenseNumber: 'dispenseNumber',
  patientId: 'patientId',
  visitId: 'visitId',
  prescriptionId: 'prescriptionId',
  drugId: 'drugId',
  drugBatchId: 'drugBatchId',
  quantityDispensed: 'quantityDispensed',
  unitPrice: 'unitPrice',
  discountAmount: 'discountAmount',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  priceType: 'priceType',
  patientPayAmount: 'patientPayAmount',
  paymentStatus: 'paymentStatus',
  paymentId: 'paymentId',
  dispensedById: 'dispensedById',
  dispensedAt: 'dispensedAt',
  dosageInstructions: 'dosageInstructions',
  duration: 'duration',
  frequency: 'frequency',
  notes: 'notes',
  createdAt: 'createdAt',
  stockMovementId: 'stockMovementId'
};

exports.Prisma.StockMovementScalarFieldEnum = {
  id: 'id',
  movementNumber: 'movementNumber',
  drugId: 'drugId',
  drugBatchId: 'drugBatchId',
  movementType: 'movementType',
  quantity: 'quantity',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  stockBefore: 'stockBefore',
  stockAfter: 'stockAfter',
  unitCost: 'unitCost',
  totalCost: 'totalCost',
  reason: 'reason',
  performedById: 'performedById',
  performedAt: 'performedAt',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.StockAdjustmentScalarFieldEnum = {
  id: 'id',
  adjustmentNumber: 'adjustmentNumber',
  adjustmentType: 'adjustmentType',
  status: 'status',
  items: 'items',
  requestedById: 'requestedById',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  totalValue: 'totalValue',
  isWrittenOff: 'isWrittenOff',
  writeOffAccount: 'writeOffAccount',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockTakeScalarFieldEnum = {
  id: 'id',
  stockTakeNumber: 'stockTakeNumber',
  name: 'name',
  stockTakeDate: 'stockTakeDate',
  status: 'status',
  isFullInventory: 'isFullInventory',
  categories: 'categories',
  items: 'items',
  totalVariance: 'totalVariance',
  countedById: 'countedById',
  verifiedById: 'verifiedById',
  verifiedAt: 'verifiedAt',
  notes: 'notes',
  journalEntryId: 'journalEntryId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LabCategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LabTestCatalogScalarFieldEnum = {
  id: 'id',
  name: 'name',
  categoryId: 'categoryId',
  description: 'description',
  price: 'price',
  referenceRange: 'referenceRange',
  unit: 'unit',
  template: 'template',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LabResultTemplateScalarFieldEnum = {
  id: 'id',
  labTestId: 'labTestId',
  templateName: 'templateName',
  resultMode: 'resultMode',
  resultSchema: 'resultSchema',
  headerHtml: 'headerHtml',
  templateHtml: 'templateHtml',
  footerHtml: 'footerHtml',
  normalRangeMin: 'normalRangeMin',
  normalRangeMax: 'normalRangeMax',
  criticalRangeMin: 'criticalRangeMin',
  criticalRangeMax: 'criticalRangeMax',
  resultUnit: 'resultUnit',
  isActive: 'isActive',
  createdById: 'createdById',
  updatedById: 'updatedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceScalarFieldEnum = {
  id: 'id',
  invoiceNumber: 'invoiceNumber',
  patientId: 'patientId',
  visitId: 'visitId',
  totalAmount: 'totalAmount',
  amountPaid: 'amountPaid',
  balanceDue: 'balanceDue',
  status: 'status',
  dueDate: 'dueDate',
  issuedById: 'issuedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InvoiceItemScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  description: 'description',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  totalPrice: 'totalPrice',
  itemType: 'itemType',
  referenceId: 'referenceId'
};

exports.Prisma.PaymentScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  taxInvoiceId: 'taxInvoiceId',
  amount: 'amount',
  paymentMethod: 'paymentMethod',
  transactionId: 'transactionId',
  receivedById: 'receivedById',
  notes: 'notes',
  createdAt: 'createdAt',
  journalEntryId: 'journalEntryId'
};

exports.Prisma.ExpenseScalarFieldEnum = {
  id: 'id',
  category: 'category',
  description: 'description',
  amount: 'amount',
  date: 'date',
  paymentMethod: 'paymentMethod',
  recordedById: 'recordedById',
  receiptImage: 'receiptImage',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  patientId: 'patientId',
  type: 'type',
  message: 'message',
  status: 'status',
  channel: 'channel',
  reference: 'reference',
  error: 'error',
  createdAt: 'createdAt'
};

exports.Prisma.TenantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  shortName: 'shortName',
  code: 'code',
  address: 'address',
  city: 'city',
  region: 'region',
  country: 'country',
  phone: 'phone',
  email: 'email',
  website: 'website',
  taxId: 'taxId',
  registrationNumber: 'registrationNumber',
  licenseExpiry: 'licenseExpiry',
  logoUrl: 'logoUrl',
  faviconUrl: 'faviconUrl',
  primaryColor: 'primaryColor',
  accentColor: 'accentColor',
  reportFont: 'reportFont',
  timezone: 'timezone',
  dateFormat: 'dateFormat',
  timeFormat: 'timeFormat',
  locale: 'locale',
  firstDayOfWeek: 'firstDayOfWeek',
  currency: 'currency',
  currencyPosition: 'currencyPosition',
  decimalPlaces: 'decimalPlaces',
  fiscalYearStartMonth: 'fiscalYearStartMonth',
  cogsAccountCode: 'cogsAccountCode',
  defaultTaxRate: 'defaultTaxRate',
  patientNumberPrefix: 'patientNumberPrefix',
  patientNumberFormat: 'patientNumberFormat',
  visitNumberPrefix: 'visitNumberPrefix',
  visitNumberFormat: 'visitNumberFormat',
  invoicePrefix: 'invoicePrefix',
  invoiceFormat: 'invoiceFormat',
  receiptPrefix: 'receiptPrefix',
  receiptFormat: 'receiptFormat',
  creditNotePrefix: 'creditNotePrefix',
  creditNoteFormat: 'creditNoteFormat',
  poPrefix: 'poPrefix',
  poFormat: 'poFormat',
  journalPrefix: 'journalPrefix',
  journalFormat: 'journalFormat',
  agingBuckets: 'agingBuckets',
  consultationFee: 'consultationFee',
  followUpWindowDays: 'followUpWindowDays',
  emergencyFee: 'emergencyFee',
  scheduledFee: 'scheduledFee',
  defaultAppointmentDuration: 'defaultAppointmentDuration',
  appointmentBufferMinutes: 'appointmentBufferMinutes',
  workingHoursStart: 'workingHoursStart',
  workingHoursEnd: 'workingHoursEnd',
  defaultReorderLevel: 'defaultReorderLevel',
  defaultMaxStock: 'defaultMaxStock',
  expiryWarningDays: 'expiryWarningDays',
  expiryCriticalDays: 'expiryCriticalDays',
  drugMarkupPercent: 'drugMarkupPercent',
  autoWriteoffThreshold: 'autoWriteoffThreshold',
  auditRetentionDays: 'auditRetentionDays',
  backdateLimitDays: 'backdateLimitDays',
  defaultPageSize: 'defaultPageSize',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BranchScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  code: 'code',
  address: 'address',
  phone: 'phone',
  isMain: 'isMain',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TenantSettingScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  key: 'key',
  value: 'value',
  valueType: 'valueType',
  category: 'category',
  description: 'description',
  updatedAt: 'updatedAt'
};

exports.Prisma.SystemSettingScalarFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  updatedAt: 'updatedAt'
};

exports.Prisma.ChartOfAccountScalarFieldEnum = {
  id: 'id',
  accountCode: 'accountCode',
  accountName: 'accountName',
  accountType: 'accountType',
  category: 'category',
  subCategory: 'subCategory',
  isActive: 'isActive',
  isControlAccount: 'isControlAccount',
  parentId: 'parentId',
  taxRateId: 'taxRateId',
  isTaxApplicable: 'isTaxApplicable',
  openingBalance: 'openingBalance',
  openingBalanceDate: 'openingBalanceDate',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TaxRateScalarFieldEnum = {
  id: 'id',
  name: 'name',
  code: 'code',
  rate: 'rate',
  isPercentage: 'isPercentage',
  taxType: 'taxType',
  isActive: 'isActive',
  effectiveFrom: 'effectiveFrom',
  effectiveTo: 'effectiveTo',
  description: 'description',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FiscalYearScalarFieldEnum = {
  id: 'id',
  name: 'name',
  startDate: 'startDate',
  endDate: 'endDate',
  isClosed: 'isClosed',
  closedAt: 'closedAt',
  closedById: 'closedById',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AccountingPeriodScalarFieldEnum = {
  id: 'id',
  fiscalYearId: 'fiscalYearId',
  periodType: 'periodType',
  periodNumber: 'periodNumber',
  startDate: 'startDate',
  endDate: 'endDate',
  isClosed: 'isClosed',
  closedAt: 'closedAt',
  closedById: 'closedById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JournalEntryScalarFieldEnum = {
  id: 'id',
  entryNumber: 'entryNumber',
  entryDate: 'entryDate',
  postingDate: 'postingDate',
  description: 'description',
  reference: 'reference',
  referenceType: 'referenceType',
  totalDebit: 'totalDebit',
  totalCredit: 'totalCredit',
  status: 'status',
  requiresApproval: 'requiresApproval',
  approvedById: 'approvedById',
  approvedAt: 'approvedAt',
  reversedFromId: 'reversedFromId',
  reversalReason: 'reversalReason',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JournalEntryLineScalarFieldEnum = {
  id: 'id',
  journalEntryId: 'journalEntryId',
  accountId: 'accountId',
  debitAmount: 'debitAmount',
  creditAmount: 'creditAmount',
  description: 'description',
  invoiceId: 'invoiceId',
  paymentId: 'paymentId',
  expenseId: 'expenseId',
  taxRateId: 'taxRateId',
  taxAmount: 'taxAmount',
  createdAt: 'createdAt'
};

exports.Prisma.TaxInvoiceScalarFieldEnum = {
  id: 'id',
  invoiceNumber: 'invoiceNumber',
  invoiceType: 'invoiceType',
  patientId: 'patientId',
  customerName: 'customerName',
  customerTin: 'customerTin',
  customerAddress: 'customerAddress',
  customerEmail: 'customerEmail',
  invoiceDate: 'invoiceDate',
  dueDate: 'dueDate',
  postingDate: 'postingDate',
  subtotal: 'subtotal',
  discountTotal: 'discountTotal',
  taxTotal: 'taxTotal',
  totalAmount: 'totalAmount',
  taxBreakdown: 'taxBreakdown',
  amountPaid: 'amountPaid',
  balanceDue: 'balanceDue',
  paymentStatus: 'paymentStatus',
  originalInvoiceId: 'originalInvoiceId',
  parentInvoiceId: 'parentInvoiceId',
  creditReason: 'creditReason',
  isRecurring: 'isRecurring',
  recurringFrequency: 'recurringFrequency',
  recurringEndDate: 'recurringEndDate',
  qrCode: 'qrCode',
  digitalSignature: 'digitalSignature',
  taxRateId: 'taxRateId',
  journalEntryId: 'journalEntryId',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  printedCount: 'printedCount',
  lastPrintedAt: 'lastPrintedAt'
};

exports.Prisma.InvoiceLineScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  lineNumber: 'lineNumber',
  itemType: 'itemType',
  itemId: 'itemId',
  itemCode: 'itemCode',
  itemName: 'itemName',
  description: 'description',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  discountRate: 'discountRate',
  discountAmount: 'discountAmount',
  taxRateId: 'taxRateId',
  taxAmount: 'taxAmount',
  lineTotal: 'lineTotal',
  revenueAccountId: 'revenueAccountId',
  createdAt: 'createdAt'
};

exports.Prisma.PaymentAllocationScalarFieldEnum = {
  id: 'id',
  paymentId: 'paymentId',
  invoiceId: 'invoiceId',
  amount: 'amount',
  createdAt: 'createdAt'
};

exports.Prisma.BudgetScalarFieldEnum = {
  id: 'id',
  name: 'name',
  fiscalYearId: 'fiscalYearId',
  budgetType: 'budgetType',
  isActive: 'isActive',
  description: 'description',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BudgetLineScalarFieldEnum = {
  id: 'id',
  budgetId: 'budgetId',
  accountId: 'accountId',
  month1Amount: 'month1Amount',
  month2Amount: 'month2Amount',
  month3Amount: 'month3Amount',
  month4Amount: 'month4Amount',
  month5Amount: 'month5Amount',
  month6Amount: 'month6Amount',
  month7Amount: 'month7Amount',
  month8Amount: 'month8Amount',
  month9Amount: 'month9Amount',
  month10Amount: 'month10Amount',
  month11Amount: 'month11Amount',
  month12Amount: 'month12Amount',
  totalAmount: 'totalAmount',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WardScalarFieldEnum = {
  id: 'id',
  name: 'name',
  description: 'description',
  type: 'type',
  capacity: 'capacity',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BedScalarFieldEnum = {
  id: 'id',
  wardId: 'wardId',
  bedNumber: 'bedNumber',
  type: 'type',
  features: 'features',
  status: 'status',
  ratePerDay: 'ratePerDay',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdmissionScalarFieldEnum = {
  id: 'id',
  admissionNumber: 'admissionNumber',
  patientId: 'patientId',
  visitId: 'visitId',
  wardId: 'wardId',
  bedId: 'bedId',
  admittingDoctorId: 'admittingDoctorId',
  admissionDate: 'admissionDate',
  dischargeDate: 'dischargeDate',
  status: 'status',
  type: 'type',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BillableItemScalarFieldEnum = {
  id: 'id',
  itemCode: 'itemCode',
  itemName: 'itemName',
  description: 'description',
  category: 'category',
  subCategory: 'subCategory',
  frequency: 'frequency',
  application: 'application',
  defaultQuantity: 'defaultQuantity',
  unitOfMeasure: 'unitOfMeasure',
  standardRate: 'standardRate',
  memberRate: 'memberRate',
  staffRate: 'staffRate',
  taxRateId: 'taxRateId',
  isTaxable: 'isTaxable',
  revenueAccountId: 'revenueAccountId',
  autoApplyRules: 'autoApplyRules',
  isActive: 'isActive',
  requiresAuth: 'requiresAuth',
  requiresApproval: 'requiresApproval',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InpatientChargeScalarFieldEnum = {
  id: 'id',
  chargeNumber: 'chargeNumber',
  admissionId: 'admissionId',
  billableItemId: 'billableItemId',
  chargeDate: 'chargeDate',
  chargeTime: 'chargeTime',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  discountAmount: 'discountAmount',
  taxAmount: 'taxAmount',
  totalAmount: 'totalAmount',
  generationMethod: 'generationMethod',
  sourceId: 'sourceId',
  shiftDate: 'shiftDate',
  shiftType: 'shiftType',
  nurseId: 'nurseId',
  nursingLevel: 'nursingLevel',
  sundryType: 'sundryType',
  dispensingId: 'dispensingId',
  isBilled: 'isBilled',
  invoiceId: 'invoiceId',
  notes: 'notes',
  createdById: 'createdById',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  dailyChargeSummaryId: 'dailyChargeSummaryId'
};

exports.Prisma.DailyChargeSummaryScalarFieldEnum = {
  id: 'id',
  admissionId: 'admissionId',
  chargeDate: 'chargeDate',
  dayOfStay: 'dayOfStay',
  roomBoardTotal: 'roomBoardTotal',
  nursingTotal: 'nursingTotal',
  medicalTotal: 'medicalTotal',
  medicationTotal: 'medicationTotal',
  procedureTotal: 'procedureTotal',
  labTotal: 'labTotal',
  radiologyTotal: 'radiologyTotal',
  sundryTotal: 'sundryTotal',
  otherTotal: 'otherTotal',
  subtotal: 'subtotal',
  taxTotal: 'taxTotal',
  grandTotal: 'grandTotal',
  patientTotal: 'patientTotal',
  isFinalized: 'isFinalized',
  finalizedAt: 'finalizedAt',
  finalizedById: 'finalizedById',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.InpatientDepositScalarFieldEnum = {
  id: 'id',
  depositNumber: 'depositNumber',
  admissionId: 'admissionId',
  depositDate: 'depositDate',
  amount: 'amount',
  paymentMethod: 'paymentMethod',
  receiptNumber: 'receiptNumber',
  receivedById: 'receivedById',
  notes: 'notes',
  remainingBalance: 'remainingBalance',
  isFullyApplied: 'isFullyApplied',
  createdAt: 'createdAt'
};

exports.Prisma.DepositApplicationScalarFieldEnum = {
  id: 'id',
  depositId: 'depositId',
  chargeId: 'chargeId',
  invoiceId: 'invoiceId',
  amountApplied: 'amountApplied',
  appliedAt: 'appliedAt',
  appliedById: 'appliedById'
};

exports.Prisma.FloorStockScalarFieldEnum = {
  id: 'id',
  wardId: 'wardId',
  drugId: 'drugId',
  batchNumber: 'batchNumber',
  quantityOnHand: 'quantityOnHand',
  reorderLevel: 'reorderLevel',
  maxStock: 'maxStock',
  lastCountDate: 'lastCountDate',
  lastCountBy: 'lastCountBy',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FloorStockUsageScalarFieldEnum = {
  id: 'id',
  floorStockId: 'floorStockId',
  admissionId: 'admissionId',
  quantityUsed: 'quantityUsed',
  usedAt: 'usedAt',
  usedById: 'usedById',
  chargeId: 'chargeId',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  action: 'action',
  entityType: 'entityType',
  entityId: 'entityId',
  userId: 'userId',
  changes: 'changes',
  timestamp: 'timestamp'
};

exports.Prisma.CounterScalarFieldEnum = {
  id: 'id',
  name: 'name',
  value: 'value',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.VisitType = exports.$Enums.VisitType = {
  OPD: 'OPD',
  EMERGENCY: 'EMERGENCY',
  SCHEDULED: 'SCHEDULED',
  FOLLOW_UP: 'FOLLOW_UP',
  LAB_REVIEW: 'LAB_REVIEW',
  VACCINATION: 'VACCINATION',
  ANTENATAL: 'ANTENATAL',
  OTHER: 'OTHER',
  LAB_ONLY: 'LAB_ONLY',
  RADIOLOGY_ONLY: 'RADIOLOGY_ONLY',
  PRESCRIPTION_ONLY: 'PRESCRIPTION_ONLY'
};

exports.DrugSchedule = exports.$Enums.DrugSchedule = {
  OTC: 'OTC',
  PRESCRIPTION: 'PRESCRIPTION',
  CONTROLLED: 'CONTROLLED',
  NARCOTIC: 'NARCOTIC',
  RESTRICTED: 'RESTRICTED'
};

exports.DosageForm = exports.$Enums.DosageForm = {
  TABLET: 'TABLET',
  CAPSULE: 'CAPSULE',
  SYRUP: 'SYRUP',
  SUSPENSION: 'SUSPENSION',
  INJECTION: 'INJECTION',
  IV_FLUID: 'IV_FLUID',
  CREAM: 'CREAM',
  OINTMENT: 'OINTMENT',
  GEL: 'GEL',
  DROPS: 'DROPS',
  INHALER: 'INHALER',
  SUPPOSITORY: 'SUPPOSITORY',
  PATCH: 'PATCH',
  POWDER: 'POWDER',
  OTHER: 'OTHER'
};

exports.StorageCondition = exports.$Enums.StorageCondition = {
  ROOM_TEMP: 'ROOM_TEMP',
  REFRIGERATED: 'REFRIGERATED',
  FROZEN: 'FROZEN',
  CONTROLLED: 'CONTROLLED'
};

exports.RouteOfAdministration = exports.$Enums.RouteOfAdministration = {
  ORAL: 'ORAL',
  SUBLINGUAL: 'SUBLINGUAL',
  BUCCAL: 'BUCCAL',
  RECTAL: 'RECTAL',
  TOPICAL: 'TOPICAL',
  TRANSDERMAL: 'TRANSDERMAL',
  OPHTHALMIC: 'OPHTHALMIC',
  OTIC: 'OTIC',
  NASAL: 'NASAL',
  INHALATION: 'INHALATION',
  IV: 'IV',
  IM: 'IM',
  SC: 'SC',
  INTRATHECAL: 'INTRATHECAL',
  INTRAOSSEOUS: 'INTRAOSSEOUS',
  VAGINAL: 'VAGINAL',
  URETHRAL: 'URETHRAL',
  OTHER: 'OTHER'
};

exports.PregnancyCategory = exports.$Enums.PregnancyCategory = {
  A: 'A',
  B: 'B',
  C: 'C',
  D: 'D',
  X: 'X',
  UNKNOWN: 'UNKNOWN'
};

exports.FormularyStatus = exports.$Enums.FormularyStatus = {
  FORMULARY: 'FORMULARY',
  NON_FORMULARY: 'NON_FORMULARY',
  RESTRICTED: 'RESTRICTED',
  PRIOR_AUTH_REQUIRED: 'PRIOR_AUTH_REQUIRED',
  STEP_THERAPY: 'STEP_THERAPY',
  EXCLUDED: 'EXCLUDED'
};

exports.PillShape = exports.$Enums.PillShape = {
  ROUND: 'ROUND',
  OVAL: 'OVAL',
  CAPSULE: 'CAPSULE',
  OBLONG: 'OBLONG',
  SQUARE: 'SQUARE',
  RECTANGULAR: 'RECTANGULAR',
  TRIANGLE: 'TRIANGLE',
  PENTAGON: 'PENTAGON',
  HEXAGON: 'HEXAGON',
  DIAMOND: 'DIAMOND',
  PEAR: 'PEAR',
  TEAR: 'TEAR',
  OTHER: 'OTHER'
};

exports.PillColor = exports.$Enums.PillColor = {
  WHITE: 'WHITE',
  CREAM: 'CREAM',
  YELLOW: 'YELLOW',
  ORANGE: 'ORANGE',
  RED: 'RED',
  PINK: 'PINK',
  PURPLE: 'PURPLE',
  BLUE: 'BLUE',
  GREEN: 'GREEN',
  BROWN: 'BROWN',
  BLACK: 'BLACK',
  GRAY: 'GRAY',
  CLEAR: 'CLEAR',
  MULTI_COLOR: 'MULTI_COLOR',
  OTHER: 'OTHER'
};

exports.PackType = exports.$Enums.PackType = {
  BLISTER: 'BLISTER',
  STRIP: 'STRIP',
  BOTTLE: 'BOTTLE',
  VIAL: 'VIAL',
  AMPOULE: 'AMPOULE',
  SACHET: 'SACHET',
  TUBE: 'TUBE',
  JAR: 'JAR',
  BOX: 'BOX',
  POUCH: 'POUCH',
  PREFILLED_SYRINGE: 'PREFILLED_SYRINGE',
  CARTRIDGE: 'CARTRIDGE',
  INHALER: 'INHALER',
  DROPPER: 'DROPPER',
  OTHER: 'OTHER'
};

exports.PharmacyPriceType = exports.$Enums.PharmacyPriceType = {
  REGULAR: 'REGULAR',
  MEMBER: 'MEMBER',
  STAFF: 'STAFF',
  CORPORATE: 'CORPORATE',
  WHOLESALE: 'WHOLESALE',
  PROMOTIONAL: 'PROMOTIONAL'
};

exports.InteractionSeverity = exports.$Enums.InteractionSeverity = {
  MILD: 'MILD',
  MODERATE: 'MODERATE',
  SEVERE: 'SEVERE',
  CONTRAINDICATED: 'CONTRAINDICATED'
};

exports.POStatus = exports.$Enums.POStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  CONFIRMED: 'CONFIRMED',
  PARTIAL: 'PARTIAL',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED'
};

exports.PaymentStatus = exports.$Enums.PaymentStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED'
};

exports.ReceiptStatus = exports.$Enums.ReceiptStatus = {
  DRAFT: 'DRAFT',
  COMPLETE: 'COMPLETE',
  PARTIAL: 'PARTIAL'
};

exports.DispensePriceType = exports.$Enums.DispensePriceType = {
  CASH: 'CASH',
  MEMBER: 'MEMBER',
  STAFF: 'STAFF',
  COMPLIMENTARY: 'COMPLIMENTARY'
};

exports.MovementType = exports.$Enums.MovementType = {
  PURCHASE: 'PURCHASE',
  DISPENSE: 'DISPENSE',
  RETURN: 'RETURN',
  RETURN_FROM_PATIENT: 'RETURN_FROM_PATIENT',
  ADJUSTMENT: 'ADJUSTMENT',
  TRANSFER: 'TRANSFER',
  DAMAGE: 'DAMAGE',
  EXPIRY: 'EXPIRY',
  THEFT: 'THEFT'
};

exports.PharmacyReferenceType = exports.$Enums.PharmacyReferenceType = {
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  DISPENSING: 'DISPENSING',
  ADJUSTMENT: 'ADJUSTMENT',
  STOCK_TAKE: 'STOCK_TAKE',
  RETURN: 'RETURN',
  TRANSFER: 'TRANSFER'
};

exports.AdjustmentType = exports.$Enums.AdjustmentType = {
  DAMAGE: 'DAMAGE',
  EXPIRY: 'EXPIRY',
  THEFT: 'THEFT',
  COUNT_CORRECTION: 'COUNT_CORRECTION',
  RETURN_TO_SUPPLIER: 'RETURN_TO_SUPPLIER',
  SAMPLE: 'SAMPLE'
};

exports.AdjustmentStatus = exports.$Enums.AdjustmentStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED'
};

exports.StockTakeStatus = exports.$Enums.StockTakeStatus = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  VERIFIED: 'VERIFIED',
  CANCELLED: 'CANCELLED'
};

exports.SettingValueType = exports.$Enums.SettingValueType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
  ENUM: 'ENUM'
};

exports.SettingCategory = exports.$Enums.SettingCategory = {
  CLINIC: 'CLINIC',
  LOCALE: 'LOCALE',
  MONEY: 'MONEY',
  NUMBERING: 'NUMBERING',
  VISIT: 'VISIT',
  APPOINTMENT: 'APPOINTMENT',
  PHARMACY: 'PHARMACY',
  LAB: 'LAB',
  RADIOLOGY: 'RADIOLOGY',
  BILLING: 'BILLING',
  FINANCE: 'FINANCE',
  COMMUNICATION: 'COMMUNICATION',
  SECURITY: 'SECURITY',
  LIMITS: 'LIMITS',
  INTEGRATION: 'INTEGRATION',
  ADVANCED: 'ADVANCED'
};

exports.AccountType = exports.$Enums.AccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE'
};

exports.AccountCategory = exports.$Enums.AccountCategory = {
  CURRENT_ASSET: 'CURRENT_ASSET',
  FIXED_ASSET: 'FIXED_ASSET',
  OTHER_ASSET: 'OTHER_ASSET',
  CURRENT_LIABILITY: 'CURRENT_LIABILITY',
  LONG_TERM_LIABILITY: 'LONG_TERM_LIABILITY',
  OWNERS_EQUITY: 'OWNERS_EQUITY',
  RETAINED_EARNINGS: 'RETAINED_EARNINGS',
  OPERATING_REVENUE: 'OPERATING_REVENUE',
  OTHER_REVENUE: 'OTHER_REVENUE',
  OPERATING_EXPENSE: 'OPERATING_EXPENSE',
  ADMIN_EXPENSE: 'ADMIN_EXPENSE',
  OTHER_EXPENSE: 'OTHER_EXPENSE'
};

exports.TaxType = exports.$Enums.TaxType = {
  VAT: 'VAT',
  WITHHOLDING: 'WITHHOLDING',
  SERVICE_TAX: 'SERVICE_TAX',
  LUXURY_TAX: 'LUXURY_TAX',
  NIL: 'NIL'
};

exports.PeriodType = exports.$Enums.PeriodType = {
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL'
};

exports.ReferenceType = exports.$Enums.ReferenceType = {
  INVOICE: 'INVOICE',
  PAYMENT: 'PAYMENT',
  EXPENSE: 'EXPENSE',
  PURCHASE: 'PURCHASE',
  ADJUSTMENT: 'ADJUSTMENT',
  CREDIT_NOTE: 'CREDIT_NOTE',
  DEBIT_NOTE: 'DEBIT_NOTE'
};

exports.JournalStatus = exports.$Enums.JournalStatus = {
  DRAFT: 'DRAFT',
  POSTED: 'POSTED',
  REVERSED: 'REVERSED',
  APPROVED: 'APPROVED'
};

exports.InvoiceType = exports.$Enums.InvoiceType = {
  TAX_INVOICE: 'TAX_INVOICE',
  RECEIPT: 'RECEIPT',
  PROFORMA_INVOICE: 'PROFORMA_INVOICE',
  CREDIT_NOTE: 'CREDIT_NOTE',
  DEBIT_NOTE: 'DEBIT_NOTE'
};

exports.RecurringFrequency = exports.$Enums.RecurringFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY'
};

exports.LineItemType = exports.$Enums.LineItemType = {
  SERVICE: 'SERVICE',
  PRODUCT: 'PRODUCT',
  DISCOUNT: 'DISCOUNT',
  FEE: 'FEE',
  OTHER: 'OTHER'
};

exports.BudgetType = exports.$Enums.BudgetType = {
  OPERATING: 'OPERATING',
  CAPITAL: 'CAPITAL',
  CASH: 'CASH',
  DEPARTMENTAL: 'DEPARTMENTAL'
};

exports.BillableItemCategory = exports.$Enums.BillableItemCategory = {
  ROOM_BOARD: 'ROOM_BOARD',
  NURSING_FEE: 'NURSING_FEE',
  MEDICAL_FEE: 'MEDICAL_FEE',
  PROCEDURE: 'PROCEDURE',
  MEDICATION: 'MEDICATION',
  CONSUMABLE: 'CONSUMABLE',
  LABORATORY: 'LABORATORY',
  RADIOLOGY: 'RADIOLOGY',
  THERAPY: 'THERAPY',
  SUNDRY: 'SUNDRY',
  DEPOSIT: 'DEPOSIT',
  OTHER: 'OTHER'
};

exports.ChargeFrequency = exports.$Enums.ChargeFrequency = {
  ONE_TIME: 'ONE_TIME',
  DAILY: 'DAILY',
  PER_SHIFT: 'PER_SHIFT',
  PER_SERVICE: 'PER_SERVICE',
  PER_UNIT: 'PER_UNIT',
  HOURLY: 'HOURLY'
};

exports.ChargeApplication = exports.$Enums.ChargeApplication = {
  AUTO: 'AUTO',
  MANUAL: 'MANUAL',
  ORDER_BASED: 'ORDER_BASED',
  TASK_BASED: 'TASK_BASED'
};

exports.NursingCareLevel = exports.$Enums.NursingCareLevel = {
  STANDARD: 'STANDARD',
  INTERMEDIATE: 'INTERMEDIATE',
  INTENSIVE: 'INTENSIVE',
  SPECIAL: 'SPECIAL',
  ONE_TO_ONE: 'ONE_TO_ONE'
};

exports.PaymentMethod = exports.$Enums.PaymentMethod = {
  CASH: 'CASH',
  MOBILE_MONEY: 'MOBILE_MONEY',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  PAYMENT_PLAN: 'PAYMENT_PLAN'
};

exports.Prisma.ModelName = {
  User: 'User',
  Account: 'Account',
  Session: 'Session',
  VerificationToken: 'VerificationToken',
  Role: 'Role',
  Permission: 'Permission',
  Patient: 'Patient',
  Visit: 'Visit',
  Appointment: 'Appointment',
  Diagnosis: 'Diagnosis',
  ICD11Code: 'ICD11Code',
  Prescription: 'Prescription',
  LabOrder: 'LabOrder',
  RadiologyCategory: 'RadiologyCategory',
  RadiologyCatalog: 'RadiologyCatalog',
  RadiologyResultTemplate: 'RadiologyResultTemplate',
  RadiologyOrder: 'RadiologyOrder',
  OrderWriteOff: 'OrderWriteOff',
  DrugCategory: 'DrugCategory',
  Drug: 'Drug',
  DrugBatch: 'DrugBatch',
  DrugPrice: 'DrugPrice',
  DrugPriceAudit: 'DrugPriceAudit',
  DrugInteraction: 'DrugInteraction',
  DrugDosageGuideline: 'DrugDosageGuideline',
  DrugImage: 'DrugImage',
  Supplier: 'Supplier',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderItem: 'PurchaseOrderItem',
  GoodsReceipt: 'GoodsReceipt',
  GoodsReceiptItem: 'GoodsReceiptItem',
  DispensingLog: 'DispensingLog',
  StockMovement: 'StockMovement',
  StockAdjustment: 'StockAdjustment',
  StockTake: 'StockTake',
  LabCategory: 'LabCategory',
  LabTestCatalog: 'LabTestCatalog',
  LabResultTemplate: 'LabResultTemplate',
  Invoice: 'Invoice',
  InvoiceItem: 'InvoiceItem',
  Payment: 'Payment',
  Expense: 'Expense',
  Notification: 'Notification',
  Tenant: 'Tenant',
  Branch: 'Branch',
  TenantSetting: 'TenantSetting',
  SystemSetting: 'SystemSetting',
  ChartOfAccount: 'ChartOfAccount',
  TaxRate: 'TaxRate',
  FiscalYear: 'FiscalYear',
  AccountingPeriod: 'AccountingPeriod',
  JournalEntry: 'JournalEntry',
  JournalEntryLine: 'JournalEntryLine',
  TaxInvoice: 'TaxInvoice',
  InvoiceLine: 'InvoiceLine',
  PaymentAllocation: 'PaymentAllocation',
  Budget: 'Budget',
  BudgetLine: 'BudgetLine',
  Ward: 'Ward',
  Bed: 'Bed',
  Admission: 'Admission',
  BillableItem: 'BillableItem',
  InpatientCharge: 'InpatientCharge',
  DailyChargeSummary: 'DailyChargeSummary',
  InpatientDeposit: 'InpatientDeposit',
  DepositApplication: 'DepositApplication',
  FloorStock: 'FloorStock',
  FloorStockUsage: 'FloorStockUsage',
  AuditLog: 'AuditLog',
  Counter: 'Counter'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
