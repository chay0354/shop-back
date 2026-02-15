import 'dotenv/config';
import { supabase } from './supabase.js';

const categories = [
  { name_he: 'משקאות', slug: 'beverages', sort_order: 1, icon: '🍹' },
  { name_he: 'פארם וטיפוח', slug: 'pharm-care', sort_order: 2, icon: '✨' },
  { name_he: 'המזווה', slug: 'pantry', sort_order: 3, icon: '🛒' },
  { name_he: 'מתנות קטנות', slug: 'small-gifts', sort_order: 4, icon: '🎁' },
  { name_he: 'מוצרי עישון פרימיום', slug: 'premium-smoking', sort_order: 5, icon: '🚬' },
  { name_he: 'ציוד משרדי יצירה וטרנדים', slug: 'office-craft-trends', sort_order: 6, icon: '📎' },
  { name_he: 'הכל לבית', slug: 'home', sort_order: 7, icon: '🏠' },
  { name_he: 'חשמל ואלקטרוניקה', slug: 'electronics', sort_order: 8, icon: '⚡' },
  { name_he: 'ביגוד והנעלה', slug: 'clothing-footwear', sort_order: 9, icon: '👕' },
];

const subcategoriesBySlug = {
  beverages: ['קלים', 'מוגזים', 'אנרגיה', 'יין', 'בירות', 'חריפים'],
  'pharm-care': ['שמפו ותחליבים', 'טיפוח', 'ויטמינים ותוספי תזונה'],
  pantry: [
    'חטיפים',
    'מתוקים',
    'תה וקפה',
    'בישול אפייה ושימורים',
    'ממרחים רטבים ותוספות',
    'חד פעמי וניקיון',
    'מזון קפוא ומקורר',
    'ציוד ומזון לבעלי חיים',
  ],
  'small-gifts': [],
  'premium-smoking': [],
  'office-craft-trends': ['ציוד משרדי', 'משחקי קופסא ויצירה', 'טראנדים חמים'],
  home: ['כלים מקצועיים', 'לבית ולמטבח'],
  electronics: ['תאורה', 'מובייל', 'מחשוב', 'דברי חשמל קטנים', 'קו לבן'],
  'clothing-footwear': ['ביגוד', 'הנעלה'],
};

async function seed() {
  const { data: existingCats } = await supabase.from('categories').select('id').limit(1);
  const hasCategories = existingCats && existingCats.length > 0;

  if (!hasCategories) {
    const { data: insertedCats, error: catErr } = await supabase
    .from('categories')
    .insert(categories)
    .select('id, slug');
    if (catErr) {
      console.error('Categories insert failed:', catErr);
      return;
    }

    const subcategories = [];
    for (const cat of insertedCats) {
      const names = subcategoriesBySlug[cat.slug] || [];
      names.forEach((name_he, i) => {
        subcategories.push({
          category_id: cat.id,
          name_he,
          slug: `${cat.slug}-${i}`,
          sort_order: i + 1,
        });
      });
    }

    if (subcategories.length) {
      const { error: subErr } = await supabase.from('subcategories').insert(subcategories);
      if (subErr) console.error('Subcategories insert failed:', subErr);
      else console.log('Inserted', subcategories.length, 'subcategories');
    }
  } else {
    console.log('Categories already exist. Skipping categories & subcategories.');
  }

  // Products: key = subcategory slug (e.g. beverages-0, pantry-2) — seed if table empty
  const { data: allSubs } = await supabase.from('subcategories').select('id, slug').order('sort_order');
  const { data: existingProducts } = await supabase.from('products').select('id').limit(1);
  if (existingProducts && existingProducts.length > 0) {
    console.log('Products already exist. Skipping product seed.');
  } else {
    const productRows = [];
    for (const sub of allSubs || []) {
      const list = sampleProductsBySubSlug[sub.slug] || [];
      list.forEach((p, i) => productRows.push({
        subcategory_id: sub.id,
        name_he: p.name_he,
        description_he: p.description_he || null,
        price: p.price,
        sort_order: i + 1,
      }));
    }
    if (productRows.length) {
      const { error: prodErr } = await supabase.from('products').insert(productRows);
      if (prodErr) console.error('Products insert failed:', prodErr);
      else console.log('Inserted', productRows.length, 'products');
    }
  }
  console.log('Seed done.');
}

