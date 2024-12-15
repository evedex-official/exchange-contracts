import Sessions from "./components/Sessions";
import Accounts from "./components/Accounts";
import DepositForm from "./forms/DepositForm";
import OrderForm from "./forms/OrderForm";

function App() {
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
