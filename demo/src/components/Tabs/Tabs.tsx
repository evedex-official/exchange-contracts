import React, { useState } from "react";
import Button from "../Button";

type TabProps = {
  tabKey: string;
  title: any;
  component: any;
};

type TabsProps = {
  tabs: TabProps[];
  defaultTab?: string;
};

const Tabs: React.FC<TabsProps> = ({ tabs, defaultTab }) => {
  const [activeTabKey, setActiveTabKey] = useState(
    defaultTab || tabs[0].tabKey
  );
  const onTabClick = (key: string) => () => setActiveTabKey(key);
  const activeTab = tabs.find((tab) => tab.tabKey === activeTabKey);
  const Component = activeTab?.component || (() => null);
  return (
    <div className="tabs">
      <div className="tabs-header">
        {tabs.map((tab) => (
          <Button
            key={tab.tabKey}
            disabled={tab.tabKey === activeTabKey}
            onClick={onTabClick(tab.tabKey)}
          >
            {tab.title}
          </Button>
        ))}
      </div>
      <div className="tabs-content">
        <Component />
      </div>
    </div>
  );
};

export default Tabs;
