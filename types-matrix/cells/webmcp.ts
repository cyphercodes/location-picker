// location-picker/webmcp: opt-in tool registration.
import { LocationPicker } from 'location-picker/core';
import { isWebMcpSupported, registerWebMcpTools, type WebMcpRegistration } from 'location-picker/webmcp';

const picker = new LocationPicker('#map');
const registration: WebMcpRegistration = registerWebMcpTools(picker, {
  purpose: 'Delivery drop-off point for this order.',
  tools: ['get_location', 'set_location'],
});
// @ts-expect-error there is never a locate tool
registerWebMcpTools(picker, { tools: ['locate'] });
export const used = [isWebMcpSupported(), registration.tools, registration.unregister()];
