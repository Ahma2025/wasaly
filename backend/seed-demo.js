// تعبئة بيانات تجريبية: 10 مطاعم + 5 سوبرماركت + 3 صيدليات، بمنتجات وإضافات وصور
// قابل لإعادة التشغيل (يحذف البيانات التجريبية القديمة أولاً)

const img = (kw, n) => `https://loremflickr.com/500/400/${kw}?lock=${n}`;
let LOCK = 100;
const nextImg = (kw) => img(kw, ++LOCK);

// إضافات جاهزة
const A_SIZE = { name_ar: 'الحجم', type: 'single', is_required: true, values: [
  { name_ar: 'صغير', extra_price: 0 }, { name_ar: 'وسط', extra_price: 3 }, { name_ar: 'كبير', extra_price: 6 } ] };
const A_EXTRAS = { name_ar: 'إضافات', type: 'multiple', is_required: false, values: [
  { name_ar: 'جبنة إضافية', extra_price: 2 }, { name_ar: 'صوص حار', extra_price: 1 }, { name_ar: 'بطاطا', extra_price: 5 } ] };
const A_DRINK = { name_ar: 'مشروب', type: 'single', is_required: false, values: [
  { name_ar: 'بدون', extra_price: 0 }, { name_ar: 'بيبسي', extra_price: 3 }, { name_ar: 'ماء', extra_price: 1 } ] };

