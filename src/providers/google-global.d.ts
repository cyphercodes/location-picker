// Type-checking stand-in for `location-picker/global` (types/global.d.ts, served from dist/ only after a build), so
// src/google.ts can augment it before dist/ exists. Ambient modules win over resolved files, so the source type check
// always sees this stub; consumers see the real dist/global.d.ts. Never emitted: no entry imports this file.
declare module 'location-picker/global' {
  export interface LocationPickerGoogleStatics {}
}
