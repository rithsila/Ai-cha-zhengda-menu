export interface GlossaryTerm {
  canonical: string;
  en: string;
  km: string;
  zh: string;
}

export const MENU_GLOSSARY: GlossaryTerm[] = [
  {
    canonical: 'Ai-Cha',
    en: 'Ai-Cha',
    km: 'Ai-Cha',
    zh: '爱茶',
  },
  {
    canonical: 'Zhengda',
    en: 'Zhengda',
    km: 'ចឹងតា',
    zh: '正大',
  },
  {
    canonical: 'Ai-Scream',
    en: 'Ai-Scream',
    km: 'Ai-Scream',
    zh: '爱冰淇淋',
  },
  {
    canonical: 'Sund-ai',
    en: 'Sund-ai',
    km: 'Sund-ai',
    zh: '圣代',
  },
  {
    canonical: 'Boba Pearl',
    en: 'Boba Pearl',
    km: 'គុជ',
    zh: '珍珠',
  },
  {
    canonical: 'Brown Sugar',
    en: 'Brown Sugar',
    km: 'ស្ករត្នោត',
    zh: '黑糖',
  },
  {
    canonical: 'Coconut Jelly',
    en: 'Coconut Jelly',
    km: 'ចាហួយដូង',
    zh: '椰果',
  },
  {
    canonical: 'Oolong Tea Jelly',
    en: 'Oolong Tea Jelly',
    km: 'ចាហួយតែអ៊ូឡុង',
    zh: '乌龙茶冻',
  },
  {
    canonical: 'Mala',
    en: 'Mala',
    km: 'ម៉ាឡា',
    zh: '麻辣',
  },
  {
    canonical: 'XXL Crispy Chicken',
    en: 'XXL Crispy Chicken',
    km: 'សាច់មាន់បំពង XXL',
    zh: 'XXL大鸡排',
  },
];

export function getGlossaryPromptContext(): string {
  return MENU_GLOSSARY.map(
    (g) => `- ${g.canonical} => EN: "${g.en}", KM: "${g.km}", ZH: "${g.zh}"`
  ).join('\n');
}
