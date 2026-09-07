import { allowedPhone, identity, read, save, runtime } from '@/lib/store';
import { brief, type Property } from '@/lib/domain';
export async function GET() {
  try {
    const id = await identity(),
      { state } = await read(id);
    return Response.json(
      {
        state,
        brief: brief(state),
        allowedPhone: allowedPhone(),
        integrations: {
          openclaw: !!runtime().WHATSAPP_SYNC_SECRET,
          sms: !!runtime().TWILIO_VERIFY_SERVICE_SID,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  const message = e instanceof Error ? e.message : 'Request failed';
  return Response.json(
    { error: message },
    { status: message === 'UNAUTHORIZED' ? 401 : 400 },
  );
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
      throw new Error('Origin not allowed');
    const id = await identity();
    if (Number(req.headers.get('content-length') || 0) > 250000)
      throw new Error('Upload too large');
    const raw = await req.text();
    if (raw.length > 250000) throw new Error('Upload too large');
    const body = JSON.parse(raw);
    const { state, revision } = await read(id);
    let next = state;
    switch (body.action) {
      case 'agent':
        if (typeof body.enabled !== 'boolean')
          throw new Error('Invalid agent state');
        state.agentEnabled = body.enabled;
        break;
      case 'crm':
        if (typeof body.connected !== 'boolean')
          throw new Error('Invalid CRM state');
        state.crm = body.connected;
        break;
      case 'note':
        if (typeof body.note !== 'string' || body.note.length > 2000)
          throw new Error('Note must be under 2,000 characters');
        state.note = body.note;
        break;
      case 'meeting': {
        if (!state.interestedId || state.status === 'Opted out')
          throw new Error(
            'A buyer must express interest before proposing a viewing.',
          );
        const date = new Date(body.date);
        if (!Number.isFinite(date.getTime()) || date.getTime() < Date.now())
          throw new Error('Choose a future date and time');
        state.meeting = {
          propertyId: state.interestedId,
          date: date.toISOString(),
          note: String(body.note || '').slice(0, 500),
        };
        state.status = 'Viewing proposed';
        break;
      }
      case 'upload': {
        if (
          !Array.isArray(body.properties) ||
          !body.properties.length ||
          body.properties.length > 100
        )
          throw new Error('Upload 1–100 properties');
        const records: Property[] = body.properties.map(
          (p: Record<string, unknown>, i: number) => {
            if (
              typeof p.location !== 'string' ||
              !/^[\p{L}\d .'-]{2,70}$/u.test(p.location)
            )
              throw new Error(`Row ${i + 1}: invalid location`);
            for (const key of ['bedrooms', 'sqft', 'priceLakhs'])
              if (
                typeof p[key] !== 'number' ||
                !Number.isFinite(p[key]) ||
                Number(p[key]) <= 0
              )
                throw new Error(`Row ${i + 1}: invalid ${key}`);
            if (
              Number(p.bedrooms) > 20 ||
              Number(p.sqft) > 1000000 ||
              Number(p.priceLakhs) > 100000
            )
              throw new Error(`Row ${i + 1}: value out of range`);
            return {
              id: 'CSV-' + crypto.randomUUID().slice(0, 8),
              location: p.location,
              bedrooms: Number(p.bedrooms),
              sqft: Number(p.sqft),
              priceLakhs: Number(p.priceLakhs),
              bathrooms: null,
              balconies: 0,
              areaType: 'Uploaded listing',
              source: 'Your CSV',
              availability: 'Owner-uploaded — verify availability',
              image: '/images/interior-warm.jpg',
            };
          },
        );
        if (state.properties.length + records.length > 500)
          throw new Error('Maximum 500 listings per demo workspace');
        state.properties.push(...records);
        break;
      }
      default:
        throw new Error('Action not allowed');
    }
    await save(id, next, revision);
    return Response.json({
      state: next,
      brief: brief(next),
      allowedPhone: allowedPhone(),
    });
  } catch (e) {
    return failure(e);
  }
}
