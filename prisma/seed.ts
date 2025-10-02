import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data
  await prisma.outboxEvent.deleteMany();
  await prisma.eventLog.deleteMany();
  await prisma.user.deleteMany();

  // Create admin user for testing
  const adminUser = await prisma.user.create({
    data: {
      id: 'admin-user-id',
      email: 'admin@example.com',
      name: 'Admin User',
      version: 1,
      createdBy: { id: 'system', name: 'System', email: 'system@example.com' },
      updatedBy: { id: 'system', name: 'System', email: 'system@example.com' }
    }
  });

  console.log('✅ Created admin user:', adminUser.email);
  console.log('✅ Database seed completed successfully');
}

main()
  .catch((e) => {
    console.error('❌ Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
