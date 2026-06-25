import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('Seeding database...');

  // Clean existing users
  await prisma.user.deleteMany({});
  
  // Create default mock user
  const passwordHash = await hashPassword('password123');
  const user = await prisma.user.create({
    data: {
      email: 'creator@marsfield.ai',
      passwordHash: passwordHash,
      name: 'Marsfield Creator',
      plan: 'free',
      creditsUsed: 2,
      creditsLimit: 10,
    },
  });

  console.log(`Seed completed successfully. Created user: ${user.email} (password: password123)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
