TripSplit: System Design & Architecture Document

1. Executive Summary

TripSplit is a collaborative expense tracking application designed for groups. It solves the problem of "who owes whom" by tracking shared expenses (Major and Daily) and calculating the most efficient settlement transactions. The system utilizes a serverless architecture (Firebase) for real-time synchronization and Gemini AI for automated data entry.

2. High-Level Architecture

2.1 Tech Stack

Frontend: React.js (Single Page Application).

State Management: React Hooks (useReducer recommended for complex state) + Context API.

Backend / Database: Google Firestore (NoSQL Document Store).

Authentication: Firebase Anonymous Auth + Upgrade to Email/Google Auth.

AI Service: Gemini 2.5 Flash (Multimodal vision for receipt scanning).

2.2 Data Flow Diagram

graph TD
    User[User Client] <-->|Real-time Sync| Firestore[Firestore DB]
    User -->|Upload Image| Gemini[Gemini AI]
    Gemini -->|JSON Data| User
    User -->|Auth Token| FBAuth[Firebase Auth]
    Firestore -->|Rules Check| Security[Security Rules]


3. Data Model (Schema Design)

The core weakness of simple expense apps is using "Names" (strings) as identifiers. A strong architecture uses UIDs (Unique Identifiers).

3.1 Collection: trips

Stores metadata about the trip and the roster of members.

Path: /artifacts/{appId}/public/data/trips/{tripId}

{
  "code": "GOA2024",           // Unique, user-friendly join code (Indexed)
  "name": "Goa Trip 2024",
  "createdAt": 1715620000000,
  "createdBy": "auth_uid_1",
  "status": "active",          // active, archived
  "currency": "INR",
  
  // MEMBER MAPPING (Crucial for Architecture)
  // Maps Authentication UIDs to Trip Display Names
  "members": {
    "auth_uid_1": { 
      "displayName": "Rahul", 
      "role": "admin",
      "joinedAt": 1715620000000 
    },
    "auth_uid_2": { 
      "displayName": "Amit", 
      "role": "member",
      "joinedAt": 1715620500000 
    }
  },
  
  // For quick UI rendering without fetching sub-collections
  "memberNames": ["Rahul", "Amit"] 
}


3.2 Collection: expenses

Stores the ledger. We separate this from the trip document to allow scaling to thousands of expenses without hitting document size limits.

Path: /artifacts/{appId}/public/data/trip_expenses/{expenseId}

{
  "tripId": "GOA2024",         // Foreign Key to Trip (Indexed)
  "description": "Flight Tickets",
  "amount": 15000,
  "currency": "INR",
  "category": "travel",        // travel, food, stay, fun, other
  "type": "major",             // major, daily (For UI filtering)
  
  "date": "2024-05-20",
  "createdAt": 1715620000000,
  "createdBy": "auth_uid_1",   // Who physically added the entry
  
  // PAYER INFO
  "paidBy": "auth_uid_1",      // The source of funds
  
  // SPLIT LOGIC (The Mathematical Core)
  "splitType": "exact",        // equal, exact, percent, shares
  "splitDetails": {
    "auth_uid_1": 7500,
    "auth_uid_2": 7500
  },
  
  // Receipt Evidence
  "receiptUrl": "https://storage....", // Optional
  "isVerified": true
}


4. Core Algorithms

4.1 Debt Simplification (The "Settle Up" Logic)

The naive approach creates $N(N-1)$ transactions. We use a Min-Cash-Flow Algorithm to minimize transfers.

Logic Flow:

Calculate Net Balance for every user: (Total Paid) - (Total Consumed).

Separate users into Debtors (Negative Balance) and Creditors (Positive Balance).

Sort both lists by magnitude.

Greedy Match: Take the largest Debtor and largest Creditor.

Match the minimum of abs(Debtor.balance) and Creditor.balance.

Create a transaction.

Update remaining balances.

Repeat until all balances are ~0.

4.2 Segregated Settlements

To handle your request for "Daily vs Major" settlements, the architecture calculates balances on a filtered subset of the expenses collection.

Global Balance: Sum(All Expenses)

Daily Balance: Sum(Expenses where type == 'daily')

Major Balance: Sum(Expenses where type == 'major')

5. Security Architecture (Firestore Rules)

Since the app is multi-user, we cannot trust the client blindly.

Read Access: A user can only read a Trip and its Expenses if their auth.uid is present in the trip.members map.

Write Access:

Create Trip: Any authenticated user.

Join Trip: Requires valid Trip Code.

Add Expense: User must be a member of the linked tripId.

Edit/Delete Expense: Only the creator of the expense OR the Trip Admin.

6. Scalability & Performance

6.1 Indexes

To ensure fast loading as the list grows, we require Composite Indexes in Firestore:

trip_expenses: tripId (Asc) + createdAt (Desc)

Purpose: Quickly load expenses for a specific trip, showing newest first.

trips: code (Asc)

Purpose: Fast lookup when joining via code.

6.2 Offline Support

We utilize Firebase's built-in enableIndexedDbPersistence.

Behavior: If the user loses internet in the mountains (common on trips), they can still add expenses.

Sync: When connectivity returns, the queue flushes to the server automatically.

7. Future Enhancements

Push Notifications: Notify users when "Rahul added a bill for ₹500".

Currency Conversion: Store base currency in Trip, convert foreign expenses on entry using an API.

Activity Log: A separate collection tracking "Who changed what" for auditing (e.g., "Amit changed Flight cost from 12k to 15k").