import fs from 'node:fs';
import path from 'node:path';

type Category =
  | 'protein'
  | 'dairy'
  | 'produce'
  | 'herbs'
  | 'spices'
  | 'dry_goods'
  | 'grain'
  | 'oil_fat'
  | 'sugar_sweetener'
  | 'vinegar'
  | 'condiment'
  | 'sauce_base'
  | 'stock'
  | 'seafood'
  | 'alcohol_spirit'
  | 'beer'
  | 'wine'
  | 'non_alcoholic_beverage'
  | 'baking';

type BaseUnit = 'g' | 'ml' | 'each';

interface IngredientEntry {
  canonical_name: string;
  category: Category;
  base_unit: BaseUnit;
  perishable_flag: boolean;
}

interface AliasEntry {
  canonical_name: string;
  aliases: string[];
}

interface IngredientSpec {
  canonical_name: string;
  base_unit?: BaseUnit;
  perishable_flag?: boolean;
  aliases?: string[];
}

const CUSTOM_ALIASES: Record<string, string[]> = {
  'parmesan cheese': ['parmesan', 'parm', 'parmigiano', 'parmigiano reggiano'],
  'extra virgin olive oil': ['evoo'],
  'all purpose flour': ['all-purpose flour', 'ap flour'],
  'scallion': ['green onion', 'spring onion'],
  'cilantro': ['coriander leaf'],
  'garbanzo bean': ['chickpea'],
  'confectioners sugar': ['powdered sugar', 'icing sugar'],
  'granulated sugar': ['white sugar'],
  'demerara sugar': ['raw sugar'],
  'black pepper': ['ground black pepper', 'pepper'],
  'dijon mustard': ['dijon'],
  'whole milk': ['milk'],
  'greek yogurt': ['strained yogurt'],
  'chardonnay': ['chard'],
  'cabernet sauvignon': ['cabernet', 'cab sauv'],
  'pinot grigio': ['pinot gris'],
  'sauvignon blanc': ['sauv blanc'],
  'india pale ale beer': ['ipa beer', 'ipa'],
  'non alcoholic beer': ['na beer', 'alcohol free beer'],
  'cold brew concentrate': ['cold brew'],
  'tomato paste': ['paste tomato'],
  'soy sauce': ['shoyu'],
  'sweet vermouth': ['rosso vermouth'],
  'dry vermouth': ['blanc vermouth'],
  'coffee liqueur': ['coffee liquor'],
  'orange liqueur': ['triple sec'],
  'white miso': ['shiro miso'],
  'red miso': ['aka miso'],
  'makrut lime leaf': ['kaffir lime leaf'],
  'romaine lettuce': ['romaine'],
  'iceberg lettuce': ['iceberg'],
  'baby spinach': ['spinach baby'],
  'baby bok choy': ['bok choy baby'],
  'yukon gold potato': ['yukon potato'],
  'russet potato': ['idaho potato'],
  'ground beef': ['minced beef'],
  'ground pork': ['minced pork'],
  'ground chicken': ['minced chicken'],
  'liquid whole egg': ['whole egg liquid'],
  'rice vinegar': ['rice wine vinegar'],
  'white balsamic vinegar': ['bianco balsamic'],
  'simple syrup': ['simple'],
  'rich simple syrup': ['rich simple'],
  'grenadine': ['pomegranate syrup'],
  'orgeat': ['almond syrup'],
  'club soda': ['soda water'],
  'tonic water': ['tonic'],
  'ginger beer': ['gingerbeer'],
  'sparkling water': ['seltzer'],
  'dark chocolate': ['bittersweet chocolate'],
  'baking soda': ['sodium bicarbonate'],
  'active dry yeast': ['dry yeast'],
  'instant yeast': ['rapid rise yeast'],
};

function spec(canonical_name: string, options: Omit<IngredientSpec, 'canonical_name'> = {}): IngredientSpec {
  return { canonical_name, ...options };
}

function buildCategory(category: Category, specs: IngredientSpec[], defaults: { base_unit: BaseUnit; perishable_flag: boolean }) {
  return specs.map((item) => ({
    canonical_name: item.canonical_name,
    category,
    base_unit: item.base_unit ?? defaults.base_unit,
    perishable_flag: item.perishable_flag ?? defaults.perishable_flag,
    aliases: item.aliases ?? [],
  }));
}

const proteinSpecs = buildCategory('protein', [
  spec('beef chuck'), spec('beef brisket'), spec('beef short rib'), spec('beef ribeye'), spec('beef strip loin'), spec('beef tenderloin'), spec('beef sirloin'), spec('beef flank'), spec('beef skirt steak'), spec('beef shank'), spec('beef oxtail'), spec('beef liver'), spec('beef tongue'), spec('ground beef'), spec('beef stock bone'),
  spec('veal cutlet'), spec('veal shank'), spec('veal loin'), spec('veal stock bone'),
  spec('lamb leg'), spec('lamb shoulder'), spec('lamb rack'), spec('lamb shank'), spec('ground lamb'),
  spec('pork shoulder'), spec('pork belly'), spec('pork loin'), spec('pork tenderloin'), spec('pork rib'), spec('pork hock'), spec('pork cheek'), spec('ground pork'), spec('bacon'), spec('pancetta'), spec('prosciutto'), spec('smoked ham'),
  spec('chorizo sausage'), spec('italian sausage'), spec('breakfast sausage'), spec('andouille sausage'),
  spec('chicken breast'), spec('chicken thigh'), spec('chicken wing'), spec('chicken leg'), spec('ground chicken'), spec('whole chicken'), spec('chicken liver'),
  spec('turkey breast'), spec('ground turkey'), spec('whole turkey'),
  spec('duck breast'), spec('duck leg'), spec('whole duck'),
  spec('quail'), spec('rabbit'), spec('goat leg'), spec('goat shoulder'), spec('bison strip loin'), spec('ground bison'), spec('venison loin'), spec('ground venison'), spec('elk loin'), spec('foie gras'),
  spec('tofu'), spec('firm tofu'), spec('silken tofu'), spec('tempeh'), spec('seitan'),
  spec('egg', { base_unit: 'each' }), spec('liquid whole egg', { base_unit: 'ml' }),
], { base_unit: 'g', perishable_flag: true });

