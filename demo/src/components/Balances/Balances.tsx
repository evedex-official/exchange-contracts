import React from "react";
import { Btc, Usdt } from "../../contracts";
import { Address } from "viem";
import { useBalance } from "../../hooks";
import { useAccount } from "wagmi";

type BalanceProps = {
  address: Address;
};

const Balance: React.FC<BalanceProps> = ({ address }) => {
  const account = useAccount();
  const { formatted, token, isLoading } = useBalance(address, account.address!);
  return isLoading ? (
    "Loading..."
  ) : (
    <div>
      {formatted} {token.symbol}
    </div>
  );
};

const Balances = () => {
  const tokens = [Usdt.address, Btc.address];
  return (
    <div>
      {tokens.map((address) => (
        <Balance key={address} address={address as Address} />
      ))}
    </div>
  );
};

export default Balances;
