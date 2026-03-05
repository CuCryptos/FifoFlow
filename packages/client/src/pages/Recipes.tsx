import { useState } from 'react';
import { useRecipes, useRecipe, useCreateRecipe, useUpdateRecipe, useDeleteRecipe } from '../hooks/useRecipes';
import { useProductRecipes, useSetProductRecipe, useDeleteProductRecipe, useCalculateOrder } from '../hooks/useProductRecipes';
import { useItems } from '../hooks/useItems';
import { useVenues } from '../hooks/useVenues';
import { useVendors } from '../hooks/useVendors';
import { useCreateOrder } from '../hooks/useOrders';
import { useToast } from '../contexts/ToastContext';
import { UNITS } from '@fifoflow/shared';
import type { CalculatedIngredient, OrderCalculationResult } from '@fifoflow/shared';

type RecipeTab = 'recipes' | 'menus' | 'calculate';

export function Recipes() {
  const [activeTab, setActiveTab] = useState<RecipeTab>('recipes');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-text-primary">Recipes</h1>

      <div className="flex gap-1 bg-bg-card rounded-lg p-1 w-fit">
        {([
          ['recipes', 'Recipes'],
          ['menus', 'Product Menus'],
          ['calculate', 'Calculate Order'],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-accent-indigo text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'recipes' && <RecipeList />}
      {activeTab === 'menus' && <ProductMenus />}
      {activeTab === 'calculate' && <CalculateOrder />}
    </div>
  );
}

// ── Recipe List Tab ───────────────────────────────────────────

function RecipeList() {
  const { data: recipes, isLoading } = useRecipes();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  if (isLoading) return <div className="text-text-secondary text-sm">Loading...</div>;

  if (editingId) {
    return <RecipeForm recipeId={editingId} onDone={() => setEditingId(null)} />;
  }

  if (showForm) {
    return <RecipeForm onDone={() => setShowForm(false)} />;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover transition-colors"
        >
          Add Recipe
        </button>
      </div>

      {!recipes?.length ? (
        <div className="text-text-secondary text-sm">No recipes yet. Create one to get started.</div>
      ) : (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-table-header text-text-secondary text-left">
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide">Type</th>
                <th className="px-4 py-2.5 font-medium text-xs uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipes.map((r) => (
                <RecipeRow key={r.id} recipe={r} onEdit={() => setEditingId(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecipeRow({ recipe, onEdit }: { recipe: { id: number; name: string; type: string }; onEdit: () => void }) {
  const deleteRecipe = useDeleteRecipe();
  const { toast } = useToast();

  return (
    <tr className="border-b border-border hover:bg-bg-hover">
      <td className="px-4 py-2 text-text-primary font-medium">{recipe.name}</td>
      <td className="px-4 py-2">
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          recipe.type === 'dish'
            ? 'bg-accent-green/20 text-accent-green'
            : 'bg-accent-amber/20 text-accent-amber'
        }`}>
          {recipe.type}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <button onClick={onEdit} className="text-accent-indigo hover:underline text-xs mr-3">Edit</button>
        <button
          onClick={() => deleteRecipe.mutate(recipe.id, {
            onSuccess: () => toast('Recipe deleted', 'success'),
            onError: (err) => toast(err.message, 'error'),
          })}
          className="text-accent-red hover:underline text-xs"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

// ── Recipe Form ───────────────────────────────────────────────

interface IngredientRow {
  item_id: number;
  quantity: string;
  unit: string;
}

function RecipeForm({ recipeId, onDone }: { recipeId?: number; onDone: () => void }) {
  const { data: existing } = useRecipe(recipeId ?? 0);
  const { data: items } = useItems();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState<'dish' | 'prep'>('dish');
  const [notes, setNotes] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Populate form when editing
  if (existing && !initialized) {
    setName(existing.name);
    setType(existing.type);
    setNotes(existing.notes ?? '');
    setIngredients(existing.items.map((i) => ({
      item_id: i.item_id,
      quantity: String(i.quantity),
      unit: i.unit,
    })));
    setInitialized(true);
  }
  if (!recipeId && !initialized) {
    setInitialized(true);
  }

  const addIngredient = () => {
    setIngredients((prev) => [...prev, { item_id: 0, quantity: '', unit: 'each' }]);
  };

  const removeIngredient = (idx: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateIngredient = (idx: number, field: keyof IngredientRow, value: string | number) => {
    setIngredients((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleSubmit = () => {
    const data = {
      name,
      type,
      notes: notes || null,
      items: ingredients
        .filter((i) => i.item_id > 0 && Number(i.quantity) > 0)
        .map((i) => ({ item_id: i.item_id, quantity: Number(i.quantity), unit: i.unit })),
    };

    if (recipeId) {
      updateRecipe.mutate({ id: recipeId, data }, {
        onSuccess: () => { toast('Recipe updated', 'success'); onDone(); },
        onError: (err) => toast(err.message, 'error'),
      });
    } else {
      createRecipe.mutate(data, {
        onSuccess: () => { toast('Recipe created', 'success'); onDone(); },
        onError: (err) => toast(err.message, 'error'),
      });
    }
  };

  const isPending = createRecipe.isPending || updateRecipe.isPending;

  return (
    <div className="bg-bg-card rounded-xl shadow-sm p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          {recipeId ? 'Edit Recipe' : 'New Recipe'}
        </h2>
        <button onClick={onDone} className="text-text-secondary hover:text-text-primary text-sm">Cancel</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
            placeholder="e.g. Grilled Mahi"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'dish' | 'prep')}
            className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          >
            <option value="dish">Dish</option>
            <option value="prep">Prep</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full bg-white border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
          rows={2}
        />
      </div>

      {/* Ingredients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-text-secondary">Ingredients</label>
          <button
            onClick={addIngredient}
            className="text-accent-indigo text-xs hover:underline"
          >
            + Add Ingredient
          </button>
        </div>

        {ingredients.length === 0 ? (
          <div className="text-text-secondary text-xs">No ingredients added yet.</div>
        ) : (
          <div className="space-y-2">
            {ingredients.map((ing, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={ing.item_id}
                  onChange={(e) => {
                    const itemId = Number(e.target.value);
                    updateIngredient(idx, 'item_id', itemId);
                    // Auto-set unit from item
                    const item = items?.find((i) => i.id === itemId);
                    if (item) updateIngredient(idx, 'unit', item.unit);
                  }}
                  className="flex-1 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                >
                  <option value={0}>Select item...</option>
                  {(items ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="Qty"
                  value={ing.quantity}
                  onChange={(e) => updateIngredient(idx, 'quantity', e.target.value)}
                  className="w-20 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary"
                />
                <select
                  value={ing.unit}
                  onChange={(e) => updateIngredient(idx, 'unit', e.target.value)}
                  className="w-20 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeIngredient(idx)}
                  className="text-accent-red text-xs hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onDone}
          className="border border-border text-text-secondary px-4 py-2 rounded-lg text-sm hover:bg-bg-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending || !name.trim()}
          className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
        >
          {recipeId ? 'Save Changes' : 'Create Recipe'}
        </button>
      </div>
    </div>
  );
}

// ── Product Menus Tab ─────────────────────────────────────────

function ProductMenus() {
  const { data: venues, isLoading: venuesLoading } = useVenues();
  const { data: recipes } = useRecipes();
  const { data: productRecipes, isLoading: prLoading } = useProductRecipes();
  const setProductRecipe = useSetProductRecipe();
  const deleteProductRecipe = useDeleteProductRecipe();
  const { toast } = useToast();

  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState(0);
  const [portionsPerGuest, setPortionsPerGuest] = useState('1');

  if (venuesLoading || prLoading) return <div className="text-text-secondary text-sm">Loading...</div>;
  if (!venues?.length) return <div className="text-text-secondary text-sm">No venues configured. Add venues first.</div>;

  const recipesByVenue = new Map<number, typeof productRecipes>();
  for (const pr of productRecipes ?? []) {
    const arr = recipesByVenue.get(pr.venue_id) ?? [];
    arr.push(pr);
    recipesByVenue.set(pr.venue_id, arr);
  }

  const handleAdd = (venueId: number) => {
    if (!selectedRecipeId) return;
    setProductRecipe.mutate(
      { venueId, data: { recipe_id: selectedRecipeId, portions_per_guest: Number(portionsPerGuest) || 1 } },
      {
        onSuccess: () => { toast('Recipe assigned', 'success'); setAddingFor(null); setSelectedRecipeId(0); setPortionsPerGuest('1'); },
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  return (
    <div className="space-y-4">
      {venues.map((venue) => {
        const assigned = recipesByVenue.get(venue.id) ?? [];
        return (
          <div key={venue.id} className="bg-bg-card rounded-xl shadow-sm">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-base font-semibold text-text-primary">{venue.name}</h3>
              <button
                onClick={() => setAddingFor(addingFor === venue.id ? null : venue.id)}
                className="text-accent-indigo text-xs hover:underline"
              >
                {addingFor === venue.id ? 'Cancel' : '+ Add Recipe'}
              </button>
            </div>

            {addingFor === venue.id && (
              <div className="px-4 py-3 border-b border-border bg-bg-hover flex items-center gap-2">
                <select
                  value={selectedRecipeId}
                  onChange={(e) => setSelectedRecipeId(Number(e.target.value))}
                  className="flex-1 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
                >
                  <option value={0}>Select recipe...</option>
                  {(recipes ?? []).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.type})</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={portionsPerGuest}
                  onChange={(e) => setPortionsPerGuest(e.target.value)}
                  className="w-24 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary"
                  placeholder="Portions/guest"
                />
                <span className="text-text-secondary text-xs whitespace-nowrap">per guest</span>
                <button
                  onClick={() => handleAdd(venue.id)}
                  disabled={!selectedRecipeId || setProductRecipe.isPending}
                  className="bg-accent-indigo text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
              </div>
            )}

            {assigned.length === 0 ? (
              <div className="px-4 py-3 text-text-secondary text-xs">No recipes assigned.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-table-header text-text-secondary text-left">
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Recipe</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Type</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Portions/Guest</th>
                    <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assigned.map((pr) => (
                    <tr key={pr.id} className="border-b border-border hover:bg-bg-hover">
                      <td className="px-4 py-2 text-text-primary">{pr.recipe_name}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          pr.recipe_type === 'dish'
                            ? 'bg-accent-green/20 text-accent-green'
                            : 'bg-accent-amber/20 text-accent-amber'
                        }`}>
                          {pr.recipe_type}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-text-secondary">{pr.portions_per_guest}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => deleteProductRecipe.mutate(pr.id, {
                            onSuccess: () => toast('Recipe removed', 'success'),
                            onError: (err) => toast(err.message, 'error'),
                          })}
                          className="text-accent-red text-xs hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Calculate Order Tab ───────────────────────────────────────

function CalculateOrder() {
  const { data: venues } = useVenues();
  const { data: vendors } = useVendors();
  const calculateOrder = useCalculateOrder();
  const createOrder = useCreateOrder();
  const { toast } = useToast();

  const [guestCounts, setGuestCounts] = useState<Record<number, string>>({});
  const [vendorFilter, setVendorFilter] = useState<number | undefined>(undefined);
  const [result, setResult] = useState<OrderCalculationResult | null>(null);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  const handleCalculate = () => {
    const guest_counts = (venues ?? [])
      .filter((v) => Number(guestCounts[v.id] || 0) > 0)
      .map((v) => ({ venue_id: v.id, guest_count: Number(guestCounts[v.id]) }));

    if (guest_counts.length === 0) {
      toast('Enter guest counts for at least one venue', 'error');
      return;
    }

    calculateOrder.mutate(
      { guest_counts, vendor_id: vendorFilter },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) => toast(err.message, 'error'),
      },
    );
  };

  const handleCreateDraftOrder = () => {
    if (!result) return;

    // Group shortages by vendor
    const byVendor = new Map<number, CalculatedIngredient[]>();
    for (const ing of result.ingredients) {
      if (ing.shortage <= 0 || !ing.vendor_id) continue;
      const arr = byVendor.get(ing.vendor_id) ?? [];
      arr.push(ing);
      byVendor.set(ing.vendor_id, arr);
    }

    if (byVendor.size === 0) {
      toast('No shortages to order', 'error');
      return;
    }

    // Create one order per vendor
    let created = 0;
    for (const [vid, ings] of byVendor) {
      const items = ings.map((ing) => ({
        item_id: ing.item_id,
        quantity: ing.shortage,
        unit: ing.order_unit ?? ing.recipe_unit,
        unit_price: ing.order_unit_price ?? 0,
      }));

      createOrder.mutate(
        { vendor_id: vid, notes: 'Auto-generated from recipe calculation', items },
        {
          onSuccess: () => {
            created++;
            if (created === byVendor.size) {
              toast(`${created} draft order(s) created`, 'success');
            }
          },
          onError: (err) => toast(`Failed: ${err.message}`, 'error'),
        },
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Guest count inputs */}
      <div className="bg-bg-card rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="text-sm font-semibold text-text-primary">Guest Counts</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {(venues ?? []).map((v) => (
            <div key={v.id} className="flex items-center gap-2">
              <label className="text-xs text-text-secondary flex-1">{v.name}</label>
              <input
                type="number"
                min="0"
                value={guestCounts[v.id] ?? ''}
                onChange={(e) => setGuestCounts((prev) => ({ ...prev, [v.id]: e.target.value }))}
                placeholder="0"
                className="w-24 bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-right text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-indigo/20"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary">Vendor filter</label>
            <select
              value={vendorFilter ?? ''}
              onChange={(e) => setVendorFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="bg-white border border-border rounded-lg px-2 py-1.5 text-xs text-text-primary"
            >
              <option value="">All vendors</option>
              {(vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleCalculate}
            disabled={calculateOrder.isPending}
            className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
          >
            {calculateOrder.isPending ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="bg-bg-card rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              Ingredient Requirements
            </h3>
            <span className="text-sm text-text-secondary font-mono">
              Est. Total: ${result.total_estimated_cost.toFixed(2)}
            </span>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-table-header text-text-secondary text-left">
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide">Item</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Needed</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">In Stock</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Shortage</th>
                <th className="px-4 py-2 font-medium text-xs uppercase tracking-wide text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {result.ingredients.map((ing) => (
                <>
                  <tr
                    key={ing.item_id}
                    className={`border-b border-border hover:bg-bg-hover cursor-pointer ${
                      ing.shortage > 0 ? '' : 'opacity-60'
                    }`}
                    onClick={() => setExpandedItem(expandedItem === ing.item_id ? null : ing.item_id)}
                  >
                    <td className="px-4 py-2 text-text-primary">
                      <span className="font-medium">{ing.item_name}</span>
                      {ing.vendor_name && (
                        <span className="text-text-secondary text-xs ml-2">({ing.vendor_name})</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {ing.total_needed} {ing.recipe_unit}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {ing.converted_stock != null ? ing.converted_stock : ing.current_qty} {ing.recipe_unit}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${
                      ing.shortage > 0 ? 'text-accent-red font-semibold' : 'text-accent-green'
                    }`}>
                      {ing.shortage > 0 ? ing.shortage : 'OK'}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-secondary">
                      {ing.estimated_cost != null ? `$${ing.estimated_cost.toFixed(2)}` : '\u2014'}
                    </td>
                  </tr>
                  {expandedItem === ing.item_id && (
                    <tr key={`${ing.item_id}-sources`} className="bg-bg-hover">
                      <td colSpan={5} className="px-8 py-2">
                        <div className="text-xs text-text-secondary space-y-1">
                          {ing.sources.map((s, i) => (
                            <div key={i} className="flex justify-between">
                              <span>{s.recipe_name}</span>
                              <span className="font-mono">
                                {s.quantity_per_guest}/guest x {s.guest_count} = {s.subtotal.toFixed(2)} {ing.recipe_unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>

          <div className="px-4 py-3 border-t border-border flex justify-end">
            <button
              onClick={handleCreateDraftOrder}
              disabled={createOrder.isPending || !result.ingredients.some((i) => i.shortage > 0 && i.vendor_id)}
              className="bg-accent-indigo text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-indigo-hover disabled:opacity-40 transition-colors"
            >
              Create Draft Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
