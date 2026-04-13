# Topwork App Sitemap

## Current Implementation Status

### Dashboard (/)

**Path:** `/dashboard/`
**Component:** `Dashboard.tsx`
**Status:** ✅ Implemented

**Features:**

- Your jobs section with job cards displaying:
  - Job title
  - Posted time
  - Number of proposals
  - Job status badges
- Your hires section with freelancer cards showing:
  - Freelancer avatar and name (selectors: `.freelancer-card`, `.avatar`)
  - Title and location
  - Hourly rate and earnings
  - Rating
  - Top 3 skills as tags
  - "Available for rehire" button when applicable
- Review project goals section with expert consultation cards
- Get Started CTA section

**Interactions:**

- Click freelancer card to navigate to profile
- Hover effects on cards
- Active states for buttons

### Freelancer Profile (/freelancer/)

**Path:** `/freelancer/?id={freelancerId}`
**Component:** `FreelancerProfile.tsx`
**Status:** ✅ Implemented

**Features:**

- Left sidebar with:
  - Large avatar
  - Name and location
  - Action buttons (Hire `.hire-btn`, Message `.message-btn`, Share `.share-btn`)
  - Stats grid (earnings, jobs, hours)
  - Hourly rate and rating
  - Availability status
- Main content area with:
  - Professional title and description
  - Skills section with clickable tags
  - Employment history with expandable job details
  - Education section (when applicable)
- Modal overlay for job details (`.modal-overlay`, `.modal`)

**Interactions:**

- Click employment items to view detailed modal
- Hire button navigates to offer page
- Message button navigates to messages
- Modal close button

### Send Offer (/platform/offer/)

**Path:** `/platform/offer/?id={freelancerId}`
**Component:** `SendOffer.tsx`
**Status:** ✅ Implemented

**Features:**

- Freelancer summary card
- Form sections:
  - Job selection dropdown
  - Contract title input
  - Hiring team dropdown (defaulted to "Shaun VanWeldeen")
  - Contract terms radio buttons (hourly/fixed)
  - Payment configuration:
    - Hourly: rate input and weekly limit
    - Fixed: price input and optional automatic weekly payments
  - Work description textarea
  - Attach file link
- FAQ section with collapsible items
- Cancel/Continue buttons (`.cancel-btn`, `.continue-btn`)

**Interactions:**

- Radio button selection changes payment form
- Checkbox toggles automatic payment field
- Continue button creates contract and navigates to messages

### Messages (/messages/)

**Path:** `/messages/?id={freelancerId}`
**Component:** `Messages.tsx`
**Status:** ✅ Implemented

**Features:**

- Left sidebar:
  - Search input
  - Conversation list with last message preview
  - Active conversation highlighted in green
- Main chat area:
  - Chat header with freelancer info
  - Message list with sent/received styling
  - Contract notification cards with "View details" button
  - Message input with formatting toolbar
- Right sidebar:
  - Freelancer details
  - Active contract info
  - Skills list

**Interactions:**

- Click conversation to select
- View details button navigates to offer sent page
- Message input area (non-functional)

### Offer Sent (/offer/sent/)

**Path:** `/offer/sent/?id={contractId}`
**Component:** `OfferSent.tsx`
**Status:** ✅ Implemented

**Features:**

- Success header with checkmark icon
- Contract details table:
  - Freelancer name
  - Contract type
  - Payment details
  - Hiring team
  - Work description
- "See full offer" expandable section (`.see-full-offer`)
- FAQ section with expandable items (`.faq-question`)
- Right sidebar:
  - Next steps card with chat button (`.chat-btn`)
  - Freelancer summary card
  - Help links

**Interactions:**

- See full offer toggle
- FAQ accordion functionality
- Chat button navigates to messages

## Navigation Flow

1. **Dashboard** → Click freelancer card → **Freelancer Profile**
2. **Freelancer Profile** → Click Hire → **Send Offer**
3. **Send Offer** → Click Continue → **Messages** (with contract notification)
4. **Messages** → Click View details → **Offer Sent**
5. **Offer Sent** → Click logo → **Dashboard**

## Key Selectors for Testing

- Navigation: `.logo`, `.nav-link`, `.post-job-btn`
- Cards: `.freelancer-card`, `.job-card`, `.expert-card`
- Buttons: `.hire-btn`, `.message-btn`, `.rehire-btn`, `.continue-btn`, `.cancel-btn`
- Forms: `input[type="radio"]`, `input[type="checkbox"]`, `textarea`, `select`
- Modals: `.modal-overlay`, `.modal`, `.close-btn`
- Messages: `.conversation-item`, `.message`, `.contract-notice`
- FAQ: `.faq-question`, `.faq-answer`

## Scenarios

### Default Scenario

- Shows dashboard with sample freelancers and jobs
- Allows full navigation flow

### Hiring Flow Scenario

- Pre-populated with an existing contract
- Shows message history
- Demonstrates offer sent state

## Not Implemented

- User authentication
- Real data persistence
- Actual messaging functionality
- File uploads
- Payment processing
- Search functionality
- Notifications
- Footer links
