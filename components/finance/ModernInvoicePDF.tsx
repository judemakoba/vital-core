import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Svg, Path, Font } from '@react-pdf/renderer';

// Register a modern font
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff2', fontWeight: 700 },
  ],
});

const styles = StyleSheet.create({
  page: {
    padding: 0,
    fontFamily: 'Inter',
    fontSize: 10,
    color: '#1a1a1a',
    backgroundColor: '#ffffff',
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: 180,
  },
  container: {
    padding: 40,
    position: 'relative',
  },
  logoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 'auto',
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: '#0047AB',
    textAlign: 'right',
  },
  invoiceMeta: {
    textAlign: 'right',
    marginTop: 5,
    color: '#666',
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  infoBox: {
    width: '45%',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 5,
    color: '#333',
  },
  infoText: {
    fontSize: 9,
    lineHeight: 1.4,
    color: '#555',
  },
  table: {
    marginTop: 20,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    padding: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0047AB',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  colDesc: { flex: 4 },
  colQty: { flex: 1, textAlign: 'center' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTotal: { flex: 1.5, textAlign: 'right' },
  headerLabel: {
    fontWeight: 700,
    fontSize: 9,
    color: '#0047AB',
    textTransform: 'uppercase',
  },
  summarySection: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  summaryBox: {
    width: 200,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryLabel: {
    color: '#666',
  },
  summaryValue: {
    fontWeight: 700,
  },
  grandTotal: {
    borderTopWidth: 2,
    borderTopColor: '#0047AB',
    marginTop: 10,
    paddingTop: 10,
  },
  totalText: {
    fontSize: 14,
    fontWeight: 700,
    color: '#0047AB',
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 20,
  },
  termsTitle: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 5,
  },
  termsText: {
    fontSize: 8,
    color: '#888',
    lineHeight: 1.4,
  },
  authSection: {
    marginTop: 20,
    padding: 10,
    backgroundColor: '#fff9e6',
    borderRadius: 5,
  },
  authTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: '#856404',
    marginBottom: 5,
  }
});

interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface ModernInvoiceProps {
  clinicInfo: {
    name: string;
    address: string;
    phone: string;
    logoUrl?: string;
    terms?: string;
  };
  invoice: {
    invoiceNumber: string;
    createdAt: Date;
    totalAmount: number;
    balanceDue: number;
    items: InvoiceItem[];
  };
  patient: {
    firstName: string;
    lastName: string;
    patientNumber: string;
    dob?: Date;
    gender?: string;
  };
  visit?: {
    visitNumber: string;
    date: Date;
    chiefComplaint?: string;
  };
  authorizations?: Array<{
    requestNumber: string;
    authorizationCode?: string;
    authorizedAmount?: number;
  }>;
}

const ModernInvoicePDF: React.FC<ModernInvoiceProps> = ({ 
  clinicInfo, 
  invoice, 
  patient, 
  visit, 
  authorizations 
}) => (
  <Document>
    <Page size="A4" style={styles.page}>
      {/* Decorative Wave Header */}
      <View style={styles.headerBackground}>
        <Svg width="100%" height="180">
          <Path
            d="M0,0 L600,0 L600,120 C450,180 150,80 0,140 Z"
            fill="#eef2ff"
          />
          <Path
            d="M0,0 L600,0 L600,100 C400,160 200,60 0,120 Z"
            fill="#e0e7ff"
          />
        </Svg>
      </View>

      <View style={styles.container}>
        {/* Header Section */}
        <View style={styles.logoContainer}>
          <View>
            {clinicInfo.logoUrl ? (
              <Image src={clinicInfo.logoUrl} style={styles.logo} />
            ) : (
              <Text style={[styles.invoiceTitle, { textAlign: 'left' }]}>{clinicInfo.name}</Text>
            )}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <View style={styles.invoiceMeta}>
              <Text>Number: {invoice.invoiceNumber}</Text>
              <Text>Date: {new Date(invoice.createdAt).toLocaleDateString()}</Text>
            </View>
          </View>
        </View>

        {/* Info Grid */}
        <View style={styles.infoSection}>
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>Clinic Info:</Text>
            <Text style={styles.infoText}>{clinicInfo.name}</Text>
            <Text style={styles.infoText}>{clinicInfo.address}</Text>
            <Text style={styles.infoText}>Tel: {clinicInfo.phone}</Text>
          </View>
          <View style={styles.infoBox}>
            <Text style={[styles.infoLabel, { textAlign: 'right' }]}>Billing To:</Text>
            <Text style={[styles.infoText, { textAlign: 'right', fontWeight: 700 }]}>
              {patient.firstName} {patient.lastName}
            </Text>
            <Text style={[styles.infoText, { textAlign: 'right' }]}>ID: {patient.patientNumber}</Text>
            {visit && (
              <>
                <Text style={[styles.infoText, { textAlign: 'right' }]}>Visit #: {visit.visitNumber}</Text>
                <Text style={[styles.infoText, { textAlign: 'right' }]}>Visit Date: {new Date(visit.date).toLocaleDateString()}</Text>
              </>
            )}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <View style={styles.colDesc}><Text style={styles.headerLabel}>Service Description</Text></View>
            <View style={styles.colQty}><Text style={styles.headerLabel}>Qty</Text></View>
            <View style={styles.colPrice}><Text style={styles.headerLabel}>Price</Text></View>
            <View style={styles.colTotal}><Text style={styles.headerLabel}>Total</Text></View>
          </View>
          {invoice.items.map((item, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={styles.colDesc}><Text>{item.description}</Text></View>
              <View style={styles.colQty}><Text>{item.quantity}</Text></View>
              <View style={styles.colPrice}><Text>{item.unitPrice.toLocaleString()}</Text></View>
              <View style={styles.colTotal}><Text style={{ fontWeight: 700 }}>{item.totalPrice.toLocaleString()}</Text></View>
            </View>
          ))}
        </View>

        {/* Pre-authorizations if any */}
        {authorizations && authorizations.length > 0 && (
          <View style={styles.authSection}>
            <Text style={styles.authTitle}>Associated Pre-authorizations:</Text>
            {authorizations.map((auth, idx) => (
              <Text key={idx} style={{ fontSize: 8 }}>
                - {auth.requestNumber} {auth.authorizationCode ? `(Approved: ${auth.authorizationCode})` : '(Pending/Requested)'}
              </Text>
            ))}
          </View>
        )}

        {/* Summary Details */}
        <View style={styles.summarySection}>
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal:</Text>
              <Text style={styles.summaryValue}>UGX {invoice.totalAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (0%):</Text>
              <Text style={styles.summaryValue}>UGX 0</Text>
            </View>
            <View style={[styles.summaryRow, styles.grandTotal]}>
              <Text style={styles.totalText}>TOTAL DUE:</Text>
              <Text style={styles.totalText}>UGX {invoice.totalAmount.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Footer / Terms */}
        <View style={styles.footer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            {/* Minimalist medical cross icon matching Medix design */}
            <Svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: 10 }}>
               <Path d="M19 11h-6V5a1 1 0 0 0-2 0v6H5a1 1 0 0 0 0 2h6v6a1 1 0 0 0 2 0v-6h6a1 1 0 0 0 0-2z" fill="#0047AB" />
            </Svg>
            <Text style={{ fontSize: 14, fontWeight: 700, color: '#0047AB' }}>VitalCore Healthcare</Text>
          </View>
          <Text style={styles.termsTitle}>Terms & Conditions:</Text>
          <Text style={styles.termsText}>
            {clinicInfo.terms || "Thank you for choosing VitalCore. Payment is due within the stipulated period. Please keep this invoice for your medical records and insurance claims."}
          </Text>
        </View>
      </View>
    </Page>
  </Document>
);

export default ModernInvoicePDF;
