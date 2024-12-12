import React from "react";
import { Btc, Usdt } from "../../contracts";
import { Address } from "viem";
import { useDexBalance } from "../../hooks";
import { useAccount } from "wagmi";

type BalanceProps = {
  address: Address;
};

const Balance: React.FC<BalanceProps> = ({ address }) => {
  const account = useAccount();
  const { formatted, token, isLoading } = useDexBalance(
    address,
    account.address!
  );
  return isLoading ? (
    "Loading..."
  ) : (
    <div>
      {token.name}: {formatted} {token.symbol}
    </div>
  );
};

const DexBalances = () => {
  const tokens = [Usdt.address, Btc.address];
  return (
    <div>
      <h4>Dex Balances</h4>
      {tokens.map((address) => (
        <Balance key={address} address={address as Address} />
      ))}
    </div>
  );
};

export default DexBalances;
