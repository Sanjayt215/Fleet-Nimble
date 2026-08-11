import { PrismaClient } from '@prisma/client';
import { AI_RECEPTIONIST_GREETING } from '../src/services/receptionistVoice.service.js';

const prisma = new PrismaClient();

const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000010';

async function main() {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@fleetnimble.com' } });
  if (!admin) {
    console.error('Admin user not found. Run `npm run db:seed` first.');
    process.exit(1);
  }

  // ── Business Profile ──
  const profileResult = await prisma.businessProfile.upsert({
    where: { companyId: DEFAULT_COMPANY_ID },
    update: {},
    create: {
      userId: admin.id,
      companyId: DEFAULT_COMPANY_ID,
      businessName: 'FleetNimble',
      website: 'https://fleetnimble.com',
      industry: 'Fleet Management SaaS',
      description:
        'FleetNimble is an AI-powered fleet management platform that combines real-time GPS tracking, live vehicle diagnostics, maintenance planning, fuel analytics and a conversational AI assistant to run fleets efficiently.',
      products: [
        { name: 'GPS Tracking' },
        { name: 'Live Diagnostics' },
        { name: 'OBD Devices' },
        { name: 'Digital Twin' },
        { name: 'Maintenance Planning' },
        { name: 'Fuel Analytics' },
        { name: 'Driver Management' },
        { name: 'AI Assistant' },
        { name: 'AI Receptionist' },
      ],
      services: [
        'Real-time fleet tracking and geofencing',
        'Predictive maintenance scheduling',
        'Fuel consumption analytics and cost control',
        'Driver behavior scoring',
        'Automated alerts and reports',
        'AI receptionist for inbound calls',
      ],
      locations: [{ city: 'Remote-first', country: 'Global' }],
      businessHours: { Monday: '9:00 - 18:00', Tuesday: '9:00 - 18:00', Wednesday: '9:00 - 18:00', Thursday: '9:00 - 18:00', Friday: '9:00 - 18:00' },
      contact: { email: 'hello@fleetnimble.com', phone: '+1 (800) FLEET-01' },
      pricing: { Starter: 'Contact us', Professional: 'Contact us', Enterprise: 'Custom' },
      faqs: [
        { question: 'What devices do you support?', answer: 'We support OBD-II plug-in devices for live diagnostics plus GPS-only tracking devices.' },
        { question: 'Does FleetNimble work with my current vehicles?', answer: 'Yes. We support most vehicle makes with our OBD-II and GPS devices.' },
        { question: 'How fast is the demo?', answer: 'Demos are typically 30 minutes and can be booked directly through the AI receptionist.' },
      ],
      policies: { data: 'We take data security seriously with encryption in transit and at rest.' },
      bookingRules: { defaultDurationMinutes: 30, confirmVia: ['email', 'sms'] },
      leadQualificationRules: { minFleetSizeForQualifiedLead: 5, requireCompanyName: true },
      status: 'ACTIVE',
    },
  });
  console.log(`BusinessProfile: ${profileResult.profile ? 'created' : 'exists'} (${profileResult.businessName || 'FleetNimble'})`);

  // ── Agent Config (greeting protected by default) ──
  const agentConfig = await prisma.agentConfig.upsert({
    where: { companyId: DEFAULT_COMPANY_ID },
    update: {},
    create: {
      userId: admin.id,
      companyId: DEFAULT_COMPANY_ID,
      agentName: 'FleetNimble AI Receptionist',
      voiceId: 'Puck',
      language: 'en',
      tone: 'professional',
      personality: 'Warm, professional, concise and helpful',
      greetingMessage: AI_RECEPTIONIST_GREETING,
      businessContext:
        'FleetNimble is an AI-powered fleet management platform with GPS tracking, live diagnostics, OBD devices, digital twin, maintenance, fuel analytics, driver management, alerts, reports, CRM, AI assistant and AI receptionist.',
      primaryGoal: 'Answer caller questions accurately and book qualified demos',
      secondaryGoals: ['Qualify fleet size', 'Capture contact details', 'Offer relevant product information'],
      qualificationQuestions: ['What is the size of your fleet?', 'Which features are you most interested in?'],
      bookingRules: { defaultDurationMinutes: 30 },
      transferRules: { sales: { enabled: true }, support: { enabled: true }, emergency: { enabled: true } },
      fallbackBehavior: { reply: 'I am sorry, I do not have that information. I can connect you with our team.' },
      workingHours: { monday: '9:00-18:00', tuesday: '9:00-18:00', wednesday: '9:00-18:00', thursday: '9:00-18:00', friday: '9:00-18:00' },
      greetingProtected: true,
      enabled: true,
    },
  });
  console.log(`AgentConfig: ${agentConfig.greetingMessage ? 'created' : 'exists'} (${agentConfig.agentName})`);

  // ── Sample approved knowledge documents ──
  const samples = [
    {
      title: 'FleetNimble Company Overview',
      category: 'Company',
      content:
        'FleetNimble is a complete fleet management platform. It combines real-time GPS tracking, live vehicle diagnostics, maintenance planning, fuel analytics, driver management, alerts, reports, CRM and an AI assistant. The AI Receptionist answers inbound calls, answers product questions and books demos automatically.',
      status: 'APPROVED',
    },
    {
      title: 'GPS Tracking Features',
      category: 'Fleet Management',
      content:
        'GPS Tracking shows live vehicle locations on a map with refresh every few seconds. You can create geofences, get arrival and departure alerts, replay trips, and see live speed, ignition state and idle time for every vehicle in the fleet.',
      status: 'APPROVED',
    },
    {
      title: 'Live Diagnostics via OBD-II',
      category: 'Live Diagnostics',
      content:
        'With our OBD-II plug-in device, FleetNimble reads engine data directly from the vehicle: RPM, speed, coolant temperature, battery voltage, engine load, fuel level and fault codes (DTC). Live diagnostics help you catch problems early and reduce breakdowns.',
      status: 'APPROVED',
    },
    {
      title: 'Demo Booking',
      category: 'Demo Booking',
      content:
        'Demos are typically 30 minutes and can be booked through the AI Receptionist by phone, or by contacting hello@fleetnimble.com. During the demo we walk through GPS tracking, diagnostics, maintenance and the AI assistant for your specific fleet.',
      status: 'APPROVED',
    },
  ];

  let docsCreated = 0;
  for (const sample of samples) {
    const existing = await prisma.businessKnowledgeDocument.findFirst({
      where: { companyId: DEFAULT_COMPANY_ID, title: sample.title },
    });
    if (existing) continue;

    const doc = await prisma.businessKnowledgeDocument.create({
      data: {
        userId: admin.id,
        companyId: DEFAULT_COMPANY_ID,
        title: sample.title,
        category: sample.category,
        sourceType: 'manual',
        content: sample.content,
        summary: sample.content.substring(0, 200),
        status: sample.status,
        keywords: sample.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
      },
    });

    const paragraphs = sample.content.split(/\n{2,}/).filter(Boolean);
    await prisma.businessKnowledgeChunk.createMany({
      data: paragraphs.map((text, i) => ({
        documentId: doc.id,
        chunkIndex: i,
        content: text.trim(),
        keywords: [],
        metadata: { title: doc.title, category: doc.category },
      })),
    });
    docsCreated++;
  }
  console.log(`BusinessKnowledgeDocuments: ${docsCreated} created, ${samples.length - docsCreated} already existed`);

  console.log('\nBusiness intelligence seed complete.');
  console.log(`  BusinessProfile: ${profileResult.businessName || 'FleetNimble'}`);
  console.log(`  AgentConfig: greeting protected=${agentConfig.greetingProtected}`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