// تعريف المتاجر
function buildStores() {
  const R = (name, desc, cat, cats) => ({ name, desc, store_type: 'restaurant', category: cat, cats });
  const S = (name, desc, cats) => ({ name, desc, store_type: 'supermarket', category: 'سوبرماركت', cats });
  const P = (name, desc, cats) => ({ name, desc, store_type: 'pharmacy', category: 'صيدلية', cats });
  const it = (name_ar, price, opts = {}) => ({ name_ar, price, ...opts });

  return [
    // ===== مطاعم =====
    R('مطعم البيك', 'ألذّ دجاج مقلي بالبلد', 'دجاج', [
      { name_ar: 'الوجبات', items: [
        it('وجبة بروست دجاج', 25, { image: nextImg('fried,chicken'), calories: 780, addons: [A_SIZE, A_DRINK] }),
        it('وجبة زنجر', 22, { image: nextImg('chicken,burger'), discount_price: 19, calories: 650, addons: [A_EXTRAS, A_DRINK] }),
        it('دجاج بروست عائلي', 55, { image: nextImg('roast,chicken'), calories: 1900 }),
      ]},
      { name_ar: 'الإضافات', items: [
        it('بطاطا مقلية', 8, { image: nextImg('fries'), is_vegetarian: true }),
        it('سلطة كولسلو', 6, { image: nextImg('coleslaw,salad'), is_vegetarian: true, calories: 150 }),
      ]},
    ]),
    R('برجر هاوس', 'برجر لحم طازج على الفحم', 'برجر', [
      { name_ar: 'البرجر', items: [
        it('تشيز برجر', 30, { image: nextImg('cheeseburger'), calories: 850, addons: [A_EXTRAS, A_DRINK] }),
        it('دبل برجر', 42, { image: nextImg('burger'), discount_price: 37, calories: 1200, addons: [A_EXTRAS, A_DRINK] }),
        it('برجر دجاج حار', 28, { image: nextImg('spicy,chicken,burger'), is_spicy: true, calories: 700, addons: [A_EXTRAS] }),
      ]},
      { name_ar: 'جانبية', items: [
        it('حلقات بصل', 10, { image: nextImg('onion,rings'), is_vegetarian: true }),
        it('بطاطا ودجز', 12, { image: nextImg('potato,wedges'), is_vegetarian: true }),
      ]},
    ]),
    R('بيتزا رومانا', 'بيتزا إيطالية بعجينة طازجة', 'بيتزا', [
      { name_ar: 'البيتزا', items: [
        it('بيتزا مارغريتا', 35, { image: nextImg('margherita,pizza'), is_vegetarian: true, calories: 900, addons: [A_SIZE] }),
        it('بيتزا بيبروني', 42, { image: nextImg('pepperoni,pizza'), discount_price: 38, calories: 1100, addons: [A_SIZE, A_EXTRAS] }),
        it('بيتزا خضار', 38, { image: nextImg('vegetable,pizza'), is_vegetarian: true, addons: [A_SIZE] }),
      ]},
      { name_ar: 'مقبلات', items: [
        it('خبز بالثوم', 12, { image: nextImg('garlic,bread'), is_vegetarian: true }),
        it('لازانيا', 30, { image: nextImg('lasagna'), calories: 800 }),
      ]},
    ]),
    R('شاورما الأصيل', 'شاورما عربي على الفحم', 'شاورما', [
      { name_ar: 'الساندويش', items: [
        it('شاورما دجاج', 15, { image: nextImg('shawarma,wrap'), calories: 550, addons: [A_EXTRAS] }),
        it('شاورما لحمة', 18, { image: nextImg('meat,shawarma'), discount_price: 16, addons: [A_EXTRAS] }),
        it('صحن شاورما', 32, { image: nextImg('shawarma,plate') }),
      ]},
      { name_ar: 'مشروبات', items: [
        it('عيران', 4, { image: nextImg('ayran,drink') }),
        it('كولا', 3, { image: nextImg('cola') }),
      ]},
    ]),
    R('مشاوي الفروسية', 'مشاوي مشكّلة على الفحم', 'مشاوي', [
      { name_ar: 'المشاوي', items: [
        it('مشاوي مشكّلة', 60, { image: nextImg('grill,meat'), calories: 1400, addons: [A_DRINK] }),
        it('شيش طاووق', 40, { image: nextImg('shish,tawook'), discount_price: 35, addons: [A_EXTRAS] }),
        it('كباب لحمة', 45, { image: nextImg('kebab') }),
      ]},
      { name_ar: 'مقبلات', items: [
        it('حمص', 8, { image: nextImg('hummus'), is_vegetarian: true }),
        it('متبل', 8, { image: nextImg('mutabbal'), is_vegetarian: true }),
      ]},
    ]),
    R('فلافل أبو علي', 'فلافل ومناقيش بلدية', 'فلافل', [
      { name_ar: 'الفطور', items: [
        it('صحن فلافل', 12, { image: nextImg('falafel'), is_vegetarian: true, is_vegan: true }),
        it('منقوشة زعتر', 5, { image: nextImg('zaatar,manakish'), is_vegetarian: true }),
        it('منقوشة جبنة', 7, { image: nextImg('cheese,manakish'), is_vegetarian: true, addons: [A_EXTRAS] }),
      ]},
    ]),
    R('معجنات الريف', 'معجنات طازجة يومياً', 'معجنات', [
      { name_ar: 'المعجنات', items: [
        it('فطيرة سبانخ', 4, { image: nextImg('spinach,pastry'), is_vegetarian: true }),
        it('صفيحة لحمة', 5, { image: nextImg('meat,pastry') }),
        it('بيتزا صغيرة', 6, { image: nextImg('mini,pizza'), addons: [A_EXTRAS] }),
      ]},
    ]),
    R('سمك البحر', 'مأكولات بحرية طازجة', 'بحري', [
      { name_ar: 'الأسماك', items: [
        it('سمك مقلي', 50, { image: nextImg('fried,fish'), calories: 700, addons: [A_SIZE] }),
        it('روبيان مشوي', 65, { image: nextImg('grilled,shrimp'), discount_price: 58 }),
        it('كاليماري', 40, { image: nextImg('calamari') }),
      ]},
    ]),
    R('صن شاي آسيا', 'مطبخ آسيوي وسوشي', 'آسيوي', [
      { name_ar: 'الأطباق', items: [
        it('نودلز دجاج', 28, { image: nextImg('chicken,noodles'), is_spicy: true, addons: [A_EXTRAS] }),
        it('أرز مقلي', 24, { image: nextImg('fried,rice'), is_vegetarian: true }),
        it('سوشي رول', 45, { image: nextImg('sushi'), discount_price: 39 }),
      ]},
    ]),
    R('حلويات الأصيل', 'حلويات شرقية وغربية', 'حلويات', [
      { name_ar: 'الحلويات', items: [
        it('كنافة نابلسية', 15, { image: nextImg('kunafa'), calories: 600 }),
        it('تشيز كيك', 18, { image: nextImg('cheesecake'), discount_price: 15 }),
        it('بقلاوة', 20, { image: nextImg('baklava') }),
      ]},
    ]),

    // ===== سوبرماركت =====
    S('سوبرماركت السلام', 'كل احتياجات البيت', [
      { name_ar: 'ألبان وأجبان', items: [
        it('حليب طازج 1 لتر', 6, { image: nextImg('milk') }),
        it('جبنة بيضاء', 12, { image: nextImg('white,cheese') }),
        it('لبنة', 9, { image: nextImg('labneh') }),
      ]},
      { name_ar: 'خضار وفواكه', items: [
        it('بندورة 1 كغ', 4, { image: nextImg('tomato') }),
        it('موز 1 كغ', 7, { image: nextImg('banana') }),
      ]},
    ]),
    S('ماركت الوفاء', 'أسعار منافسة وجودة عالية', [
      { name_ar: 'مواد غذائية', items: [
        it('أرز 5 كغ', 35, { image: nextImg('rice,bag'), discount_price: 30 }),
        it('سكر 1 كغ', 5, { image: nextImg('sugar') }),
        it('زيت زيتون 1 لتر', 45, { image: nextImg('olive,oil') }),
      ]},
      { name_ar: 'مشروبات', items: [
        it('ماء 6 عبوات', 8, { image: nextImg('water,bottles') }),
        it('عصير برتقال', 10, { image: nextImg('orange,juice') }),
      ]},
    ]),
    S('بقالة النور', 'بقالتك القريبة', [
      { name_ar: 'أساسيات', items: [
        it('خبز طازج', 3, { image: nextImg('bread') }),
        it('بيض 30 حبة', 22, { image: nextImg('eggs') }),
        it('معكرونة', 4, { image: nextImg('pasta,pack') }),
      ]},
    ]),
    S('هايبر ماركت المدينة', 'تسوّق كل شي من مكان واحد', [
      { name_ar: 'منظّفات', items: [
        it('مسحوق غسيل', 25, { image: nextImg('detergent'), discount_price: 21 }),
        it('صابون أطباق', 8, { image: nextImg('dish,soap') }),
      ]},
      { name_ar: 'وجبات خفيفة', items: [
        it('شيبس', 3, { image: nextImg('chips') }),
        it('شوكولاتة', 5, { image: nextImg('chocolate,bar') }),
      ]},
    ]),
    S('ميني ماركت الحي', 'كل ما تحتاجه بسرعة', [
      { name_ar: 'متنوّعة', items: [
        it('علبة تونة', 7, { image: nextImg('tuna,can') }),
        it('جبنة مثلثات', 11, { image: nextImg('cheese,triangles') }),
        it('كورن فليكس', 18, { image: nextImg('cornflakes') }),
      ]},
    ]),

    // ===== صيدليات =====
    P('صيدلية الشفاء', 'أدوية ومستلزمات طبية', [
      { name_ar: 'أدوية عامة', items: [
        it('بنادول', 12, { image: nextImg('medicine,box') }),
        it('فيتامين سي', 25, { image: nextImg('vitamin,c'), discount_price: 20 }),
        it('شراب سعال', 18, { image: nextImg('cough,syrup') }),
      ]},
      { name_ar: 'عناية', items: [
        it('كمامات طبية', 15, { image: nextImg('face,mask') }),
        it('معقّم يدين', 10, { image: nextImg('hand,sanitizer') }),
      ]},
    ]),
    P('صيدلية الحكمة', 'صحتك تهمنا', [
      { name_ar: 'مكمّلات', items: [
        it('أوميغا 3', 40, { image: nextImg('omega,supplement') }),
        it('كالسيوم', 30, { image: nextImg('calcium,pills') }),
        it('حديد', 28, { image: nextImg('iron,supplement') }),
      ]},
    ]),
    P('صيدلية المدينة', 'خدمة على مدار الساعة', [
      { name_ar: 'مستلزمات', items: [
        it('ميزان حرارة', 22, { image: nextImg('thermometer'), discount_price: 18 }),
        it('ضمادات', 8, { image: nextImg('bandage') }),
        it('قطن طبي', 6, { image: nextImg('cotton') }),
      ]},
    ]),
  ];
}

