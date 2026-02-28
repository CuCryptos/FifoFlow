import { getDb } from './db.js';

const SEED_ITEMS = [
  { name: 'Ahi Tuna', category: 'Seafood', unit: 'lb' },
  { name: 'Mahi Mahi', category: 'Seafood', unit: 'lb' },
  { name: 'Jumbo Shrimp', category: 'Seafood', unit: 'lb' },
  { name: 'Chicken Breast', category: 'Meats', unit: 'lb' },
  { name: 'Prime Rib', category: 'Meats', unit: 'lb' },
  { name: 'Kalua Pork', category: 'Meats', unit: 'lb' },
  { name: 'Jasmine Rice', category: 'Dry Goods', unit: 'bag' },
  { name: 'Macadamia Nuts', category: 'Dry Goods', unit: 'bag' },
  { name: 'Panko Breadcrumbs', category: 'Dry Goods', unit: 'box' },
  { name: 'Soy Sauce', category: 'Dry Goods', unit: 'bottle' },
  { name: 'Sesame Oil', category: 'Dry Goods', unit: 'bottle' },
  { name: 'Maui Onion', category: 'Produce', unit: 'each' },
  { name: 'Baby Bok Choy', category: 'Produce', unit: 'lb' },
  { name: 'Fresh Ginger', category: 'Produce', unit: 'lb' },
  { name: 'Lemongrass', category: 'Produce', unit: 'each' },
  { name: 'Pineapple', category: 'Produce', unit: 'each' },
  { name: 'Heavy Cream', category: 'Dairy', unit: 'qt' },
  { name: 'Unsalted Butter', category: 'Dairy', unit: 'lb' },
  { name: 'Kona Brewing Big Wave', category: 'Beverages', unit: 'case' },
  { name: 'Maui Brewing Bikini Blonde', category: 'Beverages', unit: 'case' },
  { name: 'House White Wine', category: 'Beverages', unit: 'bottle' },
  { name: 'House Red Wine', category: 'Beverages', unit: 'bottle' },
  { name: 'Coconut Syrup', category: 'Beverages', unit: 'bottle' },
  { name: 'To-Go Containers', category: 'Supplies', unit: 'case' },
  { name: 'Cocktail Napkins', category: 'Supplies', unit: 'case' },
  { name: 'Disposable Gloves', category: 'Supplies', unit: 'box' },
  { name: 'Chafing Fuel', category: 'Equipment', unit: 'case' },
];

function seed() {
  const db = getDb();

  const existingCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number };
  if (existingCount.count > 0) {
    console.log('Database already seeded, skipping.');
    db.close();
    return;
  }

  const insertItem = db.prepare(
    'INSERT INTO items (name, category, unit) VALUES (@name, @category, @unit)'
  );
  const insertTx = db.prepare(
    'INSERT INTO transactions (item_id, type, quantity, reason, notes) VALUES (@item_id, @type, @quantity, @reason, @notes)'
  );
  const updateQty = db.prepare(
    'UPDATE items SET current_qty = current_qty + @delta WHERE id = @id'
  );

  const seedAll = db.transaction(() => {
    for (const item of SEED_ITEMS) {
      const result = insertItem.run(item);
      const itemId = result.lastInsertRowid as number;

      // Give each item a random initial receiving
      const qty = Math.floor(Math.random() * 40) + 5;
      insertTx.run({
        item_id: itemId,
        type: 'in',
        quantity: qty,
        reason: 'Received',
        notes: 'Initial inventory count',
      });
      updateQty.run({ delta: qty, id: itemId });

      // Use some of each item randomly
      const used = Math.floor(Math.random() * qty * 0.8);
      if (used > 0) {
        insertTx.run({
          item_id: itemId,
          type: 'out',
          quantity: used,
          reason: 'Used',
          notes: null,
        });
        updateQty.run({ delta: -used, id: itemId });
      }
    }
  });

  seedAll();
  console.log(`Seeded ${SEED_ITEMS.length} items with transactions.`);
  db.close();
}

seed();