const dairySpecs = buildCategory('dairy', [
  spec('whole milk', { base_unit: 'ml' }), spec('low fat milk', { base_unit: 'ml' }), spec('skim milk', { base_unit: 'ml' }), spec('goat milk', { base_unit: 'ml' }), spec('evaporated milk', { base_unit: 'ml' }), spec('condensed milk', { base_unit: 'ml' }), spec('dry milk powder'),
  spec('buttermilk', { base_unit: 'ml' }), spec('heavy cream', { base_unit: 'ml' }), spec('light cream', { base_unit: 'ml' }), spec('half and half', { base_unit: 'ml' }), spec('sour cream'), spec('creme fraiche'),
  spec('plain yogurt', { base_unit: 'ml' }), spec('greek yogurt', { base_unit: 'ml' }), spec('whole milk yogurt', { base_unit: 'ml' }), spec('labneh'), spec('kefir', { base_unit: 'ml' }),
  spec('mascarpone'), spec('ricotta cheese'), spec('cottage cheese'), spec('cream cheese'), spec('mozzarella cheese'), spec('fresh mozzarella'), spec('burrata'), spec('parmesan cheese'), spec('pecorino romano'), spec('asiago cheese'), spec('provolone cheese'), spec('fontina cheese'), spec('gruyere cheese'), spec('swiss cheese'), spec('cheddar cheese'), spec('white cheddar cheese'), spec('monterey jack cheese'), spec('pepper jack cheese'), spec('gouda cheese'), spec('smoked gouda'), spec('blue cheese'), spec('gorgonzola cheese'), spec('feta cheese'), spec('goat cheese'), spec('halloumi cheese'), spec('paneer cheese'), spec('brie cheese'), spec('camembert cheese'), spec('havarti cheese'), spec('muenster cheese'), spec('american cheese'), spec('queso fresco'), spec('cotija cheese'), spec('romano cheese'), spec('colby cheese'),
  spec('unsalted butter'), spec('salted butter'), spec('cultured butter'), spec('whipped cream', { base_unit: 'ml' }), spec('ghee'), spec('whey powder'), spec('lactose free milk', { base_unit: 'ml' }),
], { base_unit: 'g', perishable_flag: true });

const produceSpecs = buildCategory('produce', [
  spec('yellow onion'), spec('red onion'), spec('white onion'), spec('sweet onion'), spec('shallot'), spec('scallion'), spec('leek'), spec('garlic'), spec('garlic scape'), spec('fennel bulb'),
  spec('roma tomato'), spec('beefsteak tomato'), spec('cherry tomato'), spec('grape tomato'), spec('heirloom tomato'), spec('green tomato'), spec('tomatillo'),
  spec('red bell pepper'), spec('yellow bell pepper'), spec('orange bell pepper'), spec('green bell pepper'), spec('poblano pepper'), spec('jalapeno pepper'), spec('serrano pepper'), spec('habanero pepper'), spec('fresno chile'), spec('thai chile'), spec('shishito pepper'), spec('banana pepper'), spec('pepperoncini'),
  spec('russet potato'), spec('yukon gold potato'), spec('red potato'), spec('sweet potato'), spec('purple sweet potato'), spec('fingerling potato'), spec('carrot'), spec('baby carrot'), spec('parsnip'), spec('turnip'), spec('rutabaga'), spec('beet'), spec('golden beet'), spec('red radish'), spec('daikon'), spec('celery root'), spec('ginger'), spec('galangal'), spec('turmeric root'), spec('horseradish root'),
  spec('green cabbage'), spec('red cabbage'), spec('napa cabbage'), spec('savoy cabbage'), spec('kale'), spec('lacinato kale'), spec('collard green'), spec('swiss chard'), spec('spinach'), spec('baby spinach'), spec('romaine lettuce'), spec('iceberg lettuce'), spec('butter lettuce'), spec('little gem lettuce'), spec('arugula'), spec('watercress'), spec('frisee'), spec('endive'), spec('radicchio'), spec('bok choy'), spec('baby bok choy'), spec('broccolini'), spec('broccoli'), spec('cauliflower'), spec('romanesco'), spec('brussels sprout'),
  spec('zucchini'), spec('yellow squash'), spec('eggplant'), spec('japanese eggplant'), spec('acorn squash'), spec('butternut squash'), spec('delicata squash'), spec('kabocha squash'), spec('pumpkin'), spec('cucumber'), spec('persian cucumber'), spec('english cucumber'), spec('celery'), spec('asparagus'), spec('artichoke'), spec('okra'), spec('green bean'), spec('wax bean'), spec('snap pea'), spec('snow pea'), spec('corn'), spec('baby corn'),
  spec('button mushroom'), spec('cremini mushroom'), spec('portobello mushroom'), spec('shiitake mushroom'), spec('maitake mushroom'), spec('oyster mushroom'), spec('enoki mushroom'), spec('chanterelle mushroom'), spec('porcini mushroom'), spec('morel mushroom'),
  spec('avocado'), spec('lemon'), spec('lime'), spec('orange'), spec('blood orange'), spec('grapefruit'), spec('tangerine'), spec('mandarin'), spec('pineapple'), spec('mango'), spec('papaya'), spec('banana'), spec('plantain'), spec('apple'), spec('granny smith apple'), spec('fuji apple'), spec('pear'), spec('asian pear'), spec('peach'), spec('plum'), spec('apricot'), spec('strawberry'), spec('blueberry'), spec('raspberry'), spec('blackberry'), spec('grape'), spec('watermelon'), spec('cantaloupe'), spec('honeydew'), spec('kiwi'), spec('passion fruit'), spec('pomegranate'), spec('coconut'),
], { base_unit: 'g', perishable_flag: true });

const freshHerbs = [
  'basil', 'thai basil', 'holy basil', 'parsley', 'flat leaf parsley', 'curly parsley', 'cilantro', 'dill', 'mint', 'spearmint', 'peppermint', 'oregano', 'marjoram', 'thyme', 'lemon thyme', 'rosemary', 'sage', 'tarragon', 'chervil', 'chive', 'bay leaf', 'makrut lime leaf', 'shiso', 'lemon verbena', 'savory', 'epazote', 'culantro', 'lovage', 'sorrel', 'fennel frond',
];
const driedHerbs = freshHerbs.map((name) => `dried ${name}`);
const herbSpecs = buildCategory('herbs', [
  ...freshHerbs.map((name) => spec(name, { perishable_flag: true })),
  ...driedHerbs.map((name) => spec(name, { perishable_flag: false })),
], { base_unit: 'g', perishable_flag: true });

