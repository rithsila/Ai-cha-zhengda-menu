export interface GlossaryTerm {
  canonical: string;
  en: string;
  km: string;
  zh: string;
}

export const MENU_GLOSSARY: GlossaryTerm[] = [
  // Brand Names
  { canonical: 'Ai-Cha', en: 'Ai-Cha', km: 'Ai-Cha', zh: '爱茶' },
  { canonical: 'Zhengda', en: 'Zhengda', km: 'ចឹងតា', zh: '正大' },
  { canonical: 'Ai-Scream', en: 'Ai-Scream', km: 'Ai-Scream', zh: '爱冰淇淋' },
  { canonical: 'Sund-ai', en: 'Sund-ai', km: 'Sund-ai', zh: '圣代' },

  // Coffee & Espresso
  { canonical: 'Espresso', en: 'Espresso', km: 'អេសប្រេសសូ', zh: '浓缩咖啡' },
  { canonical: 'Americano', en: 'Americano', km: 'អាមេរិកាណូ', zh: '美式咖啡' },
  { canonical: 'Latte', en: 'Latte', km: 'ឡាតេ', zh: '拿铁' },
  { canonical: 'Iced Latte', en: 'Iced Latte', km: 'ឡាតេទឹកកក', zh: '冰拿铁' },
  { canonical: 'Cappuccino', en: 'Cappuccino', km: 'កាពូឈីណូ', zh: '卡布奇诺' },
  { canonical: 'Mocha', en: 'Mocha', km: 'ម៉ូកា', zh: '摩卡' },
  { canonical: 'Caramel Macchiato', en: 'Caramel Macchiato', km: 'ការ៉ាមែល ម៉ាគីអាតូ', zh: '焦糖玛奇朵' },
  { canonical: 'Cold Brew', en: 'Cold Brew', km: 'កាហ្វេស្រង់ត្រជាក់', zh: '冷萃咖啡' },
  { canonical: 'Iced Milk Coffee', en: 'Iced Milk Coffee', km: 'កាហ្វេទឹកដោះគោទឹកកក', zh: '冰咖啡牛奶' },
  { canonical: 'Black Coffee', en: 'Black Coffee', km: 'កាហ្វេខ្មៅ', zh: '黑咖啡' },

  // Milk & Tea
  { canonical: 'Fresh Milk', en: 'Fresh Milk', km: 'ទឹកដោះគោស្រស់', zh: '鲜奶' },
  { canonical: 'Condensed Milk', en: 'Condensed Milk', km: 'ទឹកដោះគោខាប់', zh: '炼乳' },
  { canonical: 'Milk Tea', en: 'Milk Tea', km: 'តែទឹកដោះគោ', zh: '奶茶' },
  { canonical: 'Green Tea', en: 'Green Tea', km: 'តែបៃតង', zh: '绿茶' },
  { canonical: 'Matcha', en: 'Matcha', km: 'ម៉ាឆា', zh: '抹茶' },
  { canonical: 'Jasmine Tea', en: 'Jasmine Tea', km: 'តែផ្កាម្លិះ', zh: '茉莉绿茶' },
  { canonical: 'Oolong Tea', en: 'Oolong Tea', km: 'តែអ៊ូឡុង', zh: '乌龙茶' },
  { canonical: 'Fruit Tea', en: 'Fruit Tea', km: 'តែផ្លែឈើ', zh: '水果茶' },

  // Toppings & Desserts
  { canonical: 'Boba Pearl', en: 'Boba Pearl', km: 'គុជ', zh: '珍珠' },
  { canonical: 'Brown Sugar Boba', en: 'Brown Sugar Boba', km: 'គុជស្ករត្នោត', zh: '黑糖珍珠' },
  { canonical: 'Coconut Jelly', en: 'Coconut Jelly', km: 'ចាហួយដូង', zh: '椰果' },
  { canonical: 'Oolong Tea Jelly', en: 'Oolong Tea Jelly', km: 'ចាហួយតែអ៊ូឡុង', zh: '乌龙茶冻' },
  { canonical: 'Egg Pudding', en: 'Egg Pudding', km: 'ពងទាពុតឌីង', zh: '布丁' },
  { canonical: 'Cheese Foam', en: 'Cheese Foam', km: 'ពពុះឈីស', zh: '奶盖' },
  { canonical: 'Ice Cream Cone', en: 'Ice Cream Cone', km: 'ការ៉េមកោណ', zh: '甜筒冰淇淋' },

  // Fruits
  { canonical: 'Passion Fruit', en: 'Passion Fruit', km: 'ផ្លែផាសិន', zh: '百香果' },
  { canonical: 'Mango', en: 'Mango', km: 'ផ្លែស្វាយ', zh: '芒果' },
  { canonical: 'Strawberry', en: 'Strawberry', km: 'ផ្លែស្ត្រប៊ែរី', zh: '草莓' },
  { canonical: 'Peach', en: 'Peach', km: 'ផ្លែប៉េស', zh: '桃子' },
  { canonical: 'Lemon', en: 'Lemon', km: 'ក្រូចឆ្មារ', zh: '柠檬' },

  // Food & Snacks (Zhengda / Restaurant)
  { canonical: 'XXL Crispy Chicken', en: 'XXL Crispy Chicken', km: 'សាច់មាន់បំពង XXL', zh: 'XXL大鸡排' },
  { canonical: 'Crispy Fried Chicken', en: 'Crispy Fried Chicken', km: 'សាច់មាន់បំពងស្រួយ', zh: '香脆炸鸡' },
  { canonical: 'Popcorn Chicken', en: 'Popcorn Chicken', km: 'មាន់បំពងប៉ុបខន', zh: '盐酥鸡' },
  { canonical: 'Chicken Wings', en: 'Chicken Wings', km: 'ស្លាបមាន់បំពង', zh: '炸鸡翅' },
  { canonical: 'French Fries', en: 'French Fries', km: 'ដំឡូងបារាំងបំពង', zh: '薯条' },
  { canonical: 'Rice Bowl', en: 'Rice Bowl', km: 'បាយសាច់', zh: '便当盖饭' },
  { canonical: 'Mala', en: 'Mala', km: 'ម៉ាឡា', zh: '麻辣' },
  { canonical: 'Spicy', en: 'Spicy', km: 'ហឹរ', zh: '辣味' },
  { canonical: 'Extra Spicy', en: 'Extra Spicy', km: 'ហឹរខ្លាំង', zh: '特辣' },
  { canonical: 'Non-Spicy', en: 'Non-Spicy', km: 'មិនហឹរ', zh: '不辣' },

  // Temperature & Customizations
  { canonical: 'Hot', en: 'Hot', km: 'ក្តៅ', zh: '热' },
  { canonical: 'Iced', en: 'Iced', km: 'ទឹកកក', zh: '冰' },
  { canonical: 'Less Ice', en: 'Less Ice', km: 'ទឹកកកតិច', zh: '少冰' },
  { canonical: 'No Ice', en: 'No Ice', km: 'គ្មានទឹកកក', zh: '去冰' },
  { canonical: 'Less Sugar', en: 'Less Sugar', km: 'ស្ករតិច', zh: '少糖' },
  { canonical: 'No Sugar', en: 'No Sugar', km: 'គ្មានស្ករ', zh: '无糖' },
];

export function getGlossaryPromptContext(): string {
  return MENU_GLOSSARY.map(
    (g) => `- ${g.canonical} => EN: "${g.en}", KM: "${g.km}", ZH: "${g.zh}"`
  ).join('\n');
}
