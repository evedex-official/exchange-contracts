import Sessions from "./components/Sessions";
import WithdrawalRequests from "./components/WithdrawalRequests";
import Orders from "./components/Orders";
import DepositForm from "./forms/DepositForm";
import WithdrawForm from "./forms/WithdrawForm";
import OrderForm from "./forms/OrderForm";
import Tabs from "./components/Tabs";
import Config from "./components/Config";
import Accounts from "./components/Accounts";
import Instruments from "./components/Instruments";

const Wallet = () => {
  return (
    <div>
      <DepositForm />
      <hr />
      <WithdrawForm />
    </div>
  );
};

const Matcher = () => {
  return (
    <div>
      <WithdrawalRequests />
      <hr />
      <Orders />
    </div>
  );
};

function App() {
  const tabs = [
    {
      tabKey: "accounts",
      title: "Accounts",
      component: Accounts,
    },
    {
      tabKey: "wallet",
      title: "Deposit/Wihdraw",
      component: Wallet,
    },
    {
      tabKey: "sessions",
      title: "Sessions",
      component: Sessions,
    },
    {
      tabKey: "orders",
      title: "Order",
      component: OrderForm,
    },
    {
      tabKey: "matcher",
      title: "Matcher",
      component: Matcher,
    },
    {
      tabKey: "instruments",
      title: "Instruments",
      component: Instruments,
    },
  ];
  return (
    <div className="container">
      <Config />
      <hr />
      <Tabs tabs={tabs} />
    </div>
  );
}

export default App;
