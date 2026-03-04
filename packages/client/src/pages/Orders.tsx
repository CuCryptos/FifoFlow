import { useState } from 'react';
import { ManageVendorsModal } from '../components/ManageVendorsModal';

type OrderTab = 'generate' | 'history';

export function Orders() {
  const [activeTab, setActiveTab] = useState<OrderTab>('generate');
  const [showVendorsModal, setShowVendorsModal] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text-primary">Orders</h1>
        <button
          onClick={() => setShowVendorsModal(true)}
          className="bg-bg-card border border-border-emphasis text-text-secondary px-4 py-2 rounded-lg text-sm font-medium hover:bg-bg-hover transition-colors"
        >
          Manage Vendors
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-bg-card rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('generate')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'generate'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Generate Orders
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-accent-indigo text-white'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Order History
        </button>
      </div>

      {activeTab === 'generate' && <OrderGenerator />}
      {activeTab === 'history' && <OrderHistory />}

      {showVendorsModal && (
        <ManageVendorsModal onClose={() => setShowVendorsModal(false)} />
      )}
    </div>
  );
}

function OrderGenerator() {
  return <div className="text-text-secondary text-sm">Order generator coming soon...</div>;
}

function OrderHistory() {
  return <div className="text-text-secondary text-sm">Order history coming soon...</div>;
}
