import { useClient } from "wagmi";

import DepositForm from "./forms/DepositForm";
import Sessions from "./components/Sessions";
import OrderForm from "./forms/OrderForm";
import Accounts from "./components/Accounts";

function App() {
  const client = useClient();
  return (
    <div className="container">
      <Accounts />
      <hr />
      <div>
        <DepositForm />
        <hr />
        <Sessions />
        <hr />
        <OrderForm />
      </div>
    </div>
  );
}

export default App;