const spicePairs = [
  ['black pepper', 'ground black pepper'], ['white pepper', 'ground white pepper'], ['coriander seed', 'ground coriander'], ['cumin seed', 'ground cumin'], ['fennel seed', 'ground fennel'], ['mustard seed', 'ground mustard'], ['cardamom pod', 'ground cardamom'], ['clove', 'ground clove'], ['cinnamon stick', 'ground cinnamon'], ['nutmeg', 'ground nutmeg'], ['allspice berry', 'ground allspice'], ['ginger root powder', 'ground ginger'], ['turmeric root powder', 'ground turmeric'], ['fenugreek seed', 'ground fenugreek'], ['celery seed', 'ground celery seed'], ['dill seed', 'ground dill seed'], ['annatto seed', 'ground annatto'], ['caraway seed', 'ground caraway'], ['nigella seed', 'ground nigella'], ['juniper berry', 'ground juniper'], ['saffron thread', 'ground saffron'], ['sumac berry', 'ground sumac'], ['ancho chile', 'ground ancho chile'], ['guajillo chile', 'ground guajillo chile'], ['chipotle chile', 'ground chipotle chile'], ['paprika pepper', 'paprika'], ['smoked paprika pepper', 'smoked paprika'], ['sesame seed', 'toasted sesame seed'], ['star anise', 'ground star anise'], ['mace blade', 'ground mace'],
] as const;
const singleSpices = [
  'cayenne pepper', 'aleppo pepper', 'red pepper flake', 'zaatar', 'garam masala', 'ras el hanout', 'madras curry powder', 'yellow curry powder', 'chinese five spice', 'pumpkin spice blend', 'berbere spice', 'baharat', 'tajin seasoning', 'pickling spice', 'old bay seasoning', 'celery salt', 'pink peppercorn', 'green peppercorn', 'szechuan peppercorn', 'vadouvan curry',
];
const spiceSpecs = buildCategory('spices', [
  ...spicePairs.flatMap(([a, b]) => [spec(a, { perishable_flag: false }), spec(b, { perishable_flag: false })]),
  ...singleSpices.map((name) => spec(name, { perishable_flag: false })),
], { base_unit: 'g', perishable_flag: false });

const dryGoodsSpecs = buildCategory('dry_goods', [
  spec('black bean'), spec('kidney bean'), spec('pinto bean'), spec('navy bean'), spec('cannellini bean'), spec('garbanzo bean'), spec('green lentil'), spec('red lentil'), spec('french lentil'), spec('black lentil'), spec('split pea'), spec('yellow split pea'), spec('black eyed pea'), spec('fava bean'), spec('mung bean'), spec('adzuki bean'), spec('soy bean'), spec('pigeon pea'),
  spec('almond'), spec('sliced almond'), spec('cashew'), spec('walnut'), spec('pecan'), spec('hazelnut'), spec('pistachio'), spec('macadamia nut'), spec('pine nut'), spec('peanut'), spec('sunflower seed'), spec('pumpkin seed'), spec('chia seed'), spec('flax seed'), spec('hemp seed'), spec('white sesame seed'), spec('black sesame seed'), spec('poppy seed'), spec('coconut flake'), spec('shredded coconut'), spec('desiccated coconut'),
  spec('raisin'), spec('golden raisin'), spec('currant'), spec('dried cranberry'), spec('dried cherry'), spec('dried blueberry'), spec('dried apricot'), spec('dried fig'), spec('date'), spec('medjool date'), spec('prune'), spec('dried apple'),
  spec('caper'), spec('cornichon'), spec('dill pickle'), spec('pickled caperberry'), spec('green olive'), spec('kalamata olive'), spec('black olive'), spec('roasted red pepper'), spec('pimiento'), spec('artichoke heart'), spec('sun dried tomato'), spec('dried shiitake mushroom'), spec('dried porcini mushroom'), spec('nori sheet'), spec('kombu'), spec('wakame'), spec('dulse'), spec('bonito flake'),
  spec('panko breadcrumb'), spec('breadcrumb'), spec('matzo meal'), spec('cornflake crumb'), spec('potato flake'), spec('instant potato flake'), spec('crispy shallot'), spec('fried garlic'), spec('toasted coconut chip'), spec('candied pecan'), spec('candied walnut'), spec('toasted almond'), spec('toasted sesame mix'), spec('black garlic'), spec('crispy onion'), spec('dried hibiscus'), spec('freeze dried strawberry'), spec('freeze dried raspberry'), spec('seaweed salad mix'), spec('pickled jalapeno'), spec('pickled banana pepper'), spec('pickled red onion'), spec('tomato confit'),
], { base_unit: 'g', perishable_flag: false });

const grainSpecs = buildCategory('grain', [
  spec('arborio rice'), spec('sushi rice'), spec('jasmine rice'), spec('basmati rice'), spec('brown rice'), spec('wild rice'), spec('forbidden rice'), spec('short grain rice'), spec('long grain rice'), spec('bomba rice'), spec('calrose rice'), spec('sticky rice'),
  spec('quinoa'), spec('couscous'), spec('pearl couscous'), spec('farro'), spec('barley'), spec('pearl barley'), spec('bulgur'), spec('millet'), spec('polenta'), spec('grits'), spec('rolled oat'), spec('steel cut oat'), spec('buckwheat'), spec('freekeh'), spec('amaranth'), spec('sorghum grain'),
  spec('udon noodle'), spec('soba noodle'), spec('rice noodle'), spec('ramen noodle'), spec('cellophane noodle'), spec('egg noodle'), spec('vermicelli noodle'), spec('lo mein noodle'),
  spec('spaghetti'), spec('fettuccine'), spec('linguine'), spec('penne'), spec('rigatoni'), spec('fusilli'), spec('macaroni'), spec('orzo'), spec('angel hair pasta'), spec('lasagna sheet'), spec('orecchiette'), spec('gnocchi'), spec('spaetzle'),
  spec('white corn tortilla'), spec('yellow corn tortilla'), spec('flour tortilla'), spec('pita bread'), spec('naan bread'), spec('lavash bread'), spec('flatbread'), spec('rice paper wrapper'), spec('wonton wrapper'), spec('dumpling wrapper'), spec('phyllo pastry sheet'), spec('spring roll wrapper'),
], { base_unit: 'g', perishable_flag: false });

const oilFatSpecs = buildCategory('oil_fat', [
  spec('neutral oil', { base_unit: 'ml' }), spec('canola oil', { base_unit: 'ml' }), spec('soybean oil', { base_unit: 'ml' }), spec('corn oil', { base_unit: 'ml' }), spec('sunflower oil', { base_unit: 'ml' }), spec('safflower oil', { base_unit: 'ml' }), spec('grapeseed oil', { base_unit: 'ml' }), spec('peanut oil', { base_unit: 'ml' }), spec('sesame oil', { base_unit: 'ml' }), spec('toasted sesame oil', { base_unit: 'ml' }), spec('olive oil', { base_unit: 'ml' }), spec('extra virgin olive oil', { base_unit: 'ml' }), spec('avocado oil', { base_unit: 'ml' }), spec('coconut oil'), spec('walnut oil', { base_unit: 'ml' }), spec('pumpkin seed oil', { base_unit: 'ml' }), spec('chili oil', { base_unit: 'ml' }), spec('truffle oil', { base_unit: 'ml' }), spec('rice bran oil', { base_unit: 'ml' }), spec('flaxseed oil', { base_unit: 'ml' }), spec('hazelnut oil', { base_unit: 'ml' }), spec('almond oil', { base_unit: 'ml' }), spec('macadamia oil', { base_unit: 'ml' }), spec('pistachio oil', { base_unit: 'ml' }), spec('garlic oil', { base_unit: 'ml' }), spec('herb oil', { base_unit: 'ml' }), spec('lemon oil', { base_unit: 'ml' }), spec('orange oil', { base_unit: 'ml' }), spec('rosemary oil', { base_unit: 'ml' }), spec('basil oil', { base_unit: 'ml' }), spec('duck fat'), spec('beef tallow'), spec('pork lard'), spec('schmaltz'), spec('vegetable shortening'), spec('shortening'), spec('margarine'), spec('cocoa butter'), spec('bacon fat'), spec('rendered chicken fat'), spec('olive pomace oil', { base_unit: 'ml' }), spec('palm oil'), spec('cottonseed oil', { base_unit: 'ml' }), spec('mustard oil', { base_unit: 'ml' }), spec('brown butter'), spec('compound butter'), spec('vegan butter'), spec('coconut cream fat', { base_unit: 'ml' }), spec('beurre noisette base'), spec('crispy chili oil', { base_unit: 'ml' }),
], { base_unit: 'g', perishable_flag: false });

