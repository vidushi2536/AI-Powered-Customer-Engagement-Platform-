import { database, hashToken, read } from '@/lib/store';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get('accountId') || '';
    const authorization = request.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!/^estate-[a-f0-9]{16}$/.test(accountId) || !token)
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const connection = await database()
      .prepare(
        'SELECT workspace_id FROM whatsapp_connections WHERE runtime_account_id=? AND sync_token_hash=? AND provider=?',
      )
      .bind(accountId, await hashToken(token), 'openclaw')
      .first<{ workspace_id: string }>();
    if (!connection)
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { state } = await read(connection.workspace_id);
    return Response.json(
      {
        workspaceId: connection.workspace_id,
        contacts: (state.contacts || []).map((contact) => ({
          phone: contact.phone,
          consent: contact.consent,
        })),
        properties: state.properties.map((property) => ({
          id: property.id,
          location: property.location,
          bedrooms: property.bedrooms,
          sqft: property.sqft,
          priceLakhs: property.priceLakhs,
          availability: property.availability,
        })),
        meetings: (state.leads || [])
          .filter((lead) => lead.meeting)
          .map((lead) => {
            const property = state.properties.find(
              (item) => item.id === lead.meeting?.propertyId,
            );
            return {
              buyer: lead.name,
              phone: lead.phone,
              broker: lead.owner || 'Unassigned',
              propertyId: lead.meeting!.propertyId,
              location: property?.location || 'Location unavailable',
              date: lead.meeting!.date,
              status: lead.meeting!.status || 'proposed',
              note: lead.meeting!.note,
            };
          }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Context unavailable' },
      { status: 400 },
    );
  }
}
