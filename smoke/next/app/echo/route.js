// The form POST target: echoes the fields it received.
export async function POST(request) {
  const form = await request.formData();
  const fields = Object.fromEntries([...form].filter(([, value]) => typeof value === 'string'));
  return Response.json({ method: 'POST', fields });
}
