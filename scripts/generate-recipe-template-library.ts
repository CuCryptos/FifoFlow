import fs from 'node:fs';
import path from 'node:path';

type Unit = 'g' | 'kg' | 'ml' | 'l' | 'cup' | 'tbsp' | 'tsp' | 'lb' | 'oz' | 'each' | 'clove' | 'stalk';
type Category =
  | 'Sauce'
  | 'Prep component'
  | 'Stock'
  | 'Dressing'
  | 'Base'
  | 'Protein'
  | 'Marinade'
  | 'Baking base'
  | 'Bar mix'
  | 'Cocktail component'
  | 'Common restaurant side';

interface IngredientSeed {
  name: string;
  qty: number;
  unit: Unit;
}

interface RecipeTemplateSeed {
  name: string;
  category: Category;
  yield_quantity: number;
  yield_unit: Unit;
  ingredients: IngredientSeed[];
}

const i = (name: string, qty: number, unit: Unit): IngredientSeed => ({ name, qty, unit });
const t = (
  name: string,
  category: Category,
  yield_quantity: number,
  yield_unit: Unit,
  ingredients: IngredientSeed[],
): RecipeTemplateSeed => ({ name, category, yield_quantity, yield_unit, ingredients });

const sauceTemplates: RecipeTemplateSeed[] = [
  t('Tomato Basil Sauce', 'Sauce', 3, 'l', [i('olive oil', 0.5, 'cup'), i('onion', 2, 'each'), i('garlic', 8, 'clove'), i('crushed tomato', 3, 'l'), i('basil', 2, 'cup'), i('kosher salt', 2, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Roasted Garlic Cream Sauce', 'Sauce', 2, 'l', [i('unsalted butter', 8, 'oz'), i('garlic', 20, 'clove'), i('shallot', 2, 'each'), i('heavy cream', 1500, 'ml'), i('parmesan cheese', 2, 'cup'), i('kosher salt', 1, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Lemon Caper Butter Sauce', 'Sauce', 1500, 'ml', [i('unsalted butter', 12, 'oz'), i('shallot', 2, 'each'), i('garlic', 6, 'clove'), i('white wine', 2, 'cup'), i('lemon juice', 1, 'cup'), i('caper', 0.75, 'cup'), i('parsley', 1, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Red Wine Demi Sauce', 'Sauce', 2, 'l', [i('beef stock', 3, 'l'), i('red wine', 750, 'ml'), i('shallot', 3, 'each'), i('tomato paste', 0.5, 'cup'), i('thyme', 0.25, 'cup'), i('black pepper', 1, 'tbsp'), i('kosher salt', 1, 'tbsp')]),
  t('Chimichurri Sauce', 'Sauce', 1, 'l', [i('parsley', 3, 'cup'), i('oregano', 1, 'cup'), i('garlic', 10, 'clove'), i('red wine vinegar', 1, 'cup'), i('olive oil', 2.5, 'cup'), i('red pepper flake', 2, 'tbsp'), i('kosher salt', 1, 'tbsp')]),
  t('Salsa Verde Sauce', 'Sauce', 1, 'l', [i('parsley', 2, 'cup'), i('cilantro', 2, 'cup'), i('caper', 0.5, 'cup'), i('anchovy', 8, 'each'), i('garlic', 6, 'clove'), i('lemon juice', 0.5, 'cup'), i('olive oil', 2, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Romesco Sauce', 'Sauce', 2, 'l', [i('roasted red pepper', 8, 'each'), i('tomato', 6, 'each'), i('almond', 2, 'cup'), i('garlic', 10, 'clove'), i('sherry vinegar', 0.5, 'cup'), i('olive oil', 2, 'cup'), i('smoked paprika', 2, 'tbsp'), i('kosher salt', 1, 'tbsp')]),
  t('Roasted Pepper Coulis', 'Sauce', 1500, 'ml', [i('roasted red pepper', 10, 'each'), i('onion', 2, 'each'), i('garlic', 8, 'clove'), i('olive oil', 0.5, 'cup'), i('vegetable stock', 2, 'cup'), i('kosher salt', 1, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Teriyaki Sauce', 'Sauce', 2, 'l', [i('soy sauce', 4, 'cup'), i('brown sugar', 2, 'cup'), i('mirin', 2, 'cup'), i('ginger', 8, 'oz'), i('garlic', 10, 'clove'), i('water', 4, 'cup')]),
  t('Hoisin Ginger Glaze', 'Sauce', 1500, 'ml', [i('hoisin sauce', 3, 'cup'), i('soy sauce', 2, 'cup'), i('rice vinegar', 1, 'cup'), i('ginger', 6, 'oz'), i('garlic', 8, 'clove'), i('honey', 1, 'cup'), i('water', 2, 'cup')]),
  t('Black Pepper Pan Sauce', 'Sauce', 1500, 'ml', [i('shallot', 3, 'each'), i('black pepper', 2, 'tbsp'), i('brandy', 1, 'cup'), i('beef stock', 5, 'cup'), i('heavy cream', 2, 'cup'), i('unsalted butter', 6, 'oz'), i('kosher salt', 2, 'tsp')]),
  t('Coconut Curry Sauce', 'Sauce', 2, 'l', [i('neutral oil', 0.5, 'cup'), i('onion', 2, 'each'), i('garlic', 8, 'clove'), i('ginger', 6, 'oz'), i('yellow curry paste', 1, 'cup'), i('coconut milk', 6, 'cup'), i('lime juice', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Green Curry Sauce', 'Sauce', 2, 'l', [i('neutral oil', 0.5, 'cup'), i('green curry paste', 1, 'cup'), i('coconut milk', 7, 'cup'), i('fish sauce', 0.5, 'cup'), i('lime juice', 0.5, 'cup'), i('basil', 1, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Tikka Masala Sauce', 'Sauce', 3, 'l', [i('neutral oil', 0.5, 'cup'), i('onion', 3, 'each'), i('garlic', 12, 'clove'), i('ginger', 8, 'oz'), i('tomato puree', 2, 'l'), i('heavy cream', 3, 'cup'), i('garam masala', 3, 'tbsp'), i('cumin', 1, 'tbsp'), i('kosher salt', 1, 'tbsp')]),
  t('Thai Peanut Sauce', 'Sauce', 1500, 'ml', [i('peanut butter', 3, 'cup'), i('coconut milk', 3, 'cup'), i('soy sauce', 1, 'cup'), i('lime juice', 0.5, 'cup'), i('brown sugar', 0.75, 'cup'), i('ginger', 4, 'oz'), i('garlic', 6, 'clove')]),
  t('Herb Yogurt Sauce', 'Sauce', 2, 'l', [i('greek yogurt', 2, 'l'), i('cucumber', 2, 'each'), i('garlic', 6, 'clove'), i('dill', 1, 'cup'), i('mint', 1, 'cup'), i('lemon juice', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Mushroom Pan Sauce', 'Sauce', 2, 'l', [i('unsalted butter', 8, 'oz'), i('mushroom', 2, 'lb'), i('shallot', 3, 'each'), i('garlic', 8, 'clove'), i('white wine', 2, 'cup'), i('chicken stock', 5, 'cup'), i('thyme', 0.5, 'cup'), i('heavy cream', 2, 'cup')]),
  t('Peppercorn Brandy Sauce', 'Sauce', 1500, 'ml', [i('shallot', 2, 'each'), i('green peppercorn', 0.5, 'cup'), i('brandy', 1, 'cup'), i('veal stock', 4, 'cup'), i('heavy cream', 2, 'cup'), i('unsalted butter', 4, 'oz'), i('kosher salt', 2, 'tsp')]),
];

const prepTemplates: RecipeTemplateSeed[] = [
  t('Pickled Red Onion', 'Prep component', 2, 'l', [i('red onion', 8, 'each'), i('apple cider vinegar', 4, 'cup'), i('water', 4, 'cup'), i('sugar', 1.5, 'cup'), i('kosher salt', 0.5, 'cup')]),
  t('Pickled Cucumber', 'Prep component', 2, 'l', [i('cucumber', 8, 'each'), i('rice vinegar', 4, 'cup'), i('water', 4, 'cup'), i('sugar', 1.5, 'cup'), i('kosher salt', 0.5, 'cup'), i('dill', 1, 'cup')]),
  t('Roasted Garlic Puree', 'Prep component', 1, 'l', [i('garlic', 80, 'clove'), i('olive oil', 3, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Caramelized Onion Base', 'Prep component', 2, 'kg', [i('yellow onion', 5, 'kg'), i('olive oil', 1, 'cup'), i('unsalted butter', 8, 'oz'), i('kosher salt', 2, 'tbsp')]),
  t('Parsley Herb Oil', 'Prep component', 1500, 'ml', [i('parsley', 6, 'cup'), i('neutral oil', 5, 'cup'), i('kosher salt', 1, 'tsp')]),
  t('Chili Crisp Base', 'Prep component', 2, 'l', [i('neutral oil', 6, 'cup'), i('garlic', 20, 'clove'), i('shallot', 6, 'each'), i('red pepper flake', 2, 'cup'), i('sesame seed', 1, 'cup'), i('soy sauce', 0.5, 'cup')]),
  t('Sofrito Base', 'Prep component', 2, 'kg', [i('onion', 8, 'each'), i('green bell pepper', 6, 'each'), i('red bell pepper', 4, 'each'), i('garlic', 12, 'clove'), i('cilantro', 2, 'cup'), i('olive oil', 1, 'cup')]),
  t('Mirepoix Mix', 'Prep component', 3, 'kg', [i('onion', 2, 'kg'), i('carrot', 1, 'kg'), i('celery', 12, 'stalk')]),
  t('Cajun Trinity Mix', 'Prep component', 3, 'kg', [i('onion', 2, 'kg'), i('green bell pepper', 1.5, 'kg'), i('celery', 16, 'stalk')]),
  t('Ginger Garlic Paste', 'Prep component', 2, 'kg', [i('ginger', 1, 'kg'), i('garlic', 80, 'clove'), i('neutral oil', 2, 'cup'), i('kosher salt', 2, 'tbsp')]),
  t('Confit Garlic', 'Prep component', 1500, 'ml', [i('garlic', 100, 'clove'), i('olive oil', 6, 'cup'), i('thyme', 1, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Tomato Concasse', 'Prep component', 2, 'kg', [i('roma tomato', 4, 'kg'), i('olive oil', 0.5, 'cup'), i('kosher salt', 1, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Crispy Shallot', 'Prep component', 1, 'kg', [i('shallot', 3, 'kg'), i('rice flour', 2, 'cup'), i('kosher salt', 1, 'tbsp'), i('neutral oil', 2, 'l')]),
  t('Toasted Breadcrumb', 'Prep component', 1500, 'g', [i('panko breadcrumb', 10, 'cup'), i('olive oil', 1, 'cup'), i('garlic', 6, 'clove'), i('parsley', 1, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Preserved Lemon Mix', 'Prep component', 2, 'kg', [i('lemon', 20, 'each'), i('kosher salt', 3, 'cup'), i('lemon juice', 4, 'cup')]),
  t('Roasted Mushroom Mix', 'Prep component', 2, 'kg', [i('mushroom', 4, 'kg'), i('olive oil', 1, 'cup'), i('thyme', 0.5, 'cup'), i('garlic', 8, 'clove'), i('kosher salt', 2, 'tbsp')]),
  t('Braised Greens Base', 'Prep component', 2, 'kg', [i('collard green', 4, 'lb'), i('onion', 2, 'each'), i('garlic', 8, 'clove'), i('chicken stock', 4, 'cup'), i('apple cider vinegar', 0.5, 'cup')]),
  t('Charred Corn Relish', 'Prep component', 2, 'kg', [i('corn kernel', 3, 'kg'), i('red onion', 2, 'each'), i('jalapeno', 4, 'each'), i('cilantro', 2, 'cup'), i('lime juice', 1, 'cup'), i('olive oil', 0.5, 'cup')]),
];

const stockTemplates: RecipeTemplateSeed[] = [
  t('Chicken Stock', 'Stock', 8, 'l', [i('chicken bone', 12, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('garlic', 12, 'clove'), i('thyme', 1, 'cup'), i('bay leaf', 8, 'each'), i('water', 10, 'l')]),
  t('Brown Chicken Stock', 'Stock', 8, 'l', [i('roasted chicken bone', 12, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('tomato paste', 0.5, 'cup'), i('thyme', 1, 'cup'), i('water', 10, 'l')]),
  t('Veal Stock', 'Stock', 8, 'l', [i('veal bone', 14, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('tomato paste', 0.5, 'cup'), i('thyme', 1, 'cup'), i('water', 10, 'l')]),
  t('Beef Stock', 'Stock', 8, 'l', [i('beef bone', 14, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('garlic', 10, 'clove'), i('thyme', 1, 'cup'), i('water', 10, 'l')]),
  t('Vegetable Stock', 'Stock', 8, 'l', [i('onion', 5, 'each'), i('carrot', 3, 'kg'), i('celery', 16, 'stalk'), i('mushroom', 2, 'lb'), i('garlic', 10, 'clove'), i('parsley', 2, 'cup'), i('water', 10, 'l')]),
  t('Mushroom Stock', 'Stock', 8, 'l', [i('mushroom', 6, 'lb'), i('onion', 4, 'each'), i('celery', 10, 'stalk'), i('garlic', 8, 'clove'), i('thyme', 1, 'cup'), i('water', 10, 'l')]),
  t('Shellfish Stock', 'Stock', 8, 'l', [i('shrimp shell', 10, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 10, 'stalk'), i('tomato paste', 0.5, 'cup'), i('white wine', 2, 'cup'), i('water', 10, 'l')]),
  t('Fish Fumet', 'Stock', 6, 'l', [i('fish bone', 10, 'lb'), i('onion', 3, 'each'), i('celery', 8, 'stalk'), i('fennel', 2, 'each'), i('white wine', 2, 'cup'), i('parsley', 1, 'cup'), i('water', 8, 'l')]),
  t('Pork Stock', 'Stock', 8, 'l', [i('pork bone', 14, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('garlic', 10, 'clove'), i('thyme', 1, 'cup'), i('water', 10, 'l')]),
  t('Ramen Broth Base', 'Stock', 8, 'l', [i('pork bone', 12, 'lb'), i('chicken bone', 6, 'lb'), i('onion', 4, 'each'), i('garlic', 16, 'clove'), i('ginger', 12, 'oz'), i('scallion', 2, 'cup'), i('water', 10, 'l')]),
  t('Pho Broth Base', 'Stock', 8, 'l', [i('beef bone', 14, 'lb'), i('onion', 4, 'each'), i('ginger', 12, 'oz'), i('cinnamon stick', 8, 'each'), i('star anise', 10, 'each'), i('fish sauce', 0.5, 'cup'), i('water', 10, 'l')]),
  t('Dashi', 'Stock', 4, 'l', [i('water', 5, 'l'), i('kombu', 8, 'oz'), i('bonito flake', 10, 'oz')]),
  t('Corn Stock', 'Stock', 6, 'l', [i('corn cob', 20, 'each'), i('onion', 3, 'each'), i('celery', 8, 'stalk'), i('thyme', 1, 'cup'), i('water', 8, 'l')]),
  t('Lamb Stock', 'Stock', 8, 'l', [i('lamb bone', 14, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('garlic', 10, 'clove'), i('rosemary', 1, 'cup'), i('water', 10, 'l')]),
  t('Turkey Stock', 'Stock', 8, 'l', [i('turkey bone', 14, 'lb'), i('onion', 4, 'each'), i('carrot', 2, 'kg'), i('celery', 12, 'stalk'), i('thyme', 1, 'cup'), i('bay leaf', 8, 'each'), i('water', 10, 'l')]),
  t('Tomato Stock', 'Stock', 6, 'l', [i('tomato', 6, 'kg'), i('onion', 3, 'each'), i('garlic', 8, 'clove'), i('basil', 2, 'cup'), i('water', 7, 'l')]),
  t('Chili Broth Base', 'Stock', 6, 'l', [i('chicken stock', 5, 'l'), i('tomato', 2, 'kg'), i('onion', 3, 'each'), i('garlic', 12, 'clove'), i('ancho chile', 12, 'each'), i('cumin', 2, 'tbsp')]),
  t('Coconut Lemongrass Broth', 'Stock', 6, 'l', [i('coconut milk', 3, 'l'), i('vegetable stock', 3, 'l'), i('lemongrass', 10, 'stalk'), i('ginger', 8, 'oz'), i('lime juice', 1, 'cup'), i('fish sauce', 0.5, 'cup')]),
];

const dressingTemplates: RecipeTemplateSeed[] = [
  t('Caesar Dressing', 'Dressing', 2, 'l', [i('egg yolk', 12, 'each'), i('garlic', 12, 'clove'), i('anchovy', 20, 'each'), i('lemon juice', 1, 'cup'), i('dijon mustard', 3, 'tbsp'), i('olive oil', 6, 'cup'), i('parmesan cheese', 2, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Ranch Dressing', 'Dressing', 3, 'l', [i('mayonnaise', 2, 'l'), i('buttermilk', 1, 'l'), i('sour cream', 2, 'cup'), i('garlic', 6, 'clove'), i('dill', 1, 'cup'), i('chive', 1, 'cup'), i('black pepper', 1, 'tbsp')]),
  t('Balsamic Vinaigrette', 'Dressing', 2, 'l', [i('balsamic vinegar', 2, 'cup'), i('dijon mustard', 0.25, 'cup'), i('garlic', 6, 'clove'), i('honey', 0.5, 'cup'), i('olive oil', 6, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Lemon Herb Vinaigrette', 'Dressing', 2, 'l', [i('lemon juice', 2, 'cup'), i('shallot', 2, 'each'), i('parsley', 1, 'cup'), i('oregano', 0.5, 'cup'), i('olive oil', 6, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Champagne Vinaigrette', 'Dressing', 2, 'l', [i('champagne vinegar', 2, 'cup'), i('shallot', 2, 'each'), i('dijon mustard', 0.25, 'cup'), i('olive oil', 6, 'cup'), i('kosher salt', 1, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Honey Mustard Dressing', 'Dressing', 2, 'l', [i('dijon mustard', 1, 'cup'), i('honey', 1, 'cup'), i('apple cider vinegar', 1.5, 'cup'), i('olive oil', 4, 'cup'), i('mayonnaise', 2, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Green Goddess Dressing', 'Dressing', 2, 'l', [i('mayonnaise', 4, 'cup'), i('sour cream', 3, 'cup'), i('parsley', 2, 'cup'), i('tarragon', 0.5, 'cup'), i('chive', 1, 'cup'), i('anchovy', 8, 'each'), i('lemon juice', 0.75, 'cup')]),
  t('Blue Cheese Dressing', 'Dressing', 2, 'l', [i('mayonnaise', 4, 'cup'), i('sour cream', 3, 'cup'), i('buttermilk', 3, 'cup'), i('blue cheese', 3, 'cup'), i('lemon juice', 0.5, 'cup'), i('black pepper', 2, 'tsp')]),
  t('Sesame Ginger Dressing', 'Dressing', 2, 'l', [i('rice vinegar', 2, 'cup'), i('soy sauce', 1, 'cup'), i('ginger', 6, 'oz'), i('garlic', 6, 'clove'), i('sesame oil', 1, 'cup'), i('neutral oil', 4, 'cup'), i('honey', 0.5, 'cup')]),
  t('Miso Carrot Dressing', 'Dressing', 2, 'l', [i('carrot', 1, 'kg'), i('white miso', 2, 'cup'), i('rice vinegar', 1.5, 'cup'), i('ginger', 4, 'oz'), i('neutral oil', 4, 'cup'), i('sesame oil', 0.5, 'cup')]),
  t('Red Wine Vinaigrette', 'Dressing', 2, 'l', [i('red wine vinegar', 2, 'cup'), i('dijon mustard', 0.25, 'cup'), i('shallot', 2, 'each'), i('olive oil', 6, 'cup'), i('oregano', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Sherry Shallot Dressing', 'Dressing', 2, 'l', [i('sherry vinegar', 2, 'cup'), i('shallot', 4, 'each'), i('dijon mustard', 0.25, 'cup'), i('olive oil', 6, 'cup'), i('black pepper', 2, 'tsp')]),
  t('Herb Buttermilk Dressing', 'Dressing', 2, 'l', [i('buttermilk', 1.5, 'l'), i('mayonnaise', 3, 'cup'), i('parsley', 1, 'cup'), i('chive', 1, 'cup'), i('dill', 0.5, 'cup'), i('garlic', 4, 'clove')]),
  t('Cilantro Lime Dressing', 'Dressing', 2, 'l', [i('cilantro', 3, 'cup'), i('lime juice', 1.5, 'cup'), i('garlic', 4, 'clove'), i('jalapeno', 4, 'each'), i('olive oil', 5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Tahini Lemon Dressing', 'Dressing', 2, 'l', [i('tahini', 3, 'cup'), i('lemon juice', 1.5, 'cup'), i('garlic', 8, 'clove'), i('water', 4, 'cup'), i('olive oil', 1, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Poppy Seed Dressing', 'Dressing', 2, 'l', [i('apple cider vinegar', 1.5, 'cup'), i('sugar', 1.5, 'cup'), i('mayonnaise', 4, 'cup'), i('neutral oil', 2, 'cup'), i('poppy seed', 0.5, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Thousand Island Dressing', 'Dressing', 2, 'l', [i('mayonnaise', 5, 'cup'), i('ketchup', 2, 'cup'), i('pickle relish', 1, 'cup'), i('white onion', 1, 'each'), i('paprika', 2, 'tbsp'), i('lemon juice', 0.5, 'cup')]),
  t('Roasted Garlic Vinaigrette', 'Dressing', 2, 'l', [i('roasted garlic puree', 1, 'cup'), i('white wine vinegar', 2, 'cup'), i('dijon mustard', 0.25, 'cup'), i('olive oil', 6, 'cup'), i('parsley', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
];

const baseTemplates: RecipeTemplateSeed[] = [
  t('Pizza Dough Base', 'Base', 6, 'kg', [i('bread flour', 5, 'kg'), i('water', 3, 'l'), i('olive oil', 0.5, 'cup'), i('kosher salt', 4, 'tbsp'), i('instant yeast', 4, 'tbsp')]),
  t('Flatbread Dough Base', 'Base', 5, 'kg', [i('bread flour', 4, 'kg'), i('yogurt', 2, 'cup'), i('water', 2.5, 'l'), i('olive oil', 0.5, 'cup'), i('kosher salt', 3, 'tbsp'), i('instant yeast', 3, 'tbsp')]),
  t('Risotto Base', 'Base', 4, 'kg', [i('arborio rice', 3, 'kg'), i('shallot', 4, 'each'), i('olive oil', 0.5, 'cup'), i('white wine', 2, 'cup'), i('vegetable stock', 4, 'l'), i('kosher salt', 1, 'tbsp')]),
  t('Paella Sofrito Base', 'Base', 3, 'kg', [i('olive oil', 1, 'cup'), i('onion', 4, 'each'), i('red bell pepper', 4, 'each'), i('garlic', 12, 'clove'), i('tomato', 3, 'kg'), i('smoked paprika', 2, 'tbsp')]),
  t('Yellow Curry Paste Base', 'Base', 2, 'kg', [i('shallot', 10, 'each'), i('garlic', 20, 'clove'), i('ginger', 12, 'oz'), i('lemongrass', 10, 'stalk'), i('turmeric', 6, 'oz'), i('coriander', 3, 'tbsp'), i('cumin', 2, 'tbsp')]),
  t('Gumbo Roux Base', 'Base', 2, 'kg', [i('flour', 1.5, 'kg'), i('neutral oil', 6, 'cup')]),
  t('Tomato Braise Base', 'Base', 4, 'l', [i('olive oil', 1, 'cup'), i('onion', 4, 'each'), i('garlic', 14, 'clove'), i('tomato puree', 3, 'l'), i('red wine', 2, 'cup'), i('thyme', 0.5, 'cup')]),
  t('Coconut Curry Base', 'Base', 4, 'l', [i('neutral oil', 0.5, 'cup'), i('onion', 3, 'each'), i('garlic', 10, 'clove'), i('ginger', 8, 'oz'), i('red curry paste', 1, 'cup'), i('coconut milk', 3, 'l')]),
  t('Bean Chili Base', 'Base', 5, 'l', [i('neutral oil', 0.5, 'cup'), i('onion', 4, 'each'), i('garlic', 14, 'clove'), i('tomato puree', 2, 'l'), i('black bean', 2, 'kg'), i('kidney bean', 2, 'kg'), i('chili powder', 4, 'tbsp')]),
  t('Mac and Cheese Base', 'Base', 4, 'l', [i('unsalted butter', 12, 'oz'), i('flour', 2, 'cup'), i('milk', 3, 'l'), i('cheddar cheese', 8, 'cup'), i('kosher salt', 1, 'tbsp'), i('black pepper', 2, 'tsp')]),
  t('Polenta Base', 'Base', 4, 'kg', [i('water', 5, 'l'), i('polenta', 2, 'kg'), i('unsalted butter', 8, 'oz'), i('parmesan cheese', 3, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Grits Base', 'Base', 4, 'kg', [i('water', 4, 'l'), i('milk', 2, 'l'), i('stone ground grits', 2, 'kg'), i('unsalted butter', 8, 'oz'), i('cheddar cheese', 4, 'cup')]),
  t('Sushi Rice Base', 'Base', 4, 'kg', [i('sushi rice', 3, 'kg'), i('water', 3.6, 'l'), i('rice vinegar', 2, 'cup'), i('sugar', 1, 'cup'), i('kosher salt', 2, 'tbsp')]),
  t('Pilaf Base', 'Base', 4, 'kg', [i('olive oil', 0.5, 'cup'), i('onion', 3, 'each'), i('long grain rice', 3, 'kg'), i('chicken stock', 5, 'l'), i('kosher salt', 1, 'tbsp')]),
  t('Jambalaya Base', 'Base', 5, 'kg', [i('neutral oil', 0.5, 'cup'), i('onion', 4, 'each'), i('green bell pepper', 4, 'each'), i('celery', 10, 'stalk'), i('tomato', 2, 'kg'), i('long grain rice', 3, 'kg'), i('chicken stock', 4, 'l')]),
  t('Couscous Base', 'Base', 4, 'kg', [i('couscous', 3, 'kg'), i('vegetable stock', 3, 'l'), i('olive oil', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Stir Fry Sauce Base', 'Base', 2, 'l', [i('soy sauce', 4, 'cup'), i('oyster sauce', 2, 'cup'), i('rice vinegar', 1, 'cup'), i('brown sugar', 1, 'cup'), i('ginger', 4, 'oz'), i('garlic', 8, 'clove')]),
  t('Soup Vegetable Base', 'Base', 3, 'kg', [i('onion', 3, 'kg'), i('carrot', 1.5, 'kg'), i('celery', 18, 'stalk'), i('garlic', 12, 'clove'), i('olive oil', 1, 'cup')]),
];

const proteinTemplates: RecipeTemplateSeed[] = [
  t('Brined Chicken Breast', 'Protein', 20, 'each', [i('chicken breast', 20, 'each'), i('water', 4, 'l'), i('kosher salt', 1, 'cup'), i('sugar', 0.5, 'cup'), i('garlic', 8, 'clove')]),
  t('Buttermilk Fried Chicken Marinade', 'Protein', 20, 'each', [i('chicken thigh', 20, 'each'), i('buttermilk', 3, 'l'), i('kosher salt', 0.5, 'cup'), i('paprika', 3, 'tbsp'), i('garlic powder', 2, 'tbsp'), i('black pepper', 2, 'tbsp')]),
  t('Herb Roasted Chicken Prep', 'Protein', 12, 'each', [i('whole chicken', 12, 'each'), i('olive oil', 1, 'cup'), i('garlic', 20, 'clove'), i('rosemary', 1, 'cup'), i('thyme', 1, 'cup'), i('kosher salt', 0.5, 'cup')]),
  t('Beef Meatball Mix', 'Protein', 80, 'each', [i('ground beef', 5, 'kg'), i('egg', 10, 'each'), i('panko breadcrumb', 6, 'cup'), i('parmesan cheese', 2, 'cup'), i('garlic', 10, 'clove'), i('parsley', 2, 'cup')]),
  t('Burger Patty Mix', 'Protein', 40, 'each', [i('ground beef', 6, 'kg'), i('kosher salt', 3, 'tbsp'), i('black pepper', 2, 'tbsp'), i('worcestershire sauce', 0.5, 'cup')]),
  t('Cured Salmon Gravlax Base', 'Protein', 10, 'lb', [i('salmon fillet', 10, 'lb'), i('kosher salt', 2, 'cup'), i('sugar', 2, 'cup'), i('dill', 2, 'cup'), i('black pepper', 2, 'tbsp')]),
  t('Braised Pulled Pork', 'Protein', 20, 'lb', [i('pork shoulder', 22, 'lb'), i('yellow onion', 4, 'each'), i('garlic', 14, 'clove'), i('orange juice', 3, 'cup'), i('chicken stock', 4, 'cup'), i('cumin', 2, 'tbsp')]),
  t('Confit Duck Leg', 'Protein', 24, 'each', [i('duck leg', 24, 'each'), i('kosher salt', 0.75, 'cup'), i('garlic', 20, 'clove'), i('thyme', 1, 'cup'), i('duck fat', 4, 'l')]),
  t('Blackened Salmon Portion Prep', 'Protein', 24, 'each', [i('salmon fillet', 24, 'each'), i('paprika', 4, 'tbsp'), i('cayenne', 1, 'tbsp'), i('garlic powder', 2, 'tbsp'), i('onion powder', 2, 'tbsp'), i('kosher salt', 2, 'tbsp')]),
  t('Shrimp Skewer Prep', 'Protein', 30, 'each', [i('shrimp', 5, 'kg'), i('olive oil', 1, 'cup'), i('garlic', 12, 'clove'), i('lemon juice', 1, 'cup'), i('paprika', 2, 'tbsp'), i('kosher salt', 2, 'tbsp')]),
  t('Pork Belly Braise', 'Protein', 18, 'lb', [i('pork belly', 20, 'lb'), i('soy sauce', 2, 'cup'), i('brown sugar', 1.5, 'cup'), i('garlic', 14, 'clove'), i('ginger', 8, 'oz'), i('chicken stock', 4, 'cup')]),
  t('Corned Beef Brine', 'Protein', 20, 'lb', [i('beef brisket', 20, 'lb'), i('water', 6, 'l'), i('kosher salt', 2, 'cup'), i('brown sugar', 1, 'cup'), i('garlic', 12, 'clove'), i('black pepper', 3, 'tbsp')]),
  t('Beef Kebab Prep', 'Protein', 40, 'each', [i('beef sirloin', 5, 'kg'), i('olive oil', 1, 'cup'), i('garlic', 10, 'clove'), i('oregano', 0.5, 'cup'), i('lemon juice', 1, 'cup'), i('kosher salt', 2, 'tbsp')]),
  t('Chicken Shawarma Prep', 'Protein', 20, 'lb', [i('chicken thigh', 20, 'lb'), i('greek yogurt', 2, 'cup'), i('lemon juice', 1, 'cup'), i('garlic', 16, 'clove'), i('cumin', 3, 'tbsp'), i('paprika', 3, 'tbsp')]),
  t('Beef Bulgogi Prep', 'Protein', 20, 'lb', [i('beef ribeye', 20, 'lb'), i('soy sauce', 3, 'cup'), i('brown sugar', 1.5, 'cup'), i('pear puree', 2, 'cup'), i('garlic', 16, 'clove'), i('sesame oil', 1, 'cup')]),
  t('Carnitas Prep', 'Protein', 20, 'lb', [i('pork shoulder', 22, 'lb'), i('orange juice', 3, 'cup'), i('lime juice', 1, 'cup'), i('garlic', 16, 'clove'), i('bay leaf', 8, 'each'), i('kosher salt', 0.5, 'cup')]),
  t('Tofu Marinade Prep', 'Protein', 30, 'each', [i('firm tofu', 30, 'each'), i('soy sauce', 2, 'cup'), i('rice vinegar', 1, 'cup'), i('ginger', 6, 'oz'), i('garlic', 10, 'clove'), i('sesame oil', 0.5, 'cup')]),
  t('Sausage Patty Mix', 'Protein', 60, 'each', [i('ground pork', 5, 'kg'), i('sage', 0.5, 'cup'), i('thyme', 0.25, 'cup'), i('black pepper', 2, 'tbsp'), i('kosher salt', 3, 'tbsp'), i('brown sugar', 0.5, 'cup')]),
];

const marinadeTemplates: RecipeTemplateSeed[] = [
  t('Citrus Herb Marinade', 'Marinade', 2, 'l', [i('olive oil', 5, 'cup'), i('lemon juice', 1, 'cup'), i('orange juice', 1, 'cup'), i('garlic', 10, 'clove'), i('parsley', 1, 'cup'), i('oregano', 0.5, 'cup')]),
  t('Soy Ginger Marinade', 'Marinade', 2, 'l', [i('soy sauce', 4, 'cup'), i('rice vinegar', 1, 'cup'), i('brown sugar', 1, 'cup'), i('ginger', 6, 'oz'), i('garlic', 10, 'clove'), i('sesame oil', 0.5, 'cup')]),
  t('Chimichurri Marinade', 'Marinade', 2, 'l', [i('parsley', 3, 'cup'), i('oregano', 1, 'cup'), i('garlic', 12, 'clove'), i('red wine vinegar', 1, 'cup'), i('olive oil', 4, 'cup'), i('red pepper flake', 2, 'tbsp')]),
  t('Jerk Marinade', 'Marinade', 2, 'l', [i('scallion', 3, 'cup'), i('garlic', 14, 'clove'), i('ginger', 6, 'oz'), i('allspice', 2, 'tbsp'), i('brown sugar', 1, 'cup'), i('soy sauce', 2, 'cup'), i('lime juice', 1, 'cup')]),
  t('Tikka Marinade', 'Marinade', 2, 'l', [i('greek yogurt', 6, 'cup'), i('lemon juice', 1, 'cup'), i('garlic', 14, 'clove'), i('ginger', 8, 'oz'), i('garam masala', 3, 'tbsp'), i('paprika', 2, 'tbsp')]),
  t('Yogurt Herb Marinade', 'Marinade', 2, 'l', [i('greek yogurt', 6, 'cup'), i('olive oil', 1, 'cup'), i('lemon juice', 1, 'cup'), i('garlic', 10, 'clove'), i('dill', 1, 'cup'), i('mint', 1, 'cup')]),
  t('Garlic Rosemary Marinade', 'Marinade', 2, 'l', [i('olive oil', 6, 'cup'), i('red wine vinegar', 1, 'cup'), i('garlic', 16, 'clove'), i('rosemary', 1, 'cup'), i('black pepper', 1, 'tbsp')]),
  t('Adobo Marinade', 'Marinade', 2, 'l', [i('achiote paste', 0.5, 'cup'), i('orange juice', 2, 'cup'), i('lime juice', 1, 'cup'), i('garlic', 12, 'clove'), i('oregano', 0.5, 'cup'), i('olive oil', 3, 'cup')]),
  t('Miso Marinade', 'Marinade', 2, 'l', [i('white miso', 3, 'cup'), i('mirin', 2, 'cup'), i('sake', 2, 'cup'), i('sugar', 1, 'cup'), i('ginger', 4, 'oz')]),
  t('Gochujang Marinade', 'Marinade', 2, 'l', [i('gochujang', 3, 'cup'), i('soy sauce', 2, 'cup'), i('brown sugar', 1, 'cup'), i('rice vinegar', 1, 'cup'), i('garlic', 12, 'clove'), i('sesame oil', 0.5, 'cup')]),
  t('Teriyaki Marinade', 'Marinade', 2, 'l', [i('soy sauce', 4, 'cup'), i('mirin', 2, 'cup'), i('brown sugar', 1.5, 'cup'), i('ginger', 6, 'oz'), i('garlic', 10, 'clove')]),
  t('Harissa Marinade', 'Marinade', 2, 'l', [i('harissa', 2, 'cup'), i('olive oil', 4, 'cup'), i('lemon juice', 1, 'cup'), i('garlic', 12, 'clove'), i('cumin', 2, 'tbsp')]),
  t('Mojo Marinade', 'Marinade', 2, 'l', [i('orange juice', 3, 'cup'), i('lime juice', 1.5, 'cup'), i('olive oil', 3, 'cup'), i('garlic', 16, 'clove'), i('oregano', 0.5, 'cup')]),
  t('Shawarma Marinade', 'Marinade', 2, 'l', [i('greek yogurt', 4, 'cup'), i('olive oil', 2, 'cup'), i('lemon juice', 1, 'cup'), i('garlic', 12, 'clove'), i('cumin', 2, 'tbsp'), i('paprika', 2, 'tbsp')]),
  t('Coconut Curry Marinade', 'Marinade', 2, 'l', [i('coconut milk', 5, 'cup'), i('yellow curry paste', 1, 'cup'), i('lime juice', 1, 'cup'), i('fish sauce', 0.5, 'cup'), i('garlic', 10, 'clove')]),
  t('Lemongrass Marinade', 'Marinade', 2, 'l', [i('lemongrass', 8, 'stalk'), i('fish sauce', 1, 'cup'), i('lime juice', 1, 'cup'), i('sugar', 1, 'cup'), i('garlic', 10, 'clove'), i('neutral oil', 2, 'cup')]),
  t('Black Pepper Marinade', 'Marinade', 2, 'l', [i('soy sauce', 3, 'cup'), i('black pepper', 3, 'tbsp'), i('garlic', 12, 'clove'), i('brown sugar', 1, 'cup'), i('neutral oil', 3, 'cup')]),
  t('Smoked Paprika Marinade', 'Marinade', 2, 'l', [i('olive oil', 4, 'cup'), i('red wine vinegar', 1.5, 'cup'), i('smoked paprika', 3, 'tbsp'), i('garlic', 12, 'clove'), i('oregano', 0.5, 'cup')]),
];

const bakingBaseTemplates: RecipeTemplateSeed[] = [
  t('Brioche Dough', 'Baking base', 5, 'kg', [i('bread flour', 4, 'kg'), i('egg', 20, 'each'), i('milk', 1.5, 'l'), i('sugar', 500, 'g'), i('unsalted butter', 1, 'kg'), i('instant yeast', 4, 'tbsp')]),
  t('Focaccia Dough', 'Baking base', 6, 'kg', [i('bread flour', 5, 'kg'), i('water', 3.5, 'l'), i('olive oil', 1, 'cup'), i('kosher salt', 4, 'tbsp'), i('instant yeast', 4, 'tbsp')]),
  t('Biscuit Base', 'Baking base', 4, 'kg', [i('flour', 3, 'kg'), i('unsalted butter', 1.2, 'kg'), i('buttermilk', 2, 'l'), i('baking powder', 6, 'tbsp'), i('kosher salt', 2, 'tbsp')]),
  t('Pancake Batter Base', 'Baking base', 5, 'l', [i('flour', 2.5, 'kg'), i('sugar', 300, 'g'), i('baking powder', 5, 'tbsp'), i('milk', 3, 'l'), i('egg', 18, 'each'), i('unsalted butter', 12, 'oz')]),
  t('Waffle Batter Base', 'Baking base', 5, 'l', [i('flour', 2.5, 'kg'), i('sugar', 400, 'g'), i('baking powder', 5, 'tbsp'), i('milk', 3, 'l'), i('egg', 20, 'each'), i('unsalted butter', 16, 'oz')]),
  t('Muffin Batter Base', 'Baking base', 5, 'kg', [i('flour', 3, 'kg'), i('sugar', 1.2, 'kg'), i('egg', 20, 'each'), i('milk', 2, 'l'), i('neutral oil', 1.5, 'l'), i('baking powder', 6, 'tbsp')]),
  t('Scone Dough', 'Baking base', 4, 'kg', [i('flour', 3, 'kg'), i('sugar', 600, 'g'), i('unsalted butter', 1.2, 'kg'), i('heavy cream', 1.5, 'l'), i('baking powder', 5, 'tbsp')]),
  t('Tart Dough', 'Baking base', 4, 'kg', [i('flour', 2.8, 'kg'), i('powdered sugar', 600, 'g'), i('unsalted butter', 1.8, 'kg'), i('egg yolk', 24, 'each')]),
  t('Pie Dough', 'Baking base', 4, 'kg', [i('flour', 3, 'kg'), i('unsalted butter', 1.5, 'kg'), i('ice water', 1.2, 'l'), i('kosher salt', 2, 'tbsp')]),
  t('Sponge Cake Batter', 'Baking base', 5, 'kg', [i('egg', 36, 'each'), i('sugar', 1.5, 'kg'), i('flour', 1.5, 'kg'), i('unsalted butter', 12, 'oz')]),
  t('Chocolate Cake Batter', 'Baking base', 6, 'kg', [i('flour', 2.5, 'kg'), i('sugar', 2.2, 'kg'), i('cocoa powder', 800, 'g'), i('baking powder', 5, 'tbsp'), i('egg', 20, 'each'), i('milk', 2.5, 'l'), i('neutral oil', 1.5, 'l')]),
  t('Cornbread Batter', 'Baking base', 5, 'kg', [i('cornmeal', 2, 'kg'), i('flour', 1.5, 'kg'), i('sugar', 800, 'g'), i('baking powder', 5, 'tbsp'), i('buttermilk', 2.5, 'l'), i('egg', 18, 'each')]),
  t('Brownie Batter', 'Baking base', 5, 'kg', [i('unsalted butter', 1.5, 'kg'), i('dark chocolate', 1.5, 'kg'), i('sugar', 2, 'kg'), i('egg', 24, 'each'), i('flour', 1.2, 'kg'), i('cocoa powder', 400, 'g')]),
  t('Crepe Batter', 'Baking base', 4, 'l', [i('flour', 1.5, 'kg'), i('milk', 3, 'l'), i('egg', 20, 'each'), i('unsalted butter', 10, 'oz'), i('kosher salt', 1, 'tbsp')]),
  t('Donut Dough', 'Baking base', 6, 'kg', [i('bread flour', 4.5, 'kg'), i('milk', 2.2, 'l'), i('sugar', 700, 'g'), i('egg', 16, 'each'), i('unsalted butter', 1, 'kg'), i('instant yeast', 5, 'tbsp')]),
  t('Churro Batter', 'Baking base', 4, 'kg', [i('water', 2.5, 'l'), i('unsalted butter', 14, 'oz'), i('flour', 2.2, 'kg'), i('egg', 16, 'each'), i('sugar', 300, 'g'), i('kosher salt', 1, 'tbsp')]),
  t('Cinnamon Roll Dough', 'Baking base', 6, 'kg', [i('bread flour', 4.5, 'kg'), i('milk', 2.2, 'l'), i('sugar', 800, 'g'), i('egg', 18, 'each'), i('unsalted butter', 1, 'kg'), i('instant yeast', 5, 'tbsp')]),
  t('Pizza Cracker Dough', 'Baking base', 4, 'kg', [i('flour', 3, 'kg'), i('olive oil', 1, 'cup'), i('water', 1.5, 'l'), i('kosher salt', 2, 'tbsp'), i('instant yeast', 2, 'tbsp')]),
];

const barMixTemplates: RecipeTemplateSeed[] = [
  t('Simple Syrup', 'Bar mix', 2, 'l', [i('sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Rich Simple Syrup', 'Bar mix', 2, 'l', [i('sugar', 3, 'kg'), i('water', 1.5, 'l')]),
  t('Honey Syrup', 'Bar mix', 2, 'l', [i('honey', 2, 'kg'), i('water', 1, 'l')]),
  t('Demerara Syrup', 'Bar mix', 2, 'l', [i('demerara sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Ginger Syrup', 'Bar mix', 2, 'l', [i('ginger', 1, 'kg'), i('sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Cinnamon Syrup', 'Bar mix', 2, 'l', [i('cinnamon stick', 20, 'each'), i('sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Vanilla Syrup', 'Bar mix', 2, 'l', [i('vanilla bean', 10, 'each'), i('sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Jalapeno Syrup', 'Bar mix', 2, 'l', [i('jalapeno', 12, 'each'), i('sugar', 2, 'kg'), i('water', 2, 'l')]),
  t('Grapefruit Cordial', 'Bar mix', 2, 'l', [i('grapefruit juice', 1.5, 'l'), i('lime juice', 500, 'ml'), i('sugar', 1.5, 'kg'), i('grapefruit zest', 2, 'cup')]),
  t('Lime Cordial', 'Bar mix', 2, 'l', [i('lime juice', 1.5, 'l'), i('sugar', 1.5, 'kg'), i('lime zest', 2, 'cup'), i('water', 500, 'ml')]),
  t('Bloody Mary Mix', 'Bar mix', 4, 'l', [i('tomato juice', 3, 'l'), i('lemon juice', 1, 'cup'), i('horseradish', 0.5, 'cup'), i('worcestershire sauce', 0.5, 'cup'), i('hot sauce', 0.5, 'cup'), i('celery salt', 2, 'tbsp')]),
  t('Margarita Batch Mix', 'Bar mix', 4, 'l', [i('lime juice', 1.5, 'l'), i('orange liqueur', 1, 'l'), i('agave syrup', 1, 'l'), i('water', 500, 'ml')]),
  t('Pina Colada Base', 'Bar mix', 4, 'l', [i('pineapple juice', 2, 'l'), i('coconut cream', 1.5, 'l'), i('lime juice', 500, 'ml')]),
  t('Mojito Batch Mix', 'Bar mix', 3, 'l', [i('lime juice', 1.2, 'l'), i('simple syrup', 1, 'l'), i('mint', 4, 'cup'), i('water', 800, 'ml')]),
  t('Sangria Base', 'Bar mix', 5, 'l', [i('red wine', 3, 'l'), i('orange juice', 1, 'l'), i('brandy', 500, 'ml'), i('simple syrup', 500, 'ml'), i('orange', 6, 'each'), i('lemon', 4, 'each')]),
  t('Espresso Martini Batch Mix', 'Bar mix', 3, 'l', [i('cold brew concentrate', 1.5, 'l'), i('simple syrup', 500, 'ml'), i('coffee liqueur', 1, 'l')]),
  t('Tonic Concentrate', 'Bar mix', 2, 'l', [i('water', 2, 'l'), i('quinine bark', 8, 'oz'), i('lime peel', 2, 'cup'), i('lemon peel', 2, 'cup'), i('citric acid', 4, 'tbsp'), i('sugar', 1.5, 'kg')]),
  t('Passionfruit Syrup', 'Bar mix', 2, 'l', [i('passionfruit puree', 1.2, 'l'), i('sugar', 1.4, 'kg'), i('water', 500, 'ml')]),
];

const cocktailComponentTemplates: RecipeTemplateSeed[] = [
  t('Grenadine', 'Cocktail component', 2, 'l', [i('pomegranate juice', 1.5, 'l'), i('sugar', 1.5, 'kg'), i('orange blossom water', 2, 'tbsp')]),
  t('Orgeat', 'Cocktail component', 2, 'l', [i('almond', 1.5, 'kg'), i('sugar', 1.8, 'kg'), i('water', 2, 'l'), i('orange blossom water', 2, 'tbsp')]),
  t('Falernum Syrup', 'Cocktail component', 2, 'l', [i('lime zest', 2, 'cup'), i('ginger', 12, 'oz'), i('clove', 2, 'tbsp'), i('almond', 2, 'cup'), i('sugar', 1.8, 'kg'), i('water', 2, 'l')]),
  t('Coffee Liqueur Base', 'Cocktail component', 2, 'l', [i('cold brew concentrate', 1, 'l'), i('simple syrup', 1, 'l'), i('vanilla syrup', 250, 'ml')]),
  t('Old Fashioned Batch Component', 'Cocktail component', 2, 'l', [i('demerara syrup', 1, 'l'), i('orange bitters', 250, 'ml'), i('aromatic bitters', 250, 'ml'), i('water', 500, 'ml')]),
  t('Negroni Batch Component', 'Cocktail component', 3, 'l', [i('sweet vermouth', 1, 'l'), i('campari', 1, 'l'), i('gin', 1, 'l')]),
  t('Dirty Martini Brine', 'Cocktail component', 2, 'l', [i('olive brine', 1.5, 'l'), i('water', 500, 'ml'), i('lemon peel', 1, 'cup')]),
  t('Oleo Saccharum', 'Cocktail component', 2, 'l', [i('orange peel', 4, 'cup'), i('lemon peel', 2, 'cup'), i('sugar', 2, 'kg'), i('water', 1, 'l')]),
  t('Whipped Citrus Foam Base', 'Cocktail component', 1500, 'ml', [i('egg white', 20, 'each'), i('lemon juice', 1, 'cup'), i('simple syrup', 2, 'cup'), i('water', 3, 'cup')]),
  t('Egg White Foam Base', 'Cocktail component', 1500, 'ml', [i('egg white', 24, 'each'), i('simple syrup', 2, 'cup'), i('water', 4, 'cup')]),
  t('Coconut Cream Blend', 'Cocktail component', 2, 'l', [i('coconut cream', 1.5, 'l'), i('simple syrup', 500, 'ml')]),
  t('Salted Rim Blend', 'Cocktail component', 1, 'kg', [i('kosher salt', 800, 'g'), i('lime zest', 1, 'cup')]),
  t('Spiced Sugar Blend', 'Cocktail component', 1, 'kg', [i('sugar', 1, 'kg'), i('cinnamon', 2, 'tbsp'), i('star anise', 8, 'each')]),
  t('Mint Tincture', 'Cocktail component', 500, 'ml', [i('mint', 4, 'cup'), i('vodka', 500, 'ml')]),
  t('Basil Tincture', 'Cocktail component', 500, 'ml', [i('basil', 4, 'cup'), i('vodka', 500, 'ml')]),
  t('Rosemary Tincture', 'Cocktail component', 500, 'ml', [i('rosemary', 3, 'cup'), i('vodka', 500, 'ml')]),
  t('Peppercorn Tincture', 'Cocktail component', 500, 'ml', [i('black pepper', 4, 'tbsp'), i('vodka', 500, 'ml')]),
  t('Citrus Shrub Base', 'Cocktail component', 2, 'l', [i('orange', 8, 'each'), i('lemon', 8, 'each'), i('apple cider vinegar', 1, 'l'), i('sugar', 1.5, 'kg')]),
];

const sideTemplates: RecipeTemplateSeed[] = [
  t('Mashed Potato', 'Common restaurant side', 5, 'kg', [i('russet potato', 6, 'kg'), i('unsalted butter', 1, 'lb'), i('heavy cream', 1.5, 'l'), i('kosher salt', 2, 'tbsp')]),
  t('Roasted Potato', 'Common restaurant side', 5, 'kg', [i('yukon potato', 6, 'kg'), i('olive oil', 1, 'cup'), i('garlic', 12, 'clove'), i('rosemary', 1, 'cup'), i('kosher salt', 2, 'tbsp')]),
  t('French Fry Seasoning', 'Common restaurant side', 1, 'kg', [i('kosher salt', 700, 'g'), i('paprika', 100, 'g'), i('garlic powder', 80, 'g'), i('onion powder', 80, 'g'), i('black pepper', 40, 'g')]),
  t('Coleslaw', 'Common restaurant side', 4, 'kg', [i('green cabbage', 3, 'kg'), i('carrot', 1, 'kg'), i('mayonnaise', 5, 'cup'), i('apple cider vinegar', 1, 'cup'), i('sugar', 0.5, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Mac and Cheese Side', 'Common restaurant side', 5, 'kg', [i('macaroni', 3, 'kg'), i('milk', 3, 'l'), i('cheddar cheese', 10, 'cup'), i('unsalted butter', 12, 'oz'), i('flour', 2, 'cup')]),
  t('Roasted Vegetable Mix', 'Common restaurant side', 5, 'kg', [i('zucchini', 2, 'kg'), i('carrot', 1.5, 'kg'), i('red bell pepper', 8, 'each'), i('red onion', 4, 'each'), i('olive oil', 1, 'cup'), i('kosher salt', 2, 'tbsp')]),
  t('Sauteed Greens', 'Common restaurant side', 3, 'kg', [i('kale', 3, 'kg'), i('olive oil', 0.5, 'cup'), i('garlic', 12, 'clove'), i('red pepper flake', 1, 'tbsp'), i('kosher salt', 1, 'tbsp')]),
  t('Spanish Rice', 'Common restaurant side', 4, 'kg', [i('long grain rice', 3, 'kg'), i('tomato puree', 1, 'l'), i('onion', 3, 'each'), i('garlic', 10, 'clove'), i('chicken stock', 4, 'l')]),
  t('Cilantro Lime Rice', 'Common restaurant side', 4, 'kg', [i('long grain rice', 3, 'kg'), i('water', 3.5, 'l'), i('lime juice', 1, 'cup'), i('cilantro', 2, 'cup'), i('kosher salt', 1, 'tbsp')]),
  t('Refried Bean', 'Common restaurant side', 4, 'kg', [i('pinto bean', 4, 'kg'), i('onion', 2, 'each'), i('garlic', 8, 'clove'), i('lard', 1, 'cup'), i('cumin', 1, 'tbsp')]),
  t('Cornbread Side', 'Common restaurant side', 4, 'kg', [i('cornmeal', 2, 'kg'), i('flour', 1.2, 'kg'), i('sugar', 700, 'g'), i('buttermilk', 2, 'l'), i('egg', 14, 'each')]),
  t('Garlic Bread Spread', 'Common restaurant side', 2, 'kg', [i('unsalted butter', 1.5, 'kg'), i('garlic', 30, 'clove'), i('parsley', 2, 'cup'), i('parmesan cheese', 2, 'cup'), i('kosher salt', 2, 'tsp')]),
  t('Potato Salad', 'Common restaurant side', 5, 'kg', [i('yukon potato', 6, 'kg'), i('mayonnaise', 5, 'cup'), i('dijon mustard', 0.5, 'cup'), i('pickle relish', 1, 'cup'), i('celery', 8, 'stalk'), i('egg', 12, 'each')]),
  t('Quinoa Pilaf', 'Common restaurant side', 4, 'kg', [i('quinoa', 3, 'kg'), i('vegetable stock', 4, 'l'), i('onion', 2, 'each'), i('olive oil', 0.5, 'cup'), i('parsley', 1, 'cup')]),
  t('Couscous Salad Base', 'Common restaurant side', 4, 'kg', [i('couscous', 3, 'kg'), i('vegetable stock', 3, 'l'), i('olive oil', 0.5, 'cup'), i('parsley', 2, 'cup'), i('lemon juice', 1, 'cup')]),
  t('Hushpuppy Batter', 'Common restaurant side', 4, 'kg', [i('cornmeal', 2, 'kg'), i('flour', 1, 'kg'), i('buttermilk', 2, 'l'), i('egg', 12, 'each'), i('green onion', 2, 'cup'), i('baking powder', 4, 'tbsp')]),
  t('Onion Ring Batter', 'Common restaurant side', 4, 'kg', [i('flour', 2, 'kg'), i('cornstarch', 1, 'kg'), i('baking powder', 4, 'tbsp'), i('club soda', 3, 'l'), i('kosher salt', 2, 'tbsp')]),
  t('Baked Bean', 'Common restaurant side', 5, 'kg', [i('navy bean', 4, 'kg'), i('tomato puree', 1.5, 'l'), i('brown sugar', 1, 'cup'), i('molasses', 1, 'cup'), i('onion', 2, 'each'), i('mustard', 0.5, 'cup')]),
];

const templates = [
  ...sauceTemplates,
  ...prepTemplates,
  ...stockTemplates,
  ...dressingTemplates,
  ...baseTemplates,
  ...proteinTemplates,
  ...marinadeTemplates,
  ...bakingBaseTemplates,
  ...barMixTemplates,
  ...cocktailComponentTemplates,
  ...sideTemplates,
];

if (templates.length !== 198) {
  throw new Error(`Expected 198 templates but generated ${templates.length}.`);
}

const outputPath = path.resolve('packages/server/data/recipe-template-library.json');
fs.writeFileSync(outputPath, JSON.stringify({ templates }, null, 2) + '\n');
console.log(`Wrote ${templates.length} recipe templates to ${outputPath}`);
