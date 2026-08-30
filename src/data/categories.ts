import type { CategoryDefinition } from '../lib/types';

export const pantsCategory: CategoryDefinition = {
  id: 'pants',
  name: 'Pants',
  eyebrow: 'Fashion / first prototype',
  description:
    'Move semantic sliders and existing references re-rank around the shape and feeling you want.',
  attributes: [
    {
      key: 'square',
      label: 'Shape',
      lowLabel: 'Normal',
      highLabel: 'Square',
      defaultValue: 50,
      weight: 1.25,
    },
    {
      key: 'volume',
      label: 'Volume',
      lowLabel: 'Slim',
      highLabel: 'Huge',
      defaultValue: 50,
      weight: 1,
    },
    {
      key: 'business',
      label: 'Style',
      lowLabel: 'Casual',
      highLabel: 'Business',
      defaultValue: 50,
      weight: 1,
    },
    {
      key: 'experimental',
      label: 'Experiment',
      lowLabel: 'Normal',
      highLabel: 'Weird',
      defaultValue: 50,
      weight: 1.15,
    },
    {
      key: 'structured',
      label: 'Structure',
      lowLabel: 'Soft',
      highLabel: 'Rigid',
      defaultValue: 50,
      weight: 0.9,
    },
    {
      key: 'minimal',
      label: 'Visual noise',
      lowLabel: 'Detailed',
      highLabel: 'Minimal',
      defaultValue: 55,
      weight: 0.75,
    },
  ],
};

export const categories = [pantsCategory];
