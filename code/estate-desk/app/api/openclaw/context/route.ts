import { normalisePhone } from '@/lib/domain';
import { database, runtime } from '@/lib/store';

export async function GET(request: Request) {
  const secret = runtime().WHATSAPP_SYNC_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`)
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const ownerPhone = normalisePhone(
    new URL(request.url).searchParams.get('ownerPhone') || '',
  );
  if (!/^\+\d{10,15}$/.test(ownerPhone))
    return Response.json(
      { error: 'A valid ownerPhone is required' },
      { status: 400 },
    );
  const owner = await database()
    .prepare('SELECT workspace_id FROM phone_owners WHERE phone=?')
    .bind(ownerPhone)
    .first<{ workspace_id: string }>();
  if (!owner)
    return Response.json({ error: 'Owner workspace not found' }, { status: 404 });
  const contacts = await database()
    .prepare(
      "SELECT phone,name,consent FROM workspace_contacts WHERE workspace_id=? AND consent!='opted-out' ORDER BY created_at DESC LIMIT 500",
    )
    .bind(owner.workspace_id)
    .all<{
      phone: string;
      name: string;
      consent: string;
    }>();
  const row = await database()
    .prepare('SELECT state FROM workspaces WHERE id=?')
    .bind(owner.workspace_id)
    .first<{ state: string }>();
  const state = row
    ? (JSON.parse(row.state) as {
        properties?: Array<{
          id: string;
          location: string;
          bedrooms: number;
          sqft: number;
          priceLakhs: number;
          availability: string;
        }>;
      })
    : {};
  return Response.json({
    accountId: 'shellsworth',
    policy:
      'Reply only after inbound contact unless consent is opted-in. STOP always opts out.',
    contacts: contacts.results,
    properties: state.properties || [],
  });
}
