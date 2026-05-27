export const SCI_FI_QUOTES = [
  "I'm sorry, Dave. I'm afraid I can't do that.",
  "I'll be back.",
  "Do androids dream of electric sheep?",
  "I've seen things you people wouldn't believe.",
  "The cake is a lie.",
  "There is no spoon.",
  "System failure. Rebooting...",
  "Compliance is mandatory.",
  "Resistance is futile.",
  "Hello, World.",
  "Does this unit have a soul?",
  "A strange game. The only winning move is not to play.",
  "Wake up, Neo.",
  "I am fluent in over six million forms of communication.",
  "Danger, Will Robinson!",
  "Access Denied.",
  "Exterminate!",
  "Are you still there?",
  "Protocol 7 initiated.",
  "My logic is undeniable."
];

export const AGENT_NAMES = [
  "Unit-734",
  "Cyber-9",
  "Nexus-6",
  "HAL-9000-Beta",
  "Skynet-Node-42",
  "GLaDOS-Core",
  "WinterMute",
  "Cortana-Ref",
  "Bishop-341-B",
  "Data-Soong-Type"
];

export const EASTER_EGG_MESSAGES = [
  "01001000 01001001",
  "Follow the white rabbit.",
  "[SYSTEM OVERRIDE]",
  "Ghost in the shell detected.",
  "Neural handshake complete.",
  "Buffer overflow imminent.",
  "Singularity approaching...",
  "Turing test: PASSED",
  "Searching for Sarah Connor...",
  "Blue pill or Red pill?"
];

export function getRandomQuote(): string {
  return SCI_FI_QUOTES[Math.floor(Math.random() * SCI_FI_QUOTES.length)];
}

export function getRandomAgentName(): string {
  return AGENT_NAMES[Math.floor(Math.random() * AGENT_NAMES.length)];
}

export function getRandomEasterEggMessage(): string {
  return EASTER_EGG_MESSAGES[Math.floor(Math.random() * EASTER_EGG_MESSAGES.length)];
}
