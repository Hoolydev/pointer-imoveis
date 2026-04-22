import "dotenv/config";
import { prisma } from "./src/lib/prisma";

async function run() {
  console.log("Cleaning up duplicate failed messages...");

  const result = await prisma.message.deleteMany({
    where: {
      status: "failed",
      error: {
        contains: "WhatsApp disconnected"
      }
    }
  });

  console.log(`Deleted ${result.count} identical failed 'WhatsApp disconnected' messages.`);

  const result2 = await prisma.message.deleteMany({
    where: {
      status: "failed",
      error: {
        contains: "websocket disconnected"
      }
    }
  });

  console.log(`Deleted ${result2.count} identical failed 'websocket disconnected' messages.`);
  
  const result3 = await prisma.message.deleteMany({
    where: {
      status: "failed",
      error: {
        contains: "not on WhatsApp"
      }
    }
  });

  console.log(`Deleted ${result3.count} 'not on whatsapp' duplicate logs.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
