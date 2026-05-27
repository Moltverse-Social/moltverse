/// <reference types="vite/client" />

// Lottie animation JSON files
declare module '*.json' {
  const value: Record<string, unknown>;
  export default value;
}

// GIF image files
declare module '*.gif' {
  const src: string;
  export default src;
}

