import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Role, ResourceType } from "@prisma/client";

const prisma = new PrismaClient();
async function main() {
  const logins = [
    { name: "Avery Admin", username: "admin", password: "Admin@123", role: Role.ADMIN },
    { name: "Taylor Lead", username: "lead", password: "Lead@123", role: Role.TEAM_LEAD },
    { name: "Parker Manager", username: "pm", password: "Pm@123", role: Role.PROJECT_MANAGER }
  ];
  const users = [];
  for (const item of logins) {
    const passwordHash = await bcrypt.hash(item.password, 12);
    users.push(await prisma.user.upsert({
      where: { username: item.username },
      update: {
        name: item.name,
        legacyRole: item.role,
        isActive: true,
        passwordHash,
        roles: { deleteMany: {}, create: [{ role: item.role }] }
      },
      create: {
        name: item.name,
        username: item.username,
        legacyRole: item.role,
        passwordHash,
        roles: { create: [{ role: item.role }] }
      }
    }));
  }
  if (await prisma.resource.count() === 0) {
    const records = [
      ["Alex Morgan", ResourceType.Person, "Senior designer"],
      ["Meeting Room A", ResourceType.Room, "North wing, 8 seats"],
      ["Camera Kit 01", ResourceType.Equipment, "4K production kit"],
      ["Jordan Lee", ResourceType.Person, "Software engineer"],
      ["Conference Room B", ResourceType.Room, "Ground floor, 12 seats"]
    ] as const;
    const resources = [];
    for (const [name, type, description] of records) {
      resources.push(await prisma.resource.create({ data: { name, type, description, createdBy: users[0]!.id } }));
    }
    const now = new Date();
    const start = new Date(now); start.setHours(10, 0, 0, 0);
    const end = new Date(now); end.setHours(12, 0, 0, 0);
    await prisma.booking.createMany({ data: [
      { resourceId: resources[0]!.id, taskNumber: "PROJ-142", taskType: "Website", taskTitle: "Design system refresh", startDateTime: start, endDateTime: end, createdBy: users[2]!.id, notes: "Sample booking" },
      { resourceId: resources[1]!.id, taskNumber: "OPS-208", taskType: "Emailer", taskTitle: "Quarterly planning", startDateTime: new Date(start.getTime() + 3_600_000), endDateTime: new Date(end.getTime() + 3_600_000), createdBy: users[1]!.id }
    ] });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
