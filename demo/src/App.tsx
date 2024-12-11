import { useAccount, useConnect, useDisconnect } from "wagmi";
import DepositForm from "./forms/DepositForm";
import Balances from "./components/Balances";

function App() {
  const account = useAccount();
  const { connectors, connect, status, error } = useConnect();
  const { disconnect } = useDisconnect();

  const isConnected = account.status === "connected";

  if (!isConnected) {
    return (
      <div>
        <h2>Connect</h2>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            type="button"
          >
            {connector.name}
          </button>
        ))}
        <div>{status}</div>
        <div>{error?.message}</div>
      </div>
    );
  }

  return (
    <>
      {isConnected && (
        <div>
          <h2>Account</h2>
          <button type="button" onClick={() => disconnect()}>
            Disconnect
          </button>
          <div>
            <div>status: {account.status}</div>
            <div>addresses: {JSON.stringify(account.addresses)}</div>
            <div>chainId: {account.chainId}</div>
          </div>
        </div>
      )}
      <Balances />
      <div>
        <DepositForm />
      </div>
    </>
  );
}

export default App;