module.exports = async function seed(pool) {
  const stores = buildStores();

  // خريطة التصنيفات
  const { rows: cats } = await pool.query('SELECT id, name_ar FROM categories');
  const catId = (name) => {
    const c = cats.find(x => x.name_ar && (x.name_ar.includes(name) || name.includes(x.name_ar)));
    return c ? c.id : (cats[0] ? cats[0].id : null);
  };

  // حذف البيانات التجريبية القديمة (email marker)
  const { rows: old } = await pool.query("SELECT id FROM restaurants WHERE email LIKE 'demo-%@wasaly.ps'");
  for (const r of old) {
    await pool.query('DELETE FROM item_option_values WHERE option_id IN (SELECT id FROM item_options WHERE item_id IN (SELECT id FROM menu_items WHERE restaurant_id=$1))', [r.id]);
    await pool.query('DELETE FROM item_options WHERE item_id IN (SELECT id FROM menu_items WHERE restaurant_id=$1)', [r.id]);
    await pool.query('DELETE FROM menu_items WHERE restaurant_id=$1', [r.id]);
    await pool.query('DELETE FROM menu_categories WHERE restaurant_id=$1', [r.id]);
    await pool.query('DELETE FROM restaurants WHERE id=$1', [r.id]);
  }

  let nStores = 0, nItems = 0, nOptions = 0, idx = 0;
  for (const st of stores) {
    idx++;
    const lat = 32.3130 + (Math.random() - 0.5) * 0.04;
    const lng = 35.0290 + (Math.random() - 0.5) * 0.04;
    const rating = (4 + Math.random() * 0.9).toFixed(1);
    const { rows: rrows } = await pool.query(
      `INSERT INTO restaurants
        (name_ar, name_en, description_ar, category_id, city, address, lat, lng, phone, email,
         min_order, delivery_fee, delivery_time_min, delivery_time_max, store_type, logo, cover_image,
         is_active, is_verified, is_open, rating)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,true,true,true,$18) RETURNING id`,
      [
        st.name, st.name, st.desc, catId(st.category), 'طولكرم', 'شارع رئيسي - طولكرم', lat, lng,
        '0599' + (100000 + idx), `demo-${idx}@wasaly.ps`,
        st.store_type === 'restaurant' ? 15 : 10, [0, 3, 5][idx % 3], 20, 45, st.store_type,
        nextImg(st.store_type === 'pharmacy' ? 'pharmacy,logo' : st.store_type === 'supermarket' ? 'supermarket' : 'restaurant,logo'),
        nextImg(st.store_type === 'pharmacy' ? 'pharmacy' : st.store_type === 'supermarket' ? 'grocery,store' : 'restaurant,interior'),
        rating,
      ]
    );
    const restId = rrows[0].id;
    nStores++;

    let sort = 0;
    for (const cat of st.cats) {
      const { rows: crows } = await pool.query(
        'INSERT INTO menu_categories (restaurant_id, name_ar, name_en, sort_order) VALUES ($1,$2,$3,$4) RETURNING id',
        [restId, cat.name_ar, cat.name_ar, sort++]
      );
      const catRid = crows[0].id;

      for (const it of cat.items) {
        const { rows: irows } = await pool.query(
          `INSERT INTO menu_items
            (restaurant_id, category_id, name_ar, name_en, description_ar, image, price, discount_price,
             calories, is_spicy, is_vegetarian, is_vegan, preparation_time)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [
            restId, catRid, it.name_ar, it.name_ar, it.desc || '', it.image || null,
            it.price, it.discount_price || null, it.calories || null,
            !!it.is_spicy, !!it.is_vegetarian, !!it.is_vegan, 15,
          ]
        );
        const itemId = irows[0].id;
        nItems++;

        for (const opt of (it.addons || [])) {
          const { rows: orows } = await pool.query(
            'INSERT INTO item_options (item_id, name_ar, name_en, type, is_required, max_selections) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [itemId, opt.name_ar, opt.name_ar, opt.type, !!opt.is_required, opt.type === 'multiple' ? 5 : 1]
          );
          const optId = orows[0].id;
          nOptions++;
          for (const v of opt.values) {
            await pool.query(
              'INSERT INTO item_option_values (option_id, name_ar, name_en, extra_price) VALUES ($1,$2,$3,$4)',
              [optId, v.name_ar, v.name_ar, v.extra_price || 0]
            );
          }
        }
      }
    }
  }

  return { stores: nStores, items: nItems, optionGroups: nOptions };
};
