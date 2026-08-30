# Data model

## Category

```ts
CategoryDefinition {
  id
  name
  description
  attributes[]
}
```

Each category owns the semantic vocabulary presented to the user.

Example Pants attributes:

- square
- volume
- business
- experimental
- structured
- minimal

Example Cake attributes could be entirely different:

- geometric
- decorationDensity
- flowerDensity
- asymmetry
- tierCountNormalized
- minimal

The ranking engine remains unchanged.

## Attribute definition

```ts
AttributeDefinition {
  key
  label
  lowLabel
  highLabel
  defaultValue // 0..100
  weight?      // relevance weight
}
```

## Catalog item

```ts
CatalogItem {
  id
  categoryId
  title
  creator?
  sourceSite
  sourceUrl
  imageUrl
  priceLabel?
  buyable?
  note?
  attributes: Record<string, number>
}
```

Future additions may include:

- canonical source ID;
- multiple images;
- currency/price numeric fields;
- availability;
- source policy mode;
- embedding vector reference;
- AI analysis version;
- licensing/action capabilities;
- moderation status;
- creator claim status.

## Important rule

Do not create a database column for every possible global visual adjective. Category-specific attributes should remain extensible.
