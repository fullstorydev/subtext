import { AppState } from "./types";

export const scenarios: Record<string, Partial<AppState>> = {
  default: {
    patient: {
      id: "pat-001",
      firstName: "Margaret",
      lastName: "Whitfield",
      email: "margaret.whitfield@gmail.com",
      phone: "(404) 555-0173",
      dateOfBirth: "1983-07-14",
      ssn: "***-**-4829",
      insuranceId: "BCBS-GA-8834201",
      insuranceProvider: "Blue Cross Blue Shield of Georgia",
    },
    addresses: [
      {
        id: "addr-1",
        label: "Home",
        recipientName: "Margaret Whitfield",
        recipientPhone: "(404) 555-0173",
        street: "1247 Peachtree Battle Ave NW",
        apt: "Unit 4B",
        city: "Atlanta",
        state: "GA",
        zip: "30327",
        isDefault: true,
      },
      {
        id: "addr-2",
        label: "Work",
        recipientName: "Margaret Whitfield",
        recipientPhone: "(404) 555-0291",
        street: "3500 Lenox Rd NE",
        apt: "Suite 1200",
        city: "Atlanta",
        state: "GA",
        zip: "30326",
        isDefault: false,
      },
      {
        id: "addr-3",
        label: "Mom's House",
        recipientName: "Dorothy Whitfield",
        recipientPhone: "(706) 555-0842",
        street: "89 Magnolia Springs Dr",
        city: "Athens",
        state: "GA",
        zip: "30606",
        isDefault: false,
      },
      {
        id: "addr-4",
        label: "Sister",
        recipientName: "Jennifer Whitfield-Park",
        recipientPhone: "(678) 555-0394",
        street: "2201 Riverside Pkwy",
        apt: "Apt 302",
        city: "Lawrenceville",
        state: "GA",
        zip: "30043",
        isDefault: false,
      },
    ],
    orders: [
      {
        id: "ORD-20240215-7841",
        date: "2024-02-15",
        items: [
          { name: "Metformin 500mg (90ct)", quantity: 1, price: 12.99 },
          {
            name: "Blood Glucose Test Strips (100ct)",
            quantity: 2,
            price: 34.5,
          },
          { name: "Digital Thermometer", quantity: 1, price: 8.99 },
        ],
        shippingAddress: {
          id: "addr-1",
          label: "Home",
          recipientName: "Margaret Whitfield",
          recipientPhone: "(404) 555-0173",
          street: "1247 Peachtree Battle Ave NW",
          apt: "Unit 4B",
          city: "Atlanta",
          state: "GA",
          zip: "30327",
          isDefault: true,
        },
        status: "delivered",
        total: 90.98,
        trackingNumber: "1Z999AA10123456784",
      },
      {
        id: "ORD-20240301-2156",
        date: "2024-03-01",
        items: [
          { name: "Lisinopril 10mg (30ct)", quantity: 1, price: 9.99 },
          { name: "Compression Socks (3-pack)", quantity: 1, price: 24.99 },
        ],
        shippingAddress: {
          id: "addr-3",
          label: "Mom's House",
          recipientName: "Dorothy Whitfield",
          recipientPhone: "(706) 555-0842",
          street: "89 Magnolia Springs Dr",
          city: "Athens",
          state: "GA",
          zip: "30606",
          isDefault: false,
        },
        status: "delivered",
        total: 34.98,
        trackingNumber: "1Z999AA10123456785",
      },
      {
        id: "ORD-20240312-9903",
        date: "2024-03-12",
        items: [
          { name: "Atorvastatin 20mg (90ct)", quantity: 1, price: 15.99 },
          {
            name: "Omeprazole 20mg (42ct)",
            quantity: 1,
            price: 18.49,
          },
          { name: "Vitamin D3 5000IU (120ct)", quantity: 1, price: 11.99 },
          { name: "Blood Pressure Monitor (Omron)", quantity: 1, price: 49.99 },
        ],
        shippingAddress: {
          id: "addr-1",
          label: "Home",
          recipientName: "Margaret Whitfield",
          recipientPhone: "(404) 555-0173",
          street: "1247 Peachtree Battle Ave NW",
          apt: "Unit 4B",
          city: "Atlanta",
          state: "GA",
          zip: "30327",
          isDefault: true,
        },
        status: "shipped",
        total: 96.46,
        trackingNumber: "1Z999AA10123456786",
      },
      {
        id: "ORD-20240318-1147",
        date: "2024-03-18",
        items: [{ name: "Amlodipine 5mg (30ct)", quantity: 1, price: 7.99 }],
        shippingAddress: {
          id: "addr-4",
          label: "Sister",
          recipientName: "Jennifer Whitfield-Park",
          recipientPhone: "(678) 555-0394",
          street: "2201 Riverside Pkwy",
          apt: "Apt 302",
          city: "Lawrenceville",
          state: "GA",
          zip: "30043",
          isDefault: false,
        },
        status: "processing",
        total: 7.99,
      },
    ],
    paymentMethods: [
      {
        id: "pm-1",
        type: "visa",
        cardNumber: "4532 •••• •••• 8921",
        expiry: "09/26",
        cardholderName: "MARGARET A WHITFIELD",
        isDefault: true,
      },
      {
        id: "pm-2",
        type: "mastercard",
        cardNumber: "5412 •••• •••• 3347",
        expiry: "03/25",
        cardholderName: "MARGARET WHITFIELD",
        isDefault: false,
      },
      {
        id: "pm-3",
        type: "amex",
        cardNumber: "3782 •••••• 01005",
        expiry: "12/27",
        cardholderName: "MARGARET A WHITFIELD",
        isDefault: false,
      },
    ],
    medicalRecords: [
      {
        id: "rec-1",
        date: "2024-01-15",
        provider: "Dr. Rajesh Patel, MD",
        providerNPI: "1234567890",
        facility: "Emory Healthcare - Midtown",
        diagnosis: "Type 2 Diabetes Mellitus, without complications",
        diagnosisCode: "E11.9",
        medications: [
          "Metformin 500mg twice daily",
          "Glipizide 5mg once daily",
        ],
        notes:
          "Patient Margaret Whitfield (DOB: 07/14/1983, SSN ending 4829) presents for quarterly diabetes management. HbA1c improved to 7.1% from 7.8%. Continue current medication regimen. Recommend dietary counseling. Follow-up in 3 months. Insurance: BCBS-GA-8834201.",
      },
      {
        id: "rec-2",
        date: "2024-02-02",
        provider: "Dr. Sarah Chen, MD",
        providerNPI: "9876543210",
        facility: "Piedmont Heart Institute",
        diagnosis: "Essential (primary) hypertension",
        diagnosisCode: "I10",
        medications: [
          "Lisinopril 10mg once daily",
          "Amlodipine 5mg once daily",
        ],
        notes:
          "Blood pressure 142/88 at visit, improved from 158/95. Patient reports compliance with medication. Added Amlodipine to regimen. Discussed sodium reduction. Patient's phone: (404) 555-0173. Emergency contact: Dorothy Whitfield (706) 555-0842.",
      },
      {
        id: "rec-3",
        date: "2024-02-20",
        provider: "Dr. Michael Torres, DO",
        providerNPI: "5678901234",
        facility: "Atlanta Gastroenterology Associates",
        diagnosis: "Gastro-esophageal reflux disease without esophagitis",
        diagnosisCode: "K21.0",
        medications: ["Omeprazole 20mg once daily before breakfast"],
        notes:
          "Patient referred by Dr. Patel for persistent GERD symptoms. Upper endoscopy scheduled for 03/15/2024. Pre-authorization submitted to Blue Cross Blue Shield, policy BCBS-GA-8834201. Patient advised to avoid trigger foods. Contact patient at margaret.whitfield@gmail.com for scheduling.",
      },
      {
        id: "rec-4",
        date: "2024-03-01",
        provider: "Dr. Lisa Okafor, PharmD",
        providerNPI: "3456789012",
        facility: "Emory Healthcare - Pharmacy Services",
        diagnosis: "Hyperlipidemia, unspecified",
        diagnosisCode: "E78.5",
        medications: [
          "Atorvastatin 20mg once daily at bedtime",
          "Fish Oil 1000mg twice daily",
        ],
        notes:
          "Medication therapy management session. Reviewed all current medications for Margaret Whitfield. Total active prescriptions: 6. Identified potential interaction between Atorvastatin and Omeprazole — risk is low, monitor. Billing to BCBS-GA-8834201, member ID verified. Next refill dates: Metformin 03/15, Lisinopril 03/02, Atorvastatin 03/28.",
      },
      {
        id: "rec-5",
        date: "2024-03-10",
        provider: "Dr. Angela Freeman, PsyD",
        providerNPI: "7890123456",
        facility: "Grady Health System - Behavioral Health",
        diagnosis: "Generalized anxiety disorder",
        diagnosisCode: "F41.1",
        medications: [],
        notes:
          "Initial intake session. Patient reports increased anxiety related to managing multiple chronic conditions. PHQ-9 score: 8 (mild). GAD-7 score: 12 (moderate). Discussed CBT approach. Patient lives at 1247 Peachtree Battle Ave NW, Atlanta GA 30327. Recommend weekly sessions. Will coordinate with Dr. Patel re: any medication considerations.",
      },
    ],
    chatThreads: [
      {
        id: "chat-1",
        subject: "Prescription Refill Issue - Metformin",
        status: "resolved",
        messages: [
          {
            id: "cm-1",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content:
              "Hi, I'm trying to refill my Metformin 500mg prescription (Rx# 7742901) but the system says it's too early. My doctor Dr. Patel said I should be able to get a 90-day supply. My insurance is Blue Cross Blue Shield, policy BCBS-GA-8834201.",
          },
          {
            id: "cm-2",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "Carlos Rivera",
            content:
              "Hello Margaret! I can help you with that. I can see your account and the prescription Rx# 7742901 for Metformin 500mg. Let me check with your insurance. Can you confirm your date of birth for verification?",
          },
          {
            id: "cm-3",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000 + 18 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content: "Sure, it's July 14, 1983.",
          },
          {
            id: "cm-4",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000 + 25 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "Carlos Rivera",
            content:
              "Thank you, Margaret. I've verified your identity. I see the issue — your insurance requires a prior authorization for 90-day supplies. I've submitted the PA request to BCBS under your policy BCBS-GA-8834201. In the meantime, I've processed a 30-day bridge supply that will ship to your home address at 1247 Peachtree Battle Ave NW, Atlanta GA 30327. You should receive it within 2-3 business days.",
          },
          {
            id: "cm-5",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000 + 28 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content:
              "Thank you so much! Can you charge it to my Visa ending in 8921?",
          },
          {
            id: "cm-6",
            timestamp: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000 + 32 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "Carlos Rivera",
            content:
              "Done! I've charged $12.99 to your Visa ending in 8921. Your order number is ORD-20240215-7841. Is there anything else I can help with?",
          },
        ],
      },
      {
        id: "chat-2",
        subject: "Shipping Address Change for Order",
        status: "resolved",
        messages: [
          {
            id: "cm-7",
            timestamp: new Date(
              Date.now() - 3 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content:
              "I just placed order ORD-20240318-1147 but I need it shipped to my sister's address instead. Her name is Jennifer Whitfield-Park at 2201 Riverside Pkwy, Apt 302, Lawrenceville GA 30043. Her phone is (678) 555-0394.",
          },
          {
            id: "cm-8",
            timestamp: new Date(
              Date.now() - 3 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "Priya Sharma",
            content:
              "Hi Margaret! I've updated the shipping address for order ORD-20240318-1147 to Jennifer Whitfield-Park at 2201 Riverside Pkwy, Apt 302, Lawrenceville GA 30043. The package containing Amlodipine 5mg will be delivered there. Is that correct?",
          },
          {
            id: "cm-9",
            timestamp: new Date(
              Date.now() - 3 * 24 * 60 * 60 * 1000 + 12 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content: "Perfect, thank you!",
          },
        ],
      },
      {
        id: "chat-3",
        subject: "Question About Medical Records Access",
        status: "open",
        messages: [
          {
            id: "cm-10",
            timestamp: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content:
              "Hi, my mother Dorothy Whitfield needs access to my medical records for an upcoming appointment at Athens Regional. Her phone is (706) 555-0842 and she's listed as my emergency contact. Can you help set up authorized access? My account email is margaret.whitfield@gmail.com and my member ID is BCBS-GA-8834201.",
          },
          {
            id: "cm-11",
            timestamp: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "David Kim",
            content:
              "Hello Margaret! I'd be happy to help set up authorized access for Dorothy Whitfield. For HIPAA compliance, I'll need to verify a few things. I can see your account — can you confirm the last 4 digits of your SSN?",
          },
          {
            id: "cm-12",
            timestamp: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000 + 23 * 60 * 1000,
            ).toISOString(),
            sender: "patient",
            senderName: "Margaret Whitfield",
            content: "Yes, it's 4829.",
          },
          {
            id: "cm-13",
            timestamp: new Date(
              Date.now() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000,
            ).toISOString(),
            sender: "agent",
            senderName: "David Kim",
            content:
              "Verified. I'm sending an authorization form to margaret.whitfield@gmail.com. Once you sign it electronically, Dorothy Whitfield will have read-only access to your records at Emory Healthcare and Piedmont Heart Institute. She'll be able to view visit summaries, medications, and lab results but won't be able to modify anything. The form will require her contact info — you mentioned (706) 555-0842 — and a photo ID.",
          },
        ],
      },
    ],
  },
};
