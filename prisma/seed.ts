import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // A default sender identity so the app is usable immediately.
  const existing = await prisma.senderIdentity.findFirst({ where: { isDefault: true } });
  if (!existing) {
    await prisma.senderIdentity.create({
      data: {
        fromName: "Your Company",
        fromEmail: "outreach@example.com",
        replyTo: "you@example.com",
        postalAddress: "123 Example St, Suite 100, City, ST 00000, Country",
        domain: "example.com",
        isDefault: true,
      },
    });
  }

  // A few test contacts spanning regions + consent states so the compliance
  // guard is demonstrable out of the box.
  const contacts = [
    { email: "jane@acme.com", name: "Jane Doe", company: "Acme", region: "US", consentStatus: "express" },
    { email: "tom@usbiz.com", name: "Tom Smith", company: "US Biz", region: "US", consentStatus: "none" },
    { email: "eu.person@eufirm.eu", name: "Elke Weber", company: "EU Firm", region: "EU", consentStatus: "none" }, // will be blocked
    { email: "consented@euopt.eu", name: "Marco Rossi", company: "EU Opt", region: "EU", consentStatus: "express" },
    { email: "ca.person@canco.ca", name: "Alex Roy", company: "CanCo", region: "CA", consentStatus: "none" }, // will be blocked
  ];

  for (const c of contacts) {
    await prisma.contact.upsert({
      where: { email: c.email },
      create: { ...c, source: "manual" },
      update: {},
    });
  }

  // Demonstrate suppression.
  await prisma.suppressionEntry.upsert({
    where: { email: "unsubscribed@acme.com" },
    create: { email: "unsubscribed@acme.com", reason: "unsubscribe" },
    update: {},
  });
  await prisma.contact.upsert({
    where: { email: "unsubscribed@acme.com" },
    create: { email: "unsubscribed@acme.com", name: "Bo", region: "US", consentStatus: "express", source: "manual" },
    update: {},
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
