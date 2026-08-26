// Mirror of apps/menu/src/data/catalog.ts — keep in sync.
// Copied instead of imported because apps/api's tsconfig rootDir ("./src")
// rejects cross-workspace imports (TS6059). Types are re-declared locally
// (matching apps/menu/src/types/index.ts) for the same reason.

export type Brand = 'ai-cha' | 'zhengda';

export interface ModifierOption {
  id: string;
  name: string;
  priceDelta: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  options: ModifierOption[];
  required?: boolean;
}

export interface MenuItem {
  id: string;
  brand: Brand;
  category: string;
  name: string;
  description?: string;
  basePrice: number;
  imageFallback?: string;
  isSoldOut?: boolean;
  modifiers?: ModifierGroup[];
}

const DRINK_MODIFIERS: ModifierGroup[] = [
  {
    id: 'size',
    name: 'Size / Cup Type',
    type: 'single',
    required: true,
    options: [
      { id: 'hot_400', name: 'Hot (400ml)', priceDelta: 0 },
      { id: 'cold_m_500', name: 'Cold M (500ml)', priceDelta: 0 },
      { id: 'cold_l_700', name: 'Cold L (700ml)', priceDelta: 0.25 },
    ]
  },
  {
    id: 'ice',
    name: 'Ice Level',
    type: 'single',
    required: true,
    options: [
      { id: 'no_ice', name: 'No Ice', priceDelta: 0 },
      { id: 'less_ice', name: 'Less Ice', priceDelta: 0 },
      { id: 'normal_ice', name: 'Normal Ice', priceDelta: 0 },
      { id: 'more_ice', name: 'More Ice', priceDelta: 0 }
    ]
  },
  {
    id: 'sugar',
    name: 'Sugar Level',
    type: 'single',
    required: true,
    options: [
      { id: 'sugar_0', name: '0%', priceDelta: 0 },
      { id: 'sugar_25', name: '25%', priceDelta: 0 },
      { id: 'sugar_50', name: '50%', priceDelta: 0 },
      { id: 'sugar_75', name: '75%', priceDelta: 0 },
      { id: 'sugar_100', name: '100%', priceDelta: 0 }
    ]
  },
  {
    id: 'toppings',
    name: 'Toppings',
    type: 'multiple',
    options: [
      { id: 'boba', name: 'Boba Pearl', priceDelta: 0.25 },
      { id: 'coconut_jelly', name: 'Coconut Jelly', priceDelta: 0.25 },
      { id: 'oats', name: 'Oats', priceDelta: 0.25 },
      { id: 'oolong_jelly', name: 'Oolong Tea Jelly', priceDelta: 0.25 },
      { id: 'brown_sugar_jelly', name: 'Brown Sugar Jelly', priceDelta: 0.25 },
      { id: 'red_bean', name: 'Red Bean', priceDelta: 0.25 }
    ]
  }
];

const CHICKEN_MODIFIERS: ModifierGroup[] = [
  {
    id: 'flavor',
    name: 'Flavor Powder',
    type: 'single',
    required: true,
    options: [
      { id: 'sig_powder', name: 'Signature', priceDelta: 0 },
      { id: 'mala_powder', name: 'Mala', priceDelta: 0 },
      { id: 'plum_powder', name: 'Plum', priceDelta: 0 },
      { id: 'cumin_powder', name: 'Cumin', priceDelta: 0 }
    ]
  },
  {
    id: 'sauce',
    name: 'Signature Sauce',
    type: 'single',
    options: [
      { id: 'none', name: 'No Sauce', priceDelta: 0 },
      { id: 'sweet_chili', name: 'Sweet & Chili', priceDelta: 0 },
      { id: 'mala_sauce', name: 'Mala Sauce', priceDelta: 0 },
      { id: 'blackpepper', name: 'Blackpepper', priceDelta: 0 }
    ]
  }
];

