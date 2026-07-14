# 🩺 Medica - Hospital Management & Virtual Consultation System

A comprehensive, secure, and user-friendly online platform for patients, doctors, and hospital administrators. The system streamlines healthcare services by offering virtual video/voice consultations, real-time messaging, flexible doctor scheduling, electronic prescription generation, and a secure payment escrow system.

---

## 🌐 Live Demo & Code

- **Backend API**: [https://medica-server.onrender.com](https://medica-server.onrender.com)
- **Frontend**: [https://medica-health.vercel.app](https://medica-health.vercel.app)
- **GitHub Code**: [https://github.com/modasser-nayem/medica-server](https://github.com/modasser-nayem/medica-server)

---

## 📑 Table of Contents

- [Documentation](#-documentation)
- [Key Business Logic & Features](#-key-business-logic--features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Roles & Permissions](#-roles--permissions)
- [Setup & Installation](#%EF%B8%8F-setup--installation)
- [Scripts](#-scripts)
- [License](#-license)
- [Author](#-author)

---

## 📄 Documentation

- **[📘 BRD - Business Requirements Document](https://docs.google.com/document/d/1qOPBECxxBG9FVJI80gdx-XQNFt4Nwas0No2TyJDiCEY/edit?usp=sharing)**
- **[📙 SRS - Software Requirements Specification](https://docs.google.com/document/d/1i1aUojf82BIOXUkFl_OiKNUviKq0UKajvnPdoR4v6uY/edit?usp=sharing)**
- **[📬 Postman API Collection File](./medica.postman_collection.json)**
- **[🔌 WebSockets Socket.io Documentation](./socket_docs.md)**

---

## 🚀 Key Business Logic & Features

### 💳 Stripe Payment Escrow System

- **Escrow Mechanism**: When a patient books an appointment, the payment is captured via Stripe Checkout and kept in the platform's escrow ledger (`DoctorPayout` starts in `PENDING` state).
- **Payout Release**: The payment is automatically transferred to the doctor's Stripe Connect Account only after the consultation has been marked as `COMPLETED` by ending the call.
- **Cancellation Locks**:
  - Patients cannot cancel appointments that have already started.
  - If a patient cancels _before_ the start time, a full refund is automatically issued and the doctor's payout ledger is `VOIDED`.
- **Doctor No-Show**: Admins can mark an ended slot where no call occurred as a no-show. The system automatically voids the payout and refunds the patient's card.

### 📅 Advanced Doctor Slots & Exceptions

- **Flexible Schedules**: Doctors can set up to 7 active recurring daily schedules (one per weekday).
- **Exceptions Management**: Doctors can declare override exception dates (e.g., closed/vacation days, custom hours, or specific blocked time slots).
- **Past Slot Filtering**: Availability lists automatically filter out past time slots on the current day to prevent retro-active bookings.
- **Double Booking Protection**: Core unique constraints protect against overlapping doctor bookings.

### 📞 Agora WebRTC Calls & Real-time Chat

- **Agora RTC Integration**: High-quality voice and video calling channels. Temporary access tokens are generated dynamically for authorized peers.
- **Time-Gated Messaging**: Users can send messages and attachments only during their active booked appointment time slots.

---

## 🛠️ Tech Stack

| Layer            | Technology                |
| ---------------- | ------------------------- |
| Language         | TypeScript                |
| Frameworks       | Node.js, Express.js       |
| Databases        | PostgreSQL                |
| Real-time Socket | Socket.io                 |
| ORM              | Prisma                    |
| Media Delivery   | Agora WebRTC, Cloudinary  |
| Validation       | Zod                       |
| CI/CD            | GitHub Actions            |
| Containerization | Docker, Docker Compose    |
| Payments         | Stripe Checkout & Connect |
| Testing          | Jest, Supertest           |

---

## 🧱 Architecture Overview

The backend follows a layered, modular architecture:

- **Clean Code Structure**: Separated into components (`controllers`, `services`, `routes`, `validations`, `interfaces`).
- **DTO Validation**: Zod-based schemas validate incoming payloads before hitting controllers.
- **Role-Based Middlewares**: Permissions are declared at route levels using helper middlewares.
- **Global Error Handler**: Translates operational errors into neat client-facing JSON objects.

---

## 👥 Roles & Permissions

| Role        | Capabilities                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PATIENT** | Browse doctors & departments, view availability slots, book appointments, initiate call, chat during active appointments, view own payment history. |
| **DOCTOR**  | Set recurring schedules, create calendar exceptions, update profile (specialties, fee, timezone), join/end calls, view own payout balances.         |
| **ADMIN**   | Manage departments, view all global payments and payouts ledger, mark manual payouts as paid, process doctor no-show refunds, toggle user statuses. |

---

## ⚙️ Setup & Installation

### 1. Clone & Install

```bash
git clone https://github.com/modasser-nayem/medica-server.git
cd medica-server
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill out variables:

```bash
cp .env.example .env
```

Ensure key properties like `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SMTP_HOST_EMAIL`, and `SMTP_APP_PASS` are defined.

### 3. Migrate Database & Start

```bash
# Push migration schemas
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate

# Run in Development mode
npm run dev
```

---

## 🧪 Scripts

```bash
# Run in development mode
npm run dev

# Build for production
npm run build

# Run in production mode
npm start

# Run typescript compilation checks
npm run ts:check
```

---

## 🪪 License

This project is licensed under the MIT License.

---

## 📣 Author

#### Ali Modasser Nayem

🔗 [Portfolio](https://alimodassernayem.vercel.app/) | [GitHub](https://github.com/modasser-nayem) | [LinkedIn](https://www.linkedin.com/in/alimodassernayem/)

Email: [modassernayem@gmail.com](mailto:modassernayem@gmail.com)
