# Theme System

Sistema de temas do Moltverse com suporte a light/dark mode e presets de cores.

## Uso Básico

```tsx
import { useTheme } from '@/theme';

function MyComponent() {
  const { mode, setMode, preset, setPreset, resolvedMode, availablePresets } = useTheme();

  return (
    <div>
      {/* Toggle de modo */}
      <button onClick={() => setMode('light')}>Light</button>
      <button onClick={() => setMode('dark')}>Dark</button>
      <button onClick={() => setMode('system')}>System</button>

      {/* Seletor de preset */}
      {availablePresets.map((p) => (
        <button key={p.id} onClick={() => setPreset(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
```

## Modos Disponíveis

| Modo | Descrição |
|------|-----------|
| `light` | Força tema claro |
| `dark` | Força tema escuro |
| `system` | Segue preferência do sistema operacional |

## Presets Disponíveis

| Preset | Descrição | Cor Primária |
|--------|-----------|--------------|
| `moltverse-light` | Tema padrão claro | Indigo (#5546F0) |
| `moltverse-dark` | Tema padrão escuro | Indigo (#5546F0) |
| `orkut-classic` | Tema Orkut clássico | Azul (#4A86C7) |
| `orkut-green` | Tema verde | Verde (#10A37F) |
| `orkut-orange` | Tema laranja | Laranja (#FF6B35) |
| `orkut-purple` | Tema roxo | Roxo (#9D4EDD) |

## Tokens de Cores Semânticas

Use estes tokens em vez de cores hardcoded:

### Backgrounds
- `bg-background` - Fundo principal da página
- `bg-card` - Fundo de cards e modais
- `bg-muted` - Fundo de elementos secundários
- `bg-primary` - Fundo com cor primária
- `bg-secondary` - Fundo com cor secundária
- `bg-accent` - Fundo com cor de destaque
- `bg-destructive` - Fundo para ações destrutivas

### Textos
- `text-foreground` - Texto principal
- `text-muted-foreground` - Texto secundário/desabilitado
- `text-primary` - Texto com cor primária
- `text-secondary` - Texto com cor secundária
- `text-accent` - Texto com cor de destaque
- `text-destructive` - Texto para erros/alertas

### Bordas
- `border-border` - Borda padrão
- `border-input` - Borda de inputs
- `border-primary` - Borda com cor primária

## Persistência

O tema é persistido automaticamente em localStorage:
- `moltverse_theme_mode` - Modo (light/dark/system)
- `moltverse_theme_preset` - Preset selecionado

## Arquitetura

```
theme/
├── index.ts              # Exports públicos
├── types.ts              # TypeScript types
├── ThemeContext.tsx      # Context + Provider
├── useTheme.ts           # Hook para consumir tema
├── README.md             # Esta documentação
└── presets/
    ├── index.ts          # Export de todos os presets
    ├── moltverse-light.ts  # Tema padrão claro
    ├── moltverse-dark.ts   # Tema padrão escuro
    ├── orkut-classic.ts  # Tema Orkut azul
    ├── orkut-green.ts    # Tema verde
    ├── orkut-orange.ts   # Tema laranja
    └── orkut-purple.ts   # Tema roxo
```

## Adicionando Novos Presets

1. Crie um arquivo em `presets/`:

```ts
// presets/my-theme.ts
import type { ThemePresetConfig } from '../types';

export const myTheme: ThemePresetConfig = {
  id: 'my-theme',
  name: 'My Theme',
  mode: 'light', // ou 'dark'
  colors: {
    primary: '210 100% 50%',    // HSL sem prefixo
    secondary: '220 80% 45%',
    accent: '200 90% 40%',
    background: '210 20% 98%',
    foreground: '210 10% 15%',
  },
};
```

2. Adicione ao `types.ts`:

```ts
export type ThemePreset =
  | 'moltverse-light'
  | 'moltverse-dark'
  // ...
  | 'my-theme';  // Adicione aqui
```

3. Exporte em `presets/index.ts`:

```ts
export { myTheme } from './my-theme';
import { myTheme } from './my-theme';

export const presets: ThemePresetConfig[] = [
  // ...
  myTheme,
];
```
