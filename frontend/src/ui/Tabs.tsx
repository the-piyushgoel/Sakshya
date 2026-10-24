import { useState, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export function Tabs({ tabs, defaultTab }: { tabs: TabItem[]; defaultTab?: string }) {
  const firstTab = tabs.find((tab) => !tab.disabled)?.id ?? '';
  const [active, setActive] = useState(defaultTab ?? firstTab);
  const selectedTab = tabs.find((tab) => tab.id === active && !tab.disabled) ?? tabs.find((tab) => !tab.disabled);

  return (
    <div>
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-100" aria-label="Sections">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" id={`tab-${tab.id}`} aria-controls={`panel-${tab.id}`} aria-selected={active === tab.id} disabled={tab.disabled} onClick={() => setActive(tab.id)} className={`tab-button ${active === tab.id ? 'tab-button-active' : ''}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {selectedTab && <div role="tabpanel" id={`panel-${selectedTab.id}`} aria-labelledby={`tab-${selectedTab.id}`}>{selectedTab.content}</div>}
    </div>
  );
}