export const CATALOG: MenuItem[] = [
  // Ai-Cha
  {
    id: 'a1',
    brand: 'ai-cha',
    category: 'Cones',
    name: 'Matcha Ai-Scream Cone',
    description: 'Crispy cone with matcha soft serve',
    basePrice: 0.50,
    imageFallback: '/images/ai-scream-cone-matcha.webp'
  },
  {
    id: 'a2',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Brown Sugar Boba Milk',
    description: 'Classic signature drink',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-brown-sugar-pearl.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a3',
    brand: 'ai-cha',
    category: 'Frappe',
    name: 'Passion Fruit Frappe',
    description: 'Refreshing ice blend',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-passion-fruit-jasmine.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a4',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Fruity Signature Bucket',
    description: '1000ml giant tea',
    basePrice: 2.50,
    imageFallback: '/images/ai-cha-hawaiian-fruit.webp',
    modifiers: [
      {
        id: 'size',
        name: 'Size / Cup Type',
        type: 'single',
        required: true,
        options: [{ id: 'bucket_1000', name: 'Bucket (1000ml)', priceDelta: 0 }]
      },
      ...DRINK_MODIFIERS.filter(m => m.id !== 'size')
    ]
  },

  // Zhengda
  {
    id: 'z1',
    brand: 'zhengda',
    category: 'Signature',
    name: 'Signature XXL Crispy Chicken',
    description: 'Giant chicken breast',
    basePrice: 2.50,
    modifiers: CHICKEN_MODIFIERS
  },
  {
    id: 'z2',
    brand: 'zhengda',
    category: 'Signature',
    name: 'Crispy Boneless Thigh',
    description: 'Juicy and crispy',
    basePrice: 2.00,
    modifiers: CHICKEN_MODIFIERS
  },
  {
    id: 'z3',
    brand: 'zhengda',
    category: 'Combos',
    name: '4 of a Kind Combo',
    description: 'Drumsticks, wings, strips, fries',
    basePrice: 5.50,
    modifiers: CHICKEN_MODIFIERS
  },
  {
    id: 'z4',
    brand: 'zhengda',
    category: 'Rice Bowls',
    name: 'Chicken Popcorn Ricebowl',
    description: 'Served with signature sauce over rice',
    basePrice: 2.00,
    modifiers: CHICKEN_MODIFIERS
  },

{
    id: 'a10',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-scream Cone Sea Salt',
    description: 'Sea salt flavored ice cream cone with a unique sweet-savory taste.',
    basePrice: 0.50,
    imageFallback: '/images/ai-scream-cone-sea-salt.webp'

  },
  {
    id: 'a11',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-scream Cone Matcha',
    description: 'Delicious matcha-flavored cone ice cream.',
    basePrice: 0.50,
    imageFallback: '/images/ai-scream-cone-matcha.webp'

  },
  {
    id: 'a12',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-scream Cone Vanilla',
    description: 'Sweet vanilla-flavored cone ice cream.',
    basePrice: 0.50,
    imageFallback: '/images/ai-scream-cone-vanilla.webp'

  },
  {
    id: 'a13',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Boba',
    description: 'Sundae ice cream with the indulgence of brown sugar syrup and chewy boba toppings.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-boba.webp'

  },
  {
    id: 'a14',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Strawberry',
    description: 'Sundae ice cream with strawberry jam and a delightful special topping at the bottom.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-strawberry.webp'

  },
  {
    id: 'a15',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Chocolate',
    description: 'Sundae ice cream with delicious chocolate syrup and a special topping at the bottom.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-chocolate.webp'

  },
  {
    id: 'a16',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Blueberry',
    description: 'Sundae ice cream blended with blueberry jam.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-blueberry.webp'

  },
  {
    id: 'a17',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Peach Jam',
    description: 'Sundae ice cream with peach jam and yellow peach jelly toppings.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-peach-jam.webp'

  },
  {
    id: 'a18',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Grape',
    description: 'Sundae ice cream with fresh and delicious grape jam.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-grape.webp'

  },
  {
    id: 'a19',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Red Bean',
    description: 'Sundae ice cream with red bean sprinkles and strawberry jam.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-red-bean.webp'

  },
  {
    id: 'a20',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Sund-ai Mango',
    description: 'Sundae ice cream with refreshing mango jam.',
    basePrice: 1.00,
    imageFallback: '/images/sund-ai-mango.webp'

  },
  {
    id: 'a21',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-shake Strawberry',
    description: 'The perfect combination of ice cream and tea with a touch of strawberry flavor and added oat toppings.',
    basePrice: 1.50,
    imageFallback: '/images/ai-shake-strawberry.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a22',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-shake Blueberry',
    description: 'A blend of ice cream and green tea aroma with a hint of blueberry flavor and Nata de Coco topping.',
    basePrice: 1.50,
    imageFallback: '/images/ai-shake-blueberry.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a23',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-shake Grape',
    description: 'A shake drink with a combination of ice cream, green tea, grape jam, and Nata de Coco topping.',
    basePrice: 1.50,
    imageFallback: '/images/ai-shake-grape.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a24',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-shake Peach',
    description: 'A mix of ice cream and green tea aroma with a hint of peach flavor and yellow peach jelly topping.',
    basePrice: 1.50,
    imageFallback: '/images/ai-shake-peach.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a25',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-shake Boba',
    description: 'A delicious combination of ice cream and tea with brown sugar syrup and chewy boba toppings.',
    basePrice: 1.50,
    imageFallback: '/images/ai-shake-boba.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a26',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-smoothies Mango',
    description: 'Soft and refreshing mango-flavored smoothies.',
    basePrice: 1.50,
    imageFallback: '/images/ai-smoothies-mango.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a27',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-smoothies Strawberry',
    description: 'Smooth ice smoothies with a touch of sweet strawberry flavor.',
    basePrice: 1.50,
    imageFallback: '/images/ai-smoothies-strawberry.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a28',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-smoothies Chocolate Cookies',
    description: 'A sweet smoothie drink with the delightful taste of chocolate cookies.',
    basePrice: 1.50,
    imageFallback: '/images/ai-smoothies-chocolate-cookies.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a29',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-creamy Mango Boba',
    description: 'A creamy and sweet mango-flavored drink with ice cream, yellow peach jelly, boba, and Nata de Coco.',
    basePrice: 1.50,
    imageFallback: '/images/ai-creamy-mango-boba.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a30',
    brand: 'ai-cha',
    category: 'Ice Cream',
    name: 'Ai-smoothies Grapes',
    description: 'A smooth and sweet smoothie with hints of grape, peach, and green tea, topped with delicious yellow peach jelly.',
    basePrice: 1.50,
    imageFallback: '/images/ai-smoothies-grapes.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a31',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-scream Jasmine Tea',
    description: 'A unique blend of green tea and ice cream, offering two delights in one glass.',
    basePrice: 1.50,
    imageFallback: '/images/ai-scream-jasmine-tea.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a32',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-scream Earl Grey Tea',
    description: 'A unique blend of black tea and ice cream, offering two delights in one glass.',
    basePrice: 1.50,
    imageFallback: '/images/ai-scream-earl-grey-tea.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a33',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-squash Lemonade',
    description: 'A refreshing squash drink mixed with real lemon and special syrup.',
    basePrice: 1.20,
    imageFallback: '/images/ai-squash-lemonade.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a34',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Lemon Earl Grey',
    description: 'A blend of sweet black tea with fresh real lemon.',
    basePrice: 1.20,
    imageFallback: '/images/ai-cha-lemon-earl-grey.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a35',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Succulent Grapes',
    description: 'Sweet iced green tea combined with grape jam and Nata de Coco topping.',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-succulent-grapes.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a36',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Hawaiian Fruit',
    description: 'A refreshing fruit tea blend with mango and passionfruit flavors, paired with chewy yellow peach jelly topping.',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-hawaiian-fruit.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a37',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Blueberry Fruit',
    description: 'Iced tea with a unique blueberry flavor and topped with Nata de Coco',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-blueberry-fruit.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a38',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Yellow Peach Jasmine',
    description: 'A trendy tea drink with a hint of green tea aroma and yellow peach, enhanced by Nata de Coco and chewy jelly toppings.',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-yellow-peach-jasmine.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a39',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Passion Fruit Jasmine',
    description: 'A modern refreshing drink made from a blend of tea and passion fruit flavor, with the addition of Nata de Coco and chewy boba toppings.',
    basePrice: 1.50,
    imageFallback: '/images/ai-cha-passion-fruit-jasmine.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a40',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-squash Haw Flakes',
    description: 'A unique beverage with the distinct fruity flavor of Haw Flakes (Sanca) and Nata de Coco topping.',
    basePrice: 1.20,
    imageFallback: '/images/ai-squash-haw-flakes.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a41',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Original Earl Grey',
    description: 'Fragrant original black tea with a touch of sweet sugar syrup.',
    basePrice: 1.00,
    imageFallback: '/images/ai-cha-original-earl-grey.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a42',
    brand: 'ai-cha',
    category: 'Fruit Tea',
    name: 'Ai-cha Original Jasmine',
    description: 'Refreshing iced green tea with a fragrant aroma and sweet sugar syrup.',
    basePrice: 1.00,
    imageFallback: '/images/ai-cha-original-jasmine.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a43',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Supreme Mixed',
    description: 'Milk tea with a delightful mix of 4 toppings.',
    basePrice: 1.80,
    imageFallback: '/images/ai-milk-tea-supreme-mixed.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a44',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Pearl',
    description: 'The perfect blend of milk tea and chewy boba toppings.',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-pearl.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a45',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Coconut',
    description: 'Delicious milk tea combined with Nata de Coco that gives a touch of sweet coconut flavor',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-coconut.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a46',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Red Bean',
    description: 'Milk tea with a sweet red bean topping.',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-red-bean.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a47',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Brown Sugar Pearl',
    description: 'Delicious milk tea with a mix of brown sugar syrup and chewy boba topping.',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-brown-sugar-pearl.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a48',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea With 2 Toppings',
    description: 'A milk tea mix with 2 toppings.',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-with-2-toppings.webp',
    modifiers: DRINK_MODIFIERS
  },
  {
    id: 'a49',
    brand: 'ai-cha',
    category: 'Milk Tea',
    name: 'Ai-milk Tea Pearl Choco',
    description: 'The deliciousness of milk tea with a combination of chocolate syrup and chewy boba topping.',
    basePrice: 1.35,
    imageFallback: '/images/ai-milk-tea-pearl-choco.webp',
    modifiers: DRINK_MODIFIERS
  },
];
