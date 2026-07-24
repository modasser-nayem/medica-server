import { PrismaClient, UserRole, Gender, AppointmentStatus, PaymentStatus, PayoutStatus, TransactionType, TransactionStatus } from "@prisma/client";
import passwordHelper from "../utils/password";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database seed...");

  // Optional: Clean up existing data before seeding (Uncomment if needed)
  /*
  console.log("Cleaning up existing data...");
  await prisma.transaction.deleteMany();
  await prisma.doctorPayout.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany({ where: { role: { not: "ADMIN" } } });
  */

  const hashedPassword = await passwordHelper.hashPassword("123456");

  // 0. Create Admin
  console.log("Seeding admin...");
  let admin = await prisma.user.findUnique({ where: { email: "admin1@gmail.com" } });
  if (!admin) {
    await prisma.user.create({
      data: {
        name: "Test Admin",
        email: "admin1@gmail.com",
        password: hashedPassword,
        phone: "+1230000003",
        role: UserRole.ADMIN,
        gender: Gender.MALE
      }
    });
  }

  // 1. Create Departments
  console.log("Seeding departments...");
  const departmentsData = [
    { name: "Cardiology", description: "Heart related issues", icon: "heart-pulse" },
    { name: "Neurology", description: "Brain and nervous system", icon: "brain" },
    { name: "Pediatrics", description: "Child healthcare", icon: "baby" },
    { name: "General Medicine", description: "General healthcare", icon: "stethoscope" }
  ];

  const departments = [];
  for (const dept of departmentsData) {
    const existing = await prisma.department.findUnique({ where: { name: dept.name } });
    if (!existing) {
      departments.push(await prisma.department.create({ data: dept }));
    } else {
      departments.push(existing);
    }
  }

  // 2. Create Doctors
  console.log("Seeding doctors...");
  const doctorUsers = [
    {
      name: "Test Doctor",
      email: "doctor1@gmail.com",
      password: hashedPassword,
      phone: "+1230000001",
      role: UserRole.DOCTOR,
      gender: Gender.MALE,
      profileImage: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300&h=300"
    },
    {
      name: "Dr. Sarah Smith",
      email: "sarah@medica.com",
      password: hashedPassword,
      phone: "+1234567890",
      role: UserRole.DOCTOR,
      gender: Gender.FEMALE,
      profileImage: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=300&h=300"
    },
    {
      name: "Dr. James Wilson",
      email: "james@medica.com",
      password: hashedPassword,
      phone: "+1234567891",
      role: UserRole.DOCTOR,
      gender: Gender.MALE,
      profileImage: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300&h=300"
    }
  ];

  const doctors = [];
  for (const [index, userData] of doctorUsers.entries()) {
    let user = await prisma.user.findUnique({ where: { email: userData.email } });
    if (!user) {
      user = await prisma.user.create({ data: userData });
    }

    let doctor = await prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      doctor = await prisma.doctor.create({
        data: {
          userId: user.id,
          departmentId: departments[index].id,
          specialties: departments[index].name,
          qualification: "MBBS, MD",
          experience: 10 + index * 5,
          bio: `Experienced specialist in ${departments[index].name}.`,
          consultationFee: 1500.00,
          balance: 5000.00 // Seed with some dummy balance
        }
      });

      // Add a dummy schedule for the doctor
      await prisma.schedule.create({
        data: {
          doctorId: doctor.id,
          dayOfWeek: new Date().getDay(),
          startTime: "09:00",
          endTime: "17:00",
          slotDurationMinutes: 30
        }
      });
    }
    doctors.push(doctor);
  }

  // 3. Create Patients
  console.log("Seeding patients...");
  const patientUsers = [
    {
      name: "Test Patient",
      email: "patient1@gmail.com",
      password: hashedPassword,
      phone: "+1230000002",
      role: UserRole.PATIENT,
      gender: Gender.MALE
    },
    {
      name: "Alice Johnson",
      email: "alice@example.com",
      password: hashedPassword,
      phone: "+1987654320",
      role: UserRole.PATIENT,
      gender: Gender.FEMALE
    },
    {
      name: "Bob Williams",
      email: "bob@example.com",
      password: hashedPassword,
      phone: "+1987654321",
      role: UserRole.PATIENT,
      gender: Gender.MALE
    }
  ];

  const patients = [];
  for (const userData of patientUsers) {
    let user = await prisma.user.findUnique({ where: { email: userData.email } });
    if (!user) {
      user = await prisma.user.create({ data: userData });
    }

    let patient = await prisma.patient.findUnique({ where: { userId: user.id } });
    if (!patient) {
      patient = await prisma.patient.create({
        data: {
          userId: user.id,
          bloodGroup: "O+",
          emergencyContact: "+1122334455"
        }
      });
    }
    patients.push(patient);
  }

  // 4. Create Appointments and Financial Records
  console.log("Seeding appointments and transactions...");
  
  // A Completed Appointment for Dr. Sarah & Alice
  const pastStartsAt = new Date();
  pastStartsAt.setDate(pastStartsAt.getDate() - 1);
  pastStartsAt.setHours(10, 0, 0, 0);
  
  const pastEndsAt = new Date(pastStartsAt);
  pastEndsAt.setMinutes(pastEndsAt.getMinutes() + 30);

  const completedAppt = await prisma.appointment.create({
    data: {
      patientId: patients[0].id,
      doctorId: doctors[0].id,
      startsAt: pastStartsAt,
      endsAt: pastEndsAt,
      currency: "BDT",
      price: 1500.00,
      status: AppointmentStatus.COMPLETED
    }
  });

  // Create payment record for completed appointment (Amount in cents/paisa)
  const payment = await prisma.payment.create({
    data: {
      appointmentId: completedAppt.id,
      amount: 150000, 
      currency: "BDT",
      externalId: `dummy_session_${completedAppt.id}`,
      status: PaymentStatus.COMPLETED
    }
  });

  // Create Payout for Doctor (Assuming 10% commission)
  const commissionRate = 0.10;
  const commissionAmount = 1500 * commissionRate;
  const doctorAmount = 1500 - commissionAmount;

  await prisma.doctorPayout.create({
    data: {
      appointmentId: completedAppt.id,
      doctorId: doctors[0].id,
      paymentId: payment.id,
      amount: 1500.00,
      commissionRate: commissionRate,
      commissionAmount: commissionAmount,
      doctorAmount: doctorAmount,
      status: PayoutStatus.PAID,
      eligibleAt: new Date(),
      paidAt: new Date()
    }
  });

  // Create Transactions for Ledger (Patient Debit, Doctor Credit)
  await prisma.transaction.createMany({
    data: [
      {
        userId: patients[0].userId,
        amount: 1500.00,
        currency: "BDT",
        type: TransactionType.DEBIT,
        status: TransactionStatus.SUCCESS,
        description: `Payment for appointment with ${doctorUsers[0].name}`,
        referenceId: completedAppt.id
      },
      {
        userId: doctors[0].userId,
        amount: doctorAmount,
        currency: "BDT",
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
        description: `Earnings for completed appointment with ${patientUsers[0].name}`,
        referenceId: completedAppt.id
      }
    ]
  });

  // A Pending Appointment for Dr. James & Bob
  const futureStartsAt = new Date();
  futureStartsAt.setDate(futureStartsAt.getDate() + 1);
  futureStartsAt.setHours(14, 0, 0, 0);

  const futureEndsAt = new Date(futureStartsAt);
  futureEndsAt.setMinutes(futureEndsAt.getMinutes() + 30);

  const pendingAppt = await prisma.appointment.create({
    data: {
      patientId: patients[1].id,
      doctorId: doctors[1].id,
      startsAt: futureStartsAt,
      endsAt: futureEndsAt,
      currency: "BDT",
      price: 1500.00,
      status: AppointmentStatus.CONFIRMED
    }
  });

  const pendingPayment = await prisma.payment.create({
    data: {
      appointmentId: pendingAppt.id,
      amount: 150000, 
      currency: "BDT",
      externalId: `dummy_session_${pendingAppt.id}`,
      status: PaymentStatus.COMPLETED
    }
  });

  await prisma.doctorPayout.create({
    data: {
      appointmentId: pendingAppt.id,
      doctorId: doctors[1].id,
      paymentId: pendingPayment.id,
      amount: 1500.00,
      commissionRate: commissionRate,
      commissionAmount: commissionAmount,
      doctorAmount: doctorAmount,
      status: PayoutStatus.PENDING
    }
  });

  await prisma.transaction.create({
    data: {
      userId: patients[1].userId,
      amount: 1500.00,
      currency: "BDT",
      type: TransactionType.DEBIT,
      status: TransactionStatus.SUCCESS,
      description: `Payment for upcoming appointment with ${doctorUsers[1].name}`,
      referenceId: pendingAppt.id
    }
  });

  console.log("Database seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
