// The form POST target: echoes the urlencoded fields it received.
export default defineEventHandler(async (event) => ({
  method: 'POST',
  fields: await readBody(event),
}));
