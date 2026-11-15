export async function POST() {
  return Response.json(
    { error: 'Message simulation has been removed. Connect a real WhatsApp account.' },
    { status: 410 },
  );
}
