# Architecture

## MVP architecture

```text
Astro page
  └─ Vue VisualExplorer island
      ├─ category definition
      ├─ static catalog items
      ├─ ranking.ts
      └─ LocalStorage moodboard
```

No server is required for the first UX test.

## Future architecture

```text
Sources / partner feeds / creator uploads
                ↓
         ingestion workers
                ↓
       normalized catalog item
                ↓
     image analysis + embedding
                ↓
     attributes + source policy
                ↓
    database / search index / vectors
                ↓
       category ranking API
                ↓
       Visual Slider client
```

## Separation of concerns

### Category definition

Defines which semantic dimensions matter for a category and how they are labeled in the UI.

### Catalog item

Stores normalized source metadata plus numerical visual attributes.

### Ranking engine

Consumes any category definition + compatible items. It must not know that a category is “pants”.

### Analysis pipeline

Future offline process that turns images/pages into structured attributes. It should never be required synchronously for a user slider interaction.

## Why Astro + Vue

The project is content/catalog oriented, while the explorer itself is highly interactive. Astro keeps most pages simple and server/static friendly; Vue is isolated to the interactive island.