const sugarSweetenerSpecs = buildCategory('sugar_sweetener', [
  spec('granulated sugar'), spec('caster sugar'), spec('confectioners sugar'), spec('brown sugar'), spec('dark brown sugar'), spec('turbinado sugar'), spec('demerara sugar'), spec('muscovado sugar'), spec('palm sugar'), spec('coconut sugar'), spec('maple sugar'), spec('jaggery'), spec('piloncillo'), spec('panela'),
  spec('glucose syrup', { base_unit: 'ml' }), spec('corn syrup', { base_unit: 'ml' }), spec('light corn syrup', { base_unit: 'ml' }), spec('dark corn syrup', { base_unit: 'ml' }), spec('honey', { base_unit: 'ml' }), spec('clover honey', { base_unit: 'ml' }), spec('orange blossom honey', { base_unit: 'ml' }), spec('wildflower honey', { base_unit: 'ml' }), spec('agave syrup', { base_unit: 'ml' }), spec('maple syrup', { base_unit: 'ml' }), spec('molasses', { base_unit: 'ml' }), spec('sorghum syrup', { base_unit: 'ml' }), spec('rice syrup', { base_unit: 'ml' }), spec('cane syrup', { base_unit: 'ml' }), spec('invert sugar', { base_unit: 'ml' }), spec('simple syrup', { base_unit: 'ml' }), spec('rich simple syrup', { base_unit: 'ml' }), spec('vanilla syrup', { base_unit: 'ml' }), spec('caramel syrup', { base_unit: 'ml' }), spec('chocolate syrup', { base_unit: 'ml' }), spec('grenadine', { base_unit: 'ml' }), spec('orgeat', { base_unit: 'ml' }), spec('date syrup', { base_unit: 'ml' }), spec('pomegranate molasses', { base_unit: 'ml' }), spec('honey syrup', { base_unit: 'ml' }), spec('ginger syrup', { base_unit: 'ml' }), spec('cinnamon syrup', { base_unit: 'ml' }), spec('passionfruit syrup', { base_unit: 'ml' }), spec('elderflower syrup', { base_unit: 'ml' }), spec('monk fruit sweetener'), spec('stevia sweetener'),
], { base_unit: 'g', perishable_flag: false });