// Sample products per subcategory (slug of sub = e.g. beverages-0, beverages-1, ...)
const sampleProductsBySubSlug = {
  'beverages-0': [
    { name_he: 'מיץ תפוזים 1ל', price: 12.9, description_he: 'מיץ טבעי' },
    { name_he: 'מיץ תפוחים 1ל', price: 11.5 },
    { name_he: 'משקה מולטיויטמין', price: 8.9 },
  ],
  'beverages-1': [
    { name_he: 'קולה 1.5ל', price: 7.9 },
    { name_he: 'ספרייט 1.5ל', price: 6.9 },
    { name_he: 'סודה 1ל', price: 4.5 },
  ],
  'beverages-2': [
    { name_he: 'רד בול 250ml', price: 9.9 },
    { name_he: ' Monster אנרגיה', price: 10.5 },
  ],
  'beverages-3': [
    { name_he: 'יין אדום יבש 750ml', price: 49 },
    { name_he: 'יין לבן חצי יבש', price: 42 },
  ],
  'beverages-4': [
    { name_he: 'בירה מקומית 6-pack', price: 36 },
    { name_he: 'בירה מיובאת 330ml', price: 12 },
  ],
  'beverages-5': [
    { name_he: 'וודקה 700ml', price: 89 },
    { name_he: 'וויסקי 700ml', price: 120 },
  ],
  'pharm-care-0': [
    { name_he: 'שמפו לשיער יבש', price: 24.9 },
    { name_he: 'מרכך שיער', price: 19.9 },
    { name_he: 'תחליב גוף 400ml', price: 29.9 },
  ],
  'pharm-care-1': [
    { name_he: 'קרם פנים', price: 45 },
    { name_he: 'סרום ויטמין C', price: 79 },
  ],
  'pharm-care-2': [
    { name_he: 'מולטיויטמין 90 כמוסות', price: 59 },
    { name_he: 'ויטמין D3', price: 34 },
    { name_he: 'אומגה 3', price: 49 },
  ],
  'pantry-0': [
    { name_he: 'צ\'יפס 200g', price: 11.9 },
    { name_he: 'ביסלי ג\'בניקה', price: 7.5 },
    { name_he: 'חטיף שוקולד', price: 8.9 },
  ],
  'pantry-1': [
    { name_he: 'שוקולד חלב 100g', price: 12 },
    { name_he: 'ממתק גומי', price: 15 },
    { name_he: 'עוגיות שוקולד', price: 14.9 },
  ],
  'pantry-2': [
    { name_he: 'תה ירוק 20 שקיות', price: 18 },
    { name_he: 'קפה פילטר 500g', price: 42 },
    { name_he: 'נס קפה 200g', price: 28 },
  ],
  'pantry-3': [
    { name_he: 'שמן זית 750ml', price: 38 },
    { name_he: 'ריבה 400g', price: 16 },
    { name_he: 'שימור עגבניות 400g', price: 8.9 },
  ],
  'pantry-4': [
    { name_he: 'טחינה 500g', price: 22 },
    { name_he: 'קטשופ 500g', price: 12.9 },
    { name_he: 'מיונז 400g', price: 14 },
  ],
  'office-craft-trends-0': [
    { name_he: 'מחברת A4', price: 12 },
    { name_he: 'עט כדורי 5 יח\'', price: 15 },
    { name_he: 'קלסר עם קלמר', price: 24 },
  ],
  'office-craft-trends-1': [
    { name_he: 'משחק מונופול', price: 129 },
    { name_he: 'סט צבעים 24', price: 35 },
  ],
  'home-0': [
    { name_he: 'סט סכינים מקצועי', price: 199 },
    { name_he: 'מחבת ברזל', price: 89 },
  ],
  'home-1': [
    { name_he: 'כוסות זכוכית 6', price: 45 },
    { name_he: 'מגש הגשה', price: 55 },
  ],
  'electronics-0': [
    { name_he: 'מנורת לד שולחנית', price: 69 },
    { name_he: 'פס תאורה', price: 89 },
  ],
  'electronics-1': [
    { name_he: 'מטען מהיר 45W', price: 79 },
    { name_he: 'כבל USB-C 2m', price: 35 },
  ],
  'electronics-2': [
    { name_he: 'עכבר אלחוטי', price: 99 },
    { name_he: 'מקלדת מכנית', price: 299 },
  ],
  'clothing-footwear-0': [
    { name_he: 'חולצת טריקו', price: 49 },
    { name_he: 'מכנסיים קצרים', price: 79 },
  ],
  'clothing-footwear-1': [
    { name_he: 'נעלי ספורט', price: 249 },
    { name_he: 'כפכפים', price: 59 },
  ],
};

seed();
