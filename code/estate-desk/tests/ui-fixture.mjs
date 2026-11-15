import { dashboardStats, workspaceInsights } from '../lib/domain.ts';
export function fixture(empty = false) {
  const at = '2026-10-30T09:00:00.000Z';
  const properties = empty ? [] : [{
    id: 'SYNTH-001', society: 'Synthetic Riverside Residence with a deliberately long property name',
    location: 'Synthetic Sector 107, Gurugram — North residential extension',
    bedrooms: 2, sqft: 1100, bathrooms: 2, balconies: 1, priceLakhs: 80,
    areaType: 'Apartment', source: 'Your CSV', availability: 'Synthetic review fixture only', image: '',
  }];
  const leads = empty ? [] : [
    { phone: '+12025550101', name: 'Synthetic Ready Client', status: 'Viewing proposed',
      requirements: { budget: 90, bedrooms: 2, timeline: 'This month' },
      messages: [], interestedId: 'SYNTH-001',
      meeting: { propertyId: 'SYNTH-001', date: '2026-11-02T10:00', note: 'Synthetic proposal, not a booking', status: 'proposed' },
      blocked: 0, updatedAt: at },
    { phone: '+12025550102', name: 'Synthetic New Client', status: 'New', requirements: {},
      messages: [], interestedId: null, meeting: null, blocked: 0, updatedAt: at },
    { phone: '+12025550103', name: 'Synthetic Opted Out', status: 'Opted out', requirements: {},
      messages: [], interestedId: null, meeting: null, blocked: 0, updatedAt: at },
  ];
  const state = { ownerPhone: '+12025550100', onboardingComplete: true,
    contacts: leads.map(lead => ({ phone: lead.phone, name: lead.name,
      consent: lead.status === 'Opted out' ? 'opted-out' : 'inbound-only', addedAt: at })),
    leads, phone: null, phoneMode: 'demo', crm: true, agentEnabled: true,
    requirements: {}, messages: [], properties, status: 'New', interestedId: null,
    meeting: null, blocked: 0, updatedAt: at, note: '',
    whatsapp: { accountId: 'synthetic', senderPhone: null, lastEventAt: null,
      connected: false, provider: 'openclaw', status: 'disconnected' } };
  return { state, stats: dashboardStats(state), insights: workspaceInsights(state) };
}