const vinegarSpecs = buildCategory('vinegar', [
  spec('distilled white vinegar', { base_unit: 'ml' }), spec('apple cider vinegar', { base_unit: 'ml' }), spec('red wine vinegar', { base_unit: 'ml' }), spec('white wine vinegar', { base_unit: 'ml' }), spec('sherry vinegar', { base_unit: 'ml' }), spec('rice vinegar', { base_unit: 'ml' }), spec('seasoned rice vinegar', { base_unit: 'ml' }), spec('champagne vinegar', { base_unit: 'ml' }), spec('balsamic vinegar', { base_unit: 'ml' }), spec('white balsamic vinegar', { base_unit: 'ml' }), spec('malt vinegar', { base_unit: 'ml' }), spec('coconut vinegar', { base_unit: 'ml' }), spec('cane vinegar', { base_unit: 'ml' }), spec('black vinegar', { base_unit: 'ml' }), spec('tarragon vinegar', { base_unit: 'ml' }), spec('herb vinegar', { base_unit: 'ml' }), spec('raspberry vinegar', { base_unit: 'ml' }), spec('orange muscat vinegar', { base_unit: 'ml' }), spec('date vinegar', { base_unit: 'ml' }), spec('fig vinegar', { base_unit: 'ml' }), spec('lemon vinegar', { base_unit: 'ml' }), spec('sushi vinegar', { base_unit: 'ml' }), spec('pickle brine', { base_unit: 'ml' }), spec('olive brine', { base_unit: 'ml' }), spec('verjus blanc', { base_unit: 'ml' }), spec('verjus rouge', { base_unit: 'ml' }), spec('tamarind water acid', { base_unit: 'ml' }), spec('plum vinegar', { base_unit: 'ml' }), spec('persimmon vinegar', { base_unit: 'ml' }), spec('ume vinegar', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: false });

const condimentSpecs = buildCategory('condiment', [
  spec('yellow mustard'), spec('dijon mustard'), spec('whole grain mustard'), spec('spicy brown mustard'), spec('english mustard'), spec('dry mustard'),
  spec('ketchup'), spec('banana ketchup'), spec('curry ketchup'), spec('mayonnaise'), spec('aioli'), spec('garlic aioli'), spec('sriracha mayonnaise'), spec('chipotle mayonnaise'),
  spec('worcestershire sauce', { base_unit: 'ml' }), spec('fish sauce', { base_unit: 'ml' }), spec('oyster sauce', { base_unit: 'ml' }), spec('hoisin sauce', { base_unit: 'ml' }), spec('soy sauce', { base_unit: 'ml' }), spec('tamari', { base_unit: 'ml' }), spec('coconut aminos', { base_unit: 'ml' }), spec('ponzu', { base_unit: 'ml' }), spec('teriyaki sauce', { base_unit: 'ml' }), spec('yakitori sauce', { base_unit: 'ml' }),
  spec('sambal oelek', { base_unit: 'ml' }), spec('chili garlic sauce', { base_unit: 'ml' }), spec('sriracha', { base_unit: 'ml' }), spec('gochujang', { base_unit: 'g' }), spec('harissa', { base_unit: 'g' }), spec('hot sauce', { base_unit: 'ml' }), spec('tabasco sauce', { base_unit: 'ml' }), spec('buffalo sauce', { base_unit: 'ml' }), spec('steak sauce', { base_unit: 'ml' }), spec('tartar sauce', { base_unit: 'ml' }),
  spec('barbecue sauce', { base_unit: 'ml' }), spec('carolina barbecue sauce', { base_unit: 'ml' }), spec('kansas city barbecue sauce', { base_unit: 'ml' }), spec('mustard barbecue sauce', { base_unit: 'ml' }), spec('korean barbecue sauce', { base_unit: 'ml' }),
  spec('mango chutney'), spec('major grey chutney'), spec('apple chutney'), spec('onion jam'), spec('fig jam'), spec('apricot jam'), spec('orange marmalade'),
  spec('pickle relish'), spec('sweet relish'), spec('kimchi', { perishable_flag: true }), spec('sauerkraut', { perishable_flag: true }), spec('giardiniera', { perishable_flag: true }), spec('chow chow relish', { perishable_flag: true }),
  spec('black bean garlic sauce'), spec('tamarind concentrate'), spec('shrimp paste'), spec('anchovy paste'), spec('mustard relish'), spec('horseradish prepared'), spec('wasabi paste'), spec('cranberry relish'),
  spec('queso dip base', { perishable_flag: true }), spec('hummus'), spec('baba ganoush'), spec('olive tapenade'), spec('sun dried tomato spread'), spec('pesto base', { perishable_flag: true }),
  spec('remoulade'), spec('cocktail sauce'), spec('thousand island dressing', { perishable_flag: true }), spec('ranch dressing', { perishable_flag: true }), spec('caesar dressing', { perishable_flag: true }), spec('blue cheese dressing', { perishable_flag: true }), spec('green goddess dressing', { perishable_flag: true }), spec('vinaigrette base', { perishable_flag: true }),
], { base_unit: 'g', perishable_flag: false });

const sauceBaseSpecs = buildCategory('sauce_base', [
  spec('crushed tomato', { base_unit: 'ml', perishable_flag: true }), spec('diced tomato', { base_unit: 'ml', perishable_flag: true }), spec('tomato puree', { base_unit: 'ml', perishable_flag: true }), spec('passata', { base_unit: 'ml', perishable_flag: true }), spec('tomato paste', { base_unit: 'g', perishable_flag: true }), spec('marinara base', { base_unit: 'ml', perishable_flag: true }), spec('pomodoro base', { base_unit: 'ml', perishable_flag: true }), spec('vodka sauce base', { base_unit: 'ml', perishable_flag: true }),
  spec('demi glace', { base_unit: 'ml', perishable_flag: true }), spec('glace de viande', { base_unit: 'ml', perishable_flag: true }), spec('jus lie', { base_unit: 'ml', perishable_flag: true }),
  spec('chicken base', { base_unit: 'g' }), spec('beef base', { base_unit: 'g' }), spec('vegetable base', { base_unit: 'g' }), spec('seafood base', { base_unit: 'g' }), spec('mushroom base', { base_unit: 'g' }),
  spec('white miso'), spec('red miso'), spec('yellow miso'), spec('doenjang'), spec('gochujang base'), spec('ssamjang'),
  spec('red curry paste'), spec('green curry paste'), spec('yellow curry paste'), spec('massaman curry paste'), spec('panang curry paste'), spec('vindaloo curry paste'), spec('thai chili paste'),
  spec('mole negro base'), spec('mole rojo base'), spec('enchilada red base', { base_unit: 'ml', perishable_flag: true }), spec('enchilada green base', { base_unit: 'ml', perishable_flag: true }), spec('adobo paste'), spec('achiote paste'), spec('harissa base'), spec('romesco base', { base_unit: 'ml', perishable_flag: true }),
  spec('roasted garlic puree', { base_unit: 'g', perishable_flag: true }), spec('ginger puree', { base_unit: 'g', perishable_flag: true }), spec('onion puree', { base_unit: 'g', perishable_flag: true }), spec('shallot puree', { base_unit: 'g', perishable_flag: true }), spec('black garlic puree', { base_unit: 'g', perishable_flag: true }), spec('pepper puree', { base_unit: 'ml', perishable_flag: true }),
  spec('sofrito base', { base_unit: 'g', perishable_flag: true }), spec('mirepoix base', { base_unit: 'g', perishable_flag: true }), spec('cajun trinity base', { base_unit: 'g', perishable_flag: true }), spec('onion celery carrot base', { base_unit: 'g', perishable_flag: true }),
  spec('tahini'), spec('peanut butter'), spec('almond butter'), spec('sunflower butter'), spec('sesame paste'),
  spec('coconut milk', { base_unit: 'ml', perishable_flag: true }), spec('coconut cream', { base_unit: 'ml', perishable_flag: true }), spec('evaporated coconut milk', { base_unit: 'ml', perishable_flag: true }),
  spec('clam juice', { base_unit: 'ml', perishable_flag: true }), spec('dashi concentrate', { base_unit: 'ml' }), spec('bonito concentrate', { base_unit: 'ml' }), spec('kombu concentrate', { base_unit: 'ml' }),
  spec('beurre blanc base', { base_unit: 'ml', perishable_flag: true }), spec('veloute base', { base_unit: 'ml', perishable_flag: true }), spec('espagnole base', { base_unit: 'ml', perishable_flag: true }), spec('bechamel base', { base_unit: 'ml', perishable_flag: true }), spec('mornay base', { base_unit: 'ml', perishable_flag: true }), spec('curry roux', { base_unit: 'g' }), spec('blond roux', { base_unit: 'g' }), spec('brown roux', { base_unit: 'g' }),
  spec('tamarind paste'), spec('pomegranate molasses base', { base_unit: 'ml' }), spec('truffle paste'), spec('olive paste'), spec('black olive paste'), spec('sun dried tomato paste'), spec('calabrian chili paste'), spec('doubanjiang'), spec('fermented black bean paste'), spec('xo sauce base', { base_unit: 'g' }), spec('lemongrass puree', { base_unit: 'g', perishable_flag: true }), spec('herb puree', { base_unit: 'g', perishable_flag: true }),
], { base_unit: 'g', perishable_flag: true });

const stockSpecs = buildCategory('stock', [
  spec('chicken stock', { base_unit: 'ml', perishable_flag: true }), spec('chicken broth', { base_unit: 'ml', perishable_flag: true }), spec('beef stock', { base_unit: 'ml', perishable_flag: true }), spec('beef broth', { base_unit: 'ml', perishable_flag: true }), spec('veal stock', { base_unit: 'ml', perishable_flag: true }), spec('veal broth', { base_unit: 'ml', perishable_flag: true }),
  spec('vegetable stock', { base_unit: 'ml', perishable_flag: true }), spec('vegetable broth', { base_unit: 'ml', perishable_flag: true }), spec('mushroom stock', { base_unit: 'ml', perishable_flag: true }), spec('fish stock', { base_unit: 'ml', perishable_flag: true }), spec('shellfish stock', { base_unit: 'ml', perishable_flag: true }), spec('shrimp stock', { base_unit: 'ml', perishable_flag: true }), spec('lobster stock', { base_unit: 'ml', perishable_flag: true }), spec('clam broth', { base_unit: 'ml', perishable_flag: true }), spec('seafood broth', { base_unit: 'ml', perishable_flag: true }),
  spec('pork stock', { base_unit: 'ml', perishable_flag: true }), spec('turkey stock', { base_unit: 'ml', perishable_flag: true }), spec('lamb stock', { base_unit: 'ml', perishable_flag: true }), spec('duck stock', { base_unit: 'ml', perishable_flag: true }),
  spec('ramen broth', { base_unit: 'ml', perishable_flag: true }), spec('pho broth', { base_unit: 'ml', perishable_flag: true }), spec('dashi', { base_unit: 'ml', perishable_flag: true }), spec('kombu dashi', { base_unit: 'ml', perishable_flag: true }), spec('bonito dashi', { base_unit: 'ml', perishable_flag: true }),
  spec('tomato stock', { base_unit: 'ml', perishable_flag: true }), spec('corn stock', { base_unit: 'ml', perishable_flag: true }), spec('bone broth beef', { base_unit: 'ml', perishable_flag: true }), spec('bone broth chicken', { base_unit: 'ml', perishable_flag: true }),
  spec('fish fumet', { base_unit: 'ml', perishable_flag: true }), spec('chicken consommé', { base_unit: 'ml', perishable_flag: true }), spec('beef consommé', { base_unit: 'ml', perishable_flag: true }), spec('mushroom broth', { base_unit: 'ml', perishable_flag: true }), spec('miso broth', { base_unit: 'ml', perishable_flag: true }), spec('coconut broth', { base_unit: 'ml', perishable_flag: true }), spec('curry broth', { base_unit: 'ml', perishable_flag: true }),
  spec('vegetable concentrate', { base_unit: 'ml' }), spec('chicken concentrate', { base_unit: 'ml' }), spec('beef concentrate', { base_unit: 'ml' }), spec('seafood concentrate', { base_unit: 'ml' }), spec('mushroom concentrate', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: true });

const seafoodSpecs = buildCategory('seafood', [
  spec('salmon fillet'), spec('salmon belly'), spec('smoked salmon'), spec('salmon roe'), spec('tuna loin'), spec('ahi tuna'), spec('yellowtail'), spec('halibut'), spec('cod fillet'), spec('black cod'), spec('sea bass'), spec('branzino'), spec('snapper'), spec('grouper'), spec('mahi mahi'), spec('swordfish'), spec('trout'), spec('arctic char'), spec('catfish'), spec('tilapia'), spec('flounder'), spec('sole'), spec('monkfish'), spec('skate wing'), spec('anchovy'), spec('sardine'), spec('mackerel'), spec('herring'), spec('octopus'), spec('squid'), spec('cuttlefish'), spec('calamari ring'),
  spec('shrimp'), spec('prawn'), spec('jumbo shrimp'), spec('white shrimp'), spec('rock shrimp'), spec('scallop'), spec('bay scallop'), spec('mussel'), spec('clam'), spec('razor clam'), spec('cockle'), spec('oyster'), spec('lobster tail'), spec('lobster meat'), spec('crawfish'), spec('crab meat'), spec('lump crab'), spec('snow crab'), spec('king crab'), spec('dungeness crab'), spec('langostino'),
  spec('uni'), spec('tobiko'), spec('ikura'), spec('roe'), spec('eel'), spec('smoked trout'), spec('salt cod'), spec('tuna belly'), spec('conch'), spec('whelk'), spec('abalone'), spec('perch'), spec('wahoo'), spec('ono'), spec('opah'), spec('bluefin tuna'), spec('escolar'),
], { base_unit: 'g', perishable_flag: true });

const spiritSpecs = buildCategory('alcohol_spirit', [
  spec('vodka', { base_unit: 'ml', aliases: ['vodka spirit'] }), spec('gin', { base_unit: 'ml' }), spec('london dry gin', { base_unit: 'ml' }), spec('old tom gin', { base_unit: 'ml' }),
  spec('tequila blanco', { base_unit: 'ml' }), spec('tequila reposado', { base_unit: 'ml' }), spec('tequila anejo', { base_unit: 'ml' }), spec('mezcal', { base_unit: 'ml' }),
  spec('white rum', { base_unit: 'ml' }), spec('dark rum', { base_unit: 'ml' }), spec('aged rum', { base_unit: 'ml' }), spec('spiced rum', { base_unit: 'ml' }), spec('cachaca', { base_unit: 'ml' }),
  spec('bourbon', { base_unit: 'ml' }), spec('rye whiskey', { base_unit: 'ml' }), spec('scotch whisky', { base_unit: 'ml' }), spec('blended scotch', { base_unit: 'ml' }), spec('single malt whisky', { base_unit: 'ml' }), spec('irish whiskey', { base_unit: 'ml' }), spec('japanese whisky', { base_unit: 'ml' }),
  spec('cognac', { base_unit: 'ml' }), spec('brandy', { base_unit: 'ml' }), spec('armagnac', { base_unit: 'ml' }), spec('calvados', { base_unit: 'ml' }), spec('pisco', { base_unit: 'ml' }), spec('grappa', { base_unit: 'ml' }), spec('sake', { base_unit: 'ml' }),
  spec('dry vermouth', { base_unit: 'ml' }), spec('sweet vermouth', { base_unit: 'ml' }), spec('bianco vermouth', { base_unit: 'ml' }),
  spec('amaro', { base_unit: 'ml' }), spec('aperol', { base_unit: 'ml' }), spec('campari', { base_unit: 'ml' }), spec('coffee liqueur', { base_unit: 'ml' }), spec('orange liqueur', { base_unit: 'ml' }), spec('elderflower liqueur', { base_unit: 'ml' }), spec('maraschino liqueur', { base_unit: 'ml' }), spec('amaretto', { base_unit: 'ml' }), spec('creme de cassis', { base_unit: 'ml' }), spec('green chartreuse', { base_unit: 'ml' }), spec('yellow chartreuse', { base_unit: 'ml' }), spec('absinthe', { base_unit: 'ml' }), spec('sambuca', { base_unit: 'ml' }), spec('limoncello', { base_unit: 'ml' }), spec('anisette', { base_unit: 'ml' }), spec('benedictine', { base_unit: 'ml' }), spec('drambuie', { base_unit: 'ml' }), spec('falernum liqueur', { base_unit: 'ml' }), spec('creme de cacao', { base_unit: 'ml' }), spec('frangelico', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: false });

const beerSpecs = buildCategory('beer', [
  spec('lager beer', { base_unit: 'ml' }), spec('pilsner beer', { base_unit: 'ml' }), spec('helles lager', { base_unit: 'ml' }), spec('dunkel lager', { base_unit: 'ml' }), spec('bock beer', { base_unit: 'ml' }), spec('doppelbock beer', { base_unit: 'ml' }), spec('oktoberfest beer', { base_unit: 'ml' }), spec('kolsch beer', { base_unit: 'ml' }), spec('wheat beer', { base_unit: 'ml' }), spec('hefeweizen beer', { base_unit: 'ml' }), spec('witbier', { base_unit: 'ml' }), spec('saison beer', { base_unit: 'ml' }), spec('farmhouse ale', { base_unit: 'ml' }),
  spec('pale ale beer', { base_unit: 'ml' }), spec('india pale ale beer', { base_unit: 'ml' }), spec('hazy ipa beer', { base_unit: 'ml' }), spec('double ipa beer', { base_unit: 'ml' }), spec('session ipa beer', { base_unit: 'ml' }), spec('amber ale beer', { base_unit: 'ml' }), spec('red ale beer', { base_unit: 'ml' }), spec('brown ale beer', { base_unit: 'ml' }),
  spec('porter beer', { base_unit: 'ml' }), spec('stout beer', { base_unit: 'ml' }), spec('imperial stout beer', { base_unit: 'ml' }), spec('milk stout beer', { base_unit: 'ml' }),
  spec('sour beer', { base_unit: 'ml' }), spec('gose beer', { base_unit: 'ml' }), spec('berliner weisse beer', { base_unit: 'ml' }), spec('lambic beer', { base_unit: 'ml' }), spec('fruit beer', { base_unit: 'ml' }),
  spec('belgian blonde ale', { base_unit: 'ml' }), spec('belgian dubbel ale', { base_unit: 'ml' }), spec('belgian tripel ale', { base_unit: 'ml' }), spec('belgian quadrupel ale', { base_unit: 'ml' }), spec('barleywine beer', { base_unit: 'ml' }), spec('cream ale beer', { base_unit: 'ml' }),
  spec('rice lager beer', { base_unit: 'ml' }), spec('mexican lager beer', { base_unit: 'ml' }), spec('pale lager beer', { base_unit: 'ml' }), spec('schwarzbier', { base_unit: 'ml' }), spec('altbier', { base_unit: 'ml' }), spec('maibock beer', { base_unit: 'ml' }), spec('marzen beer', { base_unit: 'ml' }), spec('esb beer', { base_unit: 'ml' }), spec('non alcoholic beer', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: true });

const wineSpecs = buildCategory('wine', [
  spec('cabernet sauvignon', { base_unit: 'ml' }), spec('merlot', { base_unit: 'ml' }), spec('pinot noir', { base_unit: 'ml' }), spec('syrah', { base_unit: 'ml' }), spec('shiraz', { base_unit: 'ml' }), spec('malbec', { base_unit: 'ml' }), spec('zinfandel', { base_unit: 'ml' }), spec('tempranillo', { base_unit: 'ml' }), spec('sangiovese', { base_unit: 'ml' }), spec('nebbiolo', { base_unit: 'ml' }), spec('grenache', { base_unit: 'ml' }), spec('mourvedre', { base_unit: 'ml' }), spec('carmenere', { base_unit: 'ml' }), spec('petit verdot', { base_unit: 'ml' }), spec('cabernet franc', { base_unit: 'ml' }), spec('barbera', { base_unit: 'ml' }), spec('gamay', { base_unit: 'ml' }), spec('montepulciano', { base_unit: 'ml' }), spec('primitivo', { base_unit: 'ml' }), spec('rioja red blend', { base_unit: 'ml' }), spec('bordeaux red blend', { base_unit: 'ml' }), spec('chianti', { base_unit: 'ml' }),
  spec('prosecco', { base_unit: 'ml' }), spec('cava', { base_unit: 'ml' }), spec('champagne', { base_unit: 'ml' }), spec('sparkling wine', { base_unit: 'ml' }), spec('brut sparkling wine', { base_unit: 'ml' }),
  spec('chardonnay', { base_unit: 'ml' }), spec('sauvignon blanc', { base_unit: 'ml' }), spec('pinot grigio', { base_unit: 'ml' }), spec('riesling', { base_unit: 'ml' }), spec('gewurztraminer', { base_unit: 'ml' }), spec('chenin blanc', { base_unit: 'ml' }), spec('viognier', { base_unit: 'ml' }), spec('albarino', { base_unit: 'ml' }), spec('gruner veltliner', { base_unit: 'ml' }), spec('muscadet', { base_unit: 'ml' }), spec('semillon', { base_unit: 'ml' }), spec('torrontes', { base_unit: 'ml' }), spec('pinot blanc', { base_unit: 'ml' }), spec('verdicchio', { base_unit: 'ml' }), spec('fiano', { base_unit: 'ml' }), spec('assyrtiko', { base_unit: 'ml' }), spec('txakoli', { base_unit: 'ml' }), spec('orange wine', { base_unit: 'ml' }),
  spec('rose wine', { base_unit: 'ml' }), spec('white zinfandel', { base_unit: 'ml' }), spec('dessert wine', { base_unit: 'ml' }), spec('sauternes', { base_unit: 'ml' }), spec('ice wine', { base_unit: 'ml' }), spec('marsala wine', { base_unit: 'ml' }), spec('madeira wine', { base_unit: 'ml' }), spec('sherry wine', { base_unit: 'ml' }), spec('port wine', { base_unit: 'ml' }), spec('late harvest wine', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: true });

const naBeverageSpecs = buildCategory('non_alcoholic_beverage', [
  spec('water', { base_unit: 'ml' }), spec('sparkling water', { base_unit: 'ml' }), spec('club soda', { base_unit: 'ml' }), spec('tonic water', { base_unit: 'ml' }), spec('cola', { base_unit: 'ml' }), spec('diet cola', { base_unit: 'ml' }), spec('lemon lime soda', { base_unit: 'ml' }), spec('ginger ale', { base_unit: 'ml' }), spec('ginger beer', { base_unit: 'ml' }), spec('root beer', { base_unit: 'ml' }),
  spec('black tea', { base_unit: 'ml' }), spec('green tea', { base_unit: 'ml' }), spec('earl grey tea', { base_unit: 'ml' }), spec('jasmine tea', { base_unit: 'ml' }), spec('chamomile tea', { base_unit: 'ml' }), spec('hibiscus tea', { base_unit: 'ml' }), spec('chai concentrate', { base_unit: 'ml' }), spec('matcha concentrate', { base_unit: 'ml' }),
  spec('coffee', { base_unit: 'ml' }), spec('espresso', { base_unit: 'ml' }), spec('cold brew concentrate', { base_unit: 'ml' }), spec('decaf coffee', { base_unit: 'ml' }), spec('hot chocolate base', { base_unit: 'ml' }),
  spec('orange juice', { base_unit: 'ml' }), spec('lemon juice', { base_unit: 'ml' }), spec('lime juice', { base_unit: 'ml' }), spec('grapefruit juice', { base_unit: 'ml' }), spec('pineapple juice', { base_unit: 'ml' }), spec('cranberry juice', { base_unit: 'ml' }), spec('apple juice', { base_unit: 'ml' }), spec('tomato juice', { base_unit: 'ml' }), spec('carrot juice', { base_unit: 'ml' }), spec('pomegranate juice', { base_unit: 'ml' }), spec('beet juice', { base_unit: 'ml' }), spec('celery juice', { base_unit: 'ml' }), spec('watermelon juice', { base_unit: 'ml' }), spec('passionfruit puree', { base_unit: 'ml' }), spec('mango puree', { base_unit: 'ml' }),
  spec('coconut water', { base_unit: 'ml' }), spec('almond milk', { base_unit: 'ml' }), spec('oat milk', { base_unit: 'ml' }), spec('soy milk', { base_unit: 'ml' }), spec('rice milk', { base_unit: 'ml' }),
  spec('lemonade', { base_unit: 'ml' }), spec('pink lemonade', { base_unit: 'ml' }), spec('kombucha', { base_unit: 'ml' }), spec('energy drink', { base_unit: 'ml' }), spec('sports drink', { base_unit: 'ml' }), spec('ginger shot', { base_unit: 'ml' }), spec('horchata', { base_unit: 'ml' }), spec('mexican cola', { base_unit: 'ml' }), spec('cucumber water', { base_unit: 'ml' }), spec('mint tea', { base_unit: 'ml' }), spec('peach tea', { base_unit: 'ml' }),
], { base_unit: 'ml', perishable_flag: true });

const bakingSpecs = buildCategory('baking', [
  spec('all purpose flour'), spec('bread flour'), spec('cake flour'), spec('pastry flour'), spec('whole wheat flour'), spec('rye flour'), spec('almond flour'), spec('rice flour'), spec('semolina flour'), spec('cornmeal'),
  spec('cornstarch'), spec('tapioca starch'), spec('potato starch'), spec('arrowroot powder'), spec('masa harina'), spec('graham crumb'),
  spec('baking powder'), spec('baking soda'), spec('instant yeast'), spec('active dry yeast'), spec('fresh yeast'), spec('cream of tartar'), spec('gelatin powder'), spec('agar agar'), spec('xanthan gum'), spec('pectin'), spec('meringue powder'),
  spec('cocoa powder'), spec('dark cocoa powder'), spec('cocoa nib'), spec('dark chocolate'), spec('milk chocolate'), spec('white chocolate'), spec('chocolate chip'), spec('butterscotch chip'),
  spec('vanilla extract', { base_unit: 'ml' }), spec('almond extract', { base_unit: 'ml' }), spec('lemon extract', { base_unit: 'ml' }), spec('orange extract', { base_unit: 'ml' }), spec('rose water', { base_unit: 'ml' }), spec('orange blossom water', { base_unit: 'ml' }),
  spec('custard powder'), spec('malt powder'), spec('diastatic malt powder'), spec('non diastatic malt powder'), spec('fondant'), spec('marzipan'), spec('puff pastry dough', { perishable_flag: true }), spec('pie crust dough', { perishable_flag: true }), spec('croissant dough', { perishable_flag: true }),
], { base_unit: 'g', perishable_flag: false });

const allCategories = [
  proteinSpecs,
  dairySpecs,
  produceSpecs,
  herbSpecs,
  spiceSpecs,
  dryGoodsSpecs,
  grainSpecs,
  oilFatSpecs,
  sugarSweetenerSpecs,
  vinegarSpecs,
  condimentSpecs,
  sauceBaseSpecs,
  stockSpecs,
  seafoodSpecs,
  spiritSpecs,
  beerSpecs,
  wineSpecs,
  naBeverageSpecs,
  bakingSpecs,
];

const flattened = allCategories.flat();

function validateCounts(entries: Array<IngredientEntry & { aliases: string[] }>): void {
  const counts = new Map<Category, number>();
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  for (const category of counts.keys()) {
    const actual = counts.get(category) ?? 0;
    if (actual < 30) {
      throw new Error(`Category ${category} is underrepresented with only ${actual} entries.`);
    }
  }

  if (entries.length < 1150 || entries.length > 1250) {
    throw new Error(`Expected approximately 1200 total ingredients but found ${entries.length}.`);
  }
}

function validateUnique(entries: Array<IngredientEntry & { aliases: string[] }>): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.canonical_name)) {
      throw new Error(`Duplicate canonical ingredient name: ${entry.canonical_name}`);
    }
    seen.add(entry.canonical_name);
  }
}

function sanitize(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildAliases(name: string, category: Category, explicit: string[]): string[] {
  const aliases = new Set<string>();
  const normalized = sanitize(name);

  for (const alias of explicit) {
    const cleaned = sanitize(alias);
    if (cleaned && cleaned !== normalized) {
      aliases.add(cleaned);
    }
  }

  if (normalized.startsWith('dried ')) {
    const core = normalized.slice('dried '.length);
    aliases.add(core);
    aliases.add(`${core} dried`);
  }

  if (normalized.startsWith('ground ')) {
    const core = normalized.slice('ground '.length);
    aliases.add(core);
    aliases.add(`${core} ground`);
  }

  if (normalized.startsWith('whole ')) {
    const core = normalized.slice('whole '.length);
    aliases.add(core);
    aliases.add(`${core} whole`);
  }

  const suffixes = ['cheese', 'oil', 'vinegar', 'sauce', 'stock', 'broth', 'beer', 'wine', 'juice', 'milk', 'cream', 'syrup', 'sugar', 'flour', 'powder', 'paste', 'puree', 'concentrate', 'liqueur', 'ale'];
  for (const suffix of suffixes) {
    if (normalized.endsWith(` ${suffix}`)) {
      aliases.add(normalized.slice(0, -(` ${suffix}`).length));
    }
  }

  if (normalized.includes(' and ')) {
    aliases.add(normalized.replace(/ and /g, ' & '));
  }

  if (normalized.includes('extra virgin olive oil')) {
    aliases.add('evoo');
  }

  if (category === 'beer' && normalized.endsWith(' beer')) {
    aliases.add(normalized.replace(/ beer$/, ''));
  }

  if (category === 'wine') {
    aliases.add(normalized.replace(/ wine$/, ''));
  }

  const custom = CUSTOM_ALIASES[normalized] ?? [];
  for (const alias of custom) {
    const cleaned = sanitize(alias);
    if (cleaned && cleaned !== normalized) {
      aliases.add(cleaned);
    }
  }

  if (aliases.size === 0) {
    const compact = normalized.replace(/\s+/g, '');
    aliases.add(compact);
  }

  return [...aliases].sort();
}

const ingredients: IngredientEntry[] = flattened.map(({ canonical_name, category, base_unit, perishable_flag }) => ({
  canonical_name,
  category,
  base_unit,
  perishable_flag,
}));

const aliases: AliasEntry[] = flattened.map(({ canonical_name, category, aliases: explicitAliases }) => ({
  canonical_name,
  aliases: buildAliases(canonical_name, category, explicitAliases),
}));

validateCounts(flattened);
validateUnique(flattened);

const output = {
  ingredients,
  aliases,
};

const outputPath = path.resolve('packages/server/data/canonical-ingredient-dictionary.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Wrote ${ingredients.length} canonical ingredients to ${outputPath}`);
